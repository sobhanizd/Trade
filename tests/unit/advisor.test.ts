import { describe, expect, it } from "vitest";
import { advise, regimeTrack, type AdviceInput } from "@/lib/analysis/advisor";
import { activePatterns, detectAll, leanOf } from "@/lib/analysis/patterns";
import type { TrendLines } from "@/lib/analysis/structure";
import type { Candle } from "@/lib/market/types";

const DAY = 86_400_000;
const T0 = Date.UTC(2018, 0, 1);
const series = (f: (i: number) => number, n = 900): Candle[] =>
  Array.from({ length: n }, (_, i) => {
    const c = f(i);
    return { openTime: T0 + i * DAY, closeTime: T0 + (i + 1) * DAY - 1, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 100 };
  });
const NOW = T0 + 900 * DAY + 1;
const noLines: TrendLines = { support: null, resistance: null, pattern: "none", brokeSupport: false, brokeResistance: false };
const base = (daily: Candle[], o: Partial<AdviceInput> = {}): AdviceInput => ({ daily, now: NOW, verdict: "WAIT", direction: null, lines: noLines, scenarios: null, analogs: null, patterns: [], urgentNews: [], holding: null, ...o });
const wavy = (i: number) => 100 * 1.0008 ** i * (1 + 0.08 * Math.sin(i / 9));

describe("trader's advice", () => {
  it("measures the trend state's next-30-day record on the coin itself", () => {
    const r = regimeTrack(series(wavy));
    expect(r.now).not.toBeNull();
    expect(r.all!.n).toBeGreaterThan(500);
    expect(r.inState!.n).toBeGreaterThan(0);
  });

  it("never says buy when there is serious news — it says pause", () => {
    const a = advise(base(series(wavy), { verdict: "BUY", urgentNews: ["Exchange hacked"] }))!;
    expect(a.forNewMoney).toBe("pause");
  });

  it("a SELL answer plus a broken floor line tells owners to sell part", () => {
    const daily = series(wavy);
    const lines: TrendLines = { ...noLines, brokeSupport: true, support: { i1: 0, p1: 1, i2: 1, p2: 1, iEnd: 2, pEnd: daily[daily.length - 1].close * 1.05, t1: 0, t2: 0, tEnd: 0, touches: 3, slopeAtr: 0.1, dir: "up" } };
    const a = advise(base(daily, { verdict: "SELL", lines, holding: { quantity: 1, investedUsd: 50 } }))!;
    expect(a.action).toBe("sellPart");
    expect(["avoid", "noEdge"]).toContain(a.forNewMoney);
  });

  it("owners with a big gain in an overheated market are told to take some profit", () => {
    const daily = series((i) => (i < 860 ? 100 : 100 * 1.012 ** (i - 859)));
    const a = advise(base(daily, { holding: { quantity: 1, investedUsd: 60 } }))!;
    expect(a.holding!.gainPct).toBeGreaterThan(50);
    expect(a.action).toBe("takeProfit");
  });

  it("without a buy price there is no gain % and no take-profit; the value is after the selling cost", () => {
    const daily = series((i) => (i < 860 ? 100 : 100 * 1.012 ** (i - 859)));
    const a = advise(base(daily, { holding: { quantity: 2, investedUsd: null, sellCost: 0.005 } }))!;
    expect(a.holding!.gainPct).toBeNull();
    expect(a.action).not.toBe("takeProfit");
    expect(a.holding!.valueUsd).toBeCloseTo(2 * a.close * 0.995, 6);
  });

  it("confidence is never high, and re-check dates are in the future", () => {
    const a = advise(base(series(wavy), { verdict: "BUY" }))!;
    expect(["low", "medium"]).toContain(a.confidence);
    expect(a.recheckAt).toBeGreaterThan(NOW - DAY);
  });
});

describe("chart patterns", () => {
  it("finds a breakout to a new 20-day high and only labels a lean with enough cases", () => {
    const daily = series((i) => (i < 880 ? 100 + Math.sin(i / 3) : 110));
    const { flags } = detectAll(daily);
    expect(flags.get("breakoutHigh")?.includes(880)).toBe(true);
    const act = activePatterns(daily, NOW, 25);
    expect(act.some((p) => p.id === "breakoutHigh")).toBe(true);
    expect(leanOf({ n: 5, up: 5, median: 0.1, baseUp: 0.5, baseMedian: 0 })).toBe("rare");
    expect(leanOf({ n: 20, up: 15, median: 0.1, baseUp: 0.5, baseMedian: 0 })).toBe("up");
    expect(leanOf({ n: 20, up: 11, median: 0.1, baseUp: 0.5, baseMedian: 0 })).toBe("none");
  });
});
