import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market/types";
import { analyzeLatest, annotateCrossStrategyConflicts, evaluateAt } from "@/lib/signals/evaluate";
import { breakout } from "@/lib/strategies/breakout";
import { momentum } from "@/lib/strategies/momentum";
import { pullback } from "@/lib/strategies/pullback";
import { defaultParams, getStrategy, resolveParams, STRATEGIES, validateStrategyParams } from "@/lib/strategies/registry";
import { riskAwareSwing } from "@/lib/strategies/swing";
import { trendFollowing } from "@/lib/strategies/trendFollowing";
import { candlesFromCloses, H, randomWalk, trendUp } from "../helpers";

const last = (cs: Candle[]) => cs.length - 1;

describe("registry & params", () => {
  it("has five strategies with unique ids and documented rules", () => {
    expect(STRATEGIES.map((s) => s.id)).toEqual(["trend_following", "momentum", "pullback", "breakout", "risk_aware_swing"]);
    for (const s of STRATEGIES) {
      expect(s.rules.setup.length).toBeGreaterThan(0);
      expect(s.rules.exit.length).toBeGreaterThan(0);
      expect(s.rules.invalidation.length).toBeGreaterThan(10);
      expect(s.intendedTimeframes.length).toBeGreaterThan(0);
      for (const p of s.params) expect(p.default).toBeGreaterThanOrEqual(p.min);
    }
    expect(getStrategy("nope")).toBeUndefined();
  });
  it("fills defaults, clamps out-of-range values and drops unknown keys", () => {
    const p = resolveParams(trendFollowing.params, { fastEma: 1000, slowEma: "30", bogus: 5, adxMin: Number.NaN });
    expect(p.fastEma).toBe(100);
    expect(p.slowEma).toBe(30);
    expect(p.adxMin).toBe(20);
    expect("bogus" in p).toBe(false);
  });
  it("validates cross-parameter relations", () => {
    const p = { ...defaultParams(trendFollowing), fastEma: 60, slowEma: 50 };
    expect(validateStrategyParams(trendFollowing, p)[0]).toMatch(/smaller/);
    expect(validateStrategyParams(trendFollowing, defaultParams(trendFollowing))).toEqual([]);
  });
});

describe("no look-ahead (all strategies)", () => {
  const cs = candlesFromCloses(randomWalk(700, 3, 0.0008, 0.02), { volume: randomWalk(700, 9, 0, 0.3, 1000) });
  for (const def of STRATEGIES) {
    it(`${def.id}: evaluation at i is identical with or without future candles`, () => {
      const params = defaultParams(def);
      for (const i of [300, 420, 555, 640]) {
        const a = evaluateAt(def, cs, i, params, "4h");
        const b = evaluateAt(def, cs.slice(0, i + 1), i, params, "4h");
        expect(b.state).toBe(a.state);
        expect(b.invalidation).toEqual(a.invalidation);
        expect(b.targets).toEqual(a.targets);
        expect(b.conditions).toEqual(a.conditions);
      }
    });
  }
});

describe("Trend Following", () => {
  const params = defaultParams(trendFollowing);
  it("rates a steady up-trend as a buy setup with levels below price", () => {
    const cs = candlesFromCloses(trendUp(400, 100, 0.003, 0.004));
    const r = evaluateAt(trendFollowing, cs, last(cs), params, "4h");
    expect(["STRONG_BUY_SETUP", "POTENTIAL_BUY"]).toContain(r.state);
    expect(r.invalidation!).toBeLessThan(r.price!);
    expect(r.targets[0]).toBeGreaterThan(r.price!);
    expect(r.entryLow!).toBeLessThanOrEqual(r.entryHigh!);
    expect(r.riskReward).not.toBeNull();
  });
  it("produces an exit setup in a down-trend", () => {
    const cs = candlesFromCloses(trendUp(400, 100, -0.003, 0.004));
    const r = evaluateAt(trendFollowing, cs, last(cs), params, "4h");
    expect(r.state).toBe("EXIT_SETUP");
    expect(r.direction).toBe("exit");
    expect(r.invalidation!).toBeGreaterThan(r.price!); // cancellation level above price
  });
  it("never rates STRONG without the long-term filter (insufficient history)", () => {
    const cs = candlesFromCloses(trendUp(160, 100, 0.004, 0.003));
    const r = evaluateAt(trendFollowing, cs, last(cs), params, "4h");
    expect(r.state).not.toBe("STRONG_BUY_SETUP");
    expect(r.conditions.find((c) => c.id === "long_term")?.passed).toBeNull();
  });
});

describe("Momentum", () => {
  it("detects a fresh bullish crossover with a volume spike", () => {
    const closes = [...trendUp(120, 100, -0.002, 0.002), ...trendUp(6, 78.5, 0.012, 0.001, 3)];
    const vol = closes.map((_, i) => (i >= closes.length - 3 ? 3000 : 1000));
    const cs = candlesFromCloses(closes, { volume: vol });
    const params = defaultParams(momentum);
    let found = false;
    for (let i = closes.length - 6; i < closes.length; i++) {
      const r = evaluateAt(momentum, cs, i, params, "4h");
      if (r.conditions.find((c) => c.id === "macd_cross_up")?.passed) {
        found = true;
        expect(["STRONG_BUY_SETUP", "POTENTIAL_BUY", "HOLD_WAIT"]).toContain(r.state);
      }
    }
    expect(found).toBe(true);
  });
});

describe("Pullback", () => {
  it("waits during the dip and signals after a bullish trigger candle", () => {
    const up = trendUp(260, 100, 0.004, 0.002);
    const top = up[up.length - 1];
    const dip = [top * 0.99, top * 0.98, top * 0.97, top * 0.965];
    const cs = candlesFromCloses([...up, ...dip], { wick: 0.004 });
    const params = defaultParams(pullback);
    const waiting = evaluateAt(pullback, cs, last(cs), params, "4h");
    expect(waiting.conditions.find((c) => c.id === "trend")?.passed).toBe(true);
    const trigger = top * 0.985;
    const cs2 = [...cs, { ...cs[last(cs)], openTime: cs[last(cs)].openTime + H, closeTime: cs[last(cs)].closeTime + H, open: top * 0.965, close: trigger, high: trigger * 1.001, low: top * 0.963, volume: 2000 }];
    const r = evaluateAt(pullback, cs2, last(cs2), params, "4h");
    expect(r.conditions.find((c) => c.id === "trigger")?.passed).toBe(true);
    if (r.state === "STRONG_BUY_SETUP" || r.state === "POTENTIAL_BUY") {
      expect(r.invalidation!).toBeLessThan(Math.min(...cs2.slice(-6).map((c) => c.low)));
    }
  });
});

describe("Breakout", () => {
  const params = defaultParams(breakout);
  const range = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 2) * 1.5);
  it("rates a high-volume close above a tight range as a strong setup", () => {
    const closes = [...range, 104];
    const cs = candlesFromCloses(closes, { wick: 0.001, volume: closes.map((_, i) => (i === closes.length - 1 ? 4000 : 1000)) });
    const r = evaluateAt(breakout, cs, last(cs), params, "4h");
    expect(r.state).toBe("STRONG_BUY_SETUP");
    expect(r.invalidation!).toBeLessThan(r.indicators.rangeHigh!);
    expect(r.targets.length).toBeGreaterThan(0);
  });
  it("downgrades a breakout without volume (false-breakout safeguard)", () => {
    const closes = [...range, 104];
    const cs = candlesFromCloses(closes, { wick: 0.001 });
    const r = evaluateAt(breakout, cs, last(cs), params, "4h");
    expect(r.state).not.toBe("STRONG_BUY_SETUP");
    expect(r.conflicts.join(" ")).toMatch(/volume/i);
  });
  it("flags a failed breakout as an exit setup", () => {
    const closes = [...range, 104, 100.5];
    const cs = candlesFromCloses(closes, { wick: 0.001, volume: closes.map((_, i) => (i === closes.length - 2 ? 4000 : 1000)) });
    const r = evaluateAt(breakout, cs, last(cs), params, "4h");
    expect(r.state).toBe("EXIT_SETUP");
  });
  it("does not trigger on a wick above the range that closes inside", () => {
    const closes = [...range, 101];
    const cs = candlesFromCloses(closes, { wick: 0.001 });
    cs[last(cs)].high = 106;
    const r = evaluateAt(breakout, cs, last(cs), params, "4h");
    expect(r.conditions.find((c) => c.id === "close_above")?.passed).toBe(false);
  });
});

describe("Risk-Aware Swing", () => {
  const params = defaultParams(riskAwareSwing);
  it("produces a long setup in a calm bullish regime with sufficient R/R", () => {
    const cs = candlesFromCloses(trendUp(320, 100, 0.002, 0.004), { interval: 24 * H, wick: 0.004 });
    const r = evaluateAt(riskAwareSwing, cs, last(cs), params, "1d");
    expect(r.conditions.find((c) => c.id === "regime")?.passed).toBe(true);
    expect(["STRONG_BUY_SETUP", "POTENTIAL_BUY", "HOLD_WAIT"]).toContain(r.state);
  });
  it("downgrades when volatility exceeds the ceiling", () => {
    const cs = candlesFromCloses(trendUp(320, 100, 0.002, 0.004), { interval: 24 * H, wick: 0.06 });
    const r = evaluateAt(riskAwareSwing, cs, last(cs), params, "1d");
    expect(r.conditions.find((c) => c.id === "volatility")?.passed).toBe(false);
    expect(r.state).not.toBe("STRONG_BUY_SETUP");
  });
});

describe("analyzeLatest data gate", () => {
  const params = defaultParams(trendFollowing);
  const cs = candlesFromCloses(trendUp(400));
  const fresh = cs[last(cs)].closeTime + 60_000;
  it("returns NO_SIGNAL with reasons when data is stale", () => {
    const { result } = analyzeLatest(trendFollowing, cs, params, "1h", { now: fresh + 10 * H });
    expect(result.state).toBe("NO_SIGNAL");
    expect(result.dataIssues.join(" ")).toMatch(/stale/);
  });
  it("returns NO_SIGNAL when history is insufficient", () => {
    const { result } = analyzeLatest(trendFollowing, cs.slice(-50), params, "1h", { now: fresh });
    expect(result.state).toBe("NO_SIGNAL");
    expect(result.dataIssues.join(" ")).toMatch(/at least|needs/);
  });
  it("evaluates when data is clean", () => {
    const { result, quality } = analyzeLatest(trendFollowing, cs, params, "1h", { now: fresh });
    expect(quality.ok).toBe(true);
    expect(result.state).not.toBe("NO_SIGNAL");
    expect(result.marketDataAt).toBe(cs[last(cs)].closeTime);
  });
  it("handles extreme moves without crashing and reports risk", () => {
    const crash = [...cs.slice(0, -1), { ...cs[last(cs)], low: cs[last(cs)].close * 0.4, open: cs[last(cs)].close * 0.98 }];
    const { result } = analyzeLatest(trendFollowing, crash, params, "1h", { now: fresh });
    expect(result.state).not.toBe("NO_SIGNAL");
    expect(result.risks.join(" ")).toMatch(/3× ATR|volatility/i);
  });
});

describe("cross-strategy contradictions", () => {
  it("annotates long and exit signals that disagree", () => {
    const cs = candlesFromCloses(trendUp(400));
    const a = evaluateAt(trendFollowing, cs, last(cs), defaultParams(trendFollowing), "4h");
    const b = { ...a, strategyName: "Other", direction: "exit" as const, state: "EXIT_SETUP" as const, conflicts: [] };
    const out = annotateCrossStrategyConflicts([{ ...a, direction: "long", state: "POTENTIAL_BUY" }, b]);
    expect(out[0].conflicts.join(" ")).toMatch(/Contradiction/);
    expect(out[1].conflicts.join(" ")).toMatch(/Contradiction/);
  });
});
