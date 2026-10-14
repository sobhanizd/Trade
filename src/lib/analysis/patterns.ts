/**
 * Chart patterns on the daily chart, each with its own track record on this
 * coin's history ("after this pattern, the price was higher 7/30 days later in
 * X of N cases, vs Y% on a normal day"). Pure and causal: a pattern on day i
 * only uses candles up to i, and outcomes are only counted when known.
 *
 * Textbooks call some patterns "bullish" or "bearish"; here the label comes
 * from what actually happened afterwards on this coin, not from the textbook.
 */
import { bollinger, ema, rsi, sma } from "@/lib/indicators";
import type { Candle } from "@/lib/market/types";

export type PatternId =
  | "oversold" | "overbought"
  | "goldenCross" | "deathCross"
  | "breakoutHigh" | "breakdownLow"
  | "pullbackUptrend" | "rallyDowntrend"
  | "doubleBottom" | "doubleTop"
  | "crash" | "overheated"
  | "squeeze" | "volumeUp" | "volumeDown";

/** What the textbook says (shown only as context). */
export const TEXTBOOK: Record<PatternId, "up" | "down" | "either"> = {
  oversold: "up", overbought: "down", goldenCross: "up", deathCross: "down", breakoutHigh: "up", breakdownLow: "down",
  pullbackUptrend: "up", rallyDowntrend: "down", doubleBottom: "up", doubleTop: "down", crash: "up", overheated: "down",
  squeeze: "either", volumeUp: "up", volumeDown: "down",
};

export interface PatternOutcome { n: number; up: number; median: number; baseUp: number; baseMedian: number }
export interface PatternHit {
  id: PatternId;
  /** Day the pattern appeared (open time) — may be a few days ago. */
  time: number;
  /** Price level that matters for the pattern (neckline, broken high/low, average), USD. */
  level: number | null;
  after7: PatternOutcome | null;
  after30: PatternOutcome | null;
  /** From the track record: "up" / "down" when it beat/trailed a normal day clearly and had enough cases. */
  lean: "up" | "down" | "none" | "rare";
}

/** Daily flags for every closed candle (index-aligned). */
export function detectAll(cs: Candle[]): { flags: Map<PatternId, number[]>; levels: Map<string, number> } {
  const n = cs.length;
  const c = cs.map((x) => x.close);
  const hi = cs.map((x) => x.high);
  const lo = cs.map((x) => x.low);
  const vol = cs.map((x) => x.volume);
  const r = rsi(c, 14);
  const s50 = sma(c, 50);
  const s200 = sma(c, 200);
  const e20 = ema(c, 20);
  const e50 = ema(c, 50);
  const bb = bollinger(c, 20, 2);
  const flags = new Map<PatternId, number[]>();
  const levels = new Map<string, number>();
  const hit = (id: PatternId, i: number, level?: number) => {
    const arr = flags.get(id) ?? [];
    // One case per episode: ignore repeats within 10 days.
    if (!arr.length || i - arr[arr.length - 1] >= 10) {
      arr.push(i);
      flags.set(id, arr);
      if (level !== undefined) levels.set(`${id}:${i}`, level);
    }
  };
  const bw = bb.upper.map((u, i) => (u !== null && bb.lower[i] !== null && bb.middle[i] ? (u - bb.lower[i]!) / bb.middle[i]! : null));
  // Swing lows/highs (3 bars each side) — a swing is only known 3 days later.
  const swingLow = (j: number) => j >= 3 && j + 3 < n && [1, 2, 3].every((d) => lo[j] <= lo[j - d] && lo[j] < lo[j + d]);
  const swingHigh = (j: number) => j >= 3 && j + 3 < n && [1, 2, 3].every((d) => hi[j] >= hi[j - d] && hi[j] > hi[j + d]);

  for (let i = 201; i < n; i++) {
    const rv = r[i], rp = r[i - 1];
    if (rv !== null && rp !== null && rv < 30 && rp >= 30) hit("oversold", i);
    if (rv !== null && rp !== null && rv > 70 && rp <= 70) hit("overbought", i);
    if (s50[i] !== null && s200[i] !== null && s50[i - 1] !== null && s200[i - 1] !== null) {
      if (s50[i]! > s200[i]! && s50[i - 1]! <= s200[i - 1]!) hit("goldenCross", i, s200[i]!);
      if (s50[i]! < s200[i]! && s50[i - 1]! >= s200[i - 1]!) hit("deathCross", i, s200[i]!);
    }
    let h20 = -Infinity, l20 = Infinity;
    for (let k = i - 20; k < i; k++) {
      h20 = Math.max(h20, hi[k]);
      l20 = Math.min(l20, lo[k]);
    }
    if (c[i] > h20 && c[i - 1] <= h20) hit("breakoutHigh", i, h20);
    if (c[i] < l20 && c[i - 1] >= l20) hit("breakdownLow", i, l20);
    const up200 = s200[i] !== null && s200[i - 20] !== null && s200[i]! > s200[i - 20]!;
    const down200 = s200[i] !== null && s200[i - 20] !== null && s200[i]! < s200[i - 20]!;
    if (up200 && c[i] > s200[i]! && e50[i] !== null && c[i] <= e50[i]! * 1.02 && c[i] >= e50[i]! * 0.97 && c[i - 5] > e50[i - 5]! * 1.04) hit("pullbackUptrend", i, e50[i]!);
    if (down200 && c[i] < s200[i]! && e50[i] !== null && c[i] >= e50[i]! * 0.98 && c[i] <= e50[i]! * 1.03 && c[i - 5] < e50[i - 5]! * 0.96) hit("rallyDowntrend", i, e50[i]!);
    if (c[i] / c[i - 7] - 1 <= -0.15) hit("crash", i);
    if (c[i] / c[i - 30] - 1 >= 0.4) hit("overheated", i);
    if (bw[i] !== null) {
      let min = Infinity;
      for (let k = i - 120; k < i; k++) if (bw[k] !== null) min = Math.min(min, bw[k]!);
      if (bw[i]! <= min) hit("squeeze", i);
    }
    let v20 = 0;
    for (let k = i - 20; k < i; k++) v20 += vol[k];
    v20 /= 20;
    if (v20 > 0 && vol[i] > 2.5 * v20) {
      if (c[i] > c[i - 1] * 1.02) hit("volumeUp", i);
      else if (c[i] < c[i - 1] * 0.98) hit("volumeDown", i);
    }
    // Double bottom: two swing lows within 3 % (15–60 days apart), a peak ≥ 8 % between,
    // and today the close breaks above that peak (the "neckline"). Swings must be confirmed by day i.
    for (let b = i - 4; b >= i - 40; b--) {
      if (!swingLow(b)) continue;
      for (let a = b - 15; a >= b - 60 && a > 3; a--) {
        if (!swingLow(a) || Math.abs(lo[a] - lo[b]) / lo[a] > 0.03) continue;
        let peak = -Infinity;
        for (let k = a; k <= b; k++) peak = Math.max(peak, hi[k]);
        if (peak < Math.min(lo[a], lo[b]) * 1.08) continue;
        if (c[i] > peak && c[i - 1] <= peak) hit("doubleBottom", i, peak);
        break;
      }
      break;
    }
    for (let b = i - 4; b >= i - 40; b--) {
      if (!swingHigh(b)) continue;
      for (let a = b - 15; a >= b - 60 && a > 3; a--) {
        if (!swingHigh(a) || Math.abs(hi[a] - hi[b]) / hi[a] > 0.03) continue;
        let trough = Infinity;
        for (let k = a; k <= b; k++) trough = Math.min(trough, lo[k]);
        if (trough > Math.max(hi[a], hi[b]) * 0.92) continue;
        if (c[i] < trough && c[i - 1] >= trough) hit("doubleTop", i, trough);
        break;
      }
      break;
    }
  }
  return { flags, levels };
}

function outcome(c: number[], idx: number[], h: number, base: { up: number; median: number }): PatternOutcome | null {
  const rs = idx.filter((i) => i + h < c.length).map((i) => c[i + h] / c[i] - 1);
  if (!rs.length) return null;
  const s = [...rs].sort((a, b) => a - b);
  return { n: rs.length, up: rs.filter((x) => x > 0).length, median: s[Math.floor(s.length / 2)], baseUp: base.up, baseMedian: base.median };
}

function baseline(c: number[], h: number) {
  const rs: number[] = [];
  for (let i = 200; i + h < c.length; i++) rs.push(c[i + h] / c[i] - 1);
  const s = [...rs].sort((a, b) => a - b);
  return { up: rs.filter((x) => x > 0).length / Math.max(1, rs.length), median: s[Math.floor(s.length / 2)] ?? 0 };
}

/** Patterns seen in the last `recentDays` closed candles, each with its track record on this coin. */
export function activePatterns(daily: Candle[], now = Date.now(), recentDays = 5): PatternHit[] {
  const cs = daily.filter((x) => x.closeTime < now);
  if (cs.length < 260) return [];
  const c = cs.map((x) => x.close);
  const { flags, levels } = detectAll(cs);
  const b7 = baseline(c, 7);
  const b30 = baseline(c, 30);
  const last = cs.length - 1;
  const out: PatternHit[] = [];
  for (const [id, idx] of flags) {
    const recent = idx.filter((i) => i >= last - recentDays + 1);
    if (!recent.length) continue;
    const i = recent[recent.length - 1];
    const past = idx.filter((k) => k < last - 30); // outcomes fully known
    const a7 = outcome(c, past, 7, b7);
    const a30 = outcome(c, past, 30, b30);
    out.push({ id, time: cs[i].openTime, level: levels.get(`${id}:${i}`) ?? null, after7: a7, after30: a30, lean: leanOf(a30) });
  }
  const rank = { up: 0, down: 0, none: 1, rare: 2 };
  return out.sort((a, b) => rank[a.lean] - rank[b.lean] || b.time - a.time);
}

/** Clear lean only with ≥ 8 past cases and a gap of ≥ 12 points vs a normal day. */
export function leanOf(o: PatternOutcome | null): PatternHit["lean"] {
  if (!o || o.n < 8) return "rare";
  const r = o.up / o.n;
  if (r >= o.baseUp + 0.12) return "up";
  if (r <= o.baseUp - 0.12) return "down";
  return "none";
}
