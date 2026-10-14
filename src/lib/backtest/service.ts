import { db } from "@/lib/db";
import { ensureHistoricalCandles } from "@/lib/market/candles";
import { checkCandleQuality } from "@/lib/market/quality";
import { TIMEFRAME_MS, type Timeframe } from "@/lib/market/types";
import { getStrategy, resolveParams, validateStrategyParams } from "@/lib/strategies/registry";
import { runBacktest, type BacktestSettings } from "./engine";

export const MAX_BACKTEST_CANDLES = 20_000;

export interface BacktestRequest {
  symbol: string;
  strategyId: string;
  timeframe: Timeframe;
  params?: Record<string, unknown>;
  from: Date;
  to: Date;
  settings: Partial<BacktestSettings>;
}

export async function runAndStoreBacktest(userId: string, req: BacktestRequest) {
  const def = getStrategy(req.strategyId);
  if (!def) throw new Error("Unknown strategy.");
  const asset = await db().asset.findUnique({ where: { symbol: req.symbol.toUpperCase() } });
  if (!asset) throw new Error("Unknown asset. Add it to your watchlist first.");
  const params = resolveParams(def.params, req.params);
  const paramErrors = validateStrategyParams(def, params);
  if (paramErrors.length) throw new Error(paramErrors.join(" "));
  const to = new Date(Math.min(req.to.getTime(), Date.now()));
  if (req.from >= to) throw new Error("The start date must be before the end date.");
  const interval = TIMEFRAME_MS[req.timeframe];
  const warmup = def.warmup(params);
  const span = Math.ceil((to.getTime() - req.from.getTime()) / interval);
  if (span + warmup > MAX_BACKTEST_CANDLES) throw new Error(`Range too large: ${span} candles (max ${MAX_BACKTEST_CANDLES - warmup}). Choose a shorter range or a larger timeframe.`);
  // Load extra history before `from` so indicators are warmed up at the start of the test window.
  const dataFrom = new Date(req.from.getTime() - (warmup + 2) * interval);

  const run = await db().backtestRun.create({
    data: { userId, assetId: asset.id, strategyId: def.id, timeframe: req.timeframe, params, settings: req.settings as object, startDate: req.from, endDate: to, status: "RUNNING" },
  });
  try {
    const { candles: raw, source } = await ensureHistoricalCandles(asset, req.timeframe, dataFrom, to);
    const q = checkCandleQuality(raw, { timeframe: req.timeframe, now: Date.now(), minCandles: warmup + 10, maxStaleIntervals: Number.POSITIVE_INFINITY, maxGapRatio: 0.02 });
    if (!q.report.ok) throw new Error(`Historical data failed quality checks: ${q.report.issues.filter((i) => i.severity === "blocking").map((i) => i.message).join(" ")}`);
    const result = runBacktest(def, q.candles, params, req.timeframe, req.settings);
    const dataWarnings = q.report.issues.map((i) => `Data: ${i.message}`);
    await db().$transaction([
      db().backtestTrade.createMany({
        data: result.trades.map((t) => ({
          runId: run.id,
          segment: t.segment,
          entryTime: new Date(t.entryTime),
          entryPrice: t.entryPrice,
          exitTime: new Date(t.exitTime),
          exitPrice: t.exitPrice,
          exitReason: t.exitReason,
          quantity: t.quantity,
          stopPrice: t.stopPrice,
          targetPrice: t.targetPrice,
          grossPnl: t.grossPnl,
          fees: t.fees,
          slippageCost: t.slippageCost,
          netPnl: t.netPnl,
          returnPct: t.returnPct,
          rMultiple: t.rMultiple,
          entryState: t.entryState,
          barsHeld: t.barsHeld,
        })),
      }),
      db().backtestRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          candleCount: q.candles.length,
          dataSource: source,
          metrics: { ...result.metrics, inSample: result.inSample, outOfSample: result.outOfSample, finalEquity: result.finalEquity, splitTime: result.splitTime, skippedEntries: result.skippedEntries } as object,
          benchmark: result.benchmark,
          equityCurve: result.equityCurve,
          warnings: [...result.warnings, ...dataWarnings],
        },
      }),
    ]);
    return db().backtestRun.findUniqueOrThrow({ where: { id: run.id } });
  } catch (e) {
    await db().backtestRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: (e as Error).message.slice(0, 1000) } });
    throw e;
  }
}
