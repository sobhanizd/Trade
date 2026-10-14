import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

const running = new Set<string>();
const STALE_MS = 30 * 60_000;

export interface JobOutcome {
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  stats?: Record<string, unknown>;
  error?: string;
  jobRunId?: string;
}

/**
 * Run a named job with overlap protection (in-process + DB "RUNNING" check)
 * and a JobRun record for monitoring. Jobs themselves are idempotent.
 */
export async function runJob(name: string, fn: () => Promise<Record<string, unknown>>): Promise<JobOutcome> {
  if (running.has(name)) return { status: "SKIPPED", error: "already running in this process" };
  running.add(name);
  const log = logger.child({ job: name });
  try {
    // Recover crashed runs.
    await db().jobRun.updateMany({ where: { job: name, status: "RUNNING", startedAt: { lt: new Date(Date.now() - STALE_MS) } }, data: { status: "FAILED", error: "Abandoned (worker restarted or crashed)", finishedAt: new Date() } });
    const other = await db().jobRun.findFirst({ where: { job: name, status: "RUNNING" } });
    if (other) {
      log.warn("job skipped: another run in progress", { otherId: other.id });
      return { status: "SKIPPED", error: "another run in progress" };
    }
    const run = await db().jobRun.create({ data: { job: name, status: "RUNNING" } });
    const t = Date.now();
    try {
      const stats = await fn();
      await db().jobRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), stats: { ...stats, durationMs: Date.now() - t } as object } });
      log.info("job finished", { durationMs: Date.now() - t, ...stats });
      return { status: "SUCCESS", stats, jobRunId: run.id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db().jobRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: msg.slice(0, 2000) } }).catch(() => undefined);
      log.error("job failed", { error: e });
      return { status: "FAILED", error: msg, jobRunId: run.id };
    }
  } catch (e) {
    log.error("job runner failure (database unavailable?)", { error: e });
    return { status: "FAILED", error: e instanceof Error ? e.message : String(e) };
  } finally {
    running.delete(name);
  }
}
