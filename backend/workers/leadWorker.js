const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const { runPipeline } = require("../modules/pipeline");
require("dotenv").config();

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "lead-jobs",
  async (job) => {
    const { company, roles } = job.data;
    console.log(`[Worker] Processing job ${job.id} — company: ${company}`);

    try {
      await job.updateProgress({ status: "running", message: "Pipeline started" });

      const leads = await runPipeline(company, job.id, roles, (msg) => {
        job.updateProgress({ status: "running", message: msg });
      });

      return { success: true, leadCount: leads.length, leads };
    } catch (err) {
      console.error(`[Worker] Job ${job.id} failed:`, err.message);
      throw err;
    }
  },
  {
    connection,
    concurrency: 1, // Process one job at a time to respect rate limits
  }
);

worker.on("completed", (job, result) => {
  console.log(`[Worker] Job ${job.id} completed — ${result.leadCount} leads found`);
});

worker.on("failed", (job, err) => {
  console.log(`[Worker] Job ${job?.id} failed:`, err.message);
});

console.log("[Worker] Lead worker started, waiting for jobs...");

module.exports = worker;
