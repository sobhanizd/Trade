import { cond, countTrue, f1, f2, fp, isNum, ok, p, rTargets, when } from "./helpers";
import type { StrategyDefinition, StrategyEvaluation } from "./types";

export const momentum: StrategyDefinition = {
  id: "momentum",
  name: "Momentum",
  version: 1,
  summary: "Looks for a fresh bullish MACD crossover supported by RSI, rising price and above-average volume.",
  description:
    "Momentum shifts often start with the MACD line crossing above its signal line. This strategy only rates the shift strong when RSI is above its midline (but not overbought), price is higher than N bars ago, and volume is above its recent average — volume shows participation behind the move. Momentum signals react quickly, so they also produce more false starts than slower strategies.",
  rules: {
    setup: ["MACD line crossed above its signal line within the cross window and is still above it"],
    confirmation: ["RSI above the midline and below the overbought limit", "Volume ratio ≥ threshold within the cross window", "Rate of change (ROC) positive"],
    exit: ["EXIT SETUP: MACD crossed below its signal within the window and RSI below the midline", "POTENTIAL SELL: MACD histogram positive but falling for 3 consecutive bars"],
    invalidation: "Long setups: close − (ATR multiple × ATR). Exit setups are cancelled by MACD crossing back above its signal line.",
    targets: "Risk multiples (R) above the reference entry.",
    expiry: "Momentum fades quickly: signals expire after a short window unless re-confirmed.",
  },
  intendedTimeframes: ["1h", "4h", "1d"],
  defaultTimeframes: ["4h"],
  params: [
    p({ key: "crossLookback", label: "Cross window (bars)", min: 1, max: 10, step: 1, default: 3, help: "How recent the MACD crossover must be." }),
    p({ key: "rsiMid", label: "RSI midline", min: 40, max: 60, step: 1, default: 50, help: "RSI must be above this." }),
    p({ key: "rsiMax", label: "RSI overbought", min: 60, max: 90, step: 1, default: 70, help: "RSI must be below this." }),
    p({ key: "volPeriod", label: "Volume average (bars)", min: 5, max: 100, step: 1, default: 20, help: "Window of the volume average." }),
    p({ key: "volMult", label: "Volume ratio threshold", min: 1, max: 5, step: 0.1, default: 1.5, help: "Volume vs. its average required for confirmation." }),
    p({ key: "rocPeriod", label: "ROC period", min: 2, max: 50, step: 1, default: 10, help: "Bars for the rate-of-change check." }),
    p({ key: "atrStopMult", label: "Invalidation (× ATR)", min: 0.5, max: 6, step: 0.1, default: 1.5, help: "Distance of the invalidation level in ATRs." }),
    p({ key: "target1R", label: "Target 1 (R)", min: 0.5, max: 10, step: 0.1, default: 1.5, help: "First target in R." }),
    p({ key: "target2R", label: "Target 2 (R)", min: 0.5, max: 20, step: 0.1, default: 2.5, help: "Second target in R." }),
    p({ key: "expiryBars", label: "Expiry (bars)", min: 1, max: 50, step: 1, default: 4, help: "Bars before an unconfirmed signal expires." }),
  ],
  warmup: (pr) => Math.max(60, pr.volPeriod + 2, pr.rocPeriod + 2) + 5,
  expiryBars: (pr) => pr.expiryBars,
  evaluate({ candles, i, ind, params: pr }): StrategyEvaluation {
    const c = candles[i].close;
    const m = ind.macd(12, 26, 9);
    const rsiV = ind.rsi(14)[i];
    const vr = ind.volumeRatio(pr.volPeriod);
    const rocV = ind.roc(pr.rocPeriod)[i];
    const atrV = ind.atr(14)[i];
    const L = pr.crossLookback;

    const crossed = (dir: "up" | "down") => {
      for (let j = Math.max(1, i - L + 1); j <= i; j++) {
        const a0 = m.macd[j - 1], b0 = m.signal[j - 1], a1 = m.macd[j], b1 = m.signal[j];
        if (!isNum(a0) || !isNum(b0) || !isNum(a1) || !isNum(b1)) continue;
        if (dir === "up" && a0 <= b0 && a1 > b1) return true;
        if (dir === "down" && a0 >= b0 && a1 < b1) return true;
      }
      return false;
    };
    const macdNow = m.macd[i], sigNow = m.signal[i], hist = m.histogram[i];
    const macdAbove = when([macdNow, sigNow], () => macdNow! > sigNow!);
    const crossUp = when([macdNow, sigNow], () => crossed("up") && ok(macdAbove));
    const crossDown = when([macdNow, sigNow], () => crossed("down") && macdNow! < sigNow!);
    const maxVr = (() => {
      let mx: number | null = null;
      for (let j = Math.max(0, i - L + 1); j <= i; j++) if (isNum(vr[j])) mx = Math.max(mx ?? 0, vr[j]!);
      return mx;
    })();
    const rsiOk = when([rsiV], () => rsiV! > pr.rsiMid && rsiV! < pr.rsiMax);
    const volOk = when([maxVr], () => maxVr! >= pr.volMult);
    const rocOk = when([rocV], () => rocV! > 0);
    const h1 = m.histogram[i - 1], h2 = m.histogram[i - 2], h3 = m.histogram[i - 3];
    const fading = when([hist, h1, h2, h3], () => hist! > 0 && hist! < h1! && h1! < h2! && h2! < h3!);

    const conditions = [
      cond("macd_cross_up", `MACD crossed above signal (last ${L} bars)`, "setup", crossUp, `MACD ${f2(macdNow)} vs signal ${f2(sigNow)}`),
      cond("rsi_zone", `RSI between ${pr.rsiMid} and ${pr.rsiMax}`, "confirm", rsiOk, `RSI ${f1(rsiV)}`),
      cond("volume", `Volume ≥ ${pr.volMult}× average`, "confirm", volOk, `Max volume ratio in window: ${f2(maxVr)}`),
      cond("roc", `ROC(${pr.rocPeriod}) positive`, "confirm", rocOk, `ROC ${f2(rocV)}%`),
      cond("macd_cross_down", `MACD crossed below signal (last ${L} bars)`, "exit", crossDown, `MACD ${f2(macdNow)} vs signal ${f2(sigNow)}`),
      cond("rsi_below_mid", `RSI below ${pr.rsiMid}`, "exit", when([rsiV], () => rsiV! < pr.rsiMid), `RSI ${f1(rsiV)}`),
      cond("hist_fading", "MACD histogram falling 3 bars", "exit", fading, `Histogram ${f2(hist)}`),
    ];
    const indicators = { close: c, macd: macdNow, macdSignal: sigNow, macdHist: hist, rsi: rsiV, volumeRatio: vr[i], maxVolumeRatio: maxVr, roc: rocV, atr: atrV };
    const risks: string[] = [];
    const conflicts: string[] = [];
    let state: StrategyEvaluation["state"];
    let summary: string;

    if (ok(crossUp)) {
      const n = countTrue([rsiOk, volOk, rocOk]);
      if (volOk === false) conflicts.push("Volume is not above average — the move may lack participation.");
      if (isNum(rsiV) && rsiV >= pr.rsiMax) risks.push(`RSI ${f1(rsiV)} is overbought.`);
      if (rocOk === false) conflicts.push("Price is lower than it was at the start of the ROC window.");
      if (n === 3) {
        state = "STRONG_BUY_SETUP";
        summary = "Fresh bullish MACD crossover confirmed by RSI, positive ROC and above-average volume.";
      } else if (n === 2) {
        state = "POTENTIAL_BUY";
        summary = "Fresh bullish MACD crossover with partial confirmation.";
      } else {
        state = "HOLD_WAIT";
        summary = "MACD crossed up but confirmation is weak — waiting.";
      }
    } else if (ok(crossDown) && isNum(rsiV) && rsiV < pr.rsiMid) {
      state = "EXIT_SETUP";
      summary = "Bearish MACD crossover with RSI below its midline — momentum has turned down.";
    } else if (ok(fading)) {
      state = "POTENTIAL_SELL";
      summary = "Positive momentum is fading (MACD histogram declining for 3 bars).";
    } else if (ok(macdAbove)) {
      state = "HOLD_WAIT";
      summary = "Momentum is positive but there is no fresh crossover to act on.";
    } else {
      state = "NO_CLEAR_OPPORTUNITY";
      summary = "No bullish momentum shift detected.";
    }

    let entry: StrategyEvaluation["entry"] = null;
    let invalidation: number | null = null;
    let targets: number[] = [];
    let invalidationNote: string | undefined;
    if ((state === "STRONG_BUY_SETUP" || state === "POTENTIAL_BUY" || (state === "HOLD_WAIT" && ok(crossUp))) && isNum(atrV)) {
      entry = { low: c - 0.5 * atrV, high: c };
      invalidation = c - pr.atrStopMult * atrV;
      targets = rTargets(c, invalidation, [pr.target1R, pr.target2R]);
      invalidationNote = `Close − ${pr.atrStopMult} × ATR(14)`;
    } else if (state === "EXIT_SETUP" || state === "POTENTIAL_SELL") {
      invalidationNote = "Exit condition cancelled if MACD crosses back above its signal line";
    }
    return { state, summary, conditions, indicators, entry, invalidation, invalidationNote, targets, risks, conflicts };
  },
};
