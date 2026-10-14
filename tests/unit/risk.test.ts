import { describe, expect, it } from "vitest";
import { calculateRisk, netRiskReward, roundTrip } from "@/lib/risk/calculator";

const base = { accountBalance: 10_000, maxLoss: 100, entryPrice: 100, stopPrice: 95, targetPrice: 110, feeRate: 0, slippageRate: 0 };

describe("risk calculator", () => {
  it("sizes the position so the loss at the stop equals the max loss (no costs)", () => {
    const r = calculateRisk(base);
    expect(r.valid).toBe(true);
    expect(r.quantity).toBeCloseTo(20, 10);
    expect(r.potentialLoss).toBeCloseTo(100, 10);
    expect(r.potentialGain).toBeCloseTo(200, 10);
    expect(r.riskRewardGross).toBeCloseTo(2, 10);
    expect(r.riskRewardNet).toBeCloseTo(2, 10);
    expect(r.positionValue).toBeCloseTo(2000, 10);
  });

  it("includes fees and slippage in the loss and reduces size accordingly", () => {
    const r = calculateRisk({ ...base, feeRate: 0.001, slippageRate: 0.001 });
    // per-unit loss = (100.1 - 94.905) + 100.1*0.001 + 94.905*0.001
    const perUnit = 100.1 - 94.905 + 0.1001 + 0.094905;
    expect(r.lossPerUnit).toBeCloseTo(perUnit, 9);
    expect(r.potentialLoss).toBeCloseTo(100, 9);
    expect(r.quantity).toBeCloseTo(100 / perUnit, 9);
    expect(r.riskRewardNet!).toBeLessThan(r.riskRewardGross!);
    expect(r.costImpactAtStop).toBeGreaterThan(0);
  });

  it("caps position at the account balance (no leverage) and warns", () => {
    const r = calculateRisk({ ...base, maxLoss: 1000, stopPrice: 99.9 });
    expect(r.cappedByBalance).toBe(true);
    expect(r.positionValue).toBeLessThanOrEqual(10_000);
    expect(r.potentialLoss).toBeLessThan(1000);
    expect(r.warnings.join(" ")).toMatch(/capped/);
  });

  it("respects a lower position cap", () => {
    const r = calculateRisk({ ...base, maxLoss: 500, maxPositionPct: 25 });
    expect(r.positionValue).toBeLessThanOrEqual(2500 + 1e-9);
  });

  it("warns when risking more than 2% of balance", () => {
    expect(calculateRisk({ ...base, maxLoss: 500 }).warnings.join(" ")).toMatch(/risks 5\.00%/);
  });

  it("rejects zero, negative and inconsistent inputs", () => {
    expect(calculateRisk({ ...base, accountBalance: 0 }).errors.length).toBeGreaterThan(0);
    expect(calculateRisk({ ...base, maxLoss: -5 }).errors.length).toBeGreaterThan(0);
    expect(calculateRisk({ ...base, entryPrice: 0 }).errors.length).toBeGreaterThan(0);
    expect(calculateRisk({ ...base, stopPrice: 105 }).errors[0]).toMatch(/below the entry/);
    expect(calculateRisk({ ...base, targetPrice: 90 }).errors[0]).toMatch(/above the entry/);
    expect(calculateRisk({ ...base, maxLoss: 20_000 }).errors[0]).toMatch(/exceed/);
    expect(calculateRisk({ ...base, feeRate: 0.5 }).valid).toBe(false);
    expect(calculateRisk({ ...base, entryPrice: Number.NaN }).valid).toBe(false);
  });

  it("works without a target", () => {
    const r = calculateRisk({ ...base, targetPrice: null });
    expect(r.valid).toBe(true);
    expect(r.potentialGain).toBeNull();
    expect(r.riskRewardNet).toBeNull();
  });

  it("warns when costs eat the whole reward", () => {
    const r = calculateRisk({ ...base, targetPrice: 100.1, feeRate: 0.001, slippageRate: 0.001 });
    expect(r.warnings.join(" ")).toMatch(/cannot be profitable/);
  });

  it("roundTrip and netRiskReward are consistent", () => {
    const rt = roundTrip(100, 110, { feeRate: 0.001, slippageRate: 0.0005 });
    expect(rt.gross).toBe(10);
    expect(rt.net).toBeLessThan(10);
    expect(netRiskReward(100, 95, 110, { feeRate: 0, slippageRate: 0 })).toBeCloseTo(2, 10);
    expect(netRiskReward(100, 105, 110, { feeRate: 0, slippageRate: 0 })).toBeNull();
  });
});
