import { describe, expect, it } from "vitest";
import { allocateMonth, planPeriod, requiredGrowth, type CoinState } from "@/lib/plan/allocate";
import { dropFrequency, historyTest, simulateWindow, stagedLevels, type DailySeries } from "@/lib/plan/history";

const coin = (symbol: string, verdict: CoinState["verdict"] = "WAIT", dailyBuyIdeas = 0, priceEur = 100): CoinState => ({ symbol, verdict, dailyBuyIdeas, priceEur });
const coins = [coin("BTC"), coin("ETH"), coin("ADA", "BUY", 2), coin("LTC", "WAIT", 2), coin("TRX", "SELL"), coin("XLM", "WAIT", 0), coin("PAXG")];

describe("monthly allocation", () => {
  it("balanced €100: BTC & ETH base + 2 best other coins, skipping SELL, sums to the total", () => {
    const p = allocateMonth(100, "balanced", coins);
    const m = Object.fromEntries(p.lines.map((l) => [l.symbol, l.amountEur]));
    expect(m).toEqual({ BTC: 50, ETH: 30, ADA: 10, LTC: 10 });
    expect(p.lines.reduce((a, l) => a + l.amountEur, 0)).toBe(100);
    expect(p.notes.join(" ")).toMatch(/TRX/);
    expect(p.lines.find((l) => l.symbol === "BTC")?.quantity).toBeCloseTo(0.5, 10);
  });
  it("careful style uses gold; without gold its part goes to BTC", () => {
    expect(Object.fromEntries(allocateMonth(100, "careful", coins).lines.map((l) => [l.symbol, l.amountEur]))).toEqual({ BTC: 50, ETH: 20, PAXG: 30 });
    const noGold = allocateMonth(100, "careful", coins.filter((c) => c.symbol !== "PAXG"));
    expect(noGold.lines.find((l) => l.symbol === "BTC")?.amountEur).toBe(80);
  });
  it("small amounts are not split below the minimum order", () => {
    const p = allocateMonth(40, "bold", coins, 10);
    expect(p.lines.every((l) => l.amountEur >= 10)).toBe(true);
    expect(p.lines.reduce((a, l) => a + l.amountEur, 0)).toBe(40);
  });
  it("when every other coin says SELL, their part goes to BTC", () => {
    const p = allocateMonth(200, "bold", [coin("BTC"), coin("ETH"), coin("ADA", "SELL"), coin("TRX", "SELL")]);
    expect(Object.fromEntries(p.lines.map((l) => [l.symbol, l.amountEur]))).toEqual({ BTC: 140, ETH: 60 });
  });
});

describe("plan periods & goal math", () => {
  it("buy day 1 vs 15", () => {
    expect(planPeriod(new Date("2026-10-12T10:00:00Z"), 1)).toMatchObject({ period: "2026-10" });
    expect(planPeriod(new Date("2026-10-12T10:00:00Z"), 15).period).toBe("2026-09");
    expect(planPeriod(new Date("2026-10-12T10:00:00Z"), 15).nextBuy.toISOString().slice(0, 10)).toBe("2026-10-15");
  });
  it("€100/month for 36 months to €16,000 needs ~126% per year", () => {
    const r = requiredGrowth(100, 36, 16_000);
    expect(r.invested).toBe(3600);
    expect(r.yearly * 100).toBeGreaterThan(120);
    expect(r.yearly * 100).toBeLessThan(132);
    expect(requiredGrowth(100, 36, 3000).yearly).toBe(0);
  });
});

describe("history test", () => {
  const day = 86_400_000;
  const start = Date.UTC(2018, 0, 1);
  const mk = (symbol: string, n: number, f: (i: number) => number): DailySeries => ({ symbol, times: Array.from({ length: n }, (_, i) => start + i * day), closes: Array.from({ length: n }, (_, i) => f(i)) });
  it("flat prices return the invested amount minus fees", () => {
    const btc = mk("BTC", 2000, () => 100);
    const w = simulateWindow([btc], { BTC: 1 }, 100, Date.UTC(2018, 1, 1), 12, 0.01)!;
    expect(w.invested).toBe(1200);
    expect(w.final).toBeCloseTo(1200 * 0.99 * 0.99, 6);
  });
  it("rising prices beat the invested amount; counts windows that reach the goal", () => {
    const btc = mk("BTC", 2500, (i) => 100 * 1.002 ** i);
    const r = historyTest([btc], { BTC: 1 }, 100, 3, 5000, 0);
    expect(r.windows.length).toBeGreaterThan(20);
    expect(r.lostMoney).toBe(0);
    expect(r.reachedGoal).toBe(r.windows.length);
    expect(r.latest).not.toBeNull();
  });
  it("a coin without data yet gives its share to BTC", () => {
    const btc = mk("BTC", 2000, () => 100);
    const alt = { symbol: "ALT", times: btc.times.slice(1000), closes: btc.closes.slice(1000).map(() => 50) };
    const w = simulateWindow([btc, alt], { BTC: 0.5, ALT: 0.5 }, 100, Date.UTC(2018, 1, 1), 6, 0);
    expect(w).not.toBeNull();
    expect(w!.final).toBeCloseTo(600, 6);
  });
  it("drop frequency and staged levels", () => {
    const closes = [100, 90, 80, 120, 130, 60, 140];
    const f = dropFrequency(closes.map((_, i) => i), closes, closes, 30, 3);
    expect(f.total).toBe(4);
    // only from 120 (level 84) does a later low (60) fall 30% within 3 days; from 80 the level is 56 > 60
    expect(f.hits).toBe(1);
    const s = stagedLevels(10_000, 70_000, 50_000, 4);
    expect(s.levels.map((l) => Math.round(l.price))).toEqual([70000, 63333, 56667, 50000]);
    expect(s.averagePrice).toBeLessThan(60_000);
  });
});

import { allocateSmart, buyTiming, scaleGoal, scoreCoin, type CoinFeatures } from "@/lib/plan/smart";

const f = (symbol: string, o: Partial<CoinFeatures> = {}): CoinFeatures => ({ symbol, verdict: "WAIT", dailyBuyIdeas: 0, priceEur: 100, vs30dPct: 0, atrPct: 3, trendDown: false, ...o });

describe("smart allocation", () => {
  it("scores cheap coins with buy ideas higher and SELL/downtrend lower", () => {
    expect(scoreCoin(f("A", { verdict: "BUY", dailyBuyIdeas: 2, vs30dPct: -6 })).score).toBeCloseTo(4.5, 10);
    expect(scoreCoin(f("B", { vs30dPct: 9, trendDown: true })).score).toBe(-2);
    expect(scoreCoin(f("C", { verdict: "SELL" })).score).toBe(-3);
  });
  it("tilts BTC/ETH within ±10 points and spends the whole budget", () => {
    const neutral = allocateSmart(200, "balanced", [f("BTC"), f("ETH"), f("ADA"), f("LTC")]);
    const m = Object.fromEntries(neutral.lines.map((l) => [l.symbol, l.amountEur]));
    expect(m).toEqual({ BTC: 100, ETH: 60, ADA: 20, LTC: 20 });
    const cheapBtc = allocateSmart(200, "balanced", [f("BTC", { vs30dPct: -6, dailyBuyIdeas: 2 }), f("ETH", { vs30dPct: 9, trendDown: true }), f("ADA"), f("LTC")]);
    const b = Object.fromEntries(cheapBtc.lines.map((l) => [l.symbol, l]));
    expect(b.BTC.amountEur).toBeGreaterThan(100);
    expect(b.ETH.amountEur).toBeLessThan(60);
    expect(b.BTC.vsUsualPts).toBeGreaterThan(0);
    expect(cheapBtc.lines.reduce((a, l) => a + l.amountEur, 0)).toBeCloseTo(200, 6);
  });
  it("gives more to stronger other coins and skips SELL and weak ones", () => {
    const p = allocateSmart(300, "bold", [f("BTC"), f("ETH"), f("ADA", { verdict: "BUY", dailyBuyIdeas: 2 }), f("XLM"), f("TRX", { verdict: "SELL" }), f("LTC", { trendDown: true, vs30dPct: 10 })]);
    const m = Object.fromEntries(p.lines.map((l) => [l.symbol, l.amountEur]));
    expect(m.ADA).toBeGreaterThan(m.XLM);
    expect(m.TRX).toBeUndefined();
    expect(m.LTC).toBeUndefined();
    expect(p.notes.map((n) => n.k)).toEqual(expect.arrayContaining(["skippedSell", "skippedWeak"]));
  });
  it("timing advice", () => {
    const lines = [{ symbol: "BTC", amountEur: 100 }];
    const mid = new Date("2026-10-12T10:00:00Z");
    expect(buyTiming(lines, [f("BTC", { vs30dPct: -5 })], mid).advice).toBe("buyNow");
    expect(buyTiming(lines, [f("BTC", { vs30dPct: 6 })], mid).advice).toBe("pricey");
    expect(buyTiming(lines, [f("BTC", { vs30dPct: 0 })], mid).advice).toBe("normal");
    expect(buyTiming(lines, [f("BTC", { vs30dPct: 6 })], new Date("2026-10-30T10:00:00Z")).advice).toBe("lastDays");
  });
  it("goal keeps the same multiple; any-day periods are calendar months", () => {
    expect(scaleGoal(16000, 3600, 7200)).toBe(32000);
    expect(scaleGoal(16000, 3600, 3600)).toBe(16000);
    expect(planPeriod(new Date("2026-10-12T10:00:00Z"), 0)).toMatchObject({ period: "2026-10" });
  });
});

import { candidateMixes, dipWaitTest, goalNeeds, searchMixes } from "@/lib/plan/history";

describe("smart pick (history search)", () => {
  const DAY = 86_400_000;
  const start = Date.UTC(2017, 0, 1);
  const days = 365 * 6;
  const make = (symbol: string, f: (i: number) => number): DailySeries => ({ symbol, times: Array.from({ length: days }, (_, i) => start + i * DAY), closes: Array.from({ length: days }, (_, i) => f(i)) });
  // BTC rises steadily, ETH is flat, gold rises slowly.
  const series = [make("BTC", (i) => 100 * 1.001 ** i), make("ETH", () => 50), make("PAXG", (i) => 1000 * 1.0002 ** i)];

  it("offers BTC/ETH/gold mixes in 10% steps; gold only when watched", () => {
    const withGold = candidateMixes(true);
    const noGold = candidateMixes(false);
    expect(noGold.every((m) => !("PAXG" in m))).toBe(true);
    expect(withGold.length).toBeGreaterThan(noGold.length);
    for (const m of withGold) expect(Object.values(m).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("finds the mix with the most profit and compares it with the current plan on the same periods", () => {
    const r = searchMixes(series, { BTC: 0.5, ETH: 0.5 }, 100, 2, 4000, 0.001, true);
    expect(r.windows).toBeGreaterThan(6);
    expect(r.profit?.weights).toEqual({ BTC: 1 });
    expect(r.current!.windows).toBe(r.windows);
    expect(r.goal!.reachedShare).toBeGreaterThanOrEqual(r.current!.reachedShare);
  });

  it("works out the monthly amount the goal needs (results scale with the amount)", () => {
    const n = goalNeeds(series, { BTC: 1 }, 100, 2, 4000, 0.001);
    expect(n.monthlyTypical).not.toBeNull();
    const again = goalNeeds(series, { BTC: 1 }, 100, 2, 8000, 0.001);
    expect(again.monthlyTypical!).toBeCloseTo(n.monthlyTypical! * 2, 6);
  });

  it("in a steadily rising market, buying on the 1st beats waiting for a dip", () => {
    const d = dipWaitTest(series, { BTC: 1 }, 2, 0.001);
    expect(d!.firstWins).toBe(d!.total);
    expect(d!.avgDiffPct).toBeGreaterThan(0);
  });

  it("a custom (smart) mix is used as the monthly split", () => {
    const f = (symbol: string): CoinFeatures => ({ symbol, verdict: "WAIT", dailyBuyIdeas: 0, priceEur: 1, vs30dPct: 0, atrPct: 2, trendDown: false });
    const p = allocateSmart(100, "custom", [f("BTC"), f("ETH"), f("PAXG"), f("ADA")], 10, { BTC: 1, ETH: 0, PAXG: 0 });
    expect(p.lines.map((l) => [l.symbol, l.amountEur])).toEqual([["BTC", 100]]);
    const q = allocateSmart(100, "custom", [f("BTC"), f("ETH"), f("PAXG")], 10, { BTC: 0.2, ETH: 0.3, PAXG: 0.5 });
    expect(Object.fromEntries(q.lines.map((l) => [l.symbol, l.amountEur]))).toEqual({ BTC: 20, ETH: 30, PAXG: 50 });
  });
});
