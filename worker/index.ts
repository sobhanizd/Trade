/**
 * CryptoPilot AI background worker. Runs independently of any browser:
 * market scans, snapshots, news, retention and notification retries.
 *
 *   npm run worker          # long-running scheduler
 *   npm run worker:once     # run every job once and exit (cron / debugging)
 */
import "dotenv/config";
import cron from "node-cron";
import { bootstrap } from "@/lib/bootstrap";
import { disconnectDb } from "@/lib/db";
import { env } from "@/lib/env";
import { runMaintenance } from "@/lib/jobs/maintenance";
import { runNews } from "@/lib/jobs/news";
import { runJob } from "@/lib/jobs/runner";
import { runScan } from "@/lib/jobs/scan";
import { runSnapshot } from "@/lib/jobs/snapshot";
import { logger } from "@/lib/logger";

const jobs = {
  snapshot: () => runJob("snapshot", () => runSnapshot()),
  scan: () => runJob("scan", () => runScan()),
  news: () => runJob("news", () => runNews()),
  maintenance: () => runJob("maintenance", () => runMaintenance()),
};

async function main() {
  const e = env(); // fail fast on invalid configuration
  await bootstrap();
  if (process.argv.includes("--once")) {
    for (const [name, fn] of Object.entries(jobs)) {
      const r = await fn();
      logger.info(`job ${name}`, { status: r.status, error: r.error });
    }
    await disconnectDb();
    return;
  }

  const tasks = [
    cron.schedule(e.SNAPSHOT_CRON, () => void jobs.snapshot(), { name: "snapshot", noOverlap: true }),
    cron.schedule(e.SCAN_CRON, () => void jobs.scan(), { name: "scan", noOverlap: true }),
    cron.schedule(e.NEWS_CRON, () => void jobs.news(), { name: "news", noOverlap: true }),
    cron.schedule(e.MAINTENANCE_CRON, () => void jobs.maintenance(), { name: "maintenance", noOverlap: true }),
  ];
  logger.info("worker started", { scan: e.SCAN_CRON, snapshot: e.SNAPSHOT_CRON, news: e.NEWS_CRON, maintenance: e.MAINTENANCE_CRON });

  // Warm start: populate data immediately instead of waiting for the first tick.
  void (async () => {
    await jobs.snapshot();
    await jobs.scan();
    await jobs.news();
  })();

  const shutdown = async (sig: string) => {
    logger.info("worker shutting down", { signal: sig });
    for (const t of tasks) await t.stop();
    await disconnectDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

process.on("unhandledRejection", (e) => logger.error("unhandled rejection", { error: e }));

main().catch(async (e) => {
  logger.error("worker failed to start", { error: e });
  await disconnectDb().catch(() => undefined);
  process.exit(1);
});
