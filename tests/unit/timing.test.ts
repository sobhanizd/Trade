import { describe, expect, it } from "vitest";
import { entryTiming, exitOdds } from "@/lib/analysis/timing";
import type { Candle } from "@/lib/market/types";

const DAY = 86_400_000;
const T0 = Date.UTC(2018, 0, 1);
/** Daily candles from a close series; each day's low/high = close ∓ `wick`. */
function candles(closes: number[], wick = 0.02): Candle[] {
  return closes.map((c, i) => ({ openTime: T0 + i * DAY, closeTime: T0 + (i + 1) * DAY - 1, open: i ? closes[i - 1] : c, high: c * (1 + wick), low: c * (1 - wick), close: c, volume: 1 }));
}
const NOW = (cs: Candle[]) => cs[cs.length - 1].closeTime + 1;

describe("entry timing (history-measured)", () => {
  it("in a steady uptrend, buying now beats waiting for a dip", () => {
    const cs = candles(Array.from({ length: 1200 }, (_, i) => 100 * 1.003 ** i), 0.005);
    const t = entryTiming(cs, NOW(cs))!;
    expect(t.advice).toBe("buyNow");
    expect(t.best).toBeNull();
    expect(t.buyNowBeatsWaitShare).toBeGreaterThan(0.9);
    expect(t.samples).toBeGreaterThan(100);
  });

  it("when prices usually dip and come back, waiting with a lower order was cheaper", () => {
    // Flat, noisy market: each day is 100 ± up to 6 % at random, so dips below today are reached quickly.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
    // Today is an above-average day, so it is compared with past above-average days (which usually came back down).
    const cs = candles([...Array.from({ length: 1500 }, () => 100 * (1 + 0.12 * (rnd() - 0.5))), 105], 0.01);
    const t = entryTiming(cs, NOW(cs))!;
    expect(t.options.some((o) => o.fillRate > 0.5 && o.avgVsNowPct < 0)).toBe(true);
    expect(t.fillChance10).toBeGreaterThan(0);
    expect(t.dipPct).toBeGreaterThan(0);
  });

  it("uses closed candles only and needs enough history", () => {
    const cs = candles(Array.from({ length: 300 }, () => 100));
    expect(entryTiming(cs, NOW(cs))).toBeNull();
    const long = candles(Array.from({ length: 1200 }, (_, i) => 100 * 1.003 ** i), 0.005);
    // A candle that is still open (closes in the future) must not change the answer.
    const open = [...long, { ...long[long.length - 1], openTime: long[long.length - 1].openTime + DAY, closeTime: long[long.length - 1].closeTime + DAY, close: 1 }];
    expect(entryTiming(open, NOW(long))).toEqual(entryTiming(long, NOW(long)));
  });
});

describe("exit odds", () => {
  it("in an uptrend the target is reached first far more often than the stop", () => {
    const cs = candles(Array.from({ length: 1200 }, (_, i) => 100 * 1.003 ** i), 0.005);
    const close = cs[cs.length - 1].close;
    const r = exitOdds(cs, { target: close * 1.05, stop: close * 0.95 }, [7, 30], NOW(cs))!;
    const d30 = r.odds.find((o) => o.days === 30)!;
    expect(d30.targetFirst).toBeGreaterThan(0.9);
    expect(d30.targetFirst + d30.stopFirst + d30.neither).toBeCloseTo(1);
  });
  it("returns null without a usable level", () => {
    const cs = candles(Array.from({ length: 1200 }, () => 100));
    expect(exitOdds(cs, {}, [7], NOW(cs))).toBeNull();
  });
});
