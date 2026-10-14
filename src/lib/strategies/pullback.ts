import { cond, f1, f2, fp, isNum, lowestOf, ok, p, rTargets, when } from "./helpers";
import type { StrategyDefinition, StrategyEvaluation } from "./types";

export const pullback: StrategyDefinition = {
  id: "pullback",
  name: "Pullback",
  version: 1,
  summary: "Waits for a dip toward the fast EMA inside an established up-trend, then for a bullish trigger candle.",
  description:
    "Rather than chasing strength, this strategy waits for price to retrace toward the fast EMA during an up-trend while RSI cools down (but does not collapse). A setup is only raised once a trigger candle closes above the prior candle's high — evidence buyers are returning. If the dip keeps going through the slow EMA, the pullback may be turning into a reversal.",
  rules: {
    setup: ["Fast EMA above slow EMA and slow EMA rising", "Close above the long-term SMA", "Within the pullback window, a low touched the fast EMA zone (± ATR tolerance)", "Pullback held above the slow EMA buffer; RSI dipped into the pullback zone but not below the floor"],
    confirmation: ["Trigger: bullish candle closing above the previous candle's high", "Volume at or above its average on the trigger candle"],
    exit: ["EXIT SETUP: fast EMA below slow EMA and close below slow EMA", "POTENTIAL SELL: close below the slow EMA buffer while the fast EMA is still above"],
    invalidation: "Lowest low of the pullback window minus a buffer of ATR.",
    targets: "Risk multiples (R) above the reference entry.",
    expiry: "Re-evaluated every candle close; expires if not re-confirmed.",
  },
  intendedTimeframes: ["4h", "1d"],
  defaultTimeframes: ["4h", "1d"],
  params: [
    p({ key: "fastEma", label: "Fast EMA", min: 5, max: 100, step: 1, default: 20, help: "Pullback reference average." }),
    p({ key: "slowEma", label: "Slow EMA", min: 10, max: 200, step: 1, default: 50, help: "Trend average the pullback must hold." }),
    p({ key: "trendSma", label: "Long-term SMA", min: 50, max: 400, step: 1, default: 200, help: "Long-term trend filter." }),
    p({ key: "pullbackBars", label: "Pullback window (bars)", min: 2, max: 20, step: 1, default: 5, help: "Recent bars searched for the pullback." }),
    p({ key: "touchAtr", label: "Touch tolerance (× ATR)", min: 0, max: 2, step: 0.1, default: 0.5, help: "How close to the fast EMA counts as a touch." }),
    p({ key: "rsiPullbackMax", label: "RSI pullback max", min: 35, max: 65, step: 1, default: 50, help: "RSI must have dipped to or below this." }),
    p({ key: "rsiFloor", label: "RSI floor", min: 10, max: 45, step: 1, default: 30, help: "A dip below this is treated as a breakdown, not a pullback." }),
    p({ key: "stopBufferAtr", label: "Invalidation buffer (× ATR)", min: 0, max: 3, step: 0.1, default: 0.5, help: "Buffer below the pullback low." }),
    p({ key: "target1R", label: "Target 1 (R)", min: 0.5, max: 10, step: 0.1, default: 1.5, help: "First target in R." }),
    p({ key: "target2R", label: "Target 2 (R)", min: 0.5, max: 20, step: 0.1, default: 3, help: "Second target in R." }),
    p({ key: "expiryBars", label: "Expiry (bars)", min: 1, max: 50, step: 1, default: 4, help: "Bars before an unconfirmed signal expires." }),
  ],
  warmup: (pr) => Math.max(pr.trendSma, pr.slowEma * 3, 60) + pr.pullbackBars + 5,
  expiryBars: (pr) => pr.expiryBars,
  evaluate({ candles, i, ind, params: pr }): StrategyEvaluation {
    const cur = candles[i];
    const c = cur.close;
    const fS = ind.ema(pr.fastEma);
    const sS = ind.ema(pr.slowEma);
    const f = fS[i], s = sS[i];
    const t = ind.sma(pr.trendSma)[i];
    const slope = ind.slope("ema", pr.slowEma, 5)[i];
    const rsiS = ind.rsi(14);
    const rsiV = rsiS[i];
    const atrV = ind.atr(14)[i];
    const vr = ind.volumeRatio(20)[i];
    const W = pr.pullbackBars;
    const from = Math.max(0, i - W + 1);

    const trend = when([f, s, slope], () => f! > s! && slope! > 0);
    const longTerm = when([t], () => c > t!);
    let touched: boolean | null = null;
    let held: boolean | null = null;
    let rsiDip: boolean | null = null;
    let minRsi: number | null = null;
    if (isNum(atrV)) {
      touched = false;
      held = true;
      for (let j = from; j <= i; j++) {
        const fj = fS[j], sj = sS[j];
        if (!isNum(fj) || !isNum(sj)) {
          touched = null;
          held = null;
          break;
        }
        if (candles[j].low <= fj + pr.touchAtr * atrV) touched = true;
        if (candles[j].close < sj - pr.stopBufferAtr * atrV) held = false;
      }
      const rs = rsiS.slice(from, i + 1).filter(isNum);
      if (rs.length) {
        minRsi = Math.min(...rs);
        rsiDip = minRsi <= pr.rsiPullbackMax && minRsi >= pr.rsiFloor;
      }
    }
    const pullbackOk = ok(touched) && ok(held) && ok(rsiDip);
    const trigger = i > 0 ? c > cur.open && c > candles[i - 1].high : null;
    const volOk = when([vr], () => vr! >= 1);
    const windowLow = lowestOf(candles, from, i);

    const conditions = [
      cond("trend", `EMA ${pr.fastEma} above rising EMA ${pr.slowEma}`, "setup", trend, `${fp(f)} vs ${fp(s)}, slope ${f2(slope)}%`),
      cond("long_term", `Close above SMA ${pr.trendSma}`, "setup", longTerm, isNum(t) ? `SMA ${fp(t)}` : `Not enough history for SMA ${pr.trendSma}`),
      cond("touch", `Low touched EMA ${pr.fastEma} zone (last ${W} bars)`, "setup", touched, `Tolerance ${pr.touchAtr} × ATR (${fp(atrV)})`),
      cond("held", `Pullback held above EMA ${pr.slowEma} buffer`, "setup", held, `Lowest low in window ${fp(windowLow)}`),
      cond("rsi_dip", `RSI dipped to ${pr.rsiFloor}–${pr.rsiPullbackMax}`, "setup", rsiDip, `Min RSI in window ${f1(minRsi)}, now ${f1(rsiV)}`),
      cond("trigger", "Bullish candle closed above previous high", "confirm", trigger, i > 0 ? `Close ${fp(c)} vs prior high ${fp(candles[i - 1].high)}` : "n/a"),
      cond("volume", "Volume at or above average", "confirm", volOk, `Volume ratio ${f2(vr)}`),
      cond("exit_reversal", `EMA ${pr.fastEma} below EMA ${pr.slowEma} and close below EMA ${pr.slowEma}`, "exit", when([f, s], () => f! < s! && c < s!), `Close ${fp(c)}`),
    ];
    const indicators = { close: c, [`ema${pr.fastEma}`]: f, [`ema${pr.slowEma}`]: s, [`sma${pr.trendSma}`]: t, rsi: rsiV, minRsiWindow: minRsi, atr: atrV, volumeRatio: vr };
    const risks: string[] = [];
    const conflicts: string[] = [];
    let state: StrategyEvaluation["state"];
    let summary: string;

    if (ok(trend) && ok(longTerm) && pullbackOk && ok(trigger)) {
      if (volOk === false) conflicts.push("Trigger candle volume is below average.");
      state = ok(volOk) ? "STRONG_BUY_SETUP" : "POTENTIAL_BUY";
      summary = ok(volOk)
        ? "Pullback to the fast EMA within an up-trend, followed by a bullish trigger candle on solid volume."
        : "Pullback within an up-trend with a bullish trigger, but volume is light.";
    } else if (ok(trend) && ok(longTerm) && pullbackOk) {
      state = "HOLD_WAIT";
      summary = "Pullback in progress within an up-trend — waiting for a bullish trigger candle.";
    } else if (isNum(f) && isNum(s) && f < s && c < s) {
      state = "EXIT_SETUP";
      summary = "The pullback turned into a trend reversal (fast EMA below slow EMA, price below slow EMA).";
    } else if (isNum(f) && isNum(s) && isNum(atrV) && f > s && c < s - pr.stopBufferAtr * atrV) {
      state = "POTENTIAL_SELL";
      summary = "Price fell through the slow EMA buffer — the pullback is deeper than this strategy accepts.";
    } else if (ok(trend) && ok(longTerm)) {
      state = "HOLD_WAIT";
      summary = "Up-trend intact but no qualifying pullback yet.";
    } else {
      state = "NO_CLEAR_OPPORTUNITY";
      summary = "No up-trend pullback setup according to this strategy's rules.";
    }
    if (longTerm === null) risks.push(`Long-term SMA ${pr.trendSma} unavailable (insufficient history).`);

    let entry: StrategyEvaluation["entry"] = null;
    let invalidation: number | null = null;
    let targets: number[] = [];
    let invalidationNote: string | undefined;
    if ((state === "STRONG_BUY_SETUP" || state === "POTENTIAL_BUY" || (state === "HOLD_WAIT" && pullbackOk)) && isNum(atrV) && isNum(windowLow)) {
      invalidation = windowLow - pr.stopBufferAtr * atrV;
      entry = { low: Math.max(invalidation, isNum(f) ? Math.min(f, c) : c - 0.5 * atrV), high: c };
      targets = rTargets(c, invalidation, [pr.target1R, pr.target2R]);
      invalidationNote = `Pullback low − ${pr.stopBufferAtr} × ATR(14)`;
    } else if ((state === "EXIT_SETUP" || state === "POTENTIAL_SELL") && isNum(s)) {
      invalidation = s;
      invalidationNote = `Exit condition cancelled by a close back above EMA ${pr.slowEma}`;
    }
    return { state, summary, conditions, indicators, entry, invalidation, invalidationNote, targets, risks, conflicts };
  },
};
