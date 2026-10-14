/**
 * Smart monthly plan: decides HOW MUCH of this month's money goes to each coin,
 * and whether TODAY is a good day to buy. Pure functions (client + server).
 *
 * Rules (shown to the user in plain words):
 *  - The style sets the usual split (e.g. Balanced: BTC 50 %, ETH 30 %, others 20 %).
 *  - Each coin gets a score from facts the app already has:
 *      BUY answer +2 · each daily buy idea +0.5 (max 3) ·
 *      price ≥5 % below its 30-day average +1.5 (≥2 % below +0.75) ·
 *      price ≥8 % above its 30-day average −1 (≥4 % above −0.5) ·
 *      daily downtrend −1 · very jumpy price (ATR > 6 % of price) −0.5.
 *  - BTC and ETH are always bought; their share moves up/down by at most 10
 *    percentage points depending on their score. Gold (Careful) moves by at most 5.
 *  - The other coins share what is left, in proportion to their score; coins
 *    whose answer is SELL, or that score too low, are skipped.
 *  - No order below the minimum size; whole euros; remainder to BTC.
 */
import type { Action } from "@/lib/signals/verdict";
import { styleOf, type CustomMix, type StyleKey } from "./allocate";

export interface CoinFeatures {
  symbol: string;
  verdict: Action;
  dailyBuyIdeas: number;
  priceEur: number | null;
  /** Price vs its 30-day average, in % (negative = cheaper than usual). */
  vs30dPct: number | null;
  /** Daily ATR as % of price. */
  atrPct: number | null;
  /** Daily trend-following answer says the trend is down. */
  trendDown: boolean;
}

export type SmartFactor =
  | { k: "buySignal" }
  | { k: "ideas"; n: number }
  | { k: "cheaper"; pct: number }
  | { k: "pricier"; pct: number }
  | { k: "downtrend" }
  | { k: "volatile"; pct: number }
  | { k: "sellSignal" };

export interface SmartLine {
  symbol: string;
  amountEur: number;
  quantity: number | null;
  priceEur: number | null;
  role: "base" | "gold" | "extra";
  /** Share of the budget this month vs. the style's usual share, in percentage points. */
  vsUsualPts: number;
  factors: SmartFactor[];
}

export type SmartNote = { k: "skippedSell"; coins: string[] } | { k: "skippedWeak"; coins: string[] } | { k: "belowMin"; coin: string; min: number } | { k: "goldMissing" } | { k: "noOthers" };

export interface SmartPlan {
  total: number;
  lines: SmartLine[];
  notes: SmartNote[];
}

const CORE = new Set(["BTC", "ETH", "PAXG"]);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function scoreCoin(c: CoinFeatures): { score: number; factors: SmartFactor[] } {
  const f: SmartFactor[] = [];
  let s = 0;
  if (c.verdict === "BUY") {
    s += 2;
    f.push({ k: "buySignal" });
  }
  if (c.verdict === "SELL") f.push({ k: "sellSignal" });
  const ideas = Math.min(3, c.dailyBuyIdeas);
  if (ideas > 0) {
    s += ideas * 0.5;
    f.push({ k: "ideas", n: c.dailyBuyIdeas });
  }
  if (c.vs30dPct !== null) {
    if (c.vs30dPct <= -5) (s += 1.5), f.push({ k: "cheaper", pct: -c.vs30dPct });
    else if (c.vs30dPct <= -2) (s += 0.75), f.push({ k: "cheaper", pct: -c.vs30dPct });
    else if (c.vs30dPct >= 8) (s -= 1), f.push({ k: "pricier", pct: c.vs30dPct });
    else if (c.vs30dPct >= 4) (s -= 0.5), f.push({ k: "pricier", pct: c.vs30dPct });
  }
  if (c.trendDown) {
    s -= 1;
    f.push({ k: "downtrend" });
  }
  if (c.atrPct !== null && c.atrPct > 6) {
    s -= 0.5;
    f.push({ k: "volatile", pct: c.atrPct });
  }
  if (c.verdict === "SELL") s -= 3;
  return { score: s, factors: f };
}

export function allocateSmart(total: number, style: StyleKey, coins: CoinFeatures[], minOrder = 10, custom?: CustomMix | null): SmartPlan {
  const st = styleOf(style, custom);
  const by = new Map(coins.map((c) => [c.symbol, c]));
  const notes: SmartNote[] = [];
  const sc = new Map(coins.map((c) => [c.symbol, scoreCoin(c)]));
  const tilt = (sym: string, maxPts: number) => clamp((sc.get(sym)?.score ?? 0) * 4, -maxPts, maxPts) / 100;

  // 1. Core shares (fractions), tilted by score.
  const shares = new Map<string, { w: number; usual: number; role: SmartLine["role"] }>();
  let btc = st.btc + tilt("BTC", 10);
  let eth = by.has("ETH") ? st.eth + tilt("ETH", 10) : 0;
  if (!by.has("ETH")) btc += st.eth;
  let gold = 0;
  if (st.gold > 0) {
    if (by.has("PAXG")) gold = st.gold + tilt("PAXG", 5);
    else {
      btc += st.gold;
      notes.push({ k: "goldMissing" });
    }
  }
  // Limits keep the base sensible; a custom mix's own shares are always allowed.
  btc = clamp(btc, Math.min(0.25, st.btc), Math.max(0.8, st.btc));
  eth = clamp(eth, 0, Math.max(0.5, st.eth));
  let others = Math.max(0, 1 - btc - eth - gold);

  // 2. Other coins, in proportion to score.
  const cands = coins.filter((c) => !CORE.has(c.symbol));
  const sells = cands.filter((c) => c.verdict === "SELL").map((c) => c.symbol);
  if (sells.length) notes.push({ k: "skippedSell", coins: sells });
  const eligible = cands
    .filter((c) => c.verdict !== "SELL" && c.verdict !== "NO_DATA")
    .map((c) => ({ c, s: sc.get(c.symbol)!.score }))
    .filter((x) => x.s > -1)
    .sort((a, b) => b.s - a.s || a.c.symbol.localeCompare(b.c.symbol));
  const weak = cands.filter((c) => c.verdict !== "SELL" && c.verdict !== "NO_DATA" && sc.get(c.symbol)!.score <= -1).map((c) => c.symbol);
  if (weak.length) notes.push({ k: "skippedWeak", coins: weak });
  let n = Math.min(st.maxOthers, eligible.length);
  while (n > 0 && (others * total) / n < minOrder) n--;
  const picks = eligible.slice(0, n);
  if (st.others > 0 && !picks.length) {
    if (others > 0) notes.push({ k: "noOthers" });
    btc += others;
    others = 0;
  }
  const wsum = picks.reduce((a, p) => a + (p.s + 1.5), 0);
  for (const p of picks) shares.set(p.c.symbol, { w: (others * (p.s + 1.5)) / wsum, usual: st.others / Math.max(1, st.maxOthers), role: "extra" });
  if (!picks.length && st.others === 0) btc += others;

  shares.set("BTC", { w: btc, usual: st.btc + (by.has("ETH") ? 0 : st.eth) + (st.gold > 0 && !by.has("PAXG") ? st.gold : 0), role: "base" });
  if (eth > 0) shares.set("ETH", { w: eth, usual: st.eth, role: "base" });
  if (gold > 0) shares.set("PAXG", { w: gold, usual: st.gold, role: "gold" });

  // 3. Euros, minimum order, rounding.
  const amounts = new Map<string, number>();
  for (const [sym, v] of shares) amounts.set(sym, v.w * total);
  for (const [sym, a] of [...amounts]) {
    if (sym !== "BTC" && a < minOrder) {
      amounts.delete(sym);
      amounts.set("BTC", (amounts.get("BTC") ?? 0) + a);
      notes.push({ k: "belowMin", coin: sym, min: minOrder });
    }
  }
  const lines: SmartLine[] = [];
  let used = 0;
  for (const [sym, a] of amounts) {
    if (sym === "BTC") continue;
    const amt = Math.floor(a);
    used += amt;
    lines.push(mkLine(sym, amt));
  }
  lines.push(mkLine("BTC", Math.round((total - used) * 100) / 100));
  const order = { base: 0, gold: 1, extra: 2 };
  lines.sort((a, b) => order[a.role] - order[b.role] || b.amountEur - a.amountEur);
  return { total, lines: lines.filter((l) => l.amountEur > 0), notes };

  function mkLine(sym: string, amt: number): SmartLine {
    const c = by.get(sym);
    const sh = shares.get(sym);
    const price = c?.priceEur ?? null;
    return {
      symbol: sym,
      amountEur: amt,
      priceEur: price,
      quantity: price ? amt / price : null,
      role: sh?.role ?? "base",
      vsUsualPts: total > 0 ? Math.round(((amt / total) - (sh?.usual ?? 0)) * 100) : 0,
      factors: sc.get(sym)?.factors ?? [],
    };
  }
}

/** "pricey" still says BUY: in the price history, waiting for a dip usually cost more than it saved. */
export type TimingAdvice = "buyNow" | "goodDay" | "normal" | "pricey" | "lastDays";

/**
 * Is today a good day to buy (for "any day of the month" plans)?
 * Weighted by this month's amounts: average price vs 30-day average.
 */
export function buyTiming(lines: { symbol: string; amountEur: number }[], coins: CoinFeatures[], now: Date): { advice: TimingAdvice; avgVs30d: number | null; daysLeft: number } {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const daysLeft = Math.ceil((end - now.getTime()) / 86_400_000);
  let wsum = 0;
  let acc = 0;
  for (const l of lines) {
    const v = coins.find((c) => c.symbol === l.symbol)?.vs30dPct;
    if (v === null || v === undefined) continue;
    acc += v * l.amountEur;
    wsum += l.amountEur;
  }
  const avg = wsum > 0 ? acc / wsum : null;
  const buys = coins.filter((c) => lines.some((l) => l.symbol === c.symbol) && c.verdict === "BUY").length;
  if (daysLeft <= 3) return { advice: "lastDays", avgVs30d: avg, daysLeft };
  if (avg !== null && avg <= -4) return { advice: "buyNow", avgVs30d: avg, daysLeft };
  if ((avg !== null && avg <= -1.5) || buys >= 2) return { advice: "goodDay", avgVs30d: avg, daysLeft };
  if (avg !== null && avg >= 4) return { advice: "pricey", avgVs30d: avg, daysLeft };
  return { advice: "normal", avgVs30d: avg, daysLeft };
}

/** Keep the goal the same multiple of the money put in when amounts/years change. */
export function scaleGoal(oldGoal: number, oldInvested: number, newInvested: number) {
  if (!(oldInvested > 0) || !(newInvested > 0)) return oldGoal;
  return Math.max(500, Math.round(((oldGoal * newInvested) / oldInvested) / 500) * 500);
}
