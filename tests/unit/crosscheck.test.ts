import { describe, expect, it } from "vitest";
import { buildSourceCheck, compareCandles, crossSourceIssue, opinionFrom, priceConsensus, sourceAgreementOf } from "@/lib/market/crosscheck";
import { weeklyFromDaily } from "@/lib/market/providers/kraken";
import { computeVerdict, type VerdictSignal } from "@/lib/signals/verdict";
import { evidenceText } from "@/lib/strategies/i18n";
import { candlesFromCloses, H, randomWalk } from "../helpers";

const D = 24 * H;

describe("live price consensus", () => {
  const src = (source: string, price: number | null) => ({ source, price, at: null });

  it("agrees when sources are within 1%", () => {
    const c = priceConsensus("BTC", [src("binance", 82574.67), src("kraken", 82483.1), src("coingecko", 82404)]);
    expect(c.verdict).toBe("AGREE");
    expect(c.spreadPct).toBeCloseTo(0.207, 2);
    expect(c.outlier).toBeNull();
  });
  it("flags a small difference between 1% and 3%", () => {
    expect(priceConsensus("X", [src("binance", 100), src("kraken", 102), src("coingecko", 101)]).verdict).toBe("SMALL_DIFF");
  });
  it("detects a disagreeing source and names the outlier", () => {
    const c = priceConsensus("X", [src("binance", 100), src("kraken", 100.2), src("coingecko", 110)]);
    expect(c.verdict).toBe("DISAGREE");
    expect(c.outlier).toBe("coingecko");
  });
  it("cannot confirm with a single answering source", () => {
    const c = priceConsensus("X", [src("binance", 100), src("kraken", null), src("coingecko", null)]);
    expect(c.verdict).toBe("SINGLE_SOURCE");
    expect(c.spreadPct).toBeNull();
  });
});

describe("candle comparison", () => {
  const closes = randomWalk(120, 7);
  const main = candlesFromCloses(closes);
  const last = main[main.length - 1].openTime;
  const shifted = (f: (c: number, i: number) => number) => candlesFromCloses(closes.map(f));

  it("matches nearly identical series", () => {
    const c = compareCandles("binance", main, "kraken", shifted((x) => x * 1.0008), last);
    expect(c.verdict).toBe("AGREE");
    expect(c.matched).toBe(100);
    expect(c.lastDiffPct).toBeCloseTo(0.08, 2);
    expect(crossSourceIssue(c)).toBeNull();
  });
  it("blocks when the analysed candle differs by more than 3%", () => {
    const c = compareCandles("binance", main, "kraken", shifted((x, i) => (i === 119 ? x * 1.05 : x)), last);
    expect(c.verdict).toBe("DISAGREE");
    const issue = crossSourceIssue(c)!;
    expect(issue.code).toBe("SOURCE_MISMATCH");
    expect(issue.severity).toBe("blocking");
  });
  it("blocks when the series differ systematically", () => {
    expect(compareCandles("binance", main, "kraken", shifted((x) => x * 1.02), last).verdict).toBe("DISAGREE");
  });
  it("warns on a small difference", () => {
    const c = compareCandles("binance", main, "kraken", shifted((x, i) => (i === 119 ? x * 1.015 : x)), last);
    expect(c.verdict).toBe("SMALL_DIFF");
    expect(crossSourceIssue(c)?.severity).toBe("warning");
  });
  it("is unavailable without enough overlapping candles", () => {
    const c = compareCandles("binance", main, "kraken", [], last);
    expect(c.verdict).toBe("UNAVAILABLE");
    expect(crossSourceIssue(c)?.code).toBe("SOURCE_UNCONFIRMED");
  });
  it("ignores wicks (thin order books legitimately differ)", () => {
    const wild = shifted((x) => x).map((c) => ({ ...c, high: c.high * 1.2, low: c.low * 0.8 }));
    expect(compareCandles("binance", main, "kraken", wild, last).verdict).toBe("AGREE");
  });
  it("has Persian text for every cross-check message", () => {
    for (const c of [
      compareCandles("binance", main, "kraken", shifted((x) => x * 1.02), last),
      compareCandles("binance", main, "kraken", shifted((x, i) => (i === 119 ? x * 1.015 : x)), last),
      compareCandles("binance", main, "kraken", [], last),
    ]) {
      const msg = crossSourceIssue(c)!.message;
      expect(evidenceText(msg, "fa")).not.toBe(msg);
    }
  });
});

describe("Kraken weekly candles", () => {
  it("builds Monday-aligned weeks from daily candles and drops partial first weeks", () => {
    // 2024-01-03 is a Wednesday; the first full week starts Monday 2024-01-08.
    const daily = candlesFromCloses(Array.from({ length: 26 }, (_, i) => 100 + i), { interval: D, start: Date.UTC(2024, 0, 3) });
    const weeks = weeklyFromDaily(daily);
    expect(new Date(weeks[0].openTime).toISOString()).toBe("2024-01-08T00:00:00.000Z");
    expect(new Date(weeks[0].openTime).getUTCDay()).toBe(1);
    expect(weeks[0].open).toBe(daily[5].open);
    expect(weeks[0].close).toBe(daily[11].close);
    expect(weeks[0].high).toBe(Math.max(...daily.slice(5, 12).map((c) => c.high)));
    expect(weeks[0].volume).toBe(7000);
    expect(weeks[0].closeTime - weeks[0].openTime).toBe(7 * D - 1);
    expect(weeks.length).toBe(3); // two full weeks + the in-progress one
  });
});

describe("second opinion", () => {
  it("agrees on the same direction, disagrees otherwise", () => {
    expect(opinionFrom("kraken", "POTENTIAL_BUY", "STRONG_BUY_SETUP").agrees).toBe(true);
    expect(opinionFrom("kraken", "POTENTIAL_BUY", "HOLD_WAIT").agrees).toBe(false);
    expect(opinionFrom("kraken", "EXIT_SETUP", "POTENTIAL_SELL").agrees).toBe(true);
  });
  it("never counts a data problem as agreement or disagreement", () => {
    expect(opinionFrom("kraken", "POTENTIAL_BUY", "NO_SIGNAL")).toMatchObject({ agrees: null, gap: "NOT_ENOUGH_DATA" });
    expect(opinionFrom("kraken", "NO_SIGNAL", "POTENTIAL_BUY")).toMatchObject({ agrees: null, gap: "MAIN_NO_SIGNAL" });
    expect(opinionFrom("kraken", "POTENTIAL_BUY", null, "LAGGING")).toMatchObject({ agrees: null, gap: "LAGGING" });
  });
  it("summarises opinions", () => {
    expect(buildSourceCheck("binance", [opinionFrom("kraken", "POTENTIAL_BUY", "POTENTIAL_BUY")], []).agreement).toBe("CONFIRMED");
    expect(buildSourceCheck("binance", [opinionFrom("kraken", "POTENTIAL_BUY", "HOLD_WAIT")], []).agreement).toBe("NOT_CONFIRMED");
    expect(buildSourceCheck("binance", [opinionFrom("kraken", "POTENTIAL_BUY", null)], []).agreement).toBe("UNCHECKED");
    expect(sourceAgreementOf(null)).toBeNull();
    expect(sourceAgreementOf({ agreement: "CONFIRMED" })).toBe("CONFIRMED");
  });
});

describe("verdict with a second exchange", () => {
  let n = 0;
  const check = (state: "POTENTIAL_BUY" | "HOLD_WAIT" | null) => buildSourceCheck("binance", [opinionFrom("kraken", "POTENTIAL_BUY", state)], []);
  const s = (state: string, sourceCheck?: unknown): VerdictSignal => ({
    id: `s${n++}`, strategyId: `st${n}`, timeframe: "1d", state, riskReward: 2, rulesMet: 5, rulesTotal: 7, price: 100, invalidation: 95, targets: [110], entryLow: 98, entryHigh: 100, sourceCheck,
  });

  it("BUY when the buy setups are confirmed, and says so", () => {
    const v = computeVerdict([s("POTENTIAL_BUY", check("POTENTIAL_BUY")), s("POTENTIAL_BUY", check("POTENTIAL_BUY"))]);
    expect(v.action).toBe("BUY");
    expect(v.reasonCodes).toContainEqual({ k: "buyConfirmed", confirmed: 2, buys: 2, source: "Kraken" });
  });
  it("WAIT when the second exchange contradicts the buy setups", () => {
    const v = computeVerdict([s("POTENTIAL_BUY", check("HOLD_WAIT")), s("POTENTIAL_BUY", check("POTENTIAL_BUY"))]);
    expect(v.action).toBe("WAIT");
    expect(v.headlineCode).toBe("waitAlmost");
    expect(v.reasonCodes).toContainEqual({ k: "waitNotConfirmed", unconfirmed: 1, buys: 2, source: "Kraken" });
  });
  it("still BUY when the second exchange could not be checked, but says so", () => {
    const v = computeVerdict([s("POTENTIAL_BUY", check(null)), s("POTENTIAL_BUY", check(null))]);
    expect(v.action).toBe("BUY");
    expect(v.reasonCodes).toContainEqual({ k: "buyUnchecked" });
  });
  it("is unchanged for signals created before cross-checking", () => {
    const v = computeVerdict([s("POTENTIAL_BUY"), s("POTENTIAL_BUY")]);
    expect(v.action).toBe("BUY");
    expect(v.reasonCodes.map((r) => r.k)).toEqual(["buyAgree", "buyRR"]);
  });
});
