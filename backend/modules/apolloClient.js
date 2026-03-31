const puppeteer = require("puppeteer");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const APOLLO_EMAIL = process.env.APOLLO_EMAIL;
const APOLLO_PASSWORD = process.env.APOLLO_PASSWORD;
console.log(`[Apollo] Configured: email=${!!APOLLO_EMAIL}, password=${!!APOLLO_PASSWORD} (${APOLLO_PASSWORD?.length || 0} chars)`);

let apolloBrowser = null;
let loggedInPage = null;
let sessionReady = false;
let loginInProgress = false;

async function ensureLoggedIn() {
  // Prevent concurrent login attempts
  if (loginInProgress) {
    console.log("[Apollo] Login already in progress, waiting...");
    while (loginInProgress) await new Promise((r) => setTimeout(r, 1000));
    if (sessionReady && loggedInPage && !loggedInPage.isClosed()) return loggedInPage;
  }

  if (sessionReady && loggedInPage && !loggedInPage.isClosed()) {
    return loggedInPage;
  }

  loginInProgress = true;
  try {
    // Always use a dedicated browser for Apollo (separate from googleScraper)
    if (!apolloBrowser || !apolloBrowser.connected) {
      console.log("[Apollo] Launching dedicated browser...");
      apolloBrowser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--ignore-certificate-errors", "--disable-gpu", "--disable-dev-shm-usage"],
      });
    }

    const page = await apolloBrowser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    console.log("[Apollo] Loading login page...");
    await page.goto("https://app.apollo.io/#/login", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    console.log("[Apollo] Waiting for email input...");
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });

    console.log("[Apollo] Typing credentials...");
    await page.click('input[name="email"]');
    await page.type('input[name="email"]', APOLLO_EMAIL, { delay: 20 });
    await page.click('input[name="password"]');
    await page.type('input[name="password"]', APOLLO_PASSWORD, { delay: 20 });

    await new Promise((r) => setTimeout(r, 300));
    console.log("[Apollo] Clicking submit...");
    await page.click('button[type="submit"]');

    console.log("[Apollo] Waiting for login to complete...");
    // Wait for URL to change from /login to /home (up to 20s)
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const currentUrl = page.url();
      if (!currentUrl.includes("/login")) {
        console.log(`[Apollo] Login redirect detected after ${i + 1}s`);
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));

    const url = page.url();
    console.log(`[Apollo] Post-login URL: ${url}`);

    if (url.includes("/login")) {
      console.error("[Apollo] Login FAILED — still on login page");
      await page.close();
      loginInProgress = false;
      return null;
    }

    console.log("[Apollo] Login successful ✓");
    loggedInPage = page;
    sessionReady = true;
    loginInProgress = false;
    return page;
  } catch (err) {
    console.error(`[Apollo] Login error: ${err.message}`);
    loginInProgress = false;
    sessionReady = false;
    return null;
  }
}

/**
 * Search for people at a company using Apollo's internal API via browser session.
 */
async function searchPeople(company, roles, pageNum = 1, perPage = 10) {
  if (!APOLLO_EMAIL || !APOLLO_PASSWORD) {
    console.log("[Apollo] No credentials configured — skipping");
    return [];
  }

  console.log(`[Apollo] searchPeople called: company=${company}, roles=${roles.length}`);
  const browserPage = await ensureLoggedIn();
  if (!browserPage) {
    console.error("[Apollo] No browser page — login failed");
    return [];
  }

  try {
    console.log("[Apollo] Executing search query...");
    const result = await browserPage.evaluate(
      async (company, roles, pageNum, perPage) => {
        try {
          const csrfCookie = document.cookie
            .split(";")
            .find((c) => c.trim().startsWith("X-CSRF-TOKEN="));
          const csrf = csrfCookie
            ? decodeURIComponent(csrfCookie.split("=").slice(1).join("="))
            : "";

          const res = await fetch("/api/v1/mixed_people/search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-TOKEN": csrf,
            },
            credentials: "include",
            body: JSON.stringify({
              q_organization_name: company,
              person_titles: roles.map((r) => r.toLowerCase()),
              page: pageNum,
              per_page: perPage,
            }),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            return { error: `HTTP ${res.status}: ${text.substring(0, 200)}`, people: [] };
          }

          const data = await res.json();
          return {
            total: data.pagination?.total_entries || 0,
            people: (data.people || []).map((p) => ({
              name: [(p.first_name || ""), (p.last_name || "")]
                .filter(Boolean)
                .join(" "),
              title: p.title || p.headline || "Unknown",
              company: p.organization?.name || company,
              domain: p.organization?.primary_domain || null,
              linkedin_url: p.linkedin_url || null,
              email:
                p.email && !p.email.includes("email_not_unlocked") ? p.email : null,
              phone: p.phone_numbers?.[0]?.sanitized_number || null,
              city: p.city || null,
              state: p.state || null,
              country: p.country || null,
              photo_url: p.photo_url || null,
              source: "apollo",
              snippet: p.headline || "",
            })),
          };
        } catch (e) {
          return { error: e.message, people: [] };
        }
      },
      company,
      roles,
      pageNum,
      perPage
    );

    if (result.error) {
      console.error(`[Apollo] Search error: ${result.error}`);
      // Debug: capture page state
      const pageUrl = await browserPage.url().catch(() => "unknown");
      console.error(`[Apollo] Current page URL: ${pageUrl}`);
      await browserPage.screenshot({ path: "/tmp/apollo_search_error.png" }).catch(() => {});
      if (result.error.includes("401") || result.error.includes("403") || result.error.includes("Invalid")) {
        console.log("[Apollo] Session expired — will re-login on next call");
        sessionReady = false;
      }
      return [];
    }

    console.log(
      `[Apollo] "${company}" → ${result.people.length} people (total: ${result.total})`
    );
    return result.people;
  } catch (err) {
    console.error(`[Apollo] Search exception: ${err.message}`);
    sessionReady = false;
    return [];
  }
}

function isConfigured() {
  return !!(APOLLO_EMAIL && APOLLO_PASSWORD);
}

async function closeBrowser() {
  if (loggedInPage && !loggedInPage.isClosed()) {
    await loggedInPage.close().catch(() => {});
  }
  if (apolloBrowser) {
    await apolloBrowser.close().catch(() => {});
    apolloBrowser = null;
  }
  sessionReady = false;
  loggedInPage = null;
}

module.exports = { searchPeople, isConfigured, closeBrowser };
