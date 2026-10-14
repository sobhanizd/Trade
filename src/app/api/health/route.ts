import { NextResponse } from "next/server";
import { db, pingDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public liveness/readiness probe — reveals no configuration details. */
export async function GET() {
  const dbStatus = await pingDb();
  let scanAgeMin: number | null = null;
  if (dbStatus.ok) {
    const last = await db().jobRun.findFirst({ where: { job: "scan", status: "SUCCESS" }, orderBy: { startedAt: "desc" } }).catch(() => null);
    scanAgeMin = last ? Math.round((Date.now() - last.startedAt.getTime()) / 60_000) : null;
  }
  const ok = dbStatus.ok;
  return NextResponse.json({ ok, db: dbStatus.ok, lastScanMinutesAgo: scanAgeMin, time: new Date().toISOString() }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
