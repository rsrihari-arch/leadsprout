const axios = require("axios");
const https = require("https");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const SERPER_KEY = process.env.SERPER_KEY;

let browserInstance = null;

// ── Method 1: Serper.dev (2500 free searches, most reliable) ──
async function searchSerper(query) {
  if (!SERPER_KEY) return [];
  try {
    const { data } = await axios.post(
      "https://google.serper.dev/search",
      { q: query, num: 20 },
      {
        headers: {
          "X-API-KEY": SERPER_KEY,
          "Content-Type": "application/json",
        },
        httpsAgent,
        timeout: 15000,
      }
    );
    const results = (data.organic || []).map((r) => ({
      title: r.title || "",
      link: r.link || "",
      snippet: r.snippet || "",
    }));
    console.log(`[Scraper][Serper] "${query}" → ${results.length} results`);
    return results;
  } catch (err) {
    console.error(`[Scraper][Serper] Error:`, err.message);
    return [];
  }
}

// ── Method 2: SerpAPI (100 free/month) ──────────────
async function searchSerpApi(query) {
  if (!SERPAPI_KEY) return [];
  try {
    const { data } = await axios.get("https://serpapi.com/search.json", {
      params: { q: query, api_key: SERPAPI_KEY, num: 15, hl: "en" },
      httpsAgent,
      timeout: 15000,
    });
    const results = (data.organic_results || []).map((r) => ({
      title: r.title || "",
      link: r.link || "",
      snippet: r.snippet || "",
    }));
    console.log(`[Scraper][SerpAPI] "${query}" → ${results.length} results`);
    return results;
  } catch (err) {
    console.error(`[Scraper][SerpAPI] Error:`, err.message);
    return [];
  }
}

// ── Method 3: Bing via Puppeteer ──────────────────
async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--ignore-certificate-errors"],
    });
  }
  return browserInstance;
}

async function searchBingPuppeteer(query) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    await page.goto(
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=20&setlang=en&cc=us`,
      { waitUntil: "networkidle2", timeout: 20000 }
    );
    await page.waitForSelector("#b_results", { timeout: 5000 }).catch(() => {});

    const results = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll("#b_results li.b_algo").forEach((el) => {
        const a = el.querySelector("h2 a");
        const cite = el.querySelector("cite");
        const snippet = el.querySelector(".b_caption p");
        if (a) {
          // Bing uses tracking URLs — extract the real URL from cite or decode from href
          let realUrl = "";
          if (cite) {
            realUrl = cite.textContent.trim().replace(/\s*›\s*/g, "/");
            if (!realUrl.startsWith("http")) realUrl = "https://" + realUrl;
          }
          items.push({
            title: a.textContent.trim(),
            link: realUrl || a.href,
            snippet: snippet ? snippet.textContent.trim() : "",
          });
        }
      });
      return items;
    });

    console.log(`[Scraper][Bing] "${query}" → ${results.length} results`);
    return results;
  } catch (err) {
    console.error(`[Scraper][Bing] Error:`, err.message);
    return [];
  } finally {
    await page.close();
  }
}

// ── Method 4: Google via Puppeteer ────────────────
async function searchGooglePuppeteer(query) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    await page.goto(
      `https://www.google.com/search?q=${encodeURIComponent(query)}&num=15&hl=en`,
      { waitUntil: "domcontentloaded", timeout: 15000 }
    );

    try {
      const btn = await page.$('button[id="L2AGLb"]');
      if (btn) await btn.click();
    } catch {}

    await page.waitForSelector("div#search", { timeout: 8000 }).catch(() => {});

    const results = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll("div.g").forEach((el) => {
        const h3 = el.querySelector("h3");
        const a = el.querySelector("a[href^='http']");
        const snip = el.querySelector("[data-sncf], .VwiC3b, div.IsZvec");
        if (h3 && a) {
          items.push({
            title: h3.textContent.trim(),
            link: a.href,
            snippet: snip?.textContent?.trim() || "",
          });
        }
      });
      return items;
    });

    console.log(`[Scraper][Google] "${query}" → ${results.length} results`);
    return results;
  } catch (err) {
    console.error(`[Scraper][Google] Error:`, err.message);
    return [];
  } finally {
    await page.close();
  }
}

// ── Method 5: DuckDuckGo HTML ────────────────────
async function searchDDG(query) {
  try {
    const { data } = await axios.post(
      "https://html.duckduckgo.com/html/",
      `q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        httpsAgent,
        timeout: 10000,
      }
    );
    const $ = cheerio.load(data);
    const results = [];
    $(".result").each((_, el) => {
      const title = $(el).find(".result__a").text().trim();
      let link = $(el).find(".result__a").attr("href") || "";
      const snippet = $(el).find(".result__snippet").text().trim();
      if (link.includes("uddg=")) {
        try {
          link = decodeURIComponent(
            new URL(link, "https://duckduckgo.com").searchParams.get("uddg") || link
          );
        } catch {}
      }
      if (title && link.startsWith("http")) results.push({ title, link, snippet });
    });
    if (results.length > 0)
      console.log(`[Scraper][DDG] "${query}" → ${results.length} results`);
    return results;
  } catch {
    return [];
  }
}

// ── Main search function (tries all methods in order) ──
async function searchGoogle(query) {
  // Try Serper.dev first (most reliable, free 2500 credits)
  let results = await searchSerper(query);
  if (results.length > 0) return results;

  // Try SerpAPI
  results = await searchSerpApi(query);
  if (results.length > 0) return results;

  // Try Bing Puppeteer
  results = await searchBingPuppeteer(query);
  if (results.length > 0) return results;

  // Try Google Puppeteer
  results = await searchGooglePuppeteer(query);
  if (results.length > 0) return results;

  // Try DDG
  results = await searchDDG(query);
  if (results.length > 0) return results;

  console.log(`[Scraper] All methods failed for "${query}" — no results`);
  return [];
}

function extractLinkedInUrls(results) {
  return results.filter(
    (r) => r.link.includes("linkedin.com/in/") || r.link.includes("linkedin.com/pub/")
  );
}

async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

module.exports = { searchGoogle, extractLinkedInUrls, closeBrowser };
