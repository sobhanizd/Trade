/**
 * Multi-source verification. Market data from one exchange can be wrong
 * (bad prints, a stuck feed, a delisted pair), so every price and every
 * analysed candle is compared against independent sources:
 *
 *  - Live price: Binance, Kraken and CoinGecko (an aggregate of many exchanges).
 *  - Candles:    the closes of the main candle source vs a second exchange.
 *  - Signals:    each strategy is re-run on the second exchange's candles and
 *                the resulting state is compared ("second opinion").
 *
 * Thresholds are calibrated on real data (Oct 2026, 7 coins, 200 candles per
 * timeframe): Binance vs Kraken closes differ by ~0.1% typically and <0.4% at
 * worst; live prices across the three sources by <0.6%. Highs/lows (wicks) are
 * NOT compared — thin order books legitimately produce very different wicks.
 */
import type { DataIssue } from "./quality";
import type { Candle } from "./types";
import { directionOf, type SignalState } from "@/lib/strategies/types";

export type Agreement = "AGREE" | "SMALL_DIFF" | "DISAGREE" | "SINGLE_SOURCE";

/** Live prices: at most this far apart (max−min vs median) = agree; beyond DISAGREE = something is wrong. */
export const PRICE_AGREE_PCT = 1;
export const PRICE_DISAGREE_PCT = 3;
/** Candle closes (same candle on two exchanges). */
export const CANDLE_AGREE_LAST_PCT = 1;
export const CANDLE_AGREE_MEDIAN_PCT = 0.5;
export const CANDLE_DISAGREE_LAST_PCT = 3;
export const CANDLE_DISAGREE_MEDIAN_PCT = 1.5;
/** Fewer overlapping candles than this cannot confirm anything. */
export const MIN_MATCHED_CANDLES = 10;

export const SOURCE_LABEL: Record<string, string> = { binance: "Binance", kraken: "Kraken", coingecko: "CoinGecko" };
export const sourceLabel = (id: string) => SOURCE_LABEL[id] ?? id;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (a: number, b: number) => Math.abs(a / b - 1) * 100;
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

/* ---------------------------------------------------------------- live price */

export interface SourcePrice {
  source: string;
  price: number | null;
  /** Provider timestamp (ISO) if known. */
  at: string | null;
  error?: string;
}

export interface PriceCheck {
  symbol: string;
  sources: SourcePrice[];
  median: number | null;
  /** (max − min) / median, in percent, over the sources that answered. */
  spreadPct: number | null;
  verdict: Agreement;
  /** Source furthest from the median when the sources disagree. */
  outlier: string | null;
  checkedAt: string;
}

export function priceConsensus(symbol: string, sources: SourcePrice[], now = new Date()): PriceCheck {
  const ok = sources.filter((s): s is SourcePrice & { price: number } => s.price !== null && Number.isFinite(s.price) && s.price > 0);
  const base = { symbol, sources, checkedAt: now.toISOString() };
  if (ok.length < 2) return { ...base, median: ok[0]?.price ?? null, spreadPct: null, verdict: "SINGLE_SOURCE", outlier: null };
  const m = median(ok.map((s) => s.price));
  const prices = ok.map((s) => s.price);
  const spread = ((Math.max(...prices) - Math.min(...prices)) / m) * 100;
  const verdict: Agreement = spread <= PRICE_AGREE_PCT ? "AGREE" : spread <= PRICE_DISAGREE_PCT ? "SMALL_DIFF" : "DISAGREE";
  const outlier = verdict === "AGREE" ? null : [...ok].sort((a, b) => pct(b.price, m) - pct(a.price, m))[0].source;
  return { ...base, median: m, spreadPct: round(spread), verdict, outlier };
}

/* ------------------------------------------------------------------- candles */

export interface CandleComparison {
  primary: string;
  source: string;
  /** Closed candles present on both sources (within the compared window). */
  matched: number;
  medianDiffPct: number | null;
  maxDiffPct: number | null;
  /** Difference on the candle being analysed (null if the second source does not have it yet). */
  lastDiffPct: number | null;
  verdict: Agreement | "UNAVAILABLE";
  error?: string;
}

/**
 * Compare closes of the main series with a second source, over the last
 * `window` closed candles up to and including `lastOpenTime` (the analysed candle).
 */
export function compareCandles(primaryId: string, primary: Candle[], sourceId: string, secondary: Candle[], lastOpenTime: number, window = 100): CandleComparison {
  const byTime = new Map(secondary.map((c) => [c.openTime, c]));
  const recent = primary.filter((c) => c.openTime <= lastOpenTime).slice(-window);
  const diffs: number[] = [];
  for (const c of recent) {
    const o = byTime.get(c.openTime);
    if (o && o.close > 0 && c.close > 0) diffs.push(pct(o.close, c.close));
  }
  const last = primary.find((c) => c.openTime === lastOpenTime);
  const other = byTime.get(lastOpenTime);
  const lastDiff = last && other && other.close > 0 ? pct(other.close, last.close) : null;
  const base = { primary: primaryId, source: sourceId, matched: diffs.length };
  if (diffs.length < MIN_MATCHED_CANDLES)
    return { ...base, medianDiffPct: null, maxDiffPct: null, lastDiffPct: lastDiff === null ? null : round(lastDiff), verdict: "UNAVAILABLE", error: `only ${diffs.length} matching candle(s)` };
  const med = median(diffs);
  const max = Math.max(...diffs);
  let verdict: CandleComparison["verdict"];
  if ((lastDiff ?? 0) > CANDLE_DISAGREE_LAST_PCT || med > CANDLE_DISAGREE_MEDIAN_PCT) verdict = "DISAGREE";
  else if ((lastDiff ?? 0) > CANDLE_AGREE_LAST_PCT || med > CANDLE_AGREE_MEDIAN_PCT) verdict = "SMALL_DIFF";
  else verdict = "AGREE";
  return { ...base, medianDiffPct: round(med), maxDiffPct: round(max), lastDiffPct: lastDiff === null ? null : round(lastDiff), verdict };
}

const f2 = (x: number | null) => (x === null ? "?" : x.toFixed(2));

/** Data-quality issue for the analysis gate (null when the sources agree). */
export function crossSourceIssue(c: CandleComparison | null): DataIssue | null {
  if (!c) return null;
  const a = sourceLabel(c.primary);
  const b = sourceLabel(c.source);
  if (c.verdict === "DISAGREE")
    return {
      code: "SOURCE_MISMATCH",
      severity: "blocking",
      message: `Prices from ${a} and ${b} differ too much (${f2(c.lastDiffPct)}% on the latest candle, ${f2(c.medianDiffPct)}% typical) — one source may be wrong, so no signal is given.`,
    };
  if (c.verdict === "SMALL_DIFF")
    return { code: "SOURCE_DIFF", severity: "warning", message: `Prices from ${a} and ${b} differ slightly (${f2(c.lastDiffPct)}% on the latest candle, ${f2(c.medianDiffPct)}% typical).` };
  if (c.verdict === "UNAVAILABLE") return { code: "SOURCE_UNCONFIRMED", severity: "warning", message: `This data could not be double-checked on a second exchange (${b}).` };
  return null;
}

/* ------------------------------------------------------------ second opinion */

export type SourceAgreement = "CONFIRMED" | "NOT_CONFIRMED" | "UNCHECKED";

/** Why a second opinion could not be formed. */
export type OpinionGap = "UNAVAILABLE" | "LAGGING" | "NOT_ENOUGH_DATA" | "MAIN_NO_SIGNAL";

export interface SourceOpinion {
  source: string;
  /** Strategy state on this source's candles; null if it could not be evaluated. */
  state: SignalState | null;
  /** Same direction (buy / exit / neutral) as the main result; null if not evaluated. */
  agrees: boolean | null;
  gap?: OpinionGap;
}

/** Stored on each signal (Signal.sourceCheck). */
export interface SignalSourceCheck {
  primary: string;
  agreement: SourceAgreement;
  opinions: SourceOpinion[];
  candles: CandleComparison[];
  checkedAt: string;
}

/** NO_SIGNAL is only ever a data problem, so it never counts as agreement or disagreement. */
export function opinionFrom(source: string, primaryState: SignalState, secondState: SignalState | null, gap?: OpinionGap): SourceOpinion {
  if (primaryState === "NO_SIGNAL") return { source, state: secondState, agrees: null, gap: "MAIN_NO_SIGNAL" };
  if (secondState === null) return { source, state: null, agrees: null, gap: gap ?? "UNAVAILABLE" };
  if (secondState === "NO_SIGNAL") return { source, state: secondState, agrees: null, gap: "NOT_ENOUGH_DATA" };
  return { source, state: secondState, agrees: directionOf(secondState) === directionOf(primaryState) };
}

export function buildSourceCheck(primary: string, opinions: SourceOpinion[], candles: CandleComparison[], now = new Date()): SignalSourceCheck {
  const evaluated = opinions.filter((o) => o.agrees !== null);
  const agreement: SourceAgreement = evaluated.length === 0 ? "UNCHECKED" : evaluated.every((o) => o.agrees) ? "CONFIRMED" : "NOT_CONFIRMED";
  return { primary, agreement, opinions, candles, checkedAt: now.toISOString() };
}

/** Agreement of a stored Signal.sourceCheck value; null for signals created before cross-checking existed. */
export function sourceAgreementOf(v: unknown): SourceAgreement | null {
  const a = (v as { agreement?: unknown } | null | undefined)?.agreement;
  return a === "CONFIRMED" || a === "NOT_CONFIRMED" || a === "UNCHECKED" ? a : null;
}
