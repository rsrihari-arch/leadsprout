/**
 * Local Apollo Proxy — runs on your machine, forwards Apollo searches.
 * Render calls this instead of Apollo directly (bypasses Cloudflare).
 *
 * Usage: node local-proxy.js
 */
const path = require("path");
const https = require("https");
const fastify = require("fastify")({ logger: true });
const cors = require("@fastify/cors");
const axios = require("axios");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const PORT = 4000;
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const APOLLO_EMAIL = process.env.APOLLO_EMAIL;
const APOLLO_PASSWORD = process.env.APOLLO_PASSWORD;

let sessionCookie = "";
let csrfToken = "";

async function login() {
  console.log("[Proxy] Logging into Apollo...");
  const res = await axios.post(
    "https://app.apollo.io/api/v1/auth/login",
    { email: APOLLO_EMAIL, password: APOLLO_PASSWORD },
    {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Origin: "https://app.apollo.io",
        Referer: "https://app.apollo.io/",
      },
      httpsAgent,
      validateStatus: () => true,
    }
  );

  if (res.status !== 200 || !res.data?.is_logged_in) {
    console.error("[Proxy] Login failed:", res.status);
    return false;
  }

  const cookies = res.headers["set-cookie"] || [];
  sessionCookie = cookies.map((c) => c.split(";")[0]).join("; ");
  const csrfCookie = cookies.find((c) => c.includes("X-CSRF-TOKEN"));
  if (csrfCookie) {
    csrfToken = decodeURIComponent(csrfCookie.split("X-CSRF-TOKEN=")[1].split(";")[0]);
  }
  console.log("[Proxy] Login successful — got", cookies.length, "cookies");
  return true;
}

fastify.register(cors, { origin: true });

fastify.get("/health", async () => ({ status: "ok", hasSession: sessionCookie.length > 0 }));

fastify.post("/apollo-search", async (request, reply) => {
  const { company, roles, page = 1, perPage = 10 } = request.body || {};
  if (!company) return reply.status(400).send({ error: "company is required" });

  if (!sessionCookie) {
    const ok = await login();
    if (!ok) return reply.status(500).send({ error: "Apollo login failed" });
  }

  try {
    const res = await axios.post(
      "https://app.apollo.io/api/v1/mixed_people/search",
      {
        q_organization_name: company,
        person_titles: (roles || ["CEO"]).map((r) => r.toLowerCase()),
        page,
        per_page: perPage,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
          "X-CSRF-TOKEN": csrfToken,
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        httpsAgent,
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    // Cloudflare challenge or session expired — re-login and retry once
    if (typeof res.data === "string" && res.data.includes("turnstile")) {
      console.log("[Proxy] Cloudflare challenge — re-logging in...");
      const ok = await login();
      if (!ok) return reply.status(500).send({ error: "Re-login failed" });
      return fastify.inject({ method: "POST", url: "/apollo-search", payload: request.body }).then((r) => {
        reply.status(r.statusCode).send(JSON.parse(r.payload));
      });
    }

    if (res.status === 401 || res.status === 403) {
      console.log("[Proxy] Session expired — re-logging in...");
      sessionCookie = "";
      const ok = await login();
      if (!ok) return reply.status(500).send({ error: "Re-login failed" });
      return fastify.inject({ method: "POST", url: "/apollo-search", payload: request.body }).then((r) => {
        reply.status(r.statusCode).send(JSON.parse(r.payload));
      });
    }

    const data = res.data;
    const people = (data.people || []).map((p) => ({
      name: [(p.first_name || ""), (p.last_name || "")].filter(Boolean).join(" "),
      title: p.title || p.headline || "Unknown",
      company: p.organization?.name || company,
      domain: p.organization?.primary_domain || null,
      linkedin_url: p.linkedin_url || null,
      email: p.email && !p.email.includes("email_not_unlocked") ? p.email : null,
      phone: p.phone_numbers?.[0]?.sanitized_number || null,
      city: p.city || null,
      state: p.state || null,
      country: p.country || null,
      photo_url: p.photo_url || null,
      source: "apollo",
      snippet: p.headline || "",
    }));

    console.log(`[Proxy] "${company}" → ${people.length} people`);
    return { people, total: data.pagination?.total_entries || 0 };
  } catch (err) {
    console.error("[Proxy] Search error:", err.message);
    return reply.status(500).send({ error: err.message });
  }
});

async function start() {
  try {
    await login();
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`\n✓ Apollo proxy running on http://localhost:${PORT}`);
    console.log("  Next: expose it publicly with:");
    console.log("  ssh -p 443 -R0:localhost:4000 a.pinggy.io\n");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
