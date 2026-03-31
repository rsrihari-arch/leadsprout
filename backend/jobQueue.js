const { runPipeline } = require("./modules/pipeline");

// In-memory job store
const jobs = new Map();
let jobCounter = 0;

// Sequential queue — only one job runs at a time
const queue = [];
let processing = false;

async function runQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const job = queue.shift();
    try {
      if (job.type === "single") {
        await processJob(job);
      } else {
        await processBulkJob(job);
      }
    } catch (err) {
      job.state = "failed";
      job.progress = { status: "failed", message: err.message };
      console.error(`[Queue] Job ${job.id} failed:`, err.message);
    }
  }

  processing = false;
}

function createJob(company, roles) {
  const id = String(++jobCounter);
  const job = {
    id,
    type: "single",
    data: { company, roles },
    state: "queued",
    progress: { status: "queued", message: "Waiting in queue..." },
    result: null,
  };
  jobs.set(id, job);
  queue.push(job);
  runQueue();
  return job;
}

function createBulkJob(companies, roles) {
  const id = String(++jobCounter);
  const job = {
    id,
    type: "bulk",
    data: { companies, roles },
    state: "queued",
    progress: { status: "queued", message: `Queued — ${companies.length} companies` },
    result: null,
  };
  jobs.set(id, job);
  queue.push(job);
  runQueue();
  return job;
}

async function processJob(job) {
  console.log(`[Queue] Processing job ${job.id} — company: ${job.data.company}`);
  job.state = "active";

  const leads = await runPipeline(job.data.company, job.id, job.data.roles, (msg) => {
    job.progress = { status: "running", message: msg };
  });

  job.state = "completed";
  job.result = { success: true, leadCount: leads.length, leads };
  job.progress = { status: "completed", message: `Done — ${leads.length} leads found` };
  console.log(`[Queue] Job ${job.id} completed — ${leads.length} leads`);
}

async function processBulkJob(job) {
  const { companies, roles } = job.data;
  const allLeads = [];
  let processed = 0;

  console.log(`[Queue] Bulk job ${job.id} — ${companies.length} companies`);
  job.state = "active";

  for (const company of companies) {
    processed++;
    job.progress = {
      status: "running",
      message: `Processing ${company} (${processed}/${companies.length})`,
    };

    try {
      const leads = await runPipeline(company, job.id, roles, (msg) => {
        job.progress = {
          status: "running",
          message: `[${processed}/${companies.length}] ${company}: ${msg}`,
        };
      }, { bulk: true });
      allLeads.push(...leads);
    } catch (err) {
      console.error(`[Queue] Bulk job — failed for ${company}:`, err.message);
    }
  }

  job.state = "completed";
  job.result = {
    success: true,
    leadCount: allLeads.length,
    leads: allLeads,
    companiesProcessed: processed,
  };
  job.progress = {
    status: "completed",
    message: `Done — ${allLeads.length} leads from ${processed} companies`,
  };
  console.log(`[Queue] Bulk job ${job.id} completed — ${allLeads.length} leads from ${processed} companies`);
}

function getJob(id) {
  return jobs.get(id) || null;
}

module.exports = { createJob, createBulkJob, getJob };
