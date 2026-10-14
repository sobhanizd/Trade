/** Server-side chart payload: candles + indicators computed from real data only. */
import { bollinger, ema, macd, rsi, sma, supportResistance, atr } from "@/lib/indicators";
import { db } from "@/lib/db";
import { loadCandles } from "./candles";
import { checkCandleQuality } from "./quality";
import { trendLines } from "@/lib/analysis/structure";
import { TIMEFRAME_MS, type Timeframe } from "./types";

const series = (times: number[], vals: (number | null)[]) =>
  vals.map((v, i) => (v === null || !Number.isFinite(v) ? null : { time: Math.floor(times[i] / 1000), value: v })).filter((x): x is { time: number; value: number } => x !== null);

export async function buildChart(assetId: string, timeframe: Timeframe, userId: string, limit = 500) {
  const raw = await loadCandles(assetId, timeframe, { limit });
  const q = checkCandleQuality(raw, { timeframe, minCandles: 1 });
  const candles = raw; // includes in-progress candle for display; indicators use the same array (causal)
  const times = candles.map((c) => c.openTime);
  const closes = candles.map((c) => c.close);
  const m = macd(closes);
  const bb = bollinger(closes, 20, 2);
  const lastClosedIdx = candles.findLastIndex((c) => c.closeTime < Date.now());
  const atrV = lastClosedIdx >= 0 ? atr(candles)[lastClosedIdx] : null;
  const sr = lastClosedIdx >= 20 && atrV ? supportResistance(candles, lastClosedIdx, { tolerance: 0.5 * atrV }) : { supports: [], resistances: [] };
  const signals = await db().signal.findMany({
    where: { userId, assetId, timeframe, state: { in: ["STRONG_BUY_SETUP", "POTENTIAL_BUY", "EXIT_SETUP", "POTENTIAL_SELL"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, state: true, strategyId: true, marketDataAt: true, price: true, status: true, invalidation: true, targets: true, entryLow: true, entryHigh: true },
  });
  return {
    timeframe,
    candles: candles.map((c) => ({ time: Math.floor(c.openTime / 1000), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, closed: c.closeTime < Date.now() })),
    indicators: {
      sma50: series(times, sma(closes, 50)),
      sma200: series(times, sma(closes, 200)),
      ema20: series(times, ema(closes, 20)),
      ema50: series(times, ema(closes, 50)),
      bbUpper: series(times, bb.upper),
      bbMiddle: series(times, bb.middle),
      bbLower: series(times, bb.lower),
      rsi: series(times, rsi(closes, 14)),
      macd: series(times, m.macd),
      macdSignal: series(times, m.signal),
      macdHist: series(times, m.histogram),
    },
    levels: {
      supports: sr.supports.slice(0, 3).map((l) => ({ price: l.price, touches: l.touches })),
      resistances: sr.resistances.slice(0, 3).map((l) => ({ price: l.price, touches: l.touches })),
      method: "Clustered swing pivots (3 bars each side) within 0.5 × ATR(14), last 150 closed candles",
    },
    /** Trend lines through swing lows (support) and swing highs (resistance), drawn up to the last closed candle. */
    trend: (() => {
      const tl = trendLines(candles);
      const line = (l: typeof tl.support) => l && { from: { time: Math.floor(l.t1 / 1000), value: l.p1 }, to: { time: Math.floor(l.tEnd / 1000), value: l.pEnd }, dir: l.dir, touches: l.touches };
      return { support: line(tl.support), resistance: line(tl.resistance), pattern: tl.pattern, brokeSupport: tl.brokeSupport, brokeResistance: tl.brokeResistance };
    })(),
    signals: signals.map((s) => ({ ...s, time: Math.floor((s.marketDataAt.getTime() + 1 - TIMEFRAME_MS[timeframe]) / 1000) })),
    quality: q.report,
  };
}
