const { searchGoogle, extractLinkedInUrls } = require("./googleScraper");

const SEARCH_TEMPLATES = [
  "site:linkedin.com/in {company} {role}",
  "{role} at {company} LinkedIn",
  "{company} {role} LinkedIn profile",
];

/**
 * Parse a name from a LinkedIn search result title.
 * Typical formats:
 *   "John Doe - CFO - Company | LinkedIn"
 *   "John Doe | LinkedIn"
 *   "John Doe – Chief Financial Officer – Company"
 */
function parseNameFromTitle(title) {
  // Remove "| LinkedIn" or "- LinkedIn" suffix
  let cleaned = title.replace(/\s*[\|–\-]\s*LinkedIn.*$/i, "").trim();
  // Remove "LinkedIn" if it's at the end
  cleaned = cleaned.replace(/\s*LinkedIn\s*$/i, "").trim();

  // Split by common separators
  const parts = cleaned.split(/\s*[\|–\u2013\u2014]\s*|\s+-\s+/);
  const namePart = parts[0].trim();

  // Validate: name should be 2-5 words, only letters/spaces/punctuation
  const words = namePart.split(/\s+/);
  if (words.length >= 2 && words.length <= 5 && /^[A-Za-z\s.''·\-]+$/.test(namePart)) {
    return namePart;
  }

  return null;
}

/**
 * Parse a title/role from a LinkedIn search result.
 * Extracts from "Name - Title - Company | LinkedIn" pattern.
 */
function parseTitleFromResult(title, snippet) {
  // Remove LinkedIn suffix
  let cleaned = title.replace(/\s*[\|–\-]\s*LinkedIn.*$/i, "").trim();

  // Split by separators
  const parts = cleaned.split(/\s*[\|–\u2013\u2014]\s*|\s+-\s+/);

  // Second part is usually the title
  if (parts.length >= 2) {
    const role = parts[1].trim();
    if (role.length > 0 && role.length < 100) {
      return role;
    }
  }

  // Try extracting from snippet
  if (snippet) {
    // Common pattern: "Name is the Title at Company"
    const snippetMatch = snippet.match(/(?:is|as)\s+(?:the\s+)?(.+?)\s+at\s+/i);
    if (snippetMatch) return snippetMatch[1].trim();

    // "Title at Company"
    const atMatch = snippet.match(/^(.+?)\s+at\s+/i);
    if (atMatch && atMatch[1].length < 80) return atMatch[1].trim();
  }

  return parts.length > 1 ? parts[1]?.trim() || "Unknown" : "Unknown";
}

/**
 * Discover leads for a given company.
 * Searches Google for LinkedIn profiles matching the company + roles.
 */
async function discoverLeads(company, roles) {
  const leads = [];
  const seenUrls = new Set();

  for (const role of roles) {
    for (const template of SEARCH_TEMPLATES) {
      const query = template
        .replace("{company}", company)
        .replace("{role}", role);

      console.log(`[Discovery] Searching: "${query}"`);
      const results = await searchGoogle(query);
      const linkedInResults = extractLinkedInUrls(results);
      console.log(`[Discovery] Found ${linkedInResults.length} LinkedIn profiles`);

      for (const result of linkedInResults) {
        const url = result.link.split("?")[0];
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        const name = parseNameFromTitle(result.title);
        if (!name) continue;

        const parsedTitle = parseTitleFromResult(result.title, result.snippet);

        leads.push({
          name,
          title: parsedTitle,
          company,
          linkedin_url: url,
          source: "google_search",
          snippet: result.snippet,
        });
      }

      // Rate limit: 3-5 seconds between searches
      await sleep(3000 + Math.random() * 2000);
    }
  }

  console.log(`[Discovery] Total unique leads for "${company}": ${leads.length}`);
  return leads;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { discoverLeads, parseNameFromTitle, parseTitleFromResult };
