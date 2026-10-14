/**
 * One plain answer per coin — BUY / WAIT / SELL — derived deterministically from
 * the active strategy signals. Rules (documented in docs/STRATEGIES.md):
 *
 *  Primary timeframe = daily (1d) if scanned, else the longest scanned one.
 *  Timing timeframe  = the next shorter scanned timeframe (e.g. 4h).
 *
 *  NO DATA : no usable signals on the primary timeframe.
 *  SELL    : ≥ 2 primary strategies show exit/sell conditions and they outnumber buy setups.
 *  BUY     : ≥ 2 primary strategies show buy setups, none show exit/sell conditions,
 *            the best setup's reward/risk after costs ≥ 1.5, and the timing timeframe
 *            does not show ≥ 2 exit/sell conditions.
 *  WAIT    : everything else (the reasons are listed).
 */
export type Action = "BUY" | "WAIT" | "SELL" | "NO_DATA";

export interface VerdictSignal {
  id: string;
  strategyId: string;
  timeframe: string;
  state: string;
  riskReward: number | null;
  rulesMet: number;
  rulesTotal: number;
  price: number;
  invalidation: number | null;
  targets: number[];
  entryLow: number | null;
  entryHigh: number | null;
}

export type VerdictHeadline = "noData" | "sell" | "strongBuy" | "buy" | "waitAlmost" | "wait";
export type VerdictReason =
  | { k: "noData" }
  | { k: "sellExits"; exits: number; total: number; tf: string }
  | { k: "sellDontBuy" }
  | { k: "buyAgree"; buys: number; total: number; tf: string }
  | { k: "buyRR"; rr: number }
  | { k: "buyTimingCalm"; tf: string }
  | { k: "waitFewBuys"; buys: number; total: number; tf: string }
  | { k: "waitWarnings"; exits: number; tf: string }
  | { k: "waitLowRR"; rr: number; min: number }
  | { k: "waitTimingFalling"; tf: string; tf2: string; n: number };

export interface Verdict {
  action: Action;
  /** Language-neutral versions of headline/reasons (rendered per language in the UI). */
  headlineCode: VerdictHeadline;
  reasonCodes: VerdictReason[];
  strong: boolean;
  headline: string;
  reasons: string[];
  primaryTimeframe: string | null;
  timingTimeframe: string | null;
  buyCount: number;
  exitCount: number;
  total: number;
  /** Best buy setup (levels to show) for BUY, or best exit signal for SELL. */
  best: VerdictSignal | null;
}

export const MIN_VERDICT_RR = 1.5;
const BUY = new Set(["STRONG_BUY_SETUP", "POTENTIAL_BUY"]);
const EXIT = new Set(["EXIT_SETUP", "POTENTIAL_SELL"]);
const ORDER = ["1w", "1d", "4h", "1h"];

export function computeVerdict(signals: VerdictSignal[]): Verdict {
  const tfs = ORDER.filter((tf) => signals.some((s) => s.timeframe === tf));
  const primary = tfs.includes("1d") ? "1d" : (tfs[0] ?? null);
  const timing = primary ? (ORDER.slice(ORDER.indexOf(primary) + 1).find((tf) => tfs.includes(tf)) ?? null) : null;
  const base: Omit<Verdict, "action" | "headline" | "reasons" | "best" | "strong" | "headlineCode" | "reasonCodes"> = { primaryTimeframe: primary, timingTimeframe: timing, buyCount: 0, exitCount: 0, total: 0 };
  const label = (tf: string | null) => (tf === "1d" ? "daily" : tf === "4h" ? "4-hour" : tf === "1w" ? "weekly" : tf === "1h" ? "hourly" : "");

  const prim = signals.filter((s) => s.timeframe === primary && s.state !== "NO_SIGNAL");
  if (!primary || prim.length === 0) {
    return { ...base, action: "NO_DATA", strong: false, headline: "Not enough data yet", reasons: ["No usable signals yet — wait for the next scan or check System status."], headlineCode: "noData", reasonCodes: [{ k: "noData" }], best: null };
  }
  const buys = prim.filter((s) => BUY.has(s.state));
  const exits = prim.filter((s) => EXIT.has(s.state));
  const timingExits = timing ? signals.filter((s) => s.timeframe === timing && EXIT.has(s.state)) : [];
  const counts = { ...base, buyCount: buys.length, exitCount: exits.length, total: prim.length };
  const rank = (a: VerdictSignal, b: VerdictSignal) => b.rulesMet / Math.max(1, b.rulesTotal) - a.rulesMet / Math.max(1, a.rulesTotal) || (b.riskReward ?? 0) - (a.riskReward ?? 0);
  const bestBuy = [...buys].filter((s) => s.invalidation !== null).sort(rank)[0] ?? null;
  const bestRR = Math.max(0, ...buys.map((s) => s.riskReward ?? 0));
  const P = label(primary);
  const T = label(timing);

  if (exits.length >= 2 && exits.length > buys.length) {
    return {
      ...counts,
      action: "SELL",
      strong: exits.some((s) => s.state === "EXIT_SETUP" && s.strategyId === "trend_following"),
      headline: "Sell signal — if you own it, the rules say exit",
      reasons: [`${exits.length} of ${prim.length} ${P} strategies show exit or sell conditions.`, "Do not buy while these conditions hold."],
      headlineCode: "sell",
      reasonCodes: [{ k: "sellExits", exits: exits.length, total: prim.length, tf: primary }, { k: "sellDontBuy" }],
      best: [...exits].sort(rank)[0],
    };
  }

  const reasons: string[] = [];
  if (buys.length >= 2 && exits.length === 0 && bestRR >= MIN_VERDICT_RR && timingExits.length < 2) {
    return {
      ...counts,
      action: "BUY",
      strong: buys.some((s) => s.state === "STRONG_BUY_SETUP"),
      headline: buys.some((s) => s.state === "STRONG_BUY_SETUP") ? "Strong buy signal" : "Buy signal",
      reasons: [
        `${buys.length} of ${prim.length} ${P} strategies see a buy setup and none show a warning.`,
        `Potential gain is about ${bestRR.toFixed(1)}× the potential loss (after fees).`,
        timing ? `The ${T} chart is not falling.` : "",
      ].filter(Boolean),
      headlineCode: buys.some((s) => s.state === "STRONG_BUY_SETUP") ? "strongBuy" : "buy",
      reasonCodes: [{ k: "buyAgree", buys: buys.length, total: prim.length, tf: primary }, { k: "buyRR", rr: bestRR }, ...(timing ? [{ k: "buyTimingCalm" as const, tf: timing }] : [])],
      best: bestBuy,
    };
  }

  const reasonCodes: VerdictReason[] = [];
  if (buys.length < 2) {
    reasons.push(`Only ${buys.length} of ${prim.length} ${P} strategies see a buy setup (2 needed).`);
    reasonCodes.push({ k: "waitFewBuys", buys: buys.length, total: prim.length, tf: primary });
  }
  if (exits.length > 0) {
    reasons.push(`${exits.length} ${P} strateg${exits.length === 1 ? "y shows" : "ies show"} a warning.`);
    reasonCodes.push({ k: "waitWarnings", exits: exits.length, tf: primary });
  }
  if (buys.length >= 2 && bestRR < MIN_VERDICT_RR) {
    reasons.push(`Potential gain is only ${bestRR.toFixed(1)}× the potential loss — at least ${MIN_VERDICT_RR}× is required.`);
    reasonCodes.push({ k: "waitLowRR", rr: bestRR, min: MIN_VERDICT_RR });
  }
  if (buys.length >= 2 && timingExits.length >= 2) {
    reasons.push(`The ${P} picture looks positive, but the ${T} chart is falling (${timingExits.length} warnings) — waiting for it to settle avoids buying into a drop.`);
    reasonCodes.push({ k: "waitTimingFalling", tf: primary, tf2: timing ?? "", n: timingExits.length });
  }
  return { ...counts, action: "WAIT", strong: false, headline: buys.length >= 2 ? "Wait — almost a buy" : "Wait", reasons, headlineCode: buys.length >= 2 ? "waitAlmost" : "wait", reasonCodes, best: bestBuy };
}
