/**
 * Validate LinkedIn URL relevance for a lead.
 * Checks name similarity and company match.
 */

function normalizeString(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * Simple string similarity (Dice coefficient).
 */
function similarity(a, b) {
  a = normalizeString(a);
  b = normalizeString(b);
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.substring(i, i + 2);
    bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
  }

  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.substring(i, i + 2);
    if (bigrams.get(bigram) > 0) {
      matches++;
      bigrams.set(bigram, bigrams.get(bigram) - 1);
    }
  }

  return (2 * matches) / (a.length - 1 + b.length - 1);
}

/**
 * Check if the LinkedIn URL slug matches the person's name.
 */
function urlMatchesName(linkedinUrl, name) {
  const slug = linkedinUrl.split("/in/")[1]?.split(/[?/]/)[0] || "";
  const nameParts = normalizeString(name).split(/\s+/);

  // Check if slug contains first and last name parts
  const slugNorm = slug.toLowerCase().replace(/[^a-z]/g, "");
  let matchCount = 0;
  for (const part of nameParts) {
    if (slugNorm.includes(part)) matchCount++;
  }

  return matchCount / nameParts.length;
}

/**
 * Validate a lead's LinkedIn URL and assign confidence.
 * @param {Object} lead - { name, company, linkedin_url, snippet }
 * @returns {Object} lead with linkedin_confidence added
 */
function validateLinkedIn(lead) {
  if (!lead.linkedin_url) {
    return { ...lead, linkedin_confidence: "none" };
  }

  let score = 0;

  // Check name match in URL
  const nameMatch = urlMatchesName(lead.linkedin_url, lead.name);
  score += nameMatch * 50;

  // Check company in snippet
  if (lead.snippet && lead.company) {
    const companyNorm = normalizeString(lead.company);
    const snippetNorm = normalizeString(lead.snippet);
    if (snippetNorm.includes(companyNorm)) {
      score += 30;
    }
  }

  // Check name similarity in snippet
  if (lead.snippet && lead.name) {
    const sim = similarity(lead.name, lead.snippet.substring(0, 50));
    score += sim * 20;
  }

  let confidence;
  if (score >= 60) confidence = "high";
  else if (score >= 30) confidence = "medium";
  else confidence = "low";

  return { ...lead, linkedin_confidence: confidence };
}

module.exports = { validateLinkedIn, similarity, urlMatchesName };
