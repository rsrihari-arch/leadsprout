const { discoverLeads } = require("./leadDiscovery");
const { filterLeads, enrichSeniority } = require("./leadFilter");
const { validateLinkedIn } = require("./linkedinValidator");
const { enrichEmail } = require("./emailGenerator");
const { findPhone } = require("./phoneFinder");
const { insertLead } = require("../db");
const apollo = require("./apolloClient");

/**
 * Run the full lead enrichment pipeline.
 *
 * Flow:
 *  1. Discover leads (Apollo.io first, then Google fallback)
 *  2. Filter by target titles
 *  3. Classify seniority + score
 *  4. Validate LinkedIn URLs
 *  5. Generate emails (skip if Apollo already provided)
 *  6. Find phone numbers (skip if Apollo already provided)
 *  7. Save to database
 */
async function runPipeline(company, jobId, roles, onProgress, opts = {}) {
  const log = (msg) => {
    console.log(`[Pipeline][${jobId}] ${msg}`);
    if (onProgress) onProgress(msg);
  };

  const searchRoles = roles && roles.length > 0
    ? roles
    : ["CFO", "Founder", "Finance Head", "CEO"];

  let leads = [];
  let fromApollo = false;

  // Step 1: Discover via Apollo.io (primary)
  if (apollo.isConfigured()) {
    log(`Searching Apollo.io for "${company}" leads...`);
    const maxPages = opts.bulk ? 1 : 5;
    for (let pg = 1; pg <= maxPages; pg++) {
      const batch = await apollo.searchPeople(company, searchRoles, pg, 10);
      if (batch.length === 0) break;
      leads.push(...batch);
      log(`Apollo page ${pg}: ${batch.length} leads (total: ${leads.length})`);
      if (batch.length < 10) break; // last page
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (leads.length > 0) {
      fromApollo = true;
      log(`Apollo returned ${leads.length} leads total`);
    } else {
      log("Apollo returned 0 results — falling back to Google search");
    }
  }

  // Step 1b: Fallback to Google scraping (skip for bulk — too slow on corporate networks)
  if (leads.length === 0 && !opts.bulk) {
    log(`Discovering leads for "${company}" with roles: ${searchRoles.join(", ")}`);
    leads = await discoverLeads(company, searchRoles);
    log(`Found ${leads.length} raw leads`);
  } else if (leads.length === 0 && opts.bulk) {
    log(`No Apollo results for "${company}" — skipping (bulk mode)`);
  }

  if (leads.length === 0) {
    log("No leads found. Pipeline complete.");
    return [];
  }

  // Step 2: Filter by target titles
  log("Filtering leads by target titles...");
  let filtered = filterLeads(leads);
  if (filtered.length === 0) {
    log("No leads matched title filter — keeping all discovered leads");
    filtered = leads;
  } else {
    log(`${filtered.length} leads passed title filter`);
  }

  // Step 3: Seniority classification + scoring
  log("Classifying seniority levels...");
  let scored = filtered.map((lead) => enrichSeniority(lead));
  scored.sort((a, b) => b.score - a.score);
  log("Seniority scoring complete");

  // Step 4: Validate LinkedIn
  log("Validating LinkedIn URLs...");
  let validated = scored.map((lead) => validateLinkedIn(lead));
  log("LinkedIn validation complete");

  // Step 5: Email enrichment (skip leads that already have emails from Apollo)
  log("Generating email addresses...");
  let enriched = validated.map((lead) => {
    if (lead.email && lead.source === "apollo") return lead;
    return enrichEmail(lead);
  });
  log("Email enrichment complete");

  // Step 6: Phone enrichment (skip for Apollo leads — too slow via scraping)
  const withPhones = [];
  if (fromApollo) {
    log("Skipping phone scraping for Apollo leads (data already enriched)");
    withPhones.push(...enriched.map((l) => ({ ...l, phone: l.phone || null, phone_confidence: l.phone ? "medium" : "none" })));
  } else {
    log("Searching for phone numbers...");
    for (const lead of enriched) {
      try {
        const result = await findPhone(lead);
        withPhones.push(result);
      } catch (err) {
        console.error(`[Pipeline] Phone search failed for ${lead.name}:`, err.message);
        withPhones.push({ ...lead, phone: null, phone_confidence: "none" });
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    log("Phone enrichment complete");
  }

  // Step 7: Save to database
  log("Saving leads to database...");
  const saved = [];
  for (const lead of withPhones) {
    try {
      const row = insertLead({ ...lead, job_id: jobId });
      saved.push(row);
    } catch (err) {
      console.error(`[Pipeline] Failed to save lead ${lead.name}:`, err.message);
      saved.push(lead);
    }
  }
  log(`Pipeline complete — ${saved.length} leads saved`);

  return saved;
}

module.exports = { runPipeline };
