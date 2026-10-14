/**
 * Technical indicators. Every function is CAUSAL: the value at index i depends
 * only on inputs at indices <= i, so precomputing over a full series and reading
 * index i never leaks future data. Values that cannot be computed (warm-up
 * period, missing input) are `null` — never zero or a guess.
 */
import type { Candle } from "@/lib/market/types";

export type Series = (number | null)[];

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

export function sma(values: Series, period: number): Series {
  if (period < 1) throw new Error("period must be >= 1");
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0; // consecutive valid values in window
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isNum(v)) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += v;
    count++;
    if (count > period) {
      sum -= values[i - period] as number;
      count = period;
    }
    if (count === period) out[i] = sum / period;
  }
  return out;
}

/** EMA seeded with the SMA of the first `period` valid values. */
export function ema(values: Series, period: number): Series {
  if (period < 1) throw new Error("period must be >= 1");
  const out: Series = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seed: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isNum(v)) {
      prev = null;
      seed = [];
      continue;
    }
    if (prev === null) {
      seed.push(v);
      if (seed.length === period) {
        prev = seed.reduce((a, b) => a + b, 0) / period;
        out[i] = prev;
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's smoothing (RMA), seeded with the simple mean of the first `period` values. */
export function wilder(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let prev: number | null = null;
  let seed: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!isNum(v)) {
      prev = null;
      seed = [];
      continue;
    }
    if (prev === null) {
      seed.push(v);
      if (seed.length === period) {
        prev = seed.reduce((a, b) => a + b, 0) / period;
        out[i] = prev;
      }
      continue;
    }
    prev = (prev * (period - 1) + v) / period;
    out[i] = prev;
  }
  return out;
}

/** Relative Strength Index (Wilder). First value at index `period`. */
export function rsi(closes: number[], period = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const value = () => (avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss));
  out[period] = value();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}

export interface MacdResult {
  macd: Series;
  signal: Series;
  histogram: Series;
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  if (fast >= slow) throw new Error("MACD fast period must be shorter than slow period");
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line: Series = closes.map((_, i) => (isNum(f[i]) && isNum(s[i]) ? (f[i] as number) - (s[i] as number) : null));
  const signal = ema(line, signalPeriod);
  const histogram: Series = line.map((v, i) => (isNum(v) && isNum(signal[i]) ? v - (signal[i] as number) : null));
  return { macd: line, signal, histogram };
}

export interface BollingerResult {
  middle: Series;
  upper: Series;
  lower: Series;
  /** (upper - lower) / middle */
  bandwidth: Series;
  /** (close - lower) / (upper - lower) */
  percentB: Series;
}

/** Bollinger Bands using population standard deviation (as in Bollinger's definition). */
export function bollinger(closes: number[], period = 20, mult = 2): BollingerResult {
  const middle = sma(closes, period);
  const upper: Series = new Array(closes.length).fill(null);
  const lower: Series = new Array(closes.length).fill(null);
  const bandwidth: Series = new Array(closes.length).fill(null);
  const percentB: Series = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const m = middle[i];
    if (!isNum(m)) continue;
    let ss = 0;
    for (let j = i - period + 1; j <= i; j++) ss += (closes[j] - m) ** 2;
    const sd = Math.sqrt(ss / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
    bandwidth[i] = m !== 0 ? (upper[i]! - lower[i]!) / m : null;
    percentB[i] = upper[i]! !== lower[i]! ? (closes[i] - lower[i]!) / (upper[i]! - lower[i]!) : null;
  }
  return { middle, upper, lower, bandwidth, percentB };
}

export function trueRange(candles: Candle[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
}

/** Average True Range (Wilder). First value at index period-1. */
export function atr(candles: Candle[], period = 14): Series {
  return wilder(trueRange(candles), period);
}

export interface AdxResult {
  adx: Series;
  plusDI: Series;
  minusDI: Series;
}

/** Average Directional Index (Wilder) — trend strength regardless of direction. */
export function adx(candles: Candle[], period = 14): AdxResult {
  const n = candles.length;
  const plusDM: Series = new Array(n).fill(null);
  const minusDM: Series = new Array(n).fill(null);
  const tr: Series = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    const pc = candles[i - 1].close;
    tr[i] = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - pc), Math.abs(candles[i].low - pc));
  }
  const sTR = wilder(tr, period);
  const sPlus = wilder(plusDM, period);
  const sMinus = wilder(minusDM, period);
  const plusDI: Series = new Array(n).fill(null);
  const minusDI: Series = new Array(n).fill(null);
  const dx: Series = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (!isNum(sTR[i]) || !isNum(sPlus[i]) || !isNum(sMinus[i]) || sTR[i] === 0) continue;
    plusDI[i] = (100 * sPlus[i]!) / sTR[i]!;
    minusDI[i] = (100 * sMinus[i]!) / sTR[i]!;
    const sum = plusDI[i]! + minusDI[i]!;
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(plusDI[i]! - minusDI[i]!)) / sum;
  }
  return { adx: wilder(dx, period), plusDI, minusDI };
}

/** Current volume divided by the average of the PREVIOUS `period` volumes. */
export function volumeRatio(volumes: number[], period = 20): Series {
  const avg = sma(volumes, period);
  return volumes.map((v, i) => (i > 0 && isNum(avg[i - 1]) && avg[i - 1]! > 0 ? v / avg[i - 1]! : null));
}

/** Rate of change in percent over `period` bars. */
export function roc(closes: number[], period = 10): Series {
  return closes.map((c, i) => (i >= period && closes[i - period] > 0 ? (c / closes[i - period] - 1) * 100 : null));
}

/** Percent change of a series over `lookback` bars (used for MA slope). */
export function slopePct(values: Series, lookback = 5): Series {
  return values.map((v, i) => {
    const p = values[i - lookback];
    return i >= lookback && isNum(v) && isNum(p) && p !== 0 ? ((v - p) / p) * 100 : null;
  });
}

export function highest(values: number[], period: number, endExclusive: number): number | null {
  if (endExclusive - period < 0) return null;
  let m = -Infinity;
  for (let i = endExclusive - period; i < endExclusive; i++) m = Math.max(m, values[i]);
  return m;
}

export function lowest(values: number[], period: number, endExclusive: number): number | null {
  if (endExclusive - period < 0) return null;
  let m = Infinity;
  for (let i = endExclusive - period; i < endExclusive; i++) m = Math.min(m, values[i]);
  return m;
}

/** Annualised realised volatility (stdev of log returns) in percent. */
export function realizedVolatility(closes: number[], period: number, periodsPerYear: number): Series {
  const rets: Series = closes.map((c, i) => (i > 0 && closes[i - 1] > 0 && c > 0 ? Math.log(c / closes[i - 1]) : null));
  return rets.map((_, i) => {
    if (i < period) return null;
    const w = rets.slice(i - period + 1, i + 1);
    if (w.some((x) => !isNum(x))) return null;
    const nums = w as number[];
    const mean = nums.reduce((a, b) => a + b, 0) / period;
    const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (period - 1);
    return Math.sqrt(variance) * Math.sqrt(periodsPerYear) * 100;
  });
}

export interface Level {
  price: number;
  touches: number;
  kind: "support" | "resistance";
  lastTouchIndex: number;
}

/**
 * Support/resistance estimate at bar `i` using swing pivots that were already
 * CONFIRMED at bar i (a pivot at j needs `strength` bars on each side, so it is
 * only known at j + strength <= i). Nearby pivots are clustered within
 * `tolerance` (absolute price, typically 0.5 × ATR).
 */
export function supportResistance(
  candles: Candle[],
  i: number,
  opts: { lookback?: number; strength?: number; tolerance: number },
): { supports: Level[]; resistances: Level[] } {
  const lookback = opts.lookback ?? 150;
  const k = opts.strength ?? 3;
  const start = Math.max(k, i - lookback);
  const pivots: { price: number; idx: number; type: "high" | "low" }[] = [];
  for (let j = start; j <= i - k; j++) {
    let isHigh = true;
    let isLow = true;
    for (let d = 1; d <= k; d++) {
      if (candles[j].high <= candles[j - d].high || candles[j].high < candles[j + d].high) isHigh = false;
      if (candles[j].low >= candles[j - d].low || candles[j].low > candles[j + d].low) isLow = false;
    }
    if (isHigh) pivots.push({ price: candles[j].high, idx: j, type: "high" });
    if (isLow) pivots.push({ price: candles[j].low, idx: j, type: "low" });
  }
  pivots.sort((a, b) => a.price - b.price);
  const clusters: { prices: number[]; last: number }[] = [];
  for (const p of pivots) {
    const c = clusters[clusters.length - 1];
    if (c && p.price - c.prices[c.prices.length - 1] <= opts.tolerance) {
      c.prices.push(p.price);
      c.last = Math.max(c.last, p.idx);
    } else clusters.push({ prices: [p.price], last: p.idx });
  }
  const price = candles[i].close;
  const levels = clusters.map((c) => {
    const avg = c.prices.reduce((a, b) => a + b, 0) / c.prices.length;
    return { price: avg, touches: c.prices.length, lastTouchIndex: c.last, kind: (avg <= price ? "support" : "resistance") as Level["kind"] };
  });
  return {
    supports: levels.filter((l) => l.kind === "support").sort((a, b) => b.price - a.price),
    resistances: levels.filter((l) => l.kind === "resistance").sort((a, b) => a.price - b.price),
  };
}
