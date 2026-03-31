/**
 * Generate probable email addresses for a lead.
 */

const COMPANY_SUFFIXES = [
  "inc", "llc", "ltd", "corp", "corporation", "co", "company",
  "technologies", "tech", "solutions", "group", "holdings",
  "pvt", "private", "limited", "india", "global",
];

/**
 * Derive a company domain from company name.
 * "Razorpay Software Private Limited" -> "razorpay.com"
 */
function deriveDomain(company) {
  let domain = company.toLowerCase().trim();
  // Remove common suffixes
  for (const suffix of COMPANY_SUFFIXES) {
    domain = domain.replace(new RegExp(`\\b${suffix}\\b`, "gi"), "");
  }
  // Remove special characters and extra spaces
  domain = domain.replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "");
  return domain ? `${domain}.com` : null;
}

/**
 * Generate email pattern variations.
 */
function generateEmails(name, domain) {
  if (!name || !domain) return [];

  const parts = name.toLowerCase().trim().split(/\s+/);
  if (parts.length < 2) return [];

  const first = parts[0].replace(/[^a-z]/g, "");
  const last = parts[parts.length - 1].replace(/[^a-z]/g, "");
  const fInitial = first[0];
  const lInitial = last[0];

  if (!first || !last) return [];

  const patterns = [
    { email: `${first}.${last}@${domain}`, confidence: "high" },
    { email: `${first}${last}@${domain}`, confidence: "medium" },
    { email: `${first}@${domain}`, confidence: "medium" },
    { email: `${fInitial}${last}@${domain}`, confidence: "medium" },
    { email: `${first}.${lInitial}@${domain}`, confidence: "low" },
    { email: `${fInitial}.${last}@${domain}`, confidence: "low" },
  ];

  return patterns;
}

/**
 * Enrich a lead with email candidates.
 * Returns the lead with best-guess email and confidence.
 */
function enrichEmail(lead) {
  const domain = lead.domain || deriveDomain(lead.company);
  if (!domain) {
    return { ...lead, email: null, email_confidence: "none", domain };
  }

  const candidates = generateEmails(lead.name, domain);
  if (candidates.length === 0) {
    return { ...lead, email: null, email_confidence: "none", domain };
  }

  // Use first.last as primary (most common B2B pattern)
  const best = candidates[0];
  return {
    ...lead,
    email: best.email,
    email_confidence: best.confidence,
    email_candidates: candidates.map((c) => c.email),
    domain,
  };
}

module.exports = { enrichEmail, generateEmails, deriveDomain };
