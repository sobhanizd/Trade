/**
 * Monthly investment plan — which coins to buy with this month's money.
 *
 * Rules (shown to the user on the plan page):
 *  1. BTC and ETH are the base and are bought EVERY month, whatever the
 *     short-term signals say. Buying steadily every month ("dollar-cost
 *     averaging") is what makes monthly investing work; trying to time the
 *     market usually makes results worse.
 *  2. Careful style adds gold (PAXG) as a calmer part. Balanced/Bold add a few
 *     smaller coins from the watchlist — only coins whose combined answer is
 *     not SELL, preferring BUY, then the most daily buy ideas.
 *  3. Amounts below the minimum order size are folded into BTC.
 *  4. Amounts are whole euros; any rounding remainder goes to BTC.
 */
import type { Action } from "@/lib/signals/verdict";

export type PlanStyle = "careful" | "balanced" | "bold";

export const STYLES: Record<PlanStyle, { label: string; text: string; btc: number; eth: number; gold: number; others: number; maxOthers: number }> = {
  careful: { label: "Careful", text: "Mostly Bitcoin, some Ethereum, and gold to soften the swings.", btc: 0.5, eth: 0.2, gold: 0.3, others: 0, maxOthers: 0 },
  balanced: { label: "Balanced", text: "Mostly Bitcoin and Ethereum, plus a small part in 1–2 other coins.", btc: 0.5, eth: 0.3, gold: 0, others: 0.2, maxOthers: 2 },
  bold: { label: "Bold", text: "Bitcoin and Ethereum plus a bigger part in up to 3 other coins — bigger ups and downs.", btc: 0.4, eth: 0.3, gold: 0, others: 0.3, maxOthers: 3 },
};

export type StyleKey = PlanStyle | "custom";
export interface CustomMix { BTC: number; ETH: number; PAXG: number }

/** The split for a style; "custom" = the user's smart mix (no extra coins). */
export function styleOf(style: StyleKey, custom?: CustomMix | null) {
  if (style !== "custom") return STYLES[style];
  const c = custom ?? { BTC: 0.5, ETH: 0.3, PAXG: 0.2 };
  return { label: "My smart mix", text: "", btc: c.BTC, eth: c.ETH, gold: c.PAXG, others: 0, maxOthers: 0 };
}

export interface CoinState {
  symbol: string;
  verdict: Action;
  /** Number of daily strategies currently showing a buy setup. */
  dailyBuyIdeas: number;
  priceEur: number | null;
}

export type LineReason = { k: "btc" } | { k: "eth" } | { k: "gold" } | { k: "extraBuy" } | { k: "extraIdeas"; n: number } | { k: "extraNoSell" };
export type PlanNote =
  | { k: "goldMissing" }
  | { k: "skippedSell"; coins: string[] }
  | { k: "tooSmall"; min: number }
  | { k: "noneGood" }
  | { k: "belowMin"; coin: string; min: number };

export interface PlanLine {
  symbol: string;
  reasonCode: LineReason;
  amountEur: number;
  quantity: number | null;
  priceEur: number | null;
  role: "base" | "gold" | "extra";
  reason: string;
}

export interface MonthlyPlan {
  total: number;
  lines: PlanLine[];
  notes: string[];
  noteCodes: PlanNote[];
}

const GOLD = "PAXG";
const CORE = new Set(["BTC", "ETH", GOLD]);

export function pickOthers(coins: CoinState[], max: number): CoinState[] {
  const rank: Record<Action, number> = { BUY: 0, WAIT: 1, NO_DATA: 2, SELL: 3 };
  return coins
    .filter((c) => !CORE.has(c.symbol) && c.verdict !== "SELL" && c.verdict !== "NO_DATA")
    .sort((a, b) => rank[a.verdict] - rank[b.verdict] || b.dailyBuyIdeas - a.dailyBuyIdeas || a.symbol.localeCompare(b.symbol))
    .slice(0, max);
}

export function allocateMonth(total: number, style: StyleKey, coins: CoinState[], minOrder = 10, custom?: CustomMix | null): MonthlyPlan {
  const st = styleOf(style, custom);
  const have = (s: string) => coins.some((c) => c.symbol === s);
  const get = (s: string) => coins.find((c) => c.symbol === s);
  const notes: string[] = [];
  const noteCodes: PlanNote[] = [];
  const raw = new Map<string, { amount: number; role: PlanLine["role"]; reason: string; code: LineReason }>();
  const add = (s: string, amount: number, role: PlanLine["role"], reason: string, code: LineReason) => {
    const cur = raw.get(s);
    raw.set(s, { amount: (cur?.amount ?? 0) + amount, role: cur?.role ?? role, reason: cur?.reason ?? reason, code: cur?.code ?? code });
  };

  let btc = st.btc * total;
  if (have("ETH")) add("ETH", st.eth * total, "base", "Base of the plan — bought every month.", { k: "eth" });
  else btc += st.eth * total;
  if (st.gold > 0) {
    if (have(GOLD)) add(GOLD, st.gold * total, "gold", "Gold is calmer than crypto and softens big drops.", { k: "gold" });
    else {
      btc += st.gold * total;
      notes.push("Gold (PAXG) is not in your coins, so its part goes to Bitcoin.");
      noteCodes.push({ k: "goldMissing" });
    }
  }
  if (st.others > 0) {
    let n = st.maxOthers;
    while (n > 0 && (st.others * total) / n < minOrder) n--;
    const picks = n > 0 ? pickOthers(coins, n) : [];
    if (picks.length) {
      const each = (st.others * total) / picks.length;
      for (const p of picks) {
        add(
          p.symbol,
          each,
          "extra",
          p.verdict === "BUY" ? "Its signals say BUY right now." : p.dailyBuyIdeas > 0 ? `${p.dailyBuyIdeas} daily buy idea${p.dailyBuyIdeas > 1 ? "s" : ""}, no sell signal.` : "No sell signal right now.",
          p.verdict === "BUY" ? { k: "extraBuy" } : p.dailyBuyIdeas > 0 ? { k: "extraIdeas", n: p.dailyBuyIdeas } : { k: "extraNoSell" },
        );
      }
      const skipped = coins.filter((c) => !CORE.has(c.symbol) && c.verdict === "SELL").map((c) => c.symbol);
      if (skipped.length) {
        notes.push(`Skipped this month because their signals say SELL: ${skipped.join(", ")}.`);
        noteCodes.push({ k: "skippedSell", coins: skipped });
      }
    } else {
      btc += st.others * total;
      notes.push(n === 0 ? `The amount is too small to split into extra coins (minimum €${minOrder} per order), so it goes to Bitcoin.` : "No other coin looks good this month, so that part goes to Bitcoin.");
      noteCodes.push(n === 0 ? { k: "tooSmall", min: minOrder } : { k: "noneGood" });
    }
  }
  add("BTC", btc, "base", "Biggest and most established crypto — the base of the plan, bought every month.", { k: "btc" });

  // Fold tiny orders into BTC.
  for (const [s, v] of raw) {
    if (s !== "BTC" && v.amount < minOrder) {
      raw.delete(s);
      raw.get("BTC")!.amount += v.amount;
      notes.push(`${s} would be below the minimum order (€${minOrder}), so it goes to Bitcoin.`);
      noteCodes.push({ k: "belowMin", coin: s, min: minOrder });
    }
  }
  // Whole euros; remainder to BTC.
  const lines: PlanLine[] = [];
  let used = 0;
  for (const [s, v] of raw) {
    if (s === "BTC") continue;
    const amt = Math.floor(v.amount);
    used += amt;
    lines.push({ symbol: s, amountEur: amt, role: v.role, reason: v.reason, reasonCode: v.code, priceEur: get(s)?.priceEur ?? null, quantity: null });
  }
  const b = raw.get("BTC")!;
  lines.unshift({ symbol: "BTC", amountEur: Math.round((total - used) * 100) / 100, role: "base", reason: b.reason, reasonCode: b.code, priceEur: get("BTC")?.priceEur ?? null, quantity: null });
  for (const l of lines) l.quantity = l.priceEur ? l.amountEur / l.priceEur : null;
  const order = { base: 0, gold: 1, extra: 2 };
  lines.sort((a, b2) => order[a.role] - order[b2.role] || b2.amountEur - a.amountEur);
  return { total, lines: lines.filter((l) => l.amountEur > 0), notes, noteCodes };
}

/** The plan period ("2026-10") and the next buy date for a buy day of the month. */
export function planPeriod(now: Date, buyDay: 0 | 1 | 15) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (buyDay === 0) {
    // Any day: the period is the calendar month; next period starts on the 1st.
    const start = new Date(Date.UTC(y, m, 1));
    return { period: `${y}-${String(m + 1).padStart(2, "0")}`, periodStart: start, nextBuy: new Date(Date.UTC(y, m + 1, 1)) };
  }
  const thisBuy = new Date(Date.UTC(y, m, buyDay));
  const next = now.getTime() >= thisBuy.getTime() ? new Date(Date.UTC(y, m + 1, buyDay)) : thisBuy;
  // The current period is the month whose buy day has most recently passed (or this month if before it).
  const periodDate = now.getTime() >= thisBuy.getTime() ? thisBuy : new Date(Date.UTC(y, m - 1, buyDay));
  const period = `${periodDate.getUTCFullYear()}-${String(periodDate.getUTCMonth() + 1).padStart(2, "0")}`;
  return { period, periodStart: periodDate, nextBuy: next };
}

/** Monthly growth needed so that `monthly` invested for `months` grows to `goal` (buy at start of each month). */
export function requiredGrowth(monthly: number, months: number, goal: number, lumpNow = 0) {
  const fv = (i: number) => lumpNow * (1 + i) ** months + (i === 0 ? monthly * months : monthly * (((1 + i) ** months - 1) / i) * (1 + i));
  const invested = monthly * months + lumpNow;
  if (goal <= invested) return { monthly: 0, yearly: 0, invested };
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (fv(mid) < goal) lo = mid;
    else hi = mid;
  }
  return { monthly: lo, yearly: (1 + lo) ** 12 - 1, invested };
}
