const { searchGoogle } = require("./googleScraper");

/**
 * Phone number regex patterns.
 */
const PHONE_PATTERNS = [
  /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, // US
  /\+91[-.\s]?\d{5}[-.\s]?\d{5}/g, // India
  /\+\d{1,3}[-.\s]?\d{4,14}/g, // International
];

/**
 * Extract phone numbers from text.
 */
function extractPhones(text) {
  const phones = new Set();
  for (const pattern of PHONE_PATTERNS) {
    const matches = text.match(pattern) || [];
    for (const m of matches) {
      const cleaned = m.replace(/[^\d+]/g, "");
      if (cleaned.length >= 10 && cleaned.length <= 15) {
        phones.add(cleaned);
      }
    }
  }
  return [...phones];
}

/**
 * Determine if the phone is likely associated with the person.
 */
function scorePhoneResult(text, name) {
  const textLower = text.toLowerCase();
  const nameParts = name.toLowerCase().split(/\s+/);
  let matchCount = 0;
  for (const part of nameParts) {
    if (textLower.includes(part)) matchCount++;
  }
  if (matchCount >= 2) return "high";
  if (matchCount >= 1) return "medium";
  return "low";
}

/**
 * Find phone number for a lead via Google search.
 */
async function findPhone(lead) {
  const query = `"${lead.name}" "${lead.company}" phone contact`;
  const results = await searchGoogle(query);

  for (const result of results) {
    const combined = `${result.title} ${result.snippet}`;
    const phones = extractPhones(combined);
    if (phones.length > 0) {
      const confidence = scorePhoneResult(combined, lead.name);
      return {
        ...lead,
        phone: phones[0],
        phone_confidence: confidence,
      };
    }
  }

  return { ...lead, phone: null, phone_confidence: "none" };
}

module.exports = { findPhone, extractPhones };
