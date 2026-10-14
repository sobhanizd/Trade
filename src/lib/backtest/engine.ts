/**
 * Event-driven, long-only spot backtester.
 *
 * Execution model (documented in docs/BACKTESTING.md):
 *  - Signals are evaluated at a candle's CLOSE using only data up to that candle.
 *  - Orders fill at the NEXT candle's OPEN, adjusted for slippage, plus fees.
 *  - Stops/targets are checked intrabar. If both could have been hit in the same
 *    candle, the STOP is assumed to have been hit first (conservative).
 *  - Gaps through the stop fill at the (worse) open price.
 *  - Position size = risk % of current equity ÷ per-unit loss to the stop (incl.
 *    costs), capped at 100% of equity (no leverage, no shorting).
 */
import type { Candle, Timeframe } from "@/lib/market/types";
import { TIMEFRAME_MS } from "@/lib/market/types";
import type { CostModel } from "@/lib/risk/calculator";
import { evaluateAt } from "@/lib/signals/evaluate";
import { IndicatorCache } from "@/lib/strategies/cache";
import { STATE_RANK, type Params, type SignalState, type StrategyDefinition } from "@/lib/strategies/types";

export interface BacktestSettings extends CostModel {
  initialCapital: number;
  riskPerTradePct: number;
  /** Minimum state that opens a trade. */
  minEntryState: "STRONG_BUY_SETUP" | "POTENTIAL_BUY";
  /** Exit at next open when the strategy reports EXIT_SETUP. */
  exitOnSignal: boolean;
  /** Which target to use: 0 = first, 1 = second, -1 = none (exit by signal/stop/time only). */
  targetIndex: number;
  /** Max bars to hold (0 = unlimited). */
  maxBarsInTrade: number;
  /** Bars to wait after an exit before re-entering. */
  cooldownBars: number;
  /** Fraction of the evaluable period reserved as out-of-sample (0–0.5). */
  outOfSampleFraction: number;
}

export const DEFAULT_BACKTEST_SETTINGS: BacktestSettings = {
  initialCapital: 10_000,
  riskPerTradePct: 1,
  feeRate: 0.001,
  slippageRate: 0.0005,
  minEntryState: "STRONG_BUY_SETUP",
  exitOnSignal: true,
  targetIndex: 1,
  maxBarsInTrade: 0,
  cooldownBars: 0,
  outOfSampleFraction: 0.3,
};

export type ExitReason = "STOP" | "TARGET" | "EXIT_SIGNAL" | "TIME" | "END_OF_DATA";

export interface SimTrade {
  segment: "IN_SAMPLE" | "OUT_OF_SAMPLE";
  entryIndex: number;
  exitIndex: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number; // fill incl. slippage
  exitPrice: number; // fill incl. slippage
  quantity: number;
  stopPrice: number;
  targetPrice: number | null;
  grossPnl: number;
  fees: number;
  slippageCost: number;
  netPnl: number;
  returnPct: number; // net PnL / entry notional
  rMultiple: number | null;
  exitReason: ExitReason;
  entryState: SignalState;
  barsHeld: number;
}

export interface Metrics {
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
  grossReturnPct: number;
  netReturnPct: number;
  maxDrawdownPct: number;
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  avgWinPct: number | null;
  avgLossPct: number | null;
  avgR: number | null;
  expectancy: number | null;
  totalFees: number;
  totalSlippage: number;
  exposurePct: number;
  avgBarsHeld: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  maxConsecutiveLosses: number;
}

export interface BacktestResult {
  trades: SimTrade[];
  metrics: Metrics;
  inSample: Metrics;
  outOfSample: Metrics | null;
  benchmark: { name: string; netReturnPct: number; maxDrawdownPct: number };
  equityCurve: { t: number; equity: number; benchmark: number }[];
  warnings: string[];
  evaluatedBars: number;
  firstEvaluatedTime: number | null;
  splitTime: number | null;
  skippedEntries: number;
  finalEquity: number;
}

interface Position {
  entryIndex: number;
  entryRaw: number;
  entryFill: number;
  quantity: number;
  stop: number;
  target: number | null;
  entryFees: number;
  entryState: SignalState;
  riskPerUnit: number;
}

export function runBacktest(
  def: StrategyDefinition,
  candles: Candle[],
  params: Params,
  timeframe: Timeframe,
  settingsIn: Partial<BacktestSettings> = {},
): BacktestResult {
  const s: BacktestSettings = { ...DEFAULT_BACKTEST_SETTINGS, ...settingsIn };
  const n = candles.length;
  const warm = Math.max(def.warmup(params), 2);
  const warnings: string[] = [];
  if (n < warm + 10) throw new Error(`Not enough candles: ${n} available, at least ${warm + 10} required for this strategy (warm-up ${warm}).`);

  const ind = new IndicatorCache(candles);
  const minRank = STATE_RANK[s.minEntryState];
  const splitIndex = warm + Math.floor((n - warm) * (1 - Math.min(0.5, Math.max(0, s.outOfSampleFraction))));
  const fee = s.feeRate;
  const slip = s.slippageRate;

  let cash = s.initialCapital;
  let pos: Position | null = null;
  let pending: { kind: "enter"; stop: number; target: number | null; state: SignalState } | { kind: "exit"; reason: ExitReason } | null = null;
  let cooldownUntil = -1;
  let barsInMarket = 0;
  let skippedEntries = 0;
  const trades: SimTrade[] = [];
  const curve: { t: number; equity: number; benchmark: number }[] = [];

  // Buy & hold benchmark from the first evaluable bar's next open.
  const bhEntry = candles[warm + 1 <= n - 1 ? warm + 1 : warm].open * (1 + slip);
  const bhQty = s.initialCapital / (bhEntry * (1 + fee));

  const closeTrade = (i: number, exitRaw: number, reason: ExitReason, fillOverride?: number) => {
    if (!pos) return;
    const exitFill = fillOverride ?? exitRaw * (1 - slip);
    const exitFees = exitFill * pos.quantity * fee;
    const grossPnl = (exitRaw - pos.entryRaw) * pos.quantity;
    const slippageCost = (pos.entryFill - pos.entryRaw) * pos.quantity + (exitRaw - exitFill) * pos.quantity;
    const fees = pos.entryFees + exitFees;
    const netPnl = grossPnl - slippageCost - fees;
    cash += exitFill * pos.quantity - exitFees;
    const notional = pos.entryFill * pos.quantity;
    trades.push({
      segment: pos.entryIndex >= splitIndex ? "OUT_OF_SAMPLE" : "IN_SAMPLE",
      entryIndex: pos.entryIndex,
      exitIndex: i,
      entryTime: candles[pos.entryIndex].openTime,
      exitTime: reason === "END_OF_DATA" ? candles[i].closeTime : candles[i].openTime,
      entryPrice: pos.entryFill,
      exitPrice: exitFill,
      quantity: pos.quantity,
      stopPrice: pos.stop,
      targetPrice: pos.target,
      grossPnl,
      fees,
      slippageCost,
      netPnl,
      returnPct: notional > 0 ? (netPnl / notional) * 100 : 0,
      rMultiple: pos.riskPerUnit > 0 ? netPnl / (pos.riskPerUnit * pos.quantity) : null,
      exitReason: reason,
      entryState: pos.entryState,
      barsHeld: i - pos.entryIndex + (reason === "END_OF_DATA" ? 1 : 0),
    });
    pos = null;
    cooldownUntil = i + s.cooldownBars;
  };

  for (let i = warm; i < n; i++) {
    const bar = candles[i];

    // 1) Execute pending orders at this bar's open.
    if (pending) {
      if (pending.kind === "exit" && pos) {
        closeTrade(i, bar.open, pending.reason);
      } else if (pending.kind === "enter" && !pos) {
        if (bar.open <= pending.stop) {
          skippedEntries++; // gapped below invalidation before we could enter
        } else {
          const entryFill = bar.open * (1 + slip);
          const stopFill = pending.stop * (1 - slip);
          const riskPerUnit = entryFill - stopFill + entryFill * fee + stopFill * fee;
          const equity = cash;
          let qty = (equity * (s.riskPerTradePct / 100)) / riskPerUnit;
          const maxQty = equity / (entryFill * (1 + fee));
          if (qty > maxQty) qty = maxQty;
          if (qty > 0 && Number.isFinite(qty)) {
            const entryFees = entryFill * qty * fee;
            cash -= entryFill * qty + entryFees;
            pos = { entryIndex: i, entryRaw: bar.open, entryFill, quantity: qty, stop: pending.stop, target: pending.target, entryFees, entryState: pending.state, riskPerUnit };
          }
        }
      }
      pending = null;
    }

    // 2) Intrabar stop / target (stop first when ambiguous).
    if (pos) {
      if (bar.open <= pos.stop) closeTrade(i, bar.open, "STOP");
      else if (bar.low <= pos.stop) closeTrade(i, pos.stop, "STOP");
      else if (pos.target !== null && bar.open >= pos.target) closeTrade(i, bar.open, "TARGET");
      else if (pos.target !== null && bar.high >= pos.target) closeTrade(i, pos.target, "TARGET");
    }
    if (pos) barsInMarket++;

    // 3) Evaluate at this bar's close for actions at the next open.
    if (i < n - 1) {
      if (pos) {
        const held = i - pos.entryIndex + 1;
        if (s.maxBarsInTrade > 0 && held >= s.maxBarsInTrade) pending = { kind: "exit", reason: "TIME" };
        else if (s.exitOnSignal) {
          const r = evaluateAt(def, candles, i, params, timeframe, s, ind);
          if (r.state === "EXIT_SETUP") pending = { kind: "exit", reason: "EXIT_SIGNAL" };
        }
      } else if (i > cooldownUntil) {
        const r = evaluateAt(def, candles, i, params, timeframe, s, ind);
        if (STATE_RANK[r.state] >= minRank && r.direction === "long" && r.invalidation !== null && r.invalidation < bar.close) {
          const target = s.targetIndex >= 0 ? (r.targets[Math.min(s.targetIndex, r.targets.length - 1)] ?? null) : null;
          pending = { kind: "enter", stop: r.invalidation, target, state: r.state };
        }
      }
    }

    const equity = cash + (pos ? pos.quantity * bar.close : 0);
    curve.push({ t: bar.closeTime, equity, benchmark: bhQty * bar.close * (1 - slip) * (1 - fee) });
  }
  if (pos) closeTrade(n - 1, candles[n - 1].close, "END_OF_DATA");

  const finalEquity = cash;
  const evaluated = n - warm;
  const all = computeMetrics(trades, s.initialCapital, curve.map((p) => p.equity), barsInMarket, evaluated);
  const isTrades = trades.filter((t) => t.segment === "IN_SAMPLE");
  const oosTrades = trades.filter((t) => t.segment === "OUT_OF_SAMPLE");
  const splitPos = splitIndex - warm;
  const isCurve = curve.slice(0, splitPos).map((p) => p.equity);
  const oosCurve = curve.slice(splitPos).map((p) => p.equity);
  const inSample = computeMetrics(isTrades, s.initialCapital, isCurve, null, splitPos, finalOf(isCurve, s.initialCapital));
  const outOfSample =
    s.outOfSampleFraction > 0 && oosCurve.length
      ? computeMetrics(oosTrades, oosCurve[0] ?? s.initialCapital, oosCurve, null, oosCurve.length, finalOf(oosCurve, oosCurve[0]))
      : null;

  const bhCurve = curve.map((p) => p.benchmark);
  const benchmark = {
    name: "Buy & hold (same period, with fees & slippage)",
    netReturnPct: bhCurve.length ? (bhCurve[bhCurve.length - 1] / s.initialCapital - 1) * 100 : 0,
    maxDrawdownPct: maxDrawdown([s.initialCapital, ...bhCurve]),
  };

  // Guardrails against over-interpretation.
  if (trades.length === 0) warnings.push("No trades were triggered in this period. Consider a longer range or a different timeframe — do not loosen rules just to get trades.");
  else if (trades.length < 30) warnings.push(`Only ${trades.length} trades: too few for statistically meaningful conclusions.`);
  if (outOfSample && inSample.trades >= 5 && outOfSample.trades >= 3 && outOfSample.netReturnPct < inSample.netReturnPct * 0.5 - 1)
    warnings.push("Out-of-sample performance is much weaker than in-sample — a classic sign of overfitting or a changed market regime.");
  if (outOfSample && outOfSample.trades === 0 && s.outOfSampleFraction > 0) warnings.push("No trades occurred in the out-of-sample period, so the result cannot be validated on unseen data.");
  if (skippedEntries > 0) warnings.push(`${skippedEntries} entr${skippedEntries === 1 ? "y was" : "ies were"} skipped because price gapped below the invalidation level before the fill.`);
  const totalSpanMs = candles[n - 1].closeTime - candles[0].openTime;
  if (totalSpanMs < 180 * 86_400_000) warnings.push("The test period is shorter than 6 months and may cover only one market regime.");
  warnings.push("Results are hypothetical, assume fills at next-candle open with fixed slippage, and do not guarantee future performance.");
  warnings.push("Survivorship bias: only assets that still exist and trade today can be tested; delisted coins are missing from the sample.");

  return {
    trades,
    metrics: all,
    inSample,
    outOfSample,
    benchmark,
    equityCurve: downsample(curve, 600),
    warnings,
    evaluatedBars: evaluated,
    firstEvaluatedTime: candles[warm]?.closeTime ?? null,
    splitTime: s.outOfSampleFraction > 0 ? (candles[splitIndex]?.openTime ?? null) : null,
    skippedEntries,
    finalEquity,
  };
}

const finalOf = (curve: number[], fallback: number) => (curve.length ? curve[curve.length - 1] : fallback);

export function maxDrawdown(equity: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const e of equity) {
    peak = Math.max(peak, e);
    if (peak > 0) mdd = Math.max(mdd, (peak - e) / peak);
  }
  return mdd * 100;
}

export function computeMetrics(
  trades: SimTrade[],
  initial: number,
  equityCurve: number[],
  barsInMarket: number | null,
  totalBars: number,
  finalEquity?: number,
): Metrics {
  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl <= 0);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const totalFees = sum(trades.map((t) => t.fees));
  const totalSlippage = sum(trades.map((t) => t.slippageCost));
  const end = finalEquity ?? (equityCurve.length ? equityCurve[equityCurve.length - 1] : initial);
  const netReturnPct = (end / initial - 1) * 100;
  const grossReturnPct = ((end + totalFees + totalSlippage) / initial - 1) * 100;
  const grossWins = sum(wins.map((t) => t.netPnl));
  const grossLosses = Math.abs(sum(losses.map((t) => t.netPnl)));
  const rs = trades.map((t) => t.rMultiple).filter((x): x is number => x !== null);
  let streak = 0;
  let maxStreak = 0;
  for (const t of trades) {
    streak = t.netPnl <= 0 ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }
  const held = barsInMarket ?? sum(trades.map((t) => t.barsHeld));
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: trades.length ? (wins.length / trades.length) * 100 : null,
    grossReturnPct,
    netReturnPct,
    maxDrawdownPct: maxDrawdown([initial, ...equityCurve]),
    profitFactor: grossLosses > 0 ? grossWins / grossLosses : null,
    avgWin: wins.length ? grossWins / wins.length : null,
    avgLoss: losses.length ? -grossLosses / losses.length : null,
    avgWinPct: wins.length ? sum(wins.map((t) => t.returnPct)) / wins.length : null,
    avgLossPct: losses.length ? sum(losses.map((t) => t.returnPct)) / losses.length : null,
    avgR: rs.length ? sum(rs) / rs.length : null,
    expectancy: trades.length ? sum(trades.map((t) => t.netPnl)) / trades.length : null,
    totalFees,
    totalSlippage,
    exposurePct: totalBars > 0 ? (held / totalBars) * 100 : 0,
    avgBarsHeld: trades.length ? sum(trades.map((t) => t.barsHeld)) / trades.length : null,
    largestWin: wins.length ? Math.max(...wins.map((t) => t.netPnl)) : null,
    largestLoss: losses.length ? Math.min(...losses.map((t) => t.netPnl)) : null,
    maxConsecutiveLosses: maxStreak,
  };
}

function downsample<T>(xs: T[], max: number): T[] {
  if (xs.length <= max) return xs;
  const step = xs.length / max;
  const out: T[] = [];
  for (let k = 0; k < max; k++) out.push(xs[Math.floor(k * step)]);
  out.push(xs[xs.length - 1]);
  return out;
}

export function barsPerYear(tf: Timeframe) {
  return (365 * 86_400_000) / TIMEFRAME_MS[tf];
}
