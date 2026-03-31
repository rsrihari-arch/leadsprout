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
 * GET /debug — test Apollo login (temporary)
 */
app.get("/debug", async () => {
  const apollo = require("./modules/apolloClient");
  try {
    const results = await apollo.searchPeople("Razorpay", ["CEO"], 1, 3);
    return {
      apolloConfigured: apollo.isConfigured(),
      emailSet: !!process.env.APOLLO_EMAIL,
      passwordLength: process.env.APOLLO_PASSWORD?.length || 0,
      testSearch: results.length > 0 ? "SUCCESS" : "NO_RESULTS",
      resultCount: results.length,
      sample: results[0] ? { name: results[0].name, title: results[0].title } : null,
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
