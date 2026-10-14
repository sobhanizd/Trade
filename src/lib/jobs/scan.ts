/**
 * Scheduled market scan. For every (watched asset × scanned timeframe):
 *  1. sync candles from the provider chain (with failover),
 *  2. run data-quality checks, including a cross-check of the closes against a
 *     second exchange (big disagreement = bad data = no signal),
 *  3. evaluate each enabled strategy on the latest CLOSED candle — at most
 *     once per candle thanks to the AnalysisRun unique key (idempotent),
 *     and again on the second exchange's candles (a "second opinion" stored on the signal),
 *  4. persist signal state changes, send alerts, track paper trades,
 *  5. invalidate/expire active signals and raise stale-data system alerts.
 */
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { fetchOtherSources, loadCandles, syncRecentCandles, type OtherSource } from "@/lib/market/candles";
import { buildSourceCheck, compareCandles, crossSourceIssue, opinionFrom, type SignalSourceCheck, type SourceOpinion } from "@/lib/market/crosscheck";
import { candleProviders } from "@/lib/market/providers";
import { checkCandleQuality } from "@/lib/market/quality";
import { TIMEFRAME_MS, type Candle, type Timeframe } from "@/lib/market/types";
import { notify, processPendingDeliveries } from "@/lib/notifications/dispatch";
import { formatProviderProblemAlert, formatStaleDataAlert } from "@/lib/notifications/format";
import { autoTrackSignal, closeAutoTradesOnExit, updateOpenPaperTrades } from "@/lib/paper/service";
import { analyzeLatest, annotateCrossStrategyConflicts, type SignalResult } from "@/lib/signals/evaluate";
import { checkInvalidationsAndExpiry, processResult } from "@/lib/signals/lifecycle";
import { costsFromSettings, parseSettings, type UserSettingsData } from "@/lib/settings/schema";
import { getSettings, getStrategyConfigs, type ResolvedStrategyConfig } from "@/lib/settings/service";
import { IndicatorCache } from "@/lib/strategies/cache";

interface WorkUser {
  userId: string;
  settings: UserSettingsData;
  configs: ResolvedStrategyConfig[];
}
interface WorkItem {
  asset: { id: string; symbol: string; quote: string; binanceSymbol: string | null; krakenPair: string | null };
  timeframe: Timeframe;
  users: WorkUser[];
}

/** Candles fetched from each other exchange for the cross-check (Kraken serves at most 720). */
const CROSS_CHECK_CANDLES = 720;

export interface ScanOptions {
  now?: Date;
  /** Re-evaluate even if this candle was already analysed. */
  force?: boolean;
  /** Restrict to a user (manual "scan now"). */
  userId?: string;
}

export async function buildWorkList(userId?: string): Promise<WorkItem[]> {
  const users = await db().user.findMany({
    where: userId ? { id: userId } : undefined,
    include: { settings: true, watchlist: { include: { asset: true } } },
  });
  const map = new Map<string, WorkItem>();
  for (const u of users) {
    const settings = parseSettings(u.settings?.data);
    const configs = (await getStrategyConfigs(u.id)).filter((c) => c.enabled);
    for (const w of u.watchlist) {
      for (const tf of settings.timeframes) {
        const cfgs = configs.filter((c) => c.timeframes.includes(tf));
        if (!cfgs.length) continue;
        const key = `${w.assetId}:${tf}`;
        const item = map.get(key) ?? { asset: w.asset, timeframe: tf, users: [] };
        item.users.push({ userId: u.id, settings, configs: cfgs });
        map.set(key, item);
      }
    }
  }
  return [...map.values()];
}

async function latestEvidence(userId: string, assetId: string, strategyId: string, timeframe: string) {
  const run = await db().backtestRun.findFirst({
    where: { userId, assetId, strategyId, timeframe, status: "SUCCESS" },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, startDate: true, endDate: true, metrics: true, benchmark: true },
  });
  if (!run) return null;
  const m = run.metrics as Record<string, number | null> | null;
  return {
    backtestRunId: run.id,
    ranAt: run.createdAt.toISOString(),
    period: { from: run.startDate.toISOString(), to: run.endDate.toISOString() },
    trades: m?.trades ?? null,
    winRatePct: m?.winRatePct ?? null,
    netReturnPct: m?.netReturnPct ?? null,
    maxDrawdownPct: m?.maxDrawdownPct ?? null,
    profitFactor: m?.profitFactor ?? null,
    benchmarkReturnPct: (run.benchmark as { netReturnPct?: number } | null)?.netReturnPct ?? null,
  };
}

const sameParams = (a: unknown, b: Record<string, number>) => {
  const x = (a ?? {}) as Record<string, number>;
  return Object.keys(b).length === Object.keys(x).length && Object.entries(b).every(([k, v]) => x[k] === v);
};

async function usersWithStaleConfigs(item: WorkItem, assetId: string, timeframe: Timeframe): Promise<WorkUser[]> {
  const out: WorkUser[] = [];
  for (const u of item.users) {
    const active = await db().signal.findMany({ where: { userId: u.userId, assetId, timeframe, status: "ACTIVE" }, select: { strategyId: true, strategyVersion: true, params: true } });
    const stale = u.configs.some((c) => {
      const s = active.find((a) => a.strategyId === c.def.id);
      return !s || s.strategyVersion !== c.def.version || !sameParams(s.params, c.params);
    });
    if (stale) out.push(u);
  }
  return out;
}

export async function runScan(opts: ScanOptions = {}) {
  const now = opts.now ?? new Date();
  const items = await buildWorkList(opts.userId);
  const stats = { items: items.length, analysed: 0, skippedAlreadyAnalysed: 0, noSignal: 0, newSignals: 0, alerts: 0, fetchErrors: 0, invalidated: 0, expired: 0, paperClosed: 0, crossChecked: 0, sourceMismatches: 0, secondOpinionDisagreements: 0 };
  const failures: { symbol: string; timeframe: string; error: string }[] = [];
  const stale: { symbol: string; timeframe: string; minutes: number }[] = [];

  for (const item of items) {
    const { asset, timeframe } = item;
    const log = logger.child({ symbol: asset.symbol, timeframe });
    let candles: Candle[];
    let provider: string;
    const preferred = item.users[0]?.settings.dataProviders.candleOrder;
    try {
      const res = await syncRecentCandles(asset, timeframe, 600, preferred);
      candles = res.candles;
      provider = res.provider;
    } catch (e) {
      stats.fetchErrors++;
      failures.push({ symbol: asset.symbol, timeframe, error: e instanceof Error ? e.message : String(e) });
      log.warn("candle sync failed", { error: e });
      // Use whatever is stored so that invalidation/staleness checks still run.
      candles = await loadCandles(asset.id, timeframe, { limit: 600 });
      provider = "database cache";
    }

    const quality = checkCandleQuality(candles, { timeframe, now: now.getTime(), minCandles: 30 });
    const last = quality.candles[quality.candles.length - 1];
    if (last) {
      const ageMin = (now.getTime() - last.closeTime) / 60_000;
      if (ageMin > TIMEFRAME_MS[timeframe] / 60_000 + Math.min(...item.users.map((u) => u.settings.alerts.system.staleMinutes))) stale.push({ symbol: asset.symbol, timeframe, minutes: Math.round(ageMin) });
    }

    // Idempotency: one analysis per (asset, timeframe, closed candle).
    const lastOpen = quality.report.lastClosedOpenTime;
    const runKey = lastOpen !== null ? { assetId_timeframe_candleOpenTime: { assetId: asset.id, timeframe, candleOpenTime: new Date(lastOpen) } } : null;
    const existing = runKey ? await db().analysisRun.findUnique({ where: runKey, select: { id: true } }) : null;
    let analysisRunId: string | null = existing?.id ?? null;
    // Even when this candle was already analysed, re-evaluate users whose configuration changed since
    // (new strategy/timeframe/asset, edited parameters, or a new strategy version).
    let usersToEvaluate = !existing || opts.force ? item.users : await usersWithStaleConfigs(item, asset.id, timeframe);

    // Cross-check against the other exchanges — only when an analysis will actually run (once per candle).
    let others: OtherSource[] = [];
    if (usersToEvaluate.length && lastOpen !== null && provider !== "database cache") {
      others = await fetchOtherSources(asset, timeframe, provider, CROSS_CHECK_CANDLES, candleProviders(preferred));
      const comparisons = others.map((o) =>
        o.error ? { ...compareCandles(provider, quality.candles, o.source, [], lastOpen), error: o.error.slice(0, 200) } : compareCandles(provider, quality.candles, o.source, o.candles, lastOpen),
      );
      quality.report.crossSource = comparisons;
      for (const c of comparisons) {
        const issue = crossSourceIssue(c);
        if (issue) quality.report.issues.push(issue);
        if (c.verdict === "DISAGREE") log.warn("exchanges disagree on candle closes", { source: c.source, lastDiffPct: c.lastDiffPct, medianDiffPct: c.medianDiffPct });
      }
      quality.report.ok = !quality.report.issues.some((i) => i.severity === "blocking");
      stats.crossChecked++;
      if (comparisons.some((c) => c.verdict === "DISAGREE")) stats.sourceMismatches++;
    }

    if (runKey && !existing) {
      try {
        const run = await db().analysisRun.create({
          data: {
            ...runKey.assetId_timeframe_candleOpenTime,
            status: quality.report.ok ? "OK" : "NO_SIGNAL",
            dataQuality: quality.report as unknown as object,
            provider,
            finishedAt: now,
          },
        });
        analysisRunId = run.id;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          // Another scan analysed this candle concurrently.
          analysisRunId = (await db().analysisRun.findUnique({ where: runKey, select: { id: true } }))?.id ?? null;
          if (!opts.force) usersToEvaluate = await usersWithStaleConfigs(item, asset.id, timeframe);
        } else throw e;
      }
    } else if (existing && quality.report.crossSource) {
      await db().analysisRun.update({ where: { id: existing.id }, data: { status: quality.report.ok ? "OK" : "NO_SIGNAL", dataQuality: quality.report as unknown as object } });
    }

    if (usersToEvaluate.length) {
      stats.analysed++;
      const ind = new IndicatorCache(quality.candles);
      // The other exchanges' series, gated the same way (only comparable if they include the same closed candle).
      const seconds = others.map((o) => {
        const q = o.error ? null : checkCandleQuality(o.candles, { timeframe, now: now.getTime(), minCandles: 30 });
        return { source: o.source, raw: o.candles, q, sameCandle: q?.report.lastClosedOpenTime === lastOpen, ind: q ? new IndicatorCache(q.candles) : null };
      });
      for (const u of usersToEvaluate) {
        const costs = costsFromSettings(u.settings);
        let results = u.configs.map((c) => analyzeLatest(c.def, candles, c.params, timeframe, { now: now.getTime(), costs, ind, quality }).result);
        results = annotateCrossStrategyConflicts(results);
        const secondOpinion = (r: SignalResult, i: number): SignalSourceCheck | null => {
          if (!seconds.length) return null;
          const c = u.configs[i];
          const opinions: SourceOpinion[] = seconds.map((sec) => {
            if (!sec.q || !sec.ind) return opinionFrom(sec.source, r.state, null, "UNAVAILABLE");
            if (!sec.sameCandle) return opinionFrom(sec.source, r.state, null, "LAGGING");
            const alt = analyzeLatest(c.def, sec.raw, c.params, timeframe, { now: now.getTime(), costs, ind: sec.ind, quality: sec.q }).result;
            return opinionFrom(sec.source, r.state, alt.state);
          });
          return buildSourceCheck(provider, opinions, quality.report.crossSource ?? [], now);
        };
        for (const [i, r] of results.entries()) {
          if (r.state === "NO_SIGNAL") stats.noSignal++;
          const sourceCheck = secondOpinion(r, i);
          if (sourceCheck?.agreement === "NOT_CONFIRMED") stats.secondOpinionDisagreements++;
          const evidence = await latestEvidence(u.userId, asset.id, r.strategyId, timeframe);
          const pair = provider === "kraken" ? `${asset.symbol}USD` : `${asset.symbol}${asset.quote}`;
          const out = await processResult(u.userId, asset, pair, r, analysisRunId, u.settings, evidence, now, sourceCheck);
          if (out.created) {
            stats.newSignals++;
            await autoTrackSignal(u.userId, u.settings, out.signal);
            stats.paperClosed += await closeAutoTradesOnExit(u.userId, out.signal);
          }
          if (out.notified) stats.alerts++;
        }
      }
    } else stats.skippedAlreadyAnalysed++;

    // Invalidation uses ALL candles (including the in-progress one) after the signal's data time.
    const lowSince = (since: Date) => {
      const lows = candles.filter((c) => c.closeTime > since.getTime() && c.openTime <= now.getTime()).map((c) => c.low);
      return lows.length ? Math.min(...lows) : null;
    };
    for (const u of item.users) {
      const r = await checkInvalidationsAndExpiry(u.userId, asset, timeframe, lowSince, u.settings, now);
      stats.invalidated += r.invalidated;
      stats.expired += r.expired;
    }
  }

  // Paper trades: stop/target checks against the finest stored candles.
  const paper = await updateOpenPaperTrades(async (assetId, since) => {
    for (const tf of ["1h", "4h", "1d"] as Timeframe[]) {
      const cs = await loadCandles(assetId, tf, { from: new Date(since.getTime() - TIMEFRAME_MS[tf]), limit: 5000 });
      if (cs.length) return cs;
    }
    return [];
  });
  stats.paperClosed += paper.closed;

  // System alerts (stale data / provider failures), at most once per 6 hours each.
  const bucket = Math.floor(now.getTime() / (6 * 3_600_000));
  const userIds = [...new Set(items.flatMap((i) => i.users.map((u) => u.userId)))];
  for (const userId of userIds) {
    const settings = await getSettings(userId);
    if (!settings.alerts.system.enabled) continue;
    if (failures.length) {
      await notify(userId, settings, {
        kind: "SYSTEM",
        ...formatProviderProblemAlert(failures, settings.language),
        url: `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/status`,
        dedupeKey: `sys:provider:${bucket}`,
      }, { now });
    }
    if (stale.length) {
      await notify(userId, settings, {
        kind: "SYSTEM",
        ...formatStaleDataAlert(stale, settings.language),
        url: `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/status`,
        dedupeKey: `sys:stale:${bucket}`,
      }, { now });
    }
  }

  const deliveries = await processPendingDeliveries(getSettings, now);
  return { ...stats, failures: failures.length, stale: stale.length, deliveriesRetried: deliveries.processed };
}
