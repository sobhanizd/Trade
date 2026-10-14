/**
 * Deterministic signal evaluation shared by live scans AND backtests. The
 * analysis engine is the source of truth; the AI explainer only describes its
 * output and can never change it.
 */
import { supportResistance } from "@/lib/indicators";
import { checkCandleQuality, type QualityReport } from "@/lib/market/quality";
import { TIMEFRAME_MS, type Candle, type Timeframe } from "@/lib/market/types";
import { DEFAULT_COSTS, netRiskReward, type CostModel } from "@/lib/risk/calculator";
import { IndicatorCache } from "@/lib/strategies/cache";
import { fp, isNum } from "@/lib/strategies/helpers";
import {
  directionOf,
  type Condition,
  type Direction,
  type Params,
  type SignalState,
  type StrategyDefinition,
} from "@/lib/strategies/types";

export interface SignalResult {
  strategyId: string;
  strategyName: string;
  strategyVersion: number;
  timeframe: Timeframe;
  state: SignalState;
  direction: Direction;
  summary: string;
  conditions: Condition[];
  indicators: Record<string, number | null>;
  entryLow: number | null;
  entryHigh: number | null;
  invalidation: number | null;
  invalidationNote: string | null;
  targets: number[];
  riskReward: number | null;
  risks: string[];
  conflicts: string[];
  dataIssues: string[];
  rulesMet: number;
  rulesTotal: number;
  price: number | null;
  candleOpenTime: number | null;
  marketDataAt: number | null;
  expiresAt: number | null;
  fingerprint: string;
  params: Params;
}

/** ATR% (of price) above which volatility is flagged as elevated, per timeframe. */
export const ELEVATED_ATR_PCT: Record<Timeframe, number> = { "1h": 1.5, "4h": 3, "1d": 6, "1w": 15 };

/** Stable short hash of strategy parameters (djb2 over sorted JSON). */
export function paramsHash(params: Params): string {
  const json = JSON.stringify(Object.keys(params).sort().map((k) => [k, params[k]]));
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h << 5) + h + json.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Identity of a signal's analytical state. A new signal row is created only
 * when this changes: a different state, or a different strategy version /
 * parameter set (so levels are never silently computed with other settings).
 */
export function fingerprint(strategyId: string, timeframe: string, state: SignalState, version = 1, params: Params = {}) {
  return `${strategyId}:v${version}:${paramsHash(params)}:${timeframe}:${state}`;
}

export function evaluateAt(
  def: StrategyDefinition,
  candles: Candle[],
  i: number,
  params: Params,
  timeframe: Timeframe,
  costs: CostModel = DEFAULT_COSTS,
  ind: IndicatorCache = new IndicatorCache(candles),
): SignalResult {
  const ev = def.evaluate({ candles, i, ind, params, timeframe });
  const c = candles[i];
  const direction = directionOf(ev.state);
  const risks = [...ev.risks];
  const conflicts = [...ev.conflicts];
  const atrV = ind.atr(14)[i];

  // Common risk checks (descriptive only; they never change the strategy's state).
  if (isNum(atrV)) {
    const atrPct = (atrV / c.close) * 100;
    if (atrPct >= ELEVATED_ATR_PCT[timeframe]) risks.push(`Elevated volatility: ATR is ${atrPct.toFixed(2)}% of price on the ${timeframe} timeframe.`);
    if (c.high - c.low > 3 * atrV) risks.push("The latest candle's range exceeded 3× ATR — an unusually large move.");
  }
  const rsiV = ind.rsi(14)[i];
  if (direction === "long" && isNum(rsiV) && rsiV >= 70 && !risks.some((r) => r.includes("RSI"))) risks.push(`RSI ${rsiV.toFixed(1)} is in overbought territory.`);

  const targets = (ev.targets ?? []).filter(isNum);
  const entryRef = c.close;
  const inv = isNum(ev.invalidation) ? ev.invalidation : null;
  let riskReward: number | null = null;
  if (direction === "long" || (ev.state === "HOLD_WAIT" && ev.entry)) {
    riskReward = inv !== null && targets.length ? netRiskReward(entryRef, inv, targets[0], costs) : null;
    if (riskReward !== null && riskReward < 1) risks.push(`Reward/risk to the first target after fees & slippage is only ${riskReward.toFixed(2)}.`);
    if (isNum(atrV) && targets.length) {
      const sr = supportResistance(candles, i, { tolerance: 0.5 * atrV });
      const blocking = sr.resistances.find((r) => r.price > entryRef && r.price < targets[0]);
      if (blocking) conflicts.push(`Resistance near ${fp(blocking.price)} lies below the first target (${fp(targets[0])}).`);
    }
  }

  const relevant = ev.conditions.filter((x) => (direction === "exit" ? x.group === "exit" : x.group !== "exit"));
  const rulesMet = relevant.filter((x) => x.passed === true).length;
  return {
    strategyId: def.id,
    strategyName: def.name,
    strategyVersion: def.version,
    timeframe,
    state: ev.state,
    direction,
    summary: ev.summary,
    conditions: ev.conditions,
    indicators: ev.indicators,
    entryLow: ev.entry ? ev.entry.low : null,
    entryHigh: ev.entry ? ev.entry.high : null,
    invalidation: inv,
    invalidationNote: ev.invalidationNote ?? null,
    targets,
    riskReward,
    risks,
    conflicts,
    dataIssues: [],
    rulesMet,
    rulesTotal: relevant.length,
    price: c.close,
    candleOpenTime: c.openTime,
    marketDataAt: c.closeTime,
    expiresAt: c.closeTime + 1 + def.expiryBars(params) * TIMEFRAME_MS[timeframe],
    fingerprint: fingerprint(def.id, timeframe, ev.state, def.version, params),
    params,
  };
}

export function noSignal(def: StrategyDefinition, timeframe: Timeframe, params: Params, reasons: string[], last?: Candle | null): SignalResult {
  return {
    strategyId: def.id,
    strategyName: def.name,
    strategyVersion: def.version,
    timeframe,
    state: "NO_SIGNAL",
    direction: "neutral",
    summary: "No signal: the market data did not pass quality checks.",
    conditions: [],
    indicators: {},
    entryLow: null,
    entryHigh: null,
    invalidation: null,
    invalidationNote: null,
    targets: [],
    riskReward: null,
    risks: [],
    conflicts: [],
    dataIssues: reasons,
    rulesMet: 0,
    rulesTotal: 0,
    price: last?.close ?? null,
    candleOpenTime: last?.openTime ?? null,
    marketDataAt: last?.closeTime ?? null,
    expiresAt: null,
    fingerprint: fingerprint(def.id, timeframe, "NO_SIGNAL", def.version, params),
    params,
  };
}

/**
 * Full analysis of the latest CLOSED candle: data-quality gate first, then
 * strategy evaluation. Returns NO_SIGNAL with reasons when data is unusable.
 */
export function analyzeLatest(
  def: StrategyDefinition,
  raw: Candle[],
  params: Params,
  timeframe: Timeframe,
  opts: { now?: number; costs?: CostModel; ind?: IndicatorCache; quality?: { report: QualityReport; candles: Candle[] } } = {},
): { result: SignalResult; quality: QualityReport } {
  const q = opts.quality ?? checkCandleQuality(raw, { timeframe, now: opts.now, minCandles: def.warmup(params) });
  const candles = q.candles;
  const last = candles[candles.length - 1] ?? null;
  const warmup = def.warmup(params);
  const blocking = q.report.issues.filter((x) => x.severity === "blocking").map((x) => x.message);
  if (!q.report.ok) return { result: noSignal(def, timeframe, params, blocking, last), quality: q.report };
  if (candles.length < warmup)
    return {
      result: noSignal(def, timeframe, params, [`This strategy needs ${warmup} closed candles; only ${candles.length} are available.`], last),
      quality: q.report,
    };
  const result = evaluateAt(def, candles, candles.length - 1, params, timeframe, opts.costs, opts.ind ?? new IndicatorCache(candles));
  result.dataIssues = q.report.issues.filter((x) => x.severity === "warning").map((x) => x.message);
  return { result, quality: q.report };
}

/** Annotate contradictory signals across strategies for the same asset/timeframe. */
export function annotateCrossStrategyConflicts(results: SignalResult[]): SignalResult[] {
  const longs = results.filter((r) => r.direction === "long");
  const exits = results.filter((r) => r.direction === "exit");
  if (!longs.length || !exits.length) return results;
  return results.map((r) => {
    if (r.direction === "long")
      return { ...r, conflicts: [...r.conflicts, `Contradiction: ${exits.map((e) => e.strategyName).join(", ")} currently show(s) an exit/sell condition on this timeframe.`] };
    if (r.direction === "exit")
      return { ...r, conflicts: [...r.conflicts, `Contradiction: ${longs.map((e) => e.strategyName).join(", ")} currently show(s) a buy setup on this timeframe.`] };
    return r;
  });
}
