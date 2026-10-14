import { db, pingDb } from "@/lib/db";
import { integrationStatus } from "@/lib/env";

export async function getSystemStatus() {
  const database = await pingDb();
  if (!database.ok) return { database, providers: [], jobs: [], integrations: integrationStatus(), freshness: [] };
  const providers = await db().providerStatus.findMany({ orderBy: { provider: "asc" } });
  const jobNames = ["scan", "snapshot", "news", "maintenance"];
  const jobs = await Promise.all(
    jobNames.map(async (job) => {
      const last = await db().jobRun.findFirst({ where: { job }, orderBy: { startedAt: "desc" } });
      const lastSuccess = await db().jobRun.findFirst({ where: { job, status: "SUCCESS" }, orderBy: { startedAt: "desc" } });
      const failures24h = await db().jobRun.count({ where: { job, status: "FAILED", startedAt: { gt: new Date(Date.now() - 86_400_000) } } });
      return { job, last, lastSuccess, failures24h };
    }),
  );
  const freshness = await db().$queryRaw<{ symbol: string; timeframe: string; last_close: Date; source: string }[]>`
    SELECT a."symbol", c."timeframe", max(c."closeTime") AS last_close, (array_agg(c."source" ORDER BY c."openTime" DESC))[1] AS source
    FROM "Candle" c JOIN "Asset" a ON a."id" = c."assetId"
    GROUP BY a."symbol", c."timeframe" ORDER BY a."symbol", c."timeframe"`;
  const snapshots = await db().marketSnapshot.findMany({ where: { kind: { in: ["GLOBAL", "SENTIMENT", "FX", "OVERVIEW"] } }, select: { kind: true, source: true, fetchedAt: true, dataTimestamp: true } });
  const deliveryFailures = await db().notificationDelivery.count({ where: { status: "FAILED", updatedAt: { gt: new Date(Date.now() - 86_400_000) } } });
  return { database, providers, jobs, integrations: integrationStatus(), freshness, snapshots, deliveryFailures24h: deliveryFailures };
}
