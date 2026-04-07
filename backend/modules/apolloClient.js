const path = require("path");
const https = require("https");
const axios = require("axios");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const APOLLO_EMAIL = process.env.APOLLO_EMAIL;
const APOLLO_PASSWORD = process.env.APOLLO_PASSWORD;
const APOLLO_COOKIE = process.env.APOLLO_COOKIE || "";
const APOLLO_CSRF = process.env.APOLLO_CSRF || "";
console.log(`[Apollo] Configured: email=${!!APOLLO_EMAIL}, cookie=${APOLLO_COOKIE.length > 0 ? "yes" : "no"}, csrf=${APOLLO_CSRF.length > 0 ? "yes" : "no"}`);

let sessionCookie = APOLLO_COOKIE;
let csrfToken = APOLLO_CSRF;

/**
 * Login to Apollo via HTTP (no browser needed) and get session cookies.
 */
async function loginViaHttp() {
  if (!APOLLO_EMAIL || !APOLLO_PASSWORD) return false;

  try {
    console.log("[Apollo] Attempting HTTP login...");

    // Step 1: Get the login page to obtain CSRF token
    const loginPageRes = await axios.get("https://app.apollo.io/api/v1/auth/check", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      httpsAgent,
      validateStatus: () => true,
    });

    // Step 2: Login via API
    const loginRes = await axios.post(
      "https://app.apollo.io/api/v1/auth/login",
      {
        email: APOLLO_EMAIL,
        password: APOLLO_PASSWORD,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Origin": "https://app.apollo.io",
          "Referer": "https://app.apollo.io/",
        },
        httpsAgent,
        validateStatus: () => true,
        maxRedirects: 0,
      }
    );

    if (loginRes.status === 200 && loginRes.data && !loginRes.data.error) {
      // Extract cookies from response
      const cookies = loginRes.headers["set-cookie"];
      if (cookies) {
        sessionCookie = cookies.map((c) => c.split(";")[0]).join("; ");
        // Extract CSRF token
        const csrfCookie = cookies.find((c) => c.includes("X-CSRF-TOKEN"));
        if (csrfCookie) {
          csrfToken = decodeURIComponent(csrfCookie.split("X-CSRF-TOKEN=")[1].split(";")[0]);
        }
        console.log(`[Apollo] HTTP login successful — got ${cookies.length} cookies`);
        return true;
      }
    }

    console.log(`[Apollo] HTTP login failed: ${loginRes.status} ${JSON.stringify(loginRes.data?.error || "unknown")}`);
    return false;
  } catch (err) {
    console.error(`[Apollo] HTTP login error: ${err.message}`);
    return false;
  }
}

/**
 * Search for people at a company using Apollo's API with session cookies.
 */
async function searchPeople(company, roles, pageNum = 1, perPage = 10) {
  if (!APOLLO_EMAIL && !sessionCookie) {
    console.log("[Apollo] No credentials or cookie configured — skipping");
    return [];
  }

  // Try HTTP login if we don't have cookies yet
  if (!sessionCookie) {
    const loggedIn = await loginViaHttp();
    if (!loggedIn) {
      console.error("[Apollo] Login failed — no session");
      return [];
    }
  }

  console.log(`[Apollo] searchPeople: company=${company}, roles=${roles.length}, page=${pageNum}`);

  try {
    const res = await axios.post(
      "https://app.apollo.io/api/v1/mixed_people/search",
      {
        q_organization_name: company,
        person_titles: roles.map((r) => r.toLowerCase()),
        page: pageNum,
        per_page: perPage,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Cookie": sessionCookie,
          "X-CSRF-TOKEN": csrfToken,
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        httpsAgent,
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    if (res.status === 401 || res.status === 403) {
      console.log("[Apollo] Session expired — attempting re-login...");
      sessionCookie = "";
      const loggedIn = await loginViaHttp();
      if (!loggedIn) return [];

      // Retry the search
      return searchPeople(company, roles, pageNum, perPage);
    }

    if (res.status !== 200) {
      console.error(`[Apollo] Search error: HTTP ${res.status}`);
      return [];
    }

    const data = res.data;

    // Check for Cloudflare challenge
    if (typeof data === "string" && data.includes("turnstile")) {
      console.error("[Apollo] Cloudflare challenge detected — cookies may be IP-bound");
      return [];
    }

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

    console.log(`[Apollo] "${company}" → ${people.length} people (total: ${data.pagination?.total_entries || 0})`);
    return people;
  } catch (err) {
    console.error(`[Apollo] Search exception: ${err.message}`);
    return [];
  }
}

function isConfigured() {
  return !!(APOLLO_EMAIL || sessionCookie);
}

function hasSession() {
  return sessionCookie.length > 0;
}

function setSession(cookie, csrf) {
  sessionCookie = cookie;
  csrfToken = csrf || "";
  console.log(`[Apollo] Session updated — cookie: ${cookie.length} chars, csrf: ${csrf?.length || 0} chars`);
}

async function closeBrowser() {
  // No browser to close — using HTTP API
}

function getSession() {
  return { cookie: sessionCookie, csrf: csrfToken };
}

module.exports = { searchPeople, isConfigured, hasSession, setSession, getSession, closeBrowser };
