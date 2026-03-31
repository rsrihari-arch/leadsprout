/**
 * Filter leads by target titles/roles and classify seniority.
 */

const DEFAULT_TARGET_TITLES = [
  "cfo", "chief financial officer",
  "founder", "co-founder", "cofounder",
  "finance", "head of finance", "vp finance",
  "payments", "head of payments",
  "director of finance", "treasury", "controller",
  "ceo", "chief executive", "managing director",
  "cto", "coo", "cmo", "cio", "cpo",
  "vp", "vice president", "svp",
  "director", "head of",
  "manager", "lead",
  "president",
];

/**
 * Classify seniority level from a job title.
 * Returns: "CXO", "VP", "DIR", "MGR", "IC"
 */
function classifySeniority(title) {
  if (!title) return "IC";
  const t = title.toLowerCase();

  // CXO & Founder level
  if (/\b(ceo|cto|cfo|coo|cmo|cio|cpo|chief|founder|co-founder|cofounder|president)\b/.test(t) &&
      !/vice president/.test(t)) {
    return "CXO";
  }

  // VP & SVP level
  if (/\b(svp|evp|senior vice president|executive vice president|vice president|vp)\b/.test(t)) {
    return "VP";
  }

  // Director level
  if (/\b(director|head of|principal)\b/.test(t)) {
    return "DIR";
  }

  // Manager level
  if (/\b(manager|lead|senior|team lead)\b/.test(t)) {
    return "MGR";
  }

  return "IC";
}

/**
 * Compute a lead score (1-10) based on seniority level.
 */
function computeScore(level) {
  const scores = { CXO: 10, VP: 8, DIR: 6, MGR: 4, IC: 2 };
  return scores[level] || 2;
}

/**
 * Enrich a lead with seniority level and score.
 */
function enrichSeniority(lead) {
  const level = classifySeniority(lead.title);
  const score = computeScore(level);
  return { ...lead, level, score };
}

function matchesTargetTitle(leadTitle, targetTitles = DEFAULT_TARGET_TITLES) {
  if (!leadTitle) return false;
  const titleLower = leadTitle.toLowerCase();
  return targetTitles.some((target) => titleLower.includes(target));
}

function filterLeads(leads, targetTitles = DEFAULT_TARGET_TITLES) {
  return leads.filter((lead) => matchesTargetTitle(lead.title, targetTitles));
}

module.exports = {
  filterLeads,
  matchesTargetTitle,
  classifySeniority,
  computeScore,
  enrichSeniority,
  DEFAULT_TARGET_TITLES,
};
