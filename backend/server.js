const path = require("path");
const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
const multipart = require("@fastify/multipart");
const fastifyStatic = require("@fastify/static");
const { initDb, getLeadsByJobId, getAllLeads } = require("./db");
const { createJob, createBulkJob, getJob } = require("./jobQueue");
require("dotenv").config();

const PORT = process.env.PORT || 3001;

fastify.register(cors, { origin: true });
fastify.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB max

// Serve built frontend
fastify.register(fastifyStatic, {
  root: path.join(__dirname, "..", "frontend", "dist"),
  prefix: "/",
  wildcard: true,
});

// ── API Routes (registered under /api prefix for production) ─────

async function apiRoutes(app) {

/**
 * POST /search-leads
 * Body: { query: string, roles?: string[] }
 */
app.post("/search-leads", async (request, reply) => {
  const { query, roles } = request.body || {};
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return reply.status(400).send({ error: "query is required" });
  }

  const job = createJob(
    query.trim(),
    roles || ["CFO", "Founder", "Finance Head", "CEO"]
  );

  return { jobId: job.id, status: "queued", company: query.trim() };
});

/**
 * POST /bulk-search
 * Accepts a CSV/text file with one company name per line.
 * Also accepts JSON body: { companies: ["Company1", "Company2"], roles: [...] }
 */
app.post("/bulk-search", async (request, reply) => {
  const contentType = request.headers["content-type"] || "";

  let companies = [];
  let roles = ["CFO", "Founder", "CEO", "CTO", "VP", "Director", "Manager"];

  if (contentType.includes("multipart")) {
    // File upload
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: "No file uploaded" });

    const buffer = await data.toBuffer();
    const text = buffer.toString("utf-8");

    // Parse CSV or plain text — one company per line
    companies = text
      .split(/[\n\r]+/)
      .map((line) => {
        // Handle CSV: take first column, strip quotes
        const cols = line.split(",");
        return cols[0].replace(/^["']|["']$/g, "").trim();
      })
      .filter((c) => c.length > 0 && c.toLowerCase() !== "company" && c.toLowerCase() !== "company name");
  } else {
    // JSON body
    const body = request.body || {};
    companies = body.companies || [];
    if (body.roles) roles = body.roles;
  }

  if (companies.length === 0) {
    return reply.status(400).send({ error: "No companies found in upload" });
  }

  // Cap at 20 companies per bulk job
  if (companies.length > 20) {
    companies = companies.slice(0, 20);
  }

  const job = createBulkJob(companies, roles);

  return {
    jobId: job.id,
    status: "queued",
    companies,
    totalCompanies: companies.length,
  };
});

/**
 * GET /job/:jobId
 */
app.get("/job/:jobId", async (request, reply) => {
  const { jobId } = request.params;
  const job = getJob(jobId);

  if (!job) {
    return reply.status(404).send({ error: "Job not found" });
  }

  return {
    jobId: job.id,
    state: job.state,
    progress: job.progress,
    result: job.state === "completed" ? job.result : null,
  };
});

/**
 * GET /leads/:jobId
 */
app.get("/leads/:jobId", async (request, reply) => {
  const { jobId } = request.params;
  const leads = getLeadsByJobId(jobId);
  return { jobId, count: leads.length, leads };
});

/**
 * GET /leads
 */
app.get("/leads", async () => {
  const leads = getAllLeads();
  return { count: leads.length, leads };
});

/**
 * GET /logo/:domain — proxy company logos to avoid CORS/proxy issues
 */
app.get("/logo/:domain", async (request, reply) => {
  const { domain } = request.params;
  const https = require("https");
  const agent = new https.Agent({ rejectUnauthorized: false });

  try {
    const axios = require("axios");
    const res = await axios.get(`https://logo.clearbit.com/${domain}`, {
      responseType: "arraybuffer",
      httpsAgent: agent,
      timeout: 5000,
    });
    reply.header("Content-Type", res.headers["content-type"] || "image/png");
    reply.header("Cache-Control", "public, max-age=86400");
    return reply.send(Buffer.from(res.data));
  } catch {
    try {
      const axios = require("axios");
      const res = await axios.get(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`, {
        responseType: "arraybuffer",
        httpsAgent: agent,
        timeout: 5000,
      });
      reply.header("Content-Type", res.headers["content-type"] || "image/png");
      reply.header("Cache-Control", "public, max-age=86400");
      return reply.send(Buffer.from(res.data));
    } catch {
      return reply.status(404).send({ error: "Logo not found" });
    }
  }
});

/**
 * GET /health
 */
app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

/**
 * POST /refresh-session — push fresh Apollo cookies from local machine
 */
app.post("/refresh-session", async (request) => {
  const { cookie, csrf } = request.body || {};
  if (!cookie) return { error: "cookie is required" };
  const apollo = require("./modules/apolloClient");
  apollo.setSession(cookie, csrf || "");
  return { success: true, cookieLength: cookie.length };
});

/**
 * POST /set-proxy — set the Apollo proxy URL (from local machine tunnel)
 */
app.post("/set-proxy", async (request) => {
  const { url } = request.body || {};
  if (!url) return { error: "url is required" };
  const apollo = require("./modules/apolloClient");
  apollo.setProxyUrl(url.replace(/\/+$/, "")); // strip trailing slash
  return { success: true, proxyUrl: url };
});

/**
 * GET /proxy-status — check if the Apollo proxy is reachable
 */
app.get("/proxy-status", async () => {
  const apollo = require("./modules/apolloClient");
  const proxyUrl = apollo.getProxyUrl();
  if (!proxyUrl) return { configured: false };

  try {
    const ax = require("axios");
    const res = await ax.get(`${proxyUrl}/health`, { timeout: 5000 });
    return { configured: true, proxyUrl, reachable: true, proxyHealth: res.data };
  } catch (err) {
    return { configured: true, proxyUrl, reachable: false, error: err.message };
  }
});

/**
 * GET /debug — test Apollo search
 */
app.get("/debug", async () => {
  const apollo = require("./modules/apolloClient");
  const ax = require("axios");
  try {
    // Direct raw test
    const cookie = apollo.getSession().cookie;
    const csrf = apollo.getSession().csrf;
    const res = await ax.post("https://app.apollo.io/api/v1/mixed_people/search", {
      q_organization_name: "Razorpay", person_titles: ["ceo", "cfo"], page: 1, per_page: 3,
    }, {
      headers: { "Content-Type": "application/json", "Cookie": cookie, "X-CSRF-TOKEN": csrf, "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      validateStatus: () => true, timeout: 15000,
    });
    const isHtml = typeof res.data === "string";
    return {
      hasSession: apollo.hasSession(),
      cookieLen: cookie?.length || 0,
      csrfLen: csrf?.length || 0,
      searchStatus: res.status,
      isHtml,
      preview: isHtml ? res.data.substring(0, 200) : undefined,
      peopleCount: res.data?.people?.length,
      total: res.data?.pagination?.total_entries,
      sample: res.data?.people?.[0] ? { name: (res.data.people[0].first_name + " " + res.data.people[0].last_name).trim(), title: res.data.people[0].title } : null,
    };
  } catch (err) {
    return { error: err.message };
  }
});

} // end apiRoutes

// Register API routes under /api prefix (used by production frontend)
fastify.register(apiRoutes, { prefix: "/api" });

// SPA catch-all — serve index.html for any unmatched non-API route
fastify.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith("/api")) {
    return reply.status(404).send({ error: "API route not found" });
  }
  return reply.sendFile("index.html");
});

// ── Start ───────────────────────────────────────────

async function start() {
  try {
    initDb();
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`Server running on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
