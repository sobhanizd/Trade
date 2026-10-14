/**
 * Market structure from real candles only (pure functions, no I/O):
 * trend lines, bull/bear direction per horizon, recent changes, "similar
 * moments in the past" statistics and if-then scenarios.
 *
 * Nothing here is a forecast. Analogs report what happened after past
 * moments that looked similar; they do not say what will happen next.
 */
import { atr, ema, rsi, sma } from "@/lib/indicators";
import type { Candle } from "@/lib/market/types";

// ---------- Trend lines ----------

export interface TrendLine {
  /** Index/price of the two anchor pivots and the line value at the last candle. */
  i1: number; p1: number; i2: number; p2: number; iEnd: number; pEnd: number;
  t1: number; t2: number; tEnd: number;
  touches: number;
  /** Line change per candle as a fraction of ATR (positive = rising). */
  slopeAtr: number;
  dir: "up" | "down" | "flat";
}

export type Pattern = "upChannel" | "downChannel" | "squeeze" | "widening" | "range" | "ascending" | "descending" | "none";

export interface TrendLines {
  support: TrendLine | null;
  resistance: TrendLine | null;
  pattern: Pattern;
  /** The last closed candle closed beyond a line. */
  brokeSupport: boolean;
  brokeResistance: boolean;
}

function pivotIdx(vals: number[], k: number, from: number, to: number, kind: "high" | "low") {
  const out: number[] = [];
  for (let j = Math.max(k, from); j <= to - k; j++) {
    let ok = true;
    for (let d = 1; d <= k && ok; d++) {
      if (kind === "low" ? vals[j] > vals[j - d] || vals[j] >= vals[j + d] : vals[j] < vals[j - d] || vals[j] <= vals[j + d]) ok = false;
    }
    if (ok) out.push(j);
  }
  return out;
}

/** Candles at the end that may break a line without making it invalid (a fresh break is reported instead). */
const FRESH = 3;

/**
 * The line through two swing points that the price has respected best:
 * no wick crosses it between the anchors and no close crosses it afterwards
 * (except a fresh break in the last few candles). Preference goes to more
 * touches and a longer span. `last` = last closed candle.
 */
function fitLine(c: Candle[], last: number, kind: "high" | "low", atrNow: number, k: number, lookback: number): TrendLine | null {
  const vals = c.map((x) => (kind === "low" ? x.low : x.high));
  const piv = pivotIdx(vals, k, last - lookback, last, kind);
  const tol = 0.3 * atrNow;
  const crosses = (v: number, line: number) => (kind === "low" ? v < line - tol : v > line + tol);
  let best: { i: number; j: number; slope: number; touches: number; score: number } | null = null;
  for (let b = 1; b < piv.length; b++) {
    const j = piv[b];
    for (let a = 0; a < b; a++) {
      const i = piv[a];
      if (j - i < 8) continue;
      const slope = (vals[j] - vals[i]) / (j - i);
      const at = (m: number) => vals[i] + slope * (m - i);
      let valid = true;
      for (let m = i + 1; m < j && valid; m++) if (crosses(vals[m], at(m))) valid = false;
      for (let m = j + 1; m <= last - FRESH && valid; m++) if (crosses(c[m].close, at(m))) valid = false;
      if (!valid) continue;
      // Touches = swing points (bounces) that sit on the line.
      const touches = piv.filter((m) => m >= i && Math.abs(vals[m] - at(m)) <= 0.5 * atrNow).length;
      // Prefer lines that were tested often, span a while, are recent and are near today's price.
      const dist = Math.abs(at(last) - c[last].close) / atrNow;
      const score = 2 * touches + (last - i) / 30 + (3 * (j - (last - lookback))) / lookback - 0.6 * dist;
      if (!best || score > best.score) best = { i, j, slope, touches, score };
    }
  }
  if (!best) return null;
  const { i, j, slope, touches } = best;
  const slopeAtr = slope / atrNow;
  return {
    i1: i, p1: vals[i], i2: j, p2: vals[j], iEnd: last, pEnd: vals[i] + slope * (last - i),
    t1: c[i].openTime, t2: c[j].openTime, tEnd: c[last].openTime,
    touches, slopeAtr, dir: slopeAtr > 0.04 ? "up" : slopeAtr < -0.04 ? "down" : "flat",
  };
}

/** Support line through rising/falling lows and resistance line through highs. */
export function trendLines(c: Candle[], now = Date.now(), opts: { k?: number; lookback?: number } = {}): TrendLines {
  const last = c.findLastIndex((x) => x.closeTime < now);
  const empty: TrendLines = { support: null, resistance: null, pattern: "none", brokeSupport: false, brokeResistance: false };
  if (last < 40) return empty;
  const atrNow = atr(c.slice(0, last + 1))[last];
  if (!atrNow) return empty;
  const k = opts.k ?? 4;
  const lookback = opts.lookback ?? 150;
  const support = fitLine(c, last, "low", atrNow, k, lookback);
  const resistance = fitLine(c, last, "high", atrNow, k, lookback);
  const close = c[last].close;
  const brokeSupport = !!support && support.i2 < last && close < support.pEnd - 0.3 * atrNow;
  const brokeResistance = !!resistance && resistance.i2 < last && close > resistance.pEnd + 0.3 * atrNow;
  return { support, resistance, pattern: patternOf(support, resistance), brokeSupport, brokeResistance };
}

function patternOf(s: TrendLine | null, r: TrendLine | null): Pattern {
  if (!s || !r) return s?.dir === "up" || r?.dir === "up" ? "upChannel" : s?.dir === "down" || r?.dir === "down" ? "downChannel" : "none";
  const key = `${s.dir}/${r.dir}`;
  switch (key) {
    case "up/up": return "upChannel";
    case "down/down": return "downChannel";
    case "up/down": return "squeeze";
    case "down/up": return "widening";
    case "flat/flat": return "range";
    case "up/flat": return "ascending";
    case "flat/down": return "descending";
    case "flat/up": return "upChannel";
    case "down/flat": return "downChannel";
    default: return "none";
  }
}

// ---------- Direction (bull / bear) ----------

export type Dir = "up" | "down" | "mixed";
export interface Direction {
  overall: "bull" | "bear" | "sideways";
  /** days (≈1–2 weeks), weeks (≈2–3 months), months (≈1 year). */
  short: Dir; medium: Dir; long: Dir;
  ret7: number | null; ret30: number | null; ret90: number | null; ret365: number | null;
  close: number;
  ema20: number | null; ema50: number | null; sma200: number | null;
  /** Higher highs & higher lows (up), lower highs & lower lows (down). */
  swings: Dir;
}

const ret = (c: number[], i: number, n: number) => (i - n >= 0 && c[i - n] > 0 ? c[i] / c[i - n] - 1 : null);

/** Daily candles (closed) → direction for three horizons. */
export function direction(daily: Candle[], now = Date.now()): Direction | null {
  const cs = daily.filter((x) => x.closeTime < now);
  const n = cs.length - 1;
  if (n < 60) return null;
  const c = cs.map((x) => x.close);
  const e20 = ema(c, 20);
  const e50 = ema(c, 50);
  const s200 = sma(c, 200);
  const close = c[n];
  const r7 = ret(c, n, 7);
  const e50Slope = e50[n] !== null && e50[n - 10] !== null ? e50[n]! / e50[n - 10]! - 1 : 0;
  const s200Slope = s200[n] !== null && s200[n - 30] !== null ? s200[n]! / s200[n - 30]! - 1 : null;

  const short: Dir = r7 !== null && e20[n] !== null ? (r7 > 0.02 && close > e20[n]! ? "up" : r7 < -0.02 && close < e20[n]! ? "down" : "mixed") : "mixed";
  const medium: Dir = e50[n] !== null ? (close > e50[n]! && e50Slope > 0 ? "up" : close < e50[n]! && e50Slope < 0 ? "down" : "mixed") : "mixed";
  const long: Dir = s200[n] !== null && s200Slope !== null ? (close > s200[n]! && s200Slope > 0 ? "up" : close < s200[n]! && s200Slope < 0 ? "down" : "mixed") : "mixed";

  const highs = pivotIdx(cs.map((x) => x.high), 4, n - 120, n, "high").slice(-2);
  const lows = pivotIdx(cs.map((x) => x.low), 4, n - 120, n, "low").slice(-2);
  let swings: Dir = "mixed";
  if (highs.length === 2 && lows.length === 2) {
    const hh = cs[highs[1]].high > cs[highs[0]].high;
    const hl = cs[lows[1]].low > cs[lows[0]].low;
    swings = hh && hl ? "up" : !hh && !hl ? "down" : "mixed";
  }

  const v = (d: Dir) => (d === "up" ? 1 : d === "down" ? -1 : 0);
  const score = v(long) + v(medium) + 0.5 * v(short) + 0.5 * v(swings);
  return {
    overall: score >= 1.5 ? "bull" : score <= -1.5 ? "bear" : "sideways",
    short, medium, long, swings,
    ret7: r7, ret30: ret(c, n, 30), ret90: ret(c, n, 90), ret365: ret(c, n, 365),
    close, ema20: e20[n], ema50: e50[n], sma200: s200[n],
  };
}

// ---------- Similar moments in the past ----------

export interface AnalogCase { time: number; after7: number | null; after30: number | null; after90: number | null }
export interface HorizonStats { n: number; up: number; median: number; p25: number; p75: number; worst: number; best: number; baseUp: number; baseMedian: number }
export interface Analogs {
  cases: AnalogCase[];
  h7: HorizonStats | null; h30: HorizonStats | null; h90: HorizonStats | null;
  since: number;
  /** Today's features in plain numbers, for the explanation. */
  today: { ret30: number; ret7: number; vsEma50: number; rsi: number; aboveSma200: boolean };
}

const quant = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
};

/**
 * Finds the `count` past days whose situation looked most like today
 * (30-day and 7-day change, distance from the 50-day average, its slope,
 * RSI, and above/below the 200-day average) and reports what happened next.
 * Cases are at least `gap` days apart so one long episode isn't counted many times.
 */
export function analogs(daily: Candle[], now = Date.now(), opts: { count?: number; gap?: number } = {}): Analogs | null {
  const cs = daily.filter((x) => x.closeTime < now);
  const n = cs.length - 1;
  if (n < 400) return null;
  const c = cs.map((x) => x.close);
  const e50 = ema(c, 50);
  const s200 = sma(c, 200);
  const r = rsi(c, 14);
  const feat = (i: number) => {
    if (i < 200 || e50[i] === null || e50[i - 10] === null || s200[i] === null || r[i] === null) return null;
    return { f: [c[i] / c[i - 30] - 1, c[i] / c[i - 7] - 1, c[i] / e50[i]! - 1, e50[i]! / e50[i - 10]! - 1, r[i]! / 100], above: c[i] > s200[i]! };
  };
  const today = feat(n);
  if (!today) return null;
  const all: { i: number; f: number[]; above: boolean }[] = [];
  for (let i = 200; i <= n; i++) {
    const x = feat(i);
    if (x) all.push({ i, ...x });
  }
  const dims = today.f.length;
  const sd = Array.from({ length: dims }, (_, d) => {
    const xs = all.map((a) => a.f[d]);
    const m = xs.reduce((s, v) => s + v, 0) / xs.length;
    return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length) || 1;
  });
  const gap = opts.gap ?? 20;
  // Only moments whose next 30 days are known and that don't overlap with today.
  const pool = all
    .filter((a) => a.above === today.above && a.i + 30 <= n && a.i < n - 60)
    .map((a) => ({ i: a.i, d: Math.sqrt(a.f.reduce((s, v, k) => s + ((v - today.f[k]) / sd[k]) ** 2, 0)) }))
    .sort((a, b) => a.d - b.d);
  const picked: number[] = [];
  for (const p of pool) {
    if (picked.length >= (opts.count ?? 20)) break;
    if (picked.every((q) => Math.abs(q - p.i) >= gap)) picked.push(p.i);
  }
  const fwd = (i: number, h: number) => (i + h <= n ? c[i + h] / c[i] - 1 : null);
  const cases = picked.map((i) => ({ time: cs[i].openTime, after7: fwd(i, 7), after30: fwd(i, 30), after90: fwd(i, 90) }));
  const stats = (h: 7 | 30 | 90): HorizonStats | null => {
    const xs = cases.map((x) => (h === 7 ? x.after7 : h === 30 ? x.after30 : x.after90)).filter((v): v is number => v !== null);
    if (xs.length < 5) return null;
    const base: number[] = [];
    for (let i = 200; i + h <= n; i++) base.push(c[i + h] / c[i] - 1);
    return {
      n: xs.length, up: xs.filter((v) => v > 0).length, median: quant(xs, 0.5), p25: quant(xs, 0.25), p75: quant(xs, 0.75),
      worst: Math.min(...xs), best: Math.max(...xs),
      baseUp: base.filter((v) => v > 0).length / base.length, baseMedian: quant(base, 0.5),
    };
  };
  return {
    cases: [...cases].sort((a, b) => b.time - a.time),
    h7: stats(7), h30: stats(30), h90: stats(90),
    since: cs[200].openTime,
    today: { ret30: today.f[0], ret7: today.f[1], vsEma50: today.f[2], rsi: today.f[4] * 100, aboveSma200: today.above },
  };
}

// ---------- Big daily moves (to link with news) ----------

export interface BigMove { time: number; changePct: number }

/** Closed days in the last `days` whose move was unusually large for this coin. */
export function bigMoves(daily: Candle[], days = 30, now = Date.now()): BigMove[] {
  const cs = daily.filter((x) => x.closeTime < now);
  const n = cs.length - 1;
  if (n < 30) return [];
  const a = atr(cs);
  const out: BigMove[] = [];
  for (let i = Math.max(1, n - days + 1); i <= n; i++) {
    const ch = cs[i].close / cs[i - 1].close - 1;
    const atrPct = a[i - 1] !== null ? a[i - 1]! / cs[i - 1].close : 0.03;
    if (Math.abs(ch) >= Math.max(0.03, 1.5 * atrPct)) out.push({ time: cs[i].openTime, changePct: ch * 100 });
  }
  return out;
}

// ---------- If-then scenarios ----------

export interface Scenarios {
  upTrigger: number | null; upNext: number | null;
  downTrigger: number | null; downNext: number | null;
}

/** "If a day closes above X, the next level is Y" — from trend lines and support/resistance levels. */
export function scenarios(close: number, tl: TrendLines, supports: number[], resistances: number[]): Scenarios {
  const above = [...resistances].filter((p) => p > close).sort((a, b) => a - b);
  const below = [...supports].filter((p) => p < close).sort((a, b) => b - a);
  const lineR = tl.resistance && tl.resistance.pEnd > close ? tl.resistance.pEnd : null;
  const lineS = tl.support && tl.support.pEnd < close ? tl.support.pEnd : null;
  const upTrigger = lineR !== null && (above[0] === undefined || lineR < above[0]) ? lineR : (above[0] ?? lineR);
  const downTrigger = lineS !== null && (below[0] === undefined || lineS > below[0]) ? lineS : (below[0] ?? lineS);
  const upNext = upTrigger !== null ? (above.find((p) => p > upTrigger * 1.01) ?? null) : null;
  const downNext = downTrigger !== null ? (below.find((p) => p < downTrigger * 0.99) ?? null) : null;
  return { upTrigger, upNext, downTrigger, downNext };
}
