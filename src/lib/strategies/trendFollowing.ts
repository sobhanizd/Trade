import { cond, countTrue, f1, f2, fp, isNum, ok, p, rTargets, when } from "./helpers";
import type { StrategyDefinition, StrategyEvaluation } from "./types";

export const trendFollowing: StrategyDefinition = {
  id: "trend_following",
  name: "Trend Following",
  version: 1,
  summary: "Participates in established up-trends confirmed by moving averages, MACD momentum and ADX trend strength.",
  description:
    "Looks for markets where price is above a rising slow EMA with the fast EMA above the slow EMA. The setup is only rated strong when momentum (MACD histogram), trend strength (ADX) and the long-term filter (price above the 200-period SMA) all agree and RSI is not overextended. Trend-following tends to work in persistent trends and to lose money through repeated small losses in sideways markets.",
  rules: {
    setup: ["Close above the slow EMA", "Fast EMA above slow EMA", "Slow EMA rising over the slope window"],
    confirmation: ["MACD histogram above zero", "ADX at or above the minimum (trend strength)", "Close above the long-term SMA", "RSI below the overextension limit"],
    exit: ["EXIT SETUP: close below slow EMA, fast EMA below slow EMA and MACD line below zero", "POTENTIAL SELL: close below slow EMA while fast EMA is still above it"],
    invalidation: "Long setups: close − (ATR multiple × ATR). Exit setups are cancelled by a close back above the slow EMA.",
    targets: "Risk multiples (R) above the reference entry, where R = entry − invalidation.",
    expiry: "Re-evaluated at every candle close; an unchanged signal expires if not re-confirmed within the expiry window.",
  },
  intendedTimeframes: ["4h", "1d"],
  defaultTimeframes: ["4h", "1d"],
  params: [
    p({ key: "fastEma", label: "Fast EMA", min: 5, max: 100, step: 1, default: 20, help: "Short-term trend average." }),
    p({ key: "slowEma", label: "Slow EMA", min: 10, max: 200, step: 1, default: 50, help: "Medium-term trend average." }),
    p({ key: "trendSma", label: "Long-term SMA", min: 50, max: 400, step: 1, default: 200, help: "Long-term trend filter." }),
    p({ key: "slopeBars", label: "Slope window (bars)", min: 2, max: 30, step: 1, default: 5, help: "Bars used to measure whether the slow EMA is rising." }),
    p({ key: "adxMin", label: "Minimum ADX", min: 10, max: 50, step: 1, default: 20, help: "ADX below this suggests a weak/sideways trend." }),
    p({ key: "rsiMax", label: "RSI overextension limit", min: 55, max: 90, step: 1, default: 75, help: "Above this RSI the setup is not rated strong." }),
    p({ key: "atrStopMult", label: "Invalidation (× ATR)", min: 0.5, max: 6, step: 0.1, default: 2, help: "Distance of the invalidation level below price in ATRs." }),
    p({ key: "target1R", label: "Target 1 (R)", min: 0.5, max: 10, step: 0.1, default: 1.5, help: "First target in multiples of risk." }),
    p({ key: "target2R", label: "Target 2 (R)", min: 0.5, max: 20, step: 0.1, default: 3, help: "Second target in multiples of risk." }),
    p({ key: "expiryBars", label: "Expiry (bars)", min: 1, max: 50, step: 1, default: 6, help: "Bars before an unconfirmed signal expires." }),
  ],
  warmup: (pr) => Math.max(pr.trendSma, pr.slowEma * 3, 60) + 5,
  expiryBars: (pr) => pr.expiryBars,
  evaluate({ candles, i, ind, params: pr }): StrategyEvaluation {
    const c = candles[i].close;
    const f = ind.ema(pr.fastEma)[i];
    const s = ind.ema(pr.slowEma)[i];
    const t = ind.sma(pr.trendSma)[i];
    const slope = ind.slope("ema", pr.slowEma, pr.slopeBars)[i];
    const adxV = ind.adx(14).adx[i];
    const m = ind.macd(12, 26, 9);
    const hist = m.histogram[i];
    const macdLine = m.macd[i];
    const rsiV = ind.rsi(14)[i];
    const atrV = ind.atr(14)[i];

    const aboveSlow = when([s], () => c > s!);
    const fastAbove = when([f, s], () => f! > s!);
    const rising = when([slope], () => slope! > 0);
    const macdPos = when([hist], () => hist! > 0);
    const adxOk = when([adxV], () => adxV! >= pr.adxMin);
    const longTerm = when([t], () => c > t!);
    const notExtended = when([rsiV], () => rsiV! < pr.rsiMax);
    const belowSlow = when([s], () => c < s!);
    const fastBelow = when([f, s], () => f! < s!);
    const macdNeg = when([macdLine], () => macdLine! < 0);

    const conditions = [
      cond("above_slow", `Close above EMA ${pr.slowEma}`, "setup", aboveSlow, `Close ${fp(c)} vs EMA ${fp(s)}`),
      cond("fast_above_slow", `EMA ${pr.fastEma} above EMA ${pr.slowEma}`, "setup", fastAbove, `${fp(f)} vs ${fp(s)}`),
      cond("slow_rising", `EMA ${pr.slowEma} rising`, "setup", rising, `Slope over ${pr.slopeBars} bars: ${f2(slope)}%`),
      cond("macd_pos", "MACD histogram above zero", "confirm", macdPos, `Histogram ${f2(hist)}`),
      cond("adx", `ADX ≥ ${pr.adxMin}`, "confirm", adxOk, `ADX ${f1(adxV)}`),
      cond("long_term", `Close above SMA ${pr.trendSma}`, "confirm", longTerm, isNum(t) ? `SMA ${fp(t)}` : `Not enough history for SMA ${pr.trendSma}`),
      cond("rsi_ok", `RSI below ${pr.rsiMax}`, "confirm", notExtended, `RSI ${f1(rsiV)}`),
      cond("exit_structure", `Close and EMA ${pr.fastEma} below EMA ${pr.slowEma}`, "exit", when([s, f], () => ok(belowSlow) && ok(fastBelow)), `Close ${fp(c)}, EMA ${pr.fastEma} ${fp(f)}, EMA ${pr.slowEma} ${fp(s)}`),
      cond("exit_macd", "MACD line below zero", "exit", macdNeg, `MACD ${f2(macdLine)}`),
    ];
    const indicators = { close: c, [`ema${pr.fastEma}`]: f, [`ema${pr.slowEma}`]: s, [`sma${pr.trendSma}`]: t, emaSlopePct: slope, adx: adxV, macd: macdLine, macdHist: hist, rsi: rsiV, atr: atrV };
    const risks: string[] = [];
    const conflicts: string[] = [];

    const up = ok(aboveSlow) && ok(fastAbove) && ok(rising);
    let state: StrategyEvaluation["state"];
    let summary: string;

    if (up) {
      const confirms = countTrue([macdPos, adxOk, longTerm]);
      if (macdPos === false) conflicts.push("MACD histogram is negative while the trend structure is up (momentum not confirming).");
      if (adxOk === false) conflicts.push(`ADX ${f1(adxV)} is below ${pr.adxMin}: the trend is weak and may be range-bound.`);
      if (longTerm === false) conflicts.push(`Price is below the ${pr.trendSma}-period SMA (long-term trend not confirmed).`);
      if (longTerm === null) risks.push(`Long-term SMA ${pr.trendSma} unavailable (insufficient history).`);
      if (notExtended === false) risks.push(`RSI ${f1(rsiV)} is above ${pr.rsiMax}: price is extended and pullbacks are common.`);
      if (confirms === 3 && ok(notExtended)) {
        state = "STRONG_BUY_SETUP";
        summary = "Up-trend structure with momentum, trend-strength and long-term confirmation.";
      } else if (confirms >= 2) {
        state = "POTENTIAL_BUY";
        summary = "Up-trend structure detected; some confirmations are missing.";
      } else {
        state = "HOLD_WAIT";
        summary = "Up-trend structure present but momentum/strength not confirming — waiting.";
      }
    } else if (ok(belowSlow) && ok(fastBelow) && ok(macdNeg)) {
      state = "EXIT_SETUP";
      summary = "Trend structure broken: price and fast EMA below slow EMA with negative momentum.";
    } else if (ok(fastAbove) && ok(belowSlow)) {
      state = "POTENTIAL_SELL";
      summary = "Price closed below the slow EMA while the trend averages are still up — trend under pressure.";
    } else {
      state = "NO_CLEAR_OPPORTUNITY";
      summary = "No established up-trend according to this strategy's rules.";
    }

    let entry: StrategyEvaluation["entry"] = null;
    let invalidation: number | null = null;
    let targets: number[] = [];
    let invalidationNote: string | undefined;
    if ((state === "STRONG_BUY_SETUP" || state === "POTENTIAL_BUY" || state === "HOLD_WAIT") && isNum(atrV)) {
      entry = { low: c - 0.5 * atrV, high: c };
      invalidation = c - pr.atrStopMult * atrV;
      targets = rTargets(c, invalidation, [pr.target1R, pr.target2R]);
      invalidationNote = `Close − ${pr.atrStopMult} × ATR(14)`;
    } else if ((state === "EXIT_SETUP" || state === "POTENTIAL_SELL") && isNum(s)) {
      invalidation = s;
      invalidationNote = `Exit condition cancelled by a close back above EMA ${pr.slowEma}`;
    }
    return { state, summary, conditions, indicators, entry, invalidation, invalidationNote, targets, risks, conflicts };
  },
};
