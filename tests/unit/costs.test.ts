import { describe, expect, it } from "vitest";
import { calculateRisk, netRiskReward, roundTrip } from "@/lib/risk/calculator";
import { settlePaper } from "@/lib/paper/service";
import { simulateWindow, type DailySeries } from "@/lib/plan/history";
import { costsFromSettings, defaultSettings } from "@/lib/settings/schema";

const mine = { feeRate: 0.001, slippageRate: 0.0005, buyCost: 0.03, sellCost: 0.005 };

describe("real buy / sell costs (3 % to buy, 0.5 % to sell)", () => {
  it("€1,000 buys €970 of coin; selling €1,000 of coin pays €995", () => {
    const rt = roundTrip(2000, 2000, mine);
    const coins = 1000 / rt.entryFill;
    expect(coins * 2000).toBeCloseTo(970, 6);
    expect(1000 * (rt.exitFill / 2000)).toBeCloseTo(995, 6);
    // Same price in and out: you lose both costs.
    expect(coins * rt.exitFill).toBeCloseTo(970 * 0.995, 6);
  });

  it("a coin must rise about 3.6 % just to break even", () => {
    const breakEven = 1 / ((1 - 0.03) * (1 - 0.005));
    expect(roundTrip(100, 100 * breakEven, mine).net).toBeCloseTo(0, 9);
    expect((breakEven - 1) * 100).toBeCloseTo(3.61, 2);
  });

  it("reward/risk and position size include the costs", () => {
    const cheap = netRiskReward(100, 95, 110, { feeRate: 0.001, slippageRate: 0.0005 })!;
    const real = netRiskReward(100, 95, 110, mine)!;
    expect(real).toBeLessThan(cheap);
    const r = calculateRisk({ accountBalance: 10_000, maxLoss: 100, entryPrice: 100, stopPrice: 95, targetPrice: 110, ...mine });
    expect(r.valid).toBe(true);
    expect(r.potentialLoss).toBeCloseTo(100, 6);
  });

  it("practice trades settle with the stored costs", () => {
    const entryFill = roundTrip(100, 100, mine).entryFill;
    const s = settlePaper({ entryPrice: entryFill, quantity: 10, feeRate: 0.001, slippageRate: 0.0005, buyCost: 0.03, sellCost: 0.005 }, 120);
    expect(s.netPnl).toBeCloseTo(10 * (120 * 0.995 - 100 / 0.97), 6);
  });

  it("settings: empty costs keep fee + slippage; set costs are used", () => {
    const d = defaultSettings();
    expect(costsFromSettings(d).buyCost).toBeUndefined();
    const c = costsFromSettings({ ...d, risk: { ...d.risk, buyCostPct: 3, sellCostPct: 0.5 } });
    expect(c.buyCost).toBeCloseTo(0.03);
    expect(c.sellCost).toBeCloseTo(0.005);
  });

  it("the plan history applies the buying cost on each buy and the selling cost at the end", () => {
    const DAY = 86_400_000;
    const t0 = Date.UTC(2020, 0, 1);
    const flat: DailySeries = { symbol: "BTC", times: Array.from({ length: 800 }, (_, i) => t0 + i * DAY), closes: Array.from({ length: 800 }, () => 100) };
    const w = simulateWindow([flat], { BTC: 1 }, 1000, Date.UTC(2020, 1, 1), 12, { buy: 0.03, sell: 0.005 })!;
    expect(w.invested).toBe(12_000);
    expect(w.final).toBeCloseTo(12_000 * 0.97 * 0.995, 6);
  });
});
