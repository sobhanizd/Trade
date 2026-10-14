import { describe, expect, it } from "vitest";
import { computeMetrics, maxDrawdown, runBacktest, type SimTrade } from "@/lib/backtest/engine";
import type { Candle } from "@/lib/market/types";
import { defaultParams, STRATEGIES } from "@/lib/strategies/registry";
import type { StrategyDefinition } from "@/lib/strategies/types";
import { candlesFromCloses, randomWalk, trendUp } from "../helpers";

/** Test strategy: buy setup when close crosses above 105; stop = close - 5, target = close + 10. Exit setup when close < 90. */
const testStrategy: StrategyDefinition = {
  id: "test",
  name: "Test",
  version: 1,
  summary: "",
  description: "",
  rules: { setup: ["x"], confirmation: [], exit: ["x"], invalidation: "x", targets: "x", expiry: "x" },
  intendedTimeframes: ["1h"],
  defaultTimeframes: ["1h"],
  params: [],
  warmup: () => 5,
  expiryBars: () => 1,
  evaluate: ({ candles, i }) => {
    const c = candles[i].close;
    const prev = candles[i - 1]?.close ?? c;
    if (prev <= 105 && c > 105) return { state: "STRONG_BUY_SETUP", summary: "", conditions: [], indicators: {}, invalidation: c - 5, targets: [c + 10], risks: [], conflicts: [] };
    if (c < 90) return { state: "EXIT_SETUP", summary: "", conditions: [], indicators: {}, risks: [], conflicts: [] };
    return { state: "NO_CLEAR_OPPORTUNITY", summary: "", conditions: [], indicators: {}, risks: [], conflicts: [] };
  },
};

const noCosts = { feeRate: 0, slippageRate: 0, outOfSampleFraction: 0, targetIndex: 0 };

function bars(rows: [number, number, number, number][]): Candle[] {
  return rows.map(([open, high, low, close], i) => ({ openTime: i * 3_600_000, closeTime: (i + 1) * 3_600_000 - 1, open, high, low, close, volume: 1000 }));
}

const flat = (n: number, p = 100): [number, number, number, number][] => Array.from({ length: n }, () => [p, p + 0.5, p - 0.5, p]);

describe("backtest execution model", () => {
  it("enters at the NEXT open after the signal candle and exits at the target", () => {
    const cs = bars([...flat(10), [100, 106.5, 100, 106], [106.2, 107, 105.5, 106.5], [106.5, 117, 106, 116], ...flat(3)]);
    const r = runBacktest(testStrategy, cs, {}, "1h", noCosts);
    expect(r.trades).toHaveLength(1);
    const t = r.trades[0];
    expect(t.entryIndex).toBe(11);
    expect(t.entryPrice).toBe(106.2); // next open, not the signal close
    expect(t.exitReason).toBe("TARGET");
    expect(t.exitPrice).toBe(116); // target = 106 + 10
    expect(t.rMultiple).toBeCloseTo((116 - 106.2) / (106.2 - 101), 6);
  });

  it("assumes the stop is hit first when stop and target are both inside one candle", () => {
    const cs = bars([...flat(10), [100, 106.5, 100, 106], [106, 106.5, 105.5, 106], [106, 120, 95, 110], ...flat(3)]);
    const t = runBacktest(testStrategy, cs, {}, "1h", noCosts).trades[0];
    expect(t.exitReason).toBe("STOP");
    expect(t.exitPrice).toBe(101);
  });

  it("fills at the worse open price when price gaps through the stop", () => {
    const cs = bars([...flat(10), [100, 106.5, 100, 106], [106, 106.5, 105.5, 106], [96, 97, 95, 96], ...flat(3)]);
    const t = runBacktest(testStrategy, cs, {}, "1h", noCosts).trades[0];
    expect(t.exitReason).toBe("STOP");
    expect(t.exitPrice).toBe(96);
  });

  it("risks ~riskPerTradePct of equity at the stop, including costs", () => {
    const cs = bars([...flat(10), [100, 106.5, 100, 106], [106, 106.5, 105.5, 106], [106, 106, 100, 100.5], ...flat(3)]);
    const r = runBacktest(testStrategy, cs, {}, "1h", { feeRate: 0.001, slippageRate: 0.0005, outOfSampleFraction: 0, riskPerTradePct: 1, initialCapital: 10_000, targetIndex: 0 });
    const t = r.trades[0];
    expect(t.exitReason).toBe("STOP");
    expect(t.netPnl).toBeCloseTo(-100, 6);
    expect(t.fees).toBeGreaterThan(0);
    expect(t.slippageCost).toBeGreaterThan(0);
    expect(t.grossPnl - t.fees - t.slippageCost).toBeCloseTo(t.netPnl, 9);
    expect(r.finalEquity).toBeCloseTo(9_900, 6);
  });

  it("skips an entry when the next open gaps below the invalidation level", () => {
    const cs = bars([...flat(10), [100, 106.5, 100, 106], [99, 100, 98, 99], ...flat(3)]);
    const r = runBacktest(testStrategy, cs, {}, "1h", noCosts);
    expect(r.trades).toHaveLength(0);
    expect(r.skippedEntries).toBe(1);
  });

  it("exits at the next open on an EXIT_SETUP and closes open trades at the end", () => {
    const cs = bars([...flat(10), [100, 106.5, 100, 106], [106, 106.5, 104, 104], [104, 104, 101.5, 102], ...flat(3, 103)]);
    const s = { ...noCosts, targetIndex: -1 };
    const r = runBacktest(testStrategy, cs, {}, "1h", s);
    expect(r.trades[0].exitReason).toBe("END_OF_DATA");
    const cs2 = bars([...flat(10), [100, 106.5, 100, 106], [106, 106.5, 104, 104], [104, 104, 102, 102.5], [102, 102, 101.2, 101.5], ...flat(3, 103)]);
    const cs3 = cs2.map((c, i) => (i === 13 ? { ...c, close: 89, low: 89 } : c));
    // stop at 101 would trigger on bar 13 (low 89) — use a deeper stop strategy instead
    const deep: StrategyDefinition = { ...testStrategy, evaluate: (ctx) => ({ ...testStrategy.evaluate(ctx), ...(ctx.candles[ctx.i].close > 105 && ctx.candles[ctx.i - 1].close <= 105 ? { invalidation: 50 } : {}) }) };
    const r3 = runBacktest(deep, cs3, {}, "1h", s);
    expect(r3.trades[0].exitReason).toBe("EXIT_SIGNAL");
    expect(r3.trades[0].exitIndex).toBe(14);
    expect(r3.trades[0].exitPrice).toBe(cs3[14].open);
  });

  it("never trades on information from the future: trades closed before a cut are identical", () => {
    const cs = candlesFromCloses(randomWalk(1500, 11, 0.0004, 0.02), { volume: randomWalk(1500, 5, 0, 0.3, 1000) });
    for (const def of STRATEGIES) {
      const params = defaultParams(def);
      const full = runBacktest(def, cs, params, "4h", { outOfSampleFraction: 0 });
      const cut = runBacktest(def, cs.slice(0, 1000), params, "4h", { outOfSampleFraction: 0 });
      const closedBefore = (ts: SimTrade[]) => ts.filter((t) => t.exitIndex < 998 && t.exitReason !== "END_OF_DATA").map((t) => [t.entryIndex, t.exitIndex, t.entryPrice, t.exitPrice]);
      expect(closedBefore(cut.trades)).toEqual(closedBefore(full.trades));
    }
  });

  it("reports metrics, benchmark, in/out-of-sample split and warnings", () => {
    const cs = candlesFromCloses(trendUp(1200, 100, 0.001, 0.02, 4));
    const def = STRATEGIES[0];
    const r = runBacktest(def, cs, defaultParams(def), "4h", {});
    expect(r.metrics.trades).toBe(r.trades.length);
    expect(r.metrics.wins + r.metrics.losses).toBe(r.metrics.trades);
    expect(r.outOfSample).not.toBeNull();
    expect(r.inSample.trades + (r.outOfSample?.trades ?? 0)).toBe(r.metrics.trades);
    expect(r.metrics.grossReturnPct).toBeGreaterThanOrEqual(r.metrics.netReturnPct);
    expect(r.benchmark.name).toMatch(/Buy & hold/);
    expect(r.warnings.join(" ")).toMatch(/do not guarantee/);
    expect(r.equityCurve.length).toBeLessThanOrEqual(601);
  });

  it("throws on insufficient history", () => {
    expect(() => runBacktest(STRATEGIES[0], candlesFromCloses(trendUp(50)), defaultParams(STRATEGIES[0]), "4h")).toThrow(/Not enough candles/);
  });
});

describe("metrics", () => {
  const mk = (netPnl: number, r: number): SimTrade => ({
    segment: "IN_SAMPLE", entryIndex: 0, exitIndex: 1, entryTime: 0, exitTime: 1, entryPrice: 100, exitPrice: 100, quantity: 1, stopPrice: 90, targetPrice: null,
    grossPnl: netPnl + 1, fees: 0.5, slippageCost: 0.5, netPnl, returnPct: netPnl, rMultiple: r, exitReason: "TARGET", entryState: "STRONG_BUY_SETUP", barsHeld: 2,
  });
  it("computes win rate, profit factor, expectancy and loss streaks", () => {
    const trades = [mk(200, 2), mk(-100, -1), mk(-100, -1), mk(300, 3)];
    const m = computeMetrics(trades, 10_000, [10_200, 10_100, 10_000, 10_300], null, 8);
    expect(m.winRatePct).toBe(50);
    expect(m.profitFactor).toBeCloseTo(2.5, 10);
    expect(m.expectancy).toBeCloseTo(75, 10);
    expect(m.avgR).toBeCloseTo(0.75, 10);
    expect(m.maxConsecutiveLosses).toBe(2);
    expect(m.netReturnPct).toBeCloseTo(3, 10);
    expect(m.totalFees).toBe(2);
    expect(m.exposurePct).toBe(100);
  });
  it("profit factor is null with no losing trades; empty trade list is handled", () => {
    expect(computeMetrics([mk(10, 1)], 100, [110], null, 1).profitFactor).toBeNull();
    const e = computeMetrics([], 100, [100], null, 10);
    expect(e.winRatePct).toBeNull();
    expect(e.trades).toBe(0);
  });
  it("max drawdown", () => {
    expect(maxDrawdown([100, 120, 90, 130, 117])).toBeCloseTo(25, 10);
    expect(maxDrawdown([100, 101, 102])).toBe(0);
  });
});
