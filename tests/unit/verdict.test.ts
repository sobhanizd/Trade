import { describe, expect, it } from "vitest";
import { computeVerdict, type VerdictSignal } from "@/lib/signals/verdict";

let n = 0;
const s = (timeframe: string, state: string, extra: Partial<VerdictSignal> = {}): VerdictSignal => ({
  id: `s${n++}`, strategyId: `st${n}`, timeframe, state, riskReward: 2, rulesMet: 5, rulesTotal: 7, price: 100, invalidation: 95, targets: [110], entryLow: 98, entryHigh: 100, ...extra,
});

describe("verdict", () => {
  it("BUY when ≥2 daily buys, no warnings, good R/R and calm 4h", () => {
    const v = computeVerdict([s("1d", "POTENTIAL_BUY"), s("1d", "STRONG_BUY_SETUP", { rulesMet: 7 }), s("1d", "HOLD_WAIT"), s("4h", "HOLD_WAIT")]);
    expect(v.action).toBe("BUY");
    expect(v.strong).toBe(true);
    expect(v.best?.state).toBe("STRONG_BUY_SETUP");
  });
  it("WAIT when the 4h chart is falling even if daily looks good", () => {
    const v = computeVerdict([s("1d", "POTENTIAL_BUY"), s("1d", "POTENTIAL_BUY"), s("4h", "EXIT_SETUP"), s("4h", "EXIT_SETUP")]);
    expect(v.action).toBe("WAIT");
    expect(v.reasons.join(" ")).toMatch(/4-hour chart is falling/);
  });
  it("WAIT when reward/risk is too low", () => {
    expect(computeVerdict([s("1d", "POTENTIAL_BUY", { riskReward: 1.2 }), s("1d", "POTENTIAL_BUY", { riskReward: 1.3 })]).action).toBe("WAIT");
  });
  it("WAIT when any daily strategy warns", () => {
    expect(computeVerdict([s("1d", "POTENTIAL_BUY"), s("1d", "POTENTIAL_BUY"), s("1d", "POTENTIAL_SELL")]).action).toBe("WAIT");
  });
  it("SELL when exits dominate", () => {
    const v = computeVerdict([s("1d", "EXIT_SETUP"), s("1d", "POTENTIAL_SELL"), s("1d", "POTENTIAL_BUY")]);
    expect(v.action).toBe("SELL");
  });
  it("NO_DATA without usable signals; falls back to the longest timeframe without daily", () => {
    expect(computeVerdict([]).action).toBe("NO_DATA");
    expect(computeVerdict([s("1d", "NO_SIGNAL")]).action).toBe("NO_DATA");
    expect(computeVerdict([s("4h", "POTENTIAL_BUY"), s("4h", "POTENTIAL_BUY")]).primaryTimeframe).toBe("4h");
  });
});
