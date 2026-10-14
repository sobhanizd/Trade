import { db } from "@/lib/db";
import { processPendingDeliveries } from "@/lib/notifications/dispatch";
import { getSettings } from "@/lib/settings/service";

const DAY = 86_400_000;

/** Retention policy (documented in docs/OPERATIONS.md). */
export const RETENTION_DAYS = { candles1h: 180, candles4h: 730, notifications: 180, jobRuns: 30, analysisRuns: 120, news: 30, audit: 365 };

export async function runMaintenance(now = new Date()) {
  const ago = (d: number) => new Date(now.getTime() - d * DAY);
  const r = {
    sessions: (await db().session.deleteMany({ where: { expiresAt: { lt: now } } })).count,
    candles1h: (await db().candle.deleteMany({ where: { timeframe: "1h", openTime: { lt: ago(RETENTION_DAYS.candles1h) } } })).count,
    candles4h: (await db().candle.deleteMany({ where: { timeframe: "4h", openTime: { lt: ago(RETENTION_DAYS.candles4h) } } })).count,
    notifications: (await db().notification.deleteMany({ where: { createdAt: { lt: ago(RETENTION_DAYS.notifications) } } })).count,
    jobRuns: (await db().jobRun.deleteMany({ where: { startedAt: { lt: ago(RETENTION_DAYS.jobRuns) } } })).count,
    analysisRuns: (await db().analysisRun.deleteMany({ where: { startedAt: { lt: ago(RETENTION_DAYS.analysisRuns) } } })).count,
    news: (await db().newsItem.deleteMany({ where: { publishedAt: { lt: ago(RETENTION_DAYS.news) } } })).count,
    audit: (await db().auditEvent.deleteMany({ where: { createdAt: { lt: ago(RETENTION_DAYS.audit) } } })).count,
  };
  const deliveries = await processPendingDeliveries(getSettings, now);
  return { deleted: r, deliveries };
}
