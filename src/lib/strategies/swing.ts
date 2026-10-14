import { supportResistance } from "@/lib/indicators";
import { cond, f1, f2, fp, isNum, lowestOf, ok, p, uniqSorted, when } from "./helpers";
import type { StrategyDefinition, StrategyEvaluation } from "./types";

export const riskAwareSwing: StrategyDefinition = {
  id: "risk_aware_swing",
  name: "Risk-Aware Swing",
  version: 2,
  summary: "Multi-day/multi-week setups in a bullish regime that only qualify when volatility is acceptable and reward-to-risk to the next resistance is sufficient.",
  description:
    "Designed for slower decisions on daily candles. It requires a bullish regime (50-period SMA above 200-period SMA), price above the 50 SMA, RSI in a moderate zone, volatility (ATR as % of price) below a ceiling, and — crucially — enough distance to the nearest identified resistance to achieve the minimum reward-to-risk ratio after the invalidation level. If any risk check fails, the setup is downgraded.",
  rules: {
    setup: ["Bullish regime: SMA fast above SMA slow", "Close above SMA fast"],
    confirmation: ["Reward-to-risk to the nearest resistance (or R target if none) ≥ minimum — mandatory", "RSI within the moderate zone", "ATR% (ATR ÷ price) at or below the volatility ceiling (one of these two may fail for a POTENTIAL rating)"],
    exit: ["EXIT SETUP: two consecutive closes below SMA fast, or regime turned bearish with close below SMA fast", "POTENTIAL SELL: one close below SMA fast"],
    invalidation: "Lowest low of the recent swing window minus an ATR buffer.",
    targets: "Nearest confirmed resistance above price (if any) and an R multiple.",
    expiry: "Re-evaluated at each daily close; expires if not re-confirmed within the window.",
  },
  intendedTimeframes: ["1d", "1w"],
  defaultTimeframes: ["1d"],
  params: [
    p({ key: "fastSma", label: "Fast SMA", min: 10, max: 150, step: 1, default: 50, help: "Swing trend average." }),
    p({ key: "slowSma", label: "Slow SMA", min: 50, max: 400, step: 1, default: 200, help: "Regime average." }),
    p({ key: "rsiLow", label: "RSI zone low", min: 20, max: 60, step: 1, default: 40, help: "Lower bound of acceptable RSI." }),
    p({ key: "rsiHigh", label: "RSI zone high", min: 50, max: 85, step: 1, default: 65, help: "Upper bound of acceptable RSI." }),
    p({ key: "maxAtrPct", label: "Max ATR % of price", min: 1, max: 25, step: 0.5, default: 6, help: "Volatility ceiling." }),
    p({ key: "swingLowBars", label: "Swing-low window (bars)", min: 3, max: 60, step: 1, default: 10, help: "Bars used for the invalidation swing low." }),
    p({ key: "stopBufferAtr", label: "Invalidation buffer (× ATR)", min: 0, max: 3, step: 0.1, default: 0.5, help: "Buffer below the swing low." }),
    p({ key: "minRR", label: "Minimum reward/risk", min: 1, max: 6, step: 0.1, default: 2, help: "Required reward-to-risk to the first target." }),
    p({ key: "targetR", label: "R target", min: 1, max: 20, step: 0.1, default: 3, help: "Target in R when no resistance is identified." }),
    p({ key: "expiryBars", label: "Expiry (bars)", min: 1, max: 50, step: 1, default: 5, help: "Bars before an unconfirmed signal expires." }),
  ],
  warmup: (pr) => Math.max(pr.slowSma, 60) + 5,
  expiryBars: (pr) => pr.expiryBars,
  evaluate({ candles, i, ind, params: pr }): StrategyEvaluation {
    const c = candles[i].close;
    const fastS = ind.sma(pr.fastSma);
    const fast = fastS[i];
    const slow = ind.sma(pr.slowSma)[i];
    const rsiV = ind.rsi(14)[i];
    const atrV = ind.atr(14)[i];
    const atrPct = isNum(atrV) ? (atrV / c) * 100 : null;
    const prevClose = i > 0 ? candles[i - 1].close : null;
    const prevFast = fastS[i - 1];

    const regime = when([fast, slow], () => fast! > slow!);
    const aboveFast = when([fast], () => c > fast!);
    const rsiZone = when([rsiV], () => rsiV! >= pr.rsiLow && rsiV! <= pr.rsiHigh);
    const volOk = when([atrPct], () => atrPct! <= pr.maxAtrPct);

    const swingLow = lowestOf(candles, i - pr.swingLowBars + 1, i);
    const invalidation = isNum(swingLow) && isNum(atrV) ? swingLow - pr.stopBufferAtr * atrV : null;
    const risk = isNum(invalidation) ? c - invalidation : null;
    const sr = isNum(atrV) ? supportResistance(candles, i, { lookback: 150, strength: 3, tolerance: 0.5 * atrV }) : null;
    const resistance = sr?.resistances.find((l) => l.price > c) ?? null;
    let rr: number | null = null;
    if (isNum(risk) && risk > 0) rr = resistance ? (resistance.price - c) / risk : pr.targetR;
    const rrOk = when([rr], () => rr! >= pr.minRR);

    const conditions = [
      cond("regime", `SMA ${pr.fastSma} above SMA ${pr.slowSma} (bullish regime)`, "setup", regime, isNum(slow) ? `${fp(fast)} vs ${fp(slow)}` : `Not enough history for SMA ${pr.slowSma}`),
      cond("above_fast", `Close above SMA ${pr.fastSma}`, "setup", aboveFast, `Close ${fp(c)} vs ${fp(fast)}`),
      cond("rsi_zone", `RSI between ${pr.rsiLow} and ${pr.rsiHigh}`, "confirm", rsiZone, `RSI ${f1(rsiV)}`),
      cond("volatility", `ATR ≤ ${pr.maxAtrPct}% of price`, "confirm", volOk, `ATR ${f2(atrPct)}% of price`),
      cond("reward_risk", `Reward/risk ≥ ${pr.minRR}`, "confirm", rrOk, resistance ? `Next resistance ${fp(resistance.price)} (${resistance.touches} touches), R/R ${f2(rr)}` : `No resistance identified above; using ${pr.targetR}R target`),
      cond("two_closes_below", `Two closes below SMA ${pr.fastSma}`, "exit", when([fast, prevFast, prevClose], () => c < fast! && prevClose! < prevFast!), `Close ${fp(c)}, previous ${fp(prevClose)}`),
      cond("regime_bear", `Regime bearish and close below SMA ${pr.fastSma}`, "exit", when([fast, slow], () => fast! < slow! && c < fast!), `SMA ${pr.fastSma} ${fp(fast)} vs SMA ${pr.slowSma} ${fp(slow)}`),
    ];
    const indicators = { close: c, [`sma${pr.fastSma}`]: fast, [`sma${pr.slowSma}`]: slow, rsi: rsiV, atr: atrV, atrPct, nearestResistance: resistance?.price ?? null, nearestSupport: sr?.supports[0]?.price ?? null, rewardRisk: rr };
    const risks: string[] = [];
    const conflicts: string[] = [];
    let state: StrategyEvaluation["state"];
    let summary: string;

    if (ok(regime) && ok(aboveFast)) {
      // Reward/risk is mandatory for this strategy; RSI zone and volatility allow one miss.
      const fails = [rsiZone, volOk].filter((x) => x !== true).length;
      if (volOk === false) risks.push(`Volatility is high (ATR ${f2(atrPct)}% of price): wider swings and larger losses if invalidated.`);
      if (rrOk === false) conflicts.push(`Reward-to-risk ${f2(rr)} to the next resistance is below ${pr.minRR}.`);
      if (rsiZone === false) conflicts.push(`RSI ${f1(rsiV)} is outside the ${pr.rsiLow}–${pr.rsiHigh} zone.`);
      if (!resistance) risks.push("No overhead resistance identified (possibly price discovery); targets are R multiples only.");
      if (fails === 0 && ok(rrOk)) {
        state = "STRONG_BUY_SETUP";
        summary = "Bullish regime with acceptable volatility, moderate RSI and sufficient reward-to-risk.";
      } else if (fails === 1 && ok(rrOk)) {
        state = "POTENTIAL_BUY";
        summary = "Bullish regime swing setup with sufficient reward-to-risk; one other check is failing.";
      } else if (!ok(rrOk)) {
        state = "HOLD_WAIT";
        summary = "Bullish regime, but reward-to-risk to the next resistance is insufficient — waiting.";
      } else {
        state = "HOLD_WAIT";
        summary = "Bullish regime, but entry conditions are not favourable — waiting.";
      }
    } else if (isNum(fast) && c < fast && ((isNum(prevClose) && isNum(prevFast) && prevClose < prevFast) || (isNum(slow) && fast < slow))) {
      state = "EXIT_SETUP";
      summary = "Swing trend lost: closes below the fast SMA (or bearish regime).";
    } else if (isNum(fast) && c < fast && ok(regime)) {
      state = "POTENTIAL_SELL";
      summary = "First close below the fast SMA in a bullish regime — watch for confirmation.";
    } else {
      state = "NO_CLEAR_OPPORTUNITY";
      summary = "No bullish swing regime according to this strategy's rules.";
    }
    if (isNum(atrPct) && atrPct > pr.maxAtrPct * 1.5) risks.push("Volatility is extreme relative to this strategy's ceiling.");

    let entry: StrategyEvaluation["entry"] = null;
    let inv: number | null = null;
    let targets: number[] = [];
    let invalidationNote: string | undefined;
    if ((state === "STRONG_BUY_SETUP" || state === "POTENTIAL_BUY" || state === "HOLD_WAIT") && isNum(invalidation) && isNum(risk) && risk > 0) {
      inv = invalidation;
      entry = { low: Math.max(invalidation, isNum(atrV) ? c - 0.5 * atrV : c), high: c };
      targets = uniqSorted([resistance?.price ?? NaN, c + pr.targetR * risk].filter((x) => isNum(x) && x > c));
      invalidationNote = `Lowest low of ${pr.swingLowBars} bars − ${pr.stopBufferAtr} × ATR(14)`;
    } else if ((state === "EXIT_SETUP" || state === "POTENTIAL_SELL") && isNum(fast)) {
      inv = fast;
      invalidationNote = `Exit condition cancelled by a close back above SMA ${pr.fastSma}`;
    }
    return { state, summary, conditions, indicators, entry, invalidation: inv, invalidationNote, targets, risks, conflicts };
  },
};
