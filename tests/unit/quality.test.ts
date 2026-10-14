import { describe, expect, it } from "vitest";
import { checkCandleQuality, closedOnly, isFresh, normalizeCandles } from "@/lib/market/quality";
import { candlesFromCloses, H } from "../helpers";

const now = Date.UTC(2024, 0, 1) + 100 * H + 60_000; // 1 minute after candle 99 closed

describe("data quality", () => {
  const base = candlesFromCloses(Array.from({ length: 100 }, (_, i) => 100 + i));

  it("accepts a clean, fresh series", () => {
    const { report, candles } = checkCandleQuality(base, { timeframe: "1h", now, minCandles: 50 });
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    expect(candles.length).toBe(100);
  });

  it("excludes the in-progress candle from analysis", () => {
    const withLive = candlesFromCloses(Array.from({ length: 101 }, (_, i) => 100 + i));
    const { candles } = checkCandleQuality(withLive, { timeframe: "1h", now, minCandles: 50 });
    expect(candles.length).toBe(100);
    expect(closedOnly(withLive, now).length).toBe(100);
  });

  it("flags stale data as blocking", () => {
    const { report } = checkCandleQuality(base, { timeframe: "1h", now: now + 5 * H, minCandles: 50 });
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => i.code)).toContain("STALE");
  });

  it("removes exact duplicates with a warning and sorts unsorted input", () => {
    const dup = [...base.slice(0, 50), base[10], ...base.slice(50)].reverse();
    const { report, candles } = checkCandleQuality(dup, { timeframe: "1h", now, minCandles: 50 });
    expect(report.ok).toBe(true);
    expect(candles.length).toBe(100);
    expect(report.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["DUPLICATE", "UNSORTED"]));
  });

  it("detects conflicting duplicates and keeps the latest", () => {
    const changed = { ...base[20], close: base[20].close + 0.5, high: base[20].high + 1 };
    const n = normalizeCandles([...base, changed]);
    expect(n.conflicting).toBe(1);
    expect(n.candles[20].close).toBe(changed.close);
  });

  it("blocks when many candles are missing", () => {
    const gappy = base.filter((_, i) => i % 10 !== 5);
    const { report } = checkCandleQuality(gappy, { timeframe: "1h", now, minCandles: 50 });
    expect(report.gapCount).toBe(10);
    expect(report.ok).toBe(false);
  });

  it("warns (not blocks) on a single missing candle", () => {
    const one = base.filter((_, i) => i !== 40);
    const { report } = checkCandleQuality(one, { timeframe: "1h", now, minCandles: 50 });
    expect(report.ok).toBe(true);
    expect(report.issues[0].code).toBe("GAP");
  });

  it("blocks on zero/negative prices and inconsistent OHLC", () => {
    const bad = base.map((c, i) => (i === 30 ? { ...c, low: -1 } : i === 31 ? { ...c, high: c.close * 0.5 } : c));
    const codes = checkCandleQuality(bad, { timeframe: "1h", now, minCandles: 50 }).report.issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["NON_POSITIVE", "INVALID_OHLC"]));
  });

  it("flags extreme moves as a warning", () => {
    const ext = base.map((c, i) => (i === 60 ? { ...c, high: c.close * 2 } : c));
    const { report } = checkCandleQuality(ext, { timeframe: "1h", now, minCandles: 50 });
    expect(report.issues.find((i) => i.code === "EXTREME_MOVE")?.severity).toBe("warning");
  });

  it("blocks on insufficient history and empty input", () => {
    expect(checkCandleQuality(base.slice(0, 10), { timeframe: "1h", now, minCandles: 50 }).report.issues.map((i) => i.code)).toContain("INSUFFICIENT_HISTORY");
    expect(checkCandleQuality([], { timeframe: "1h", now }).report.issues[0].code).toBe("EMPTY");
  });

  it("isFresh handles missing and old timestamps", () => {
    expect(isFresh(null, 1000)).toBe(false);
    expect(isFresh(new Date(Date.now() - 500), 1000)).toBe(true);
    expect(isFresh(new Date(Date.now() - 5000), 1000)).toBe(false);
  });
});
