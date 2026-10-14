/**
 * "Trader's advice": one clear action per coin (buy now / buy in parts / wait for
 * a dip / don't buy / hold / protect / take some profit / sell part), WHEN to act
 * or re-check, why, what would change the advice, and how reliable such advice
 * has been on this coin. Pure function over facts the app already measures.
 *
 * Honesty rules built in:
 *  - Every "edge" is measured on this coin's own daily history, not assumed.
 *  - Confidence is never "high": short-term direction was close to a coin flip.
 *  - A monthly plan keeps buying regardless; this advice is for extra money and
 *    for coins the user already holds.
 */
import { ema, rsi, sma } from "@/lib/indicators";
import type { Candle } from "@/lib/market/types";
import type { Action } from "@/lib/signals/verdict";
import type { PatternHit } from "./patterns";
import type { EntryTiming, LevelOdds } from "./timing";
import type { Analogs, Direction, Scenarios, TrendLines } from "./structure";

// ───────────── Trend state and its track record on this coin ─────────────

export type Regime = "strongUp" | "up" | "mixed" | "down" | "strongDown";
export interface RegimeStats { n: number; up30: number; avg30: number; medDip30: number; badDip30: number }

function regimeAt(c: number[], e20: (number | null)[], e50: (number | null)[], s200: (number | null)[], i: number): Regime | null {
  if (s200[i] === null || s200[i - 30] === null || e50[i] === null || e50[i - 10] === null || e20[i] === null) return null;
  let v = 0;
  v += c[i] > s200[i]! && s200[i]! > s200[i - 30]! ? 2 : c[i] < s200[i]! && s200[i]! < s200[i - 30]! ? -2 : 0;
  v += c[i] > e50[i]! && e50[i]! > e50[i - 10]! ? 1 : c[i] < e50[i]! && e50[i]! < e50[i - 10]! ? -1 : 0;
  const r7 = c[i] / c[i - 7] - 1;
  v += r7 > 0.02 && c[i] > e20[i]! ? 0.5 : r7 < -0.02 && c[i] < e20[i]! ? -0.5 : 0;
  return v >= 2.5 ? "strongUp" : v >= 1 ? "up" : v > -1 ? "mixed" : v > -2.5 ? "down" : "strongDown";
}

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
};

/** Today's trend state, plus what the next 30 days looked like in that state and on all days. */
export function regimeTrack(cs: Candle[]): { now: Regime | null; inState: RegimeStats | null; all: RegimeStats | null } {
  const c = cs.map((x) => x.close);
  const e20 = ema(c, 20), e50 = ema(c, 50), s200 = sma(c, 200);
  const last = c.length - 1;
  const groups = new Map<Regime, { r: number[]; dip: number[] }>();
  const all = { r: [] as number[], dip: [] as number[] };
  for (let i = 230; i + 30 <= last; i++) {
    const g = regimeAt(c, e20, e50, s200, i);
    if (!g) continue;
    let low = Infinity;
    for (let j = i + 1; j <= i + 30; j++) low = Math.min(low, cs[j].low);
    const r = c[i + 30] / c[i] - 1;
    const dip = low / c[i] - 1;
    const b = groups.get(g) ?? { r: [], dip: [] };
    b.r.push(r);
    b.dip.push(dip);
    groups.set(g, b);
    all.r.push(r);
    all.dip.push(dip);
  }
  const st = (b: { r: number[]; dip: number[] } | undefined): RegimeStats | null =>
    b && b.r.length ? { n: b.r.length, up30: b.r.filter((x) => x > 0).length / b.r.length, avg30: b.r.reduce((a, x) => a + x, 0) / b.r.length, medDip30: q(b.dip, 0.5), badDip30: q(b.dip, 0.1) } : null;
  const now = last >= 230 ? regimeAt(c, e20, e50, s200, last) : null;
  return { now, inState: now ? st(groups.get(now)) : null, all: st(all) };
}

// ───────────── The advice ─────────────

/**
 * noEdge = no clear reason either way: small parts are fine, no rush.
 * waitDip only when the timing check measured that waiting for a lower price paid off on this coin.
 */
export type AdviceAction = "buyNow" | "buyParts" | "noEdge" | "waitDip" | "avoid" | "pause" | "hold" | "protect" | "takeProfit" | "sellPart";
export type Part =
  | { k: "regime"; regime: Regime; avg30: number; baseAvg30: number; badDip: number; baseBadDip: number; n: number; pts: number }
  | { k: "analogs"; up: number; n: number; baseUp: number; pts: number }
  | { k: "pattern"; id: PatternHit["id"]; lean: "up" | "down"; up: number; n: number; baseUp: number; pts: number }
  | { k: "verdict"; action: Action; pts: number }
  | { k: "lines"; broke: "support" | "resistance"; level: number; pts: number }
  | { k: "rsi"; value: number; pts: number }
  | { k: "news"; title: string; pts: number };


export interface AdviceInput {
  daily: Candle[];
  now?: number;
  verdict: Action;
  direction: Direction | null;
  lines: TrendLines;
  scenarios: Scenarios | null;
  analogs: Analogs | null;
  patterns: PatternHit[];
  /** Serious news about the coin in the last 24 h. */
  urgentNews: string[];
  /** The user's position (from "I bought these"), in USD at today's price. */
  /** investedUsd = null when the user didn't enter what they paid (then no gain % is shown). sellCost = fraction lost when selling. */
  holding: { quantity: number; investedUsd: number | null; sellCost?: number } | null;
  timing?: EntryTiming | null;
  /** Chance the stop / an upside level is hit first within 7/30/90 days (from timing.exitOdds). */
  exitOdds?: { odds: LevelOdds[]; samples: number } | null;
}

export interface Advice {
  action: AdviceAction;
  /** Same advice for someone who doesn't own the coin (shown as a second line when the user owns it). */
  forNewMoney: AdviceAction;
  score: number;
  confidence: "low" | "medium";
  parts: Part[];
  /** Price levels (USD). */
  close: number;
  buyLevel: number | null;
  stopLevel: number | null;
  upTrigger: number | null;
  downTrigger: number | null;
  /** Days until the advice should be re-checked, and the date (ms). */
  recheckDays: number;
  recheckAt: number;
  /** Next-30-day picture from this coin's history in today's trend state. */
  month: { regime: Regime | null; inState: RegimeStats | null; all: RegimeStats | null };
  week: { up: number; n: number; baseUp: number } | null;
  /** valueUsd is after the selling cost ("what you'd get if you sold now"). */
  holding: { quantity: number; investedUsd: number | null; valueUsd: number; gainPct: number | null } | null;
  timing: EntryTiming | null;
  exitOdds: { odds: LevelOdds[]; samples: number } | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const DAY = 86_400_000;

export function advise(inp: AdviceInput): Advice | null {
  const now = inp.now ?? Date.now();
  const cs = inp.daily.filter((x) => x.closeTime < now);
  if (cs.length < 60) return null;
  const c = cs.map((x) => x.close);
  const last = c.length - 1;
  const close = c[last];
  const parts: Part[] = [];

  // 1. Trend state, judged by what followed it on THIS coin (needs a decent sample).
  const rt = regimeTrack(cs);
  if (rt.now && rt.inState && rt.all && rt.inState.n >= 150) {
    const d = rt.inState.avg30 - rt.all.avg30;
    let pts = clamp(d * 25, -1.5, 1.5);
    if (rt.inState.badDip30 < rt.all.badDip30 - 0.05) pts -= 0.75;
    else if (rt.inState.badDip30 > rt.all.badDip30 + 0.04) pts += 0.25;
    parts.push({ k: "regime", regime: rt.now, avg30: rt.inState.avg30, baseAvg30: rt.all.avg30, badDip: rt.inState.badDip30, baseBadDip: rt.all.badDip30, n: rt.inState.n, pts: round(pts) });
  }
  // 2. Similar moments in the past (30 days later).
  const h30 = inp.analogs?.h30;
  if (h30 && h30.n >= 10) parts.push({ k: "analogs", up: h30.up, n: h30.n, baseUp: h30.baseUp, pts: round(clamp((h30.up / h30.n - h30.baseUp) * 5, -1, 1)) });
  // 3. Patterns with a measured lean on this coin.
  let patPts = 0;
  for (const p of inp.patterns) {
    if (p.lean !== "up" && p.lean !== "down") continue;
    const pts = p.lean === "up" ? 0.75 : -0.75;
    if (Math.abs(patPts + pts) > 1.5) continue;
    patPts += pts;
    parts.push({ k: "pattern", id: p.id, lean: p.lean, up: p.after30!.up, n: p.after30!.n, baseUp: p.after30!.baseUp, pts });
  }
  // 4. The app's strategies (BUY/WAIT/SELL).
  if (inp.verdict === "BUY") parts.push({ k: "verdict", action: "BUY", pts: 1 });
  else if (inp.verdict === "SELL") parts.push({ k: "verdict", action: "SELL", pts: -1.5 });
  // 5. Trend lines broken on the last close.
  if (inp.lines.brokeSupport && inp.lines.support) parts.push({ k: "lines", broke: "support", level: inp.lines.support.pEnd, pts: -0.75 });
  if (inp.lines.brokeResistance && inp.lines.resistance) parts.push({ k: "lines", broke: "resistance", level: inp.lines.resistance.pEnd, pts: 0.5 });
  const r = rsi(c, 14)[last];
  if (r !== null && (r >= 75 || r <= 25)) parts.push({ k: "rsi", value: r, pts: 0 });
  for (const t of inp.urgentNews.slice(0, 2)) parts.push({ k: "news", title: t, pts: 0 });

  const score = round(parts.reduce((a, p) => a + p.pts, 0));
  const signed = parts.filter((p) => p.pts !== 0);
  const agree = signed.filter((p) => Math.sign(p.pts) === Math.sign(score)).length;
  const against = signed.filter((p) => Math.sign(p.pts) === -Math.sign(score)).length;
  const confidence: Advice["confidence"] = Math.abs(score) >= 2.5 && agree >= 3 && against === 0 ? "medium" : "low";

  // Levels: a sensible dip to buy at, a safety level, and the if-then triggers.
  const e20 = ema(c, 20)[last];
  const medDip = rt.inState?.medDip30 ?? rt.all?.medDip30 ?? -0.1;
  const dipFromHistory = inp.timing?.advice === "waitForDip" && inp.timing.best ? inp.timing.best.price : close * (1 + medDip / 2);
  const sup = inp.scenarios?.downTrigger ?? null;
  const buyLevel = round2(Math.max(dipFromHistory, sup !== null && sup < close && sup > dipFromHistory ? sup : -Infinity, e20 !== null && e20 < close && e20 > close * 0.9 ? Math.min(e20, close * 0.98) : -Infinity));
  const bad = rt.inState?.badDip30 ?? rt.all?.badDip30 ?? -0.25;
  const stopLevel = round2(Math.min(sup ?? Infinity, close * (1 + Math.max(bad, -0.3) * 0.6)));

  const overextended = e20 !== null && close > e20 * 1.06;
  let forNewMoney: AdviceAction;
  if (inp.urgentNews.length) forNewMoney = "pause";
  else if (score <= -0.75) forNewMoney = "avoid";
  else if (inp.timing?.advice === "waitForDip" && inp.timing.best) forNewMoney = "waitDip";
  else if (score >= 2) forNewMoney = overextended ? "buyParts" : "buyNow";
  else if (score >= 0.75) forNewMoney = "buyParts";
  else forNewMoney = "noEdge";

  let holding: Advice["holding"] = null;
  let action: AdviceAction = forNewMoney;
  if (inp.holding && inp.holding.quantity > 0) {
    const valueUsd = inp.holding.quantity * close * (1 - (inp.holding.sellCost ?? 0));
    const gainPct = inp.holding.investedUsd && inp.holding.investedUsd > 0 ? (valueUsd / inp.holding.investedUsd - 1) * 100 : null;
    holding = { quantity: inp.holding.quantity, investedUsd: inp.holding.investedUsd, valueUsd, gainPct };
    const hot = (r !== null && r >= 75) || inp.patterns.some((p) => p.id === "overheated" || p.id === "overbought") || c[last] / c[Math.max(0, last - 30)] - 1 >= 0.3;
    if (score <= -2.5 || (inp.verdict === "SELL" && inp.lines.brokeSupport)) action = "sellPart";
    else if (gainPct !== null && gainPct >= 50 && hot) action = "takeProfit";
    else if (score <= -0.75 || inp.urgentNews.length) action = "protect";
    else action = "hold";
  }
  const recheckDays = action === "pause" ? 2 : action === "avoid" ? 14 : action === "waitDip" ? (inp.timing?.best?.days ?? 7) : 7;
  const w = inp.analogs?.h7;
  return {
    action,
    forNewMoney,
    score,
    confidence,
    parts,
    close,
    buyLevel: buyLevel < close ? buyLevel : null,
    stopLevel: stopLevel < close ? stopLevel : null,
    upTrigger: inp.scenarios?.upTrigger ?? null,
    downTrigger: inp.scenarios?.downTrigger ?? null,
    recheckDays,
    recheckAt: Math.floor(now / DAY) * DAY + recheckDays * DAY,
    month: { regime: rt.now, inState: rt.inState, all: rt.all },
    week: w ? { up: w.up, n: w.n, baseUp: w.baseUp } : null,
    holding,
    timing: inp.timing ?? null,
    exitOdds: inp.exitOdds ?? null,
  };
}

const round = (v: number) => Math.round(v * 100) / 100;
const round2 = (v: number) => (v >= 100 ? Math.round(v * 100) / 100 : Number(v.toPrecision(6)));
