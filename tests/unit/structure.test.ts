import { describe, expect, it } from "vitest";
import { linkMoves, rateNews, urgentItems } from "@/lib/analysis/news";
import { analogs, bigMoves, direction, scenarios, trendLines } from "@/lib/analysis/structure";
import type { Candle } from "@/lib/market/types";

const DAY = 86_400_000;
const T0 = Date.UTC(2020, 0, 1);
/** Daily candles from closes; high/low ±1% around the close. */
function candles(closes: number[]): Candle[] {
  return closes.map((c, i) => ({ openTime: T0 + i * DAY, closeTime: T0 + (i + 1) * DAY - 1, open: i ? closes[i - 1] : c, high: c * 1.01, low: c * 0.99, close: c, volume: 1 }));
}
const NOW = (n: number) => T0 + n * DAY + 1;
/** Zigzag around a line: base + slope*i with a 12-day wave. */
const zig = (n: number, base: number, slope: number, amp: number) => Array.from({ length: n }, (_, i) => base + slope * i + amp * Math.sin((i / 12) * 2 * Math.PI));

describe("trend lines", () => {
  it("finds a rising channel in a rising zigzag", () => {
    const cs = candles(zig(200, 100, 0.5, 6));
    const tl = trendLines(cs, NOW(200));
    expect(tl.support?.dir).toBe("up");
    expect(tl.resistance?.dir).toBe("up");
    expect(tl.pattern).toBe("upChannel");
    expect(tl.brokeSupport).toBe(false);
  });

  it("flags a close below a rising floor line", () => {
    const closes = zig(200, 100, 0.5, 6);
    closes.push(closes[closes.length - 1] * 0.8);
    const tl = trendLines(candles(closes), NOW(201));
    expect(tl.brokeSupport).toBe(true);
  });

  it("finds a falling channel in a falling zigzag", () => {
    const tl = trendLines(candles(zig(200, 300, -0.5, 6)), NOW(200));
    expect(tl.pattern).toBe("downChannel");
  });

  it("ignores the candle that is still forming", () => {
    const cs = candles(zig(200, 100, 0.5, 6));
    cs[cs.length - 1] = { ...cs[cs.length - 1], close: 1, low: 1 };
    expect(trendLines(cs, cs[cs.length - 1].openTime + 1).brokeSupport).toBe(false);
  });
});

describe("direction", () => {
  it("is bullish in a steady rise and bearish in a steady fall", () => {
    const up = direction(candles(Array.from({ length: 300 }, (_, i) => 100 * 1.005 ** i)), NOW(300));
    expect(up?.overall).toBe("bull");
    expect(up?.long).toBe("up");
    const down = direction(candles(Array.from({ length: 300 }, (_, i) => 100 * 0.995 ** i)), NOW(300));
    expect(down?.overall).toBe("bear");
    expect(down?.ret30).toBeLessThan(0);
  });

  it("needs enough history", () => {
    expect(direction(candles([1, 2, 3]), NOW(3))).toBeNull();
  });
});

describe("similar moments (analogs)", () => {
  it("returns spaced-out past cases with known 30-day outcomes", () => {
    const cs = candles(zig(1200, 100, 0.05, 10));
    const a = analogs(cs, NOW(1200), { count: 10, gap: 20 })!;
    expect(a.cases.length).toBe(10);
    const times = a.cases.map((c) => c.time).sort((x, y) => x - y);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(20 * DAY);
    expect(a.cases.every((c) => c.after30 !== null && c.time < NOW(1200) - 60 * DAY)).toBe(true);
    expect(a.h30!.n).toBe(10);
    expect(a.h30!.baseUp).toBeGreaterThan(0);
  });

  it("matches a repeating wave at the same phase", () => {
    // A perfect 24-day wave: similar moments are 24 days apart multiples, so their 7-day outcome equals today's.
    const cs = candles(Array.from({ length: 1000 }, (_, i) => 100 + 10 * Math.sin((i / 24) * 2 * Math.PI)));
    const a = analogs(cs, NOW(1000), { count: 8, gap: 20 })!;
    const outcomes = a.cases.map((c) => c.after7!);
    expect(Math.max(...outcomes) - Math.min(...outcomes)).toBeLessThan(0.02);
  });
});

describe("big moves and scenarios", () => {
  it("detects an unusually large day", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 ? 0.5 : -0.5));
    closes.push(112);
    const moves = bigMoves(candles(closes), 30, NOW(61));
    expect(moves).toHaveLength(1);
    expect(moves[0].changePct).toBeGreaterThan(10);
  });

  it("picks the nearest levels above and below", () => {
    const sc = scenarios(100, { support: null, resistance: null, pattern: "none", brokeSupport: false, brokeResistance: false }, [95, 80, 99.5], [104, 120, 104.5]);
    expect(sc.upTrigger).toBe(104);
    expect(sc.upNext).toBe(120);
    expect(sc.downTrigger).toBe(99.5);
    expect(sc.downNext).toBe(95);
  });
});

describe("news importance", () => {
  const base = { id: "1", url: "https://x.test/a", source: "Test", publishedAt: new Date(), kind: "NEWS" };
  it("rates a hack about the coin as serious", () => {
    expect(rateNews({ ...base, title: "Bitcoin bridge hacked, $50M stolen", assets: ["BTC"], tags: ["Security incident"] }, "BTC")?.level).toBe("high");
  });
  it("treats macro news as market-wide and medium", () => {
    const r = rateNews({ ...base, title: "Bitcoin waits for US CPI inflation data", assets: [], tags: ["Macro"] }, "ETH");
    expect(r?.level).toBe("medium");
    expect(r?.aboutCoin).toBe(false);
  });
  it("ignores unrelated news and downgrades opinion", () => {
    expect(rateNews({ ...base, title: "Solana upgrade ships", assets: ["SOL"], tags: ["Network event"] }, "BTC")).toBeNull();
    expect(rateNews({ ...base, kind: "OPINION", title: "Why ETH ETF could rally?", assets: ["ETH"], tags: ["ETF"] }, "ETH")?.level).toBe("low");
  });
  it("links headlines to big-move days and finds urgent items", () => {
    const now = Date.UTC(2026, 9, 12, 12);
    const news = [rateNews({ ...base, publishedAt: new Date(now - 3_600_000), title: "Exchange hack drains ETH wallets", assets: ["ETH"], tags: ["Security incident"] }, "ETH")!];
    expect(linkMoves([{ time: Date.UTC(2026, 9, 12), changePct: -9 }], news)[0].news).toHaveLength(1);
    const urgent = urgentItems(news, -12, 3, now);
    expect(urgent.map((u) => u.kind)).toEqual(["move", "news"]);
    expect(urgentItems(news, -5, 3, now + 2 * DAY)).toHaveLength(0);
  });
});
