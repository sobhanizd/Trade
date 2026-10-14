import { describe, expect, it } from "vitest";
import fixture from "../fixtures/indicators.json";
import { adx, atr, bollinger, ema, macd, realizedVolatility, roc, rsi, sma, supportResistance, volumeRatio } from "@/lib/indicators";
import type { Candle } from "@/lib/market/types";
import { candlesFromCloses, randomWalk } from "../helpers";

const candles = fixture.candles as Candle[];
const closes = candles.map((c) => c.close);
const tail = <T>(xs: T[]) => xs.slice(fixture.tailStart);

function expectClose(actual: (number | null)[], expected: number[], tol: number) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((v, k) => {
    expect(v).not.toBeNull();
    expect(Math.abs((v as number) - expected[k])).toBeLessThan(tol);
  });
}

describe("SMA / EMA", () => {
  it("computes a simple moving average with null warm-up", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it("seeds EMA with the SMA and applies k = 2/(n+1)", () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBeCloseTo(2, 10);
    expect(out[3]).toBeCloseTo(4 * 0.5 + 2 * 0.5, 10);
    expect(out[4]).toBeCloseTo(5 * 0.5 + 3 * 0.5, 10);
  });
  it("restarts after missing values instead of fabricating them", () => {
    const out = sma([1, 2, null, 4, 5, 6], 2);
    expect(out).toEqual([null, 1.5, null, null, 4.5, 5.5]);
  });
  it("matches pandas rolling mean", () => {
    expectClose(tail(sma(closes, 20)), fixture.sma20, 1e-9);
  });
  it("rejects invalid periods", () => {
    expect(() => sma([1], 0)).toThrow();
  });
});

describe("RSI (Wilder)", () => {
  // Classic worked example (StockCharts ChartSchool RSI table). The published
  // table rounds intermediate averages (first value shown as 70.53); the exact
  // Wilder values below were computed independently and match TA-Lib.
  const data = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64, 46.21];
  it("reproduces the published worked example", () => {
    const r = rsi(data, 14);
    expect(r.slice(0, 14).every((x) => x === null)).toBe(true);
    const exact = [70.464, 66.25, 66.481, 69.347, 66.295, 57.915, 62.881];
    exact.forEach((v, k) => expect(r[14 + k]).toBeCloseTo(v, 2));
    // And within rounding distance of the published table.
    expect(Math.abs(r[14]! - 70.53)).toBeLessThan(0.1);
  });
  it("converges to pandas Wilder RSI", () => {
    expectClose(tail(rsi(closes, 14)), fixture.rsi14, 1e-6);
  });
  it("returns 100 when there are no losses and 50 for a flat series", () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3)[5]).toBe(100);
    expect(rsi([5, 5, 5, 5, 5], 3)[4]).toBe(50);
  });
  it("returns all nulls when history is insufficient", () => {
    expect(rsi([1, 2, 3], 14).every((x) => x === null)).toBe(true);
  });
});

describe("MACD", () => {
  it("converges to pandas EMA-based MACD", () => {
    const m = macd(closes, 12, 26, 9);
    expectClose(tail(m.macd), fixture.macd, 1e-6);
    expectClose(tail(m.signal), fixture.macdSignal, 1e-6);
    expectClose(tail(m.histogram), fixture.macdHist, 1e-6);
  });
  it("throws if fast >= slow", () => {
    expect(() => macd(closes, 26, 12, 9)).toThrow();
  });
  it("has nulls until slow + signal warm-up", () => {
    const m = macd(closes, 12, 26, 9);
    // slow EMA first at index 25, signal EMA(9) of MACD first at 25 + 8 = 33
    expect(m.macd[24]).toBeNull();
    expect(m.macd[25]).not.toBeNull();
    expect(m.signal[32]).toBeNull();
    expect(m.signal[33]).not.toBeNull();
  });
});

describe("Bollinger Bands", () => {
  it("matches pandas (population std)", () => {
    const b = bollinger(closes, 20, 2);
    expectClose(tail(b.upper), fixture.bbUpper, 1e-9);
    expectClose(tail(b.lower), fixture.bbLower, 1e-9);
  });
  it("collapses to the mean on a flat series", () => {
    const b = bollinger([10, 10, 10, 10], 3, 2);
    expect(b.upper[3]).toBe(10);
    expect(b.lower[3]).toBe(10);
    expect(b.percentB[3]).toBeNull();
  });
});

describe("ATR / ADX", () => {
  it("ATR converges to pandas Wilder ATR", () => {
    expectClose(tail(atr(candles, 14)), fixture.atr14, 1e-6);
  });
  it("ADX is high in a clean trend and bounded 0..100", () => {
    const up = candlesFromCloses(Array.from({ length: 120 }, (_, i) => 100 + i));
    const a = adx(up, 14);
    const last = a.adx[a.adx.length - 1]!;
    expect(last).toBeGreaterThan(40);
    expect(last).toBeLessThanOrEqual(100);
    expect(a.plusDI[a.plusDI.length - 1]!).toBeGreaterThan(a.minusDI[a.minusDI.length - 1]!);
  });
});

describe("volume, momentum, volatility", () => {
  it("volume ratio compares to the PREVIOUS average only", () => {
    const v = [10, 10, 10, 30];
    expect(volumeRatio(v, 3)[3]).toBeCloseTo(3, 10);
    expect(volumeRatio(v, 3)[2]).toBeNull();
  });
  it("ROC in percent", () => {
    expect(roc([100, 110, 121], 2)[2]).toBeCloseTo(21, 10);
  });
  it("realized volatility is null during warm-up and positive after", () => {
    const rv = realizedVolatility(randomWalk(100), 30, 365);
    expect(rv[29]).toBeNull();
    expect(rv[60]!).toBeGreaterThan(0);
  });
});

describe("causality (no look-ahead)", () => {
  it("indicator values at i do not change when future candles are appended", () => {
    const full = candles;
    const cut = full.slice(0, 400);
    const i = 399;
    const fc = full.map((c) => c.close);
    const cc = cut.map((c) => c.close);
    expect(rsi(cc, 14)[i]).toBeCloseTo(rsi(fc, 14)[i]!, 12);
    expect(macd(cc).histogram[i]).toBeCloseTo(macd(fc).histogram[i]!, 12);
    expect(atr(cut)[i]).toBeCloseTo(atr(full)[i]!, 12);
    expect(adx(cut).adx[i]).toBeCloseTo(adx(full).adx[i]!, 12);
    expect(bollinger(cc).upper[i]).toBeCloseTo(bollinger(fc).upper[i]!, 12);
    const a = supportResistance(cut, i, { tolerance: 0.5 });
    const b = supportResistance(full, i, { tolerance: 0.5 });
    expect(a.supports.map((l) => l.price)).toEqual(b.supports.map((l) => l.price));
    expect(a.resistances.map((l) => l.price)).toEqual(b.resistances.map((l) => l.price));
  });
});

describe("support / resistance", () => {
  it("finds a repeated ceiling as resistance above price", () => {
    const pattern: number[] = [];
    for (let k = 0; k < 6; k++) pattern.push(100, 103, 106, 110, 106, 103, 100);
    pattern.push(101, 102);
    const cs = candlesFromCloses(pattern, { wick: 0 });
    const sr = supportResistance(cs, cs.length - 1, { tolerance: 1, strength: 2 });
    expect(sr.resistances[0].price).toBeCloseTo(110, 0);
    expect(sr.resistances[0].touches).toBeGreaterThanOrEqual(4);
    expect(sr.supports[0].price).toBeLessThan(102);
  });
});
