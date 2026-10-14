import { cond, countTrue, f2, fp, highestOf, isNum, lowestOf, ok, p, uniqSorted, when } from "./helpers";
import type { StrategyDefinition, StrategyEvaluation } from "./types";

export const breakout: StrategyDefinition = {
  id: "breakout",
  name: "Breakout",
  version: 1,
  summary: "Detects closes above a consolidation range with volume confirmation and false-breakout safeguards.",
  description:
    "Defines a range from the highest high and lowest low of the previous N bars. A breakout requires a CLOSE (not just a wick) above the range high plus a small ATR buffer, ideally after a tight consolidation, on above-average volume and with the candle closing in the upper part of its range. Optionally it waits for additional confirming closes. Many breakouts fail; a close back inside the range is treated as a failed breakout.",
  rules: {
    setup: ["Close above the prior N-bar high plus an ATR buffer, for the required number of confirming closes"],
    confirmation: ["Range height ≤ maximum ATR multiple (a genuine consolidation)", "Breakout candle volume ≥ threshold × average", "Breakout candle closed in the upper part of its range"],
    exit: ["EXIT SETUP: a recent breakout closed back below the broken level (failed breakout)", "EXIT SETUP: close below the range low (breakdown)"],
    invalidation: "Range high minus ATR multiple (price back inside the range).",
    targets: "Measured move (range height projected from the breakout level) and an R multiple.",
    expiry: "Breakouts are time-sensitive; signals expire quickly unless re-confirmed.",
  },
  intendedTimeframes: ["4h", "1d"],
  defaultTimeframes: ["4h", "1d"],
  params: [
    p({ key: "rangeBars", label: "Range length (bars)", min: 5, max: 120, step: 1, default: 20, help: "Bars defining the consolidation range." }),
    p({ key: "maxRangeAtr", label: "Max range height (× ATR)", min: 2, max: 30, step: 0.5, default: 8, help: "Larger ranges are not treated as consolidations." }),
    p({ key: "bufferAtr", label: "Breakout buffer (× ATR)", min: 0, max: 2, step: 0.05, default: 0.1, help: "Close must exceed the level by this much." }),
    p({ key: "volMult", label: "Volume ratio threshold", min: 1, max: 5, step: 0.1, default: 1.5, help: "Breakout volume vs. average." }),
    p({ key: "closeStrength", label: "Close strength", min: 0, max: 1, step: 0.05, default: 0.5, help: "Close position within the candle range (0 = low, 1 = high)." }),
    p({ key: "confirmBars", label: "Confirming closes", min: 1, max: 5, step: 1, default: 1, help: "Consecutive closes above the level required." }),
    p({ key: "stopAtr", label: "Invalidation (× ATR below level)", min: 0.25, max: 5, step: 0.25, default: 1, help: "Distance below the broken level." }),
    p({ key: "targetR", label: "R target", min: 0.5, max: 20, step: 0.1, default: 3, help: "Additional target in multiples of risk." }),
    p({ key: "failLookback", label: "Failed-breakout window (bars)", min: 1, max: 20, step: 1, default: 5, help: "Recent breakouts checked for failure." }),
    p({ key: "expiryBars", label: "Expiry (bars)", min: 1, max: 50, step: 1, default: 3, help: "Bars before an unconfirmed signal expires." }),
  ],
  warmup: (pr) => Math.max(pr.rangeBars + pr.confirmBars + pr.failLookback + 25, 60),
  expiryBars: (pr) => pr.expiryBars,
  evaluate({ candles, i, ind, params: pr }): StrategyEvaluation {
    const c = candles[i].close;
    const atrS = ind.atr(14);
    const vrS = ind.volumeRatio(20);
    const b = i - pr.confirmBars + 1; // breakout bar
    const rangeHigh = highestOf(candles, b - pr.rangeBars, b - 1);
    const rangeLow = lowestOf(candles, b - pr.rangeBars, b - 1);
    const atrB = atrS[b - 1];
    const atrV = atrS[i];

    const closesAbove = when([rangeHigh, atrB], () => {
      for (let j = b; j <= i; j++) if (!(candles[j].close > rangeHigh! + pr.bufferAtr * atrB!)) return false;
      return true;
    });
    const height = isNum(rangeHigh) && isNum(rangeLow) ? rangeHigh - rangeLow : null;
    const consolidated = when([height, atrB], () => height! <= pr.maxRangeAtr * atrB!);
    const volOk = when([vrS[b]], () => vrS[b]! >= pr.volMult);
    const bc = candles[b];
    const strongClose = bc ? (bc.high > bc.low ? (bc.close - bc.low) / (bc.high - bc.low) >= pr.closeStrength : null) : null;

    // Failed breakout: a recent bar closed above its own prior-range high, and price is now back below that level.
    let failedLevel: number | null = null;
    for (let j = Math.max(pr.rangeBars, i - pr.failLookback); j < i; j++) {
      const rh = highestOf(candles, j - pr.rangeBars, j - 1);
      const a = atrS[j - 1];
      if (isNum(rh) && isNum(a) && candles[j].close > rh + pr.bufferAtr * a && c < rh) failedLevel = rh;
    }
    const curRangeLow = lowestOf(candles, i - pr.rangeBars, i - 1);
    const curRangeHigh = highestOf(candles, i - pr.rangeBars, i - 1);
    const breakdown = when([curRangeLow], () => c < curRangeLow!);

    const conditions = [
      cond("close_above", `${pr.confirmBars} close(s) above ${pr.rangeBars}-bar high + buffer`, "setup", closesAbove, `Range high ${fp(rangeHigh)}, close ${fp(c)}`),
      cond("consolidation", `Range height ≤ ${pr.maxRangeAtr} × ATR`, "confirm", consolidated, `Height ${fp(height)} vs ATR ${fp(atrB)}`),
      cond("volume", `Breakout volume ≥ ${pr.volMult}× average`, "confirm", volOk, `Volume ratio ${f2(vrS[b])}`),
      cond("close_strength", `Close in upper ${Math.round((1 - pr.closeStrength) * 100)}% of candle`, "confirm", strongClose, bc ? `High ${fp(bc.high)} low ${fp(bc.low)} close ${fp(bc.close)}` : "n/a"),
      cond("failed_breakout", "Recent breakout failed (closed back inside range)", "exit", failedLevel !== null, failedLevel !== null ? `Broken level ${fp(failedLevel)}` : "No recent failed breakout"),
      cond("breakdown", `Close below ${pr.rangeBars}-bar low`, "exit", breakdown, `Range low ${fp(curRangeLow)}`),
    ];
    const indicators = { close: c, rangeHigh, rangeLow, rangeHeight: height, atr: atrV, volumeRatio: vrS[b] ?? null, rsi: ind.rsi(14)[i] };
    const risks: string[] = ["Breakouts frequently fail; a close back inside the range invalidates the setup."];
    const conflicts: string[] = [];
    let state: StrategyEvaluation["state"];
    let summary: string;

    if (ok(closesAbove)) {
      const n = countTrue([consolidated, volOk, strongClose]);
      if (volOk === false) conflicts.push("Breakout volume is not above average — a common sign of false breakouts.");
      if (consolidated === false) conflicts.push("The prior range was wide; this may not be a true consolidation breakout.");
      if (strongClose === false) conflicts.push("The breakout candle closed weakly (long upper wick).");
      if (n === 3) {
        state = "STRONG_BUY_SETUP";
        summary = "Confirmed close above a tight range on strong volume.";
      } else if (n === 2) {
        state = "POTENTIAL_BUY";
        summary = "Close above the range with partial confirmation.";
      } else {
        state = "HOLD_WAIT";
        summary = "Price closed above the range but confirmation is weak — possible false breakout.";
      }
    } else if (failedLevel !== null) {
      state = "EXIT_SETUP";
      summary = "Failed breakout: price closed back below the broken level.";
    } else if (ok(breakdown)) {
      state = "EXIT_SETUP";
      summary = "Price broke down below the range low.";
    } else if (isNum(curRangeHigh) && isNum(atrV) && curRangeHigh - c <= 0.5 * atrV && c <= curRangeHigh) {
      state = "HOLD_WAIT";
      summary = "Price is testing the top of its range — waiting for a confirmed close above.";
    } else {
      state = "NO_CLEAR_OPPORTUNITY";
      summary = "Price is inside its range; no breakout.";
    }

    let entry: StrategyEvaluation["entry"] = null;
    let invalidation: number | null = null;
    let targets: number[] = [];
    let invalidationNote: string | undefined;
    if (ok(closesAbove) && isNum(rangeHigh) && isNum(atrB) && isNum(height)) {
      invalidation = rangeHigh - pr.stopAtr * atrB;
      entry = { low: Math.max(rangeHigh, isNum(atrV) ? c - 0.5 * atrV : rangeHigh), high: c };
      const r = c - invalidation;
      targets = uniqSorted([rangeHigh + height, c + pr.targetR * r].filter((x) => x > c));
      invalidationNote = `Range high − ${pr.stopAtr} × ATR (back inside the range)`;
    } else if (state === "EXIT_SETUP") {
      invalidation = failedLevel ?? curRangeLow;
      invalidationNote = failedLevel !== null ? "Exit condition cancelled by a close back above the broken level" : "Exit condition cancelled by a close back above the range low";
    }
    return { state, summary, conditions, indicators, entry, invalidation, invalidationNote, targets, risks, conflicts };
  },
};
