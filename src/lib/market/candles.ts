import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { candleProviders } from "./providers";
import { tracked } from "./status";
import { TIMEFRAME_MS, type AssetRef, type Candle, type CandleProvider, type Timeframe } from "./types";

export interface FetchResult {
  candles: Candle[];
  provider: string;
  errors: { provider: string; error: string }[];
}

/** Try each provider in order; first success wins. Errors are collected, not thrown, unless all fail. */
export async function fetchRecentCandles(
  asset: AssetRef,
  timeframe: Timeframe,
  limit: number,
  providers: CandleProvider[] = candleProviders(),
): Promise<FetchResult> {
  const errors: FetchResult["errors"] = [];
  for (const p of providers) {
    if (!p.supports(asset, timeframe)) continue;
    try {
      const candles = await tracked(p.id, () => p.fetchCandles({ asset, timeframe, limit: Math.min(limit, p.maxPerRequest) }));
      if (candles.length === 0) throw new Error("empty response");
      return { candles, provider: p.id, errors };
    } catch (e) {
      errors.push({ provider: p.id, error: e instanceof Error ? e.message : String(e) });
      logger.warn("candle provider failed, trying next", { provider: p.id, symbol: asset.symbol, timeframe, error: e });
    }
  }
  throw Object.assign(new Error(`All candle providers failed for ${asset.symbol} ${timeframe}: ${errors.map((e) => `${e.provider}: ${e.error}`).join("; ") || "no provider supports this asset"}`), {
    errors,
  });
}

export interface OtherSource {
  source: string;
  candles: Candle[];
  error?: string;
}

/**
 * Recent candles from every provider except `exclude` (the one that supplied the
 * stored series), for cross-checking. Never throws: failures are returned per source.
 */
export async function fetchOtherSources(
  asset: AssetRef,
  timeframe: Timeframe,
  exclude: string,
  limit: number,
  providers: CandleProvider[] = candleProviders(),
): Promise<OtherSource[]> {
  const out: OtherSource[] = [];
  for (const p of providers) {
    if (p.id === exclude || !p.supports(asset, timeframe)) continue;
    try {
      const candles = await tracked(p.id, () => p.fetchCandles({ asset, timeframe, limit: Math.min(limit, p.maxPerRequest) }));
      out.push({ source: p.id, candles });
    } catch (e) {
      logger.warn("cross-check source failed", { provider: p.id, symbol: asset.symbol, timeframe, error: e });
      out.push({ source: p.id, candles: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

/** Paginated historical fetch (for backtests). Uses only providers that support arbitrary ranges. */
export async function fetchHistoricalCandles(
  asset: AssetRef,
  timeframe: Timeframe,
  startTime: number,
  endTime: number,
  providers: CandleProvider[] = candleProviders(),
  maxCandles = 20_000,
): Promise<FetchResult> {
  const errors: FetchResult["errors"] = [];
  const interval = TIMEFRAME_MS[timeframe];
  for (const p of providers) {
    if (!p.supports(asset, timeframe)) continue;
    if (!p.supportsHistoricalRange) {
      // Can still serve if the range lies within its recent window.
      if (Date.now() - startTime > p.maxPerRequest * interval) {
        errors.push({ provider: p.id, error: `only the most recent ${p.maxPerRequest} candles are available` });
        continue;
      }
    }
    try {
      const out: Candle[] = [];
      let cursor = startTime;
      while (cursor <= endTime && out.length < maxCandles) {
        const batch = await tracked(p.id, () => p.fetchCandles({ asset, timeframe, startTime: cursor, endTime, limit: p.maxPerRequest }));
        const filtered = batch.filter((c) => c.openTime >= cursor && c.openTime <= endTime);
        if (filtered.length === 0) break;
        out.push(...filtered);
        cursor = filtered[filtered.length - 1].openTime + interval;
        if (!p.supportsHistoricalRange) break;
      }
      return { candles: out, provider: p.id, errors };
    } catch (e) {
      errors.push({ provider: p.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  throw Object.assign(new Error(`No provider could supply historical candles for ${asset.symbol} ${timeframe}: ${errors.map((e) => `${e.provider}: ${e.error}`).join("; ")}`), {
    errors,
  });
}

/** Bulk upsert candles (latest values win — providers revise the in-progress bar). */
export async function storeCandles(assetId: string, timeframe: Timeframe, candles: Candle[], source: string): Promise<number> {
  if (candles.length === 0) return 0;
  const now = new Date();
  let written = 0;
  for (let i = 0; i < candles.length; i += 500) {
    const chunk = candles.slice(i, i + 500);
    const values = chunk.map(
      (c) =>
        Prisma.sql`(${assetId}, ${timeframe}, ${new Date(c.openTime)}, ${new Date(c.closeTime)}, ${c.open}, ${c.high}, ${c.low}, ${c.close}, ${c.volume}, ${source}, ${now})`,
    );
    written += await db().$executeRaw`
      INSERT INTO "Candle" ("assetId","timeframe","openTime","closeTime","open","high","low","close","volume","source","updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("assetId","timeframe","openTime") DO UPDATE SET
        "closeTime" = EXCLUDED."closeTime", "open" = EXCLUDED."open", "high" = EXCLUDED."high", "low" = EXCLUDED."low",
        "close" = EXCLUDED."close", "volume" = EXCLUDED."volume", "source" = EXCLUDED."source", "updatedAt" = EXCLUDED."updatedAt"`;
  }
  return written;
}

export async function loadCandles(
  assetId: string,
  timeframe: Timeframe,
  opts: { from?: Date; to?: Date; limit?: number } = {},
): Promise<Candle[]> {
  const rows = await db().candle.findMany({
    where: { assetId, timeframe, openTime: { gte: opts.from, lte: opts.to } },
    orderBy: { openTime: "desc" },
    take: opts.limit ?? 1000,
  });
  return rows.reverse().map((r) => ({
    openTime: r.openTime.getTime(),
    closeTime: r.closeTime.getTime(),
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));
}

/**
 * Bring stored candles up to date for an asset/timeframe and return the most
 * recent `keep` candles from the DB.
 */
export async function syncRecentCandles(
  asset: AssetRef & { id: string },
  timeframe: Timeframe,
  keep = 500,
  preferred?: string[],
): Promise<{ candles: Candle[]; provider: string; fetched: number }> {
  const latest = await db().candle.findFirst({ where: { assetId: asset.id, timeframe }, orderBy: { openTime: "desc" }, select: { openTime: true, source: true } });
  const interval = TIMEFRAME_MS[timeframe];
  // Fetch enough to cover the gap since our latest stored candle (+2 for the revised live bar), or a full window.
  const needed = latest ? Math.min(keep, Math.ceil((Date.now() - latest.openTime.getTime()) / interval) + 2) : keep;
  const providers = candleProviders(preferred);
  const res = await fetchRecentCandles(asset, timeframe, Math.max(needed, 3), providers);
  // If the provider changed from what we stored, refresh the full window to avoid mixing sources.
  if (latest && latest.source !== res.provider && needed < keep) {
    const full = await fetchRecentCandles(asset, timeframe, keep, providers);
    await storeCandles(asset.id, timeframe, full.candles, full.provider);
    return { candles: await loadCandles(asset.id, timeframe, { limit: keep }), provider: full.provider, fetched: full.candles.length };
  }
  await storeCandles(asset.id, timeframe, res.candles, res.provider);
  return { candles: await loadCandles(asset.id, timeframe, { limit: keep }), provider: res.provider, fetched: res.candles.length };
}

/** Load a historical range, fetching and caching any portion not already stored. */
export async function ensureHistoricalCandles(
  asset: AssetRef & { id: string },
  timeframe: Timeframe,
  from: Date,
  to: Date,
): Promise<{ candles: Candle[]; source: string }> {
  const interval = TIMEFRAME_MS[timeframe];
  const expected = Math.floor((Math.min(to.getTime(), Date.now()) - from.getTime()) / interval);
  const stored = await db().candle.count({ where: { assetId: asset.id, timeframe, openTime: { gte: from, lte: to } } });
  let source = "database cache";
  if (stored < expected * 0.98) {
    const res = await fetchHistoricalCandles(asset, timeframe, from.getTime(), to.getTime());
    await storeCandles(asset.id, timeframe, res.candles, res.provider);
    source = res.provider;
  }
  return { candles: await loadCandles(asset.id, timeframe, { from, to, limit: 50_000 }), source };
}
