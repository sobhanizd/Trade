import { TIMEFRAME_MS, type Candle, type Timeframe } from "./types";

export type IssueSeverity = "blocking" | "warning";
export interface DataIssue {
  code:
    | "EMPTY"
    | "INSUFFICIENT_HISTORY"
    | "STALE"
    | "DUPLICATE"
    | "CONFLICTING_DUPLICATE"
    | "GAP"
    | "INVALID_OHLC"
    | "NON_POSITIVE"
    | "UNSORTED"
    | "EXTREME_MOVE"
    | "ZERO_VOLUME";
  severity: IssueSeverity;
  message: string;
}

export interface QualityReport {
  ok: boolean; // false if any blocking issue
  issues: DataIssue[];
  candleCount: number;
  closedCount: number;
  lastClosedOpenTime: number | null;
  lastClosedCloseTime: number | null;
  gapCount: number;
  checkedAt: number;
}

export interface QualityOptions {
  timeframe: Timeframe;
  now?: number;
  minCandles?: number;
  /** Stale if the last closed candle closed more than this many intervals ago. */
  maxStaleIntervals?: number;
  /** Fraction of missing candles tolerated before blocking. */
  maxGapRatio?: number;
  /** Single-candle range (high/low - 1) considered extreme. */
  extremeMovePct?: number;
}

/**
 * Normalise a raw candle list: sort ascending, remove exact duplicates, and
 * report conflicting duplicates (same openTime, different values). Keeps the
 * LAST occurrence for conflicting duplicates (providers revise the live bar).
 */
export function normalizeCandles(raw: Candle[]): { candles: Candle[]; duplicates: number; conflicting: number; unsorted: boolean } {
  let unsorted = false;
  for (let i = 1; i < raw.length; i++) if (raw[i].openTime < raw[i - 1].openTime) unsorted = true;
  const byTime = new Map<number, Candle>();
  let duplicates = 0;
  let conflicting = 0;
  for (const c of raw) {
    const prev = byTime.get(c.openTime);
    if (prev) {
      duplicates++;
      if (prev.open !== c.open || prev.high !== c.high || prev.low !== c.low || prev.close !== c.close || prev.volume !== c.volume) conflicting++;
    }
    byTime.set(c.openTime, c);
  }
  const candles = [...byTime.values()].sort((a, b) => a.openTime - b.openTime);
  return { candles, duplicates, conflicting, unsorted };
}

/** Only candles whose close time has passed are used for analysis (no repainting). */
export function closedOnly(candles: Candle[], now = Date.now()): Candle[] {
  return candles.filter((c) => c.closeTime < now);
}

export function checkCandleQuality(raw: Candle[], opts: QualityOptions): { report: QualityReport; candles: Candle[] } {
  const now = opts.now ?? Date.now();
  const interval = TIMEFRAME_MS[opts.timeframe];
  const minCandles = opts.minCandles ?? 60;
  const maxStale = opts.maxStaleIntervals ?? 2;
  const maxGapRatio = opts.maxGapRatio ?? 0.02;
  const extreme = opts.extremeMovePct ?? 0.5;
  const issues: DataIssue[] = [];

  if (raw.length === 0) {
    issues.push({ code: "EMPTY", severity: "blocking", message: "No candle data was returned by the provider." });
    return {
      report: { ok: false, issues, candleCount: 0, closedCount: 0, lastClosedOpenTime: null, lastClosedCloseTime: null, gapCount: 0, checkedAt: now },
      candles: [],
    };
  }

  const norm = normalizeCandles(raw);
  if (norm.unsorted) issues.push({ code: "UNSORTED", severity: "warning", message: "Candles arrived out of order and were re-sorted." });
  if (norm.duplicates - norm.conflicting > 0)
    issues.push({ code: "DUPLICATE", severity: "warning", message: `${norm.duplicates - norm.conflicting} exact duplicate candle(s) removed.` });
  if (norm.conflicting > 0)
    issues.push({
      code: "CONFLICTING_DUPLICATE",
      severity: norm.conflicting > 2 ? "blocking" : "warning",
      message: `${norm.conflicting} candle(s) had conflicting duplicate values; the latest version was kept.`,
    });

  const candles = norm.candles;
  let invalid = 0;
  let nonPositive = 0;
  let extremeCount = 0;
  let zeroVol = 0;
  for (const c of candles) {
    const vals = [c.open, c.high, c.low, c.close];
    if (vals.some((v) => !Number.isFinite(v) || v <= 0) || !Number.isFinite(c.volume) || c.volume < 0) {
      nonPositive++;
      continue;
    }
    if (c.high < Math.max(c.open, c.close) || c.low > Math.min(c.open, c.close) || c.high < c.low) invalid++;
    if (c.low > 0 && c.high / c.low - 1 > extreme) extremeCount++;
    if (c.volume === 0) zeroVol++;
  }
  if (nonPositive > 0) issues.push({ code: "NON_POSITIVE", severity: "blocking", message: `${nonPositive} candle(s) contain zero, negative or non-numeric prices/volume.` });
  if (invalid > 0) issues.push({ code: "INVALID_OHLC", severity: "blocking", message: `${invalid} candle(s) have inconsistent OHLC values (e.g. high below close).` });
  if (extremeCount > 0)
    issues.push({ code: "EXTREME_MOVE", severity: "warning", message: `${extremeCount} candle(s) moved more than ${Math.round(extreme * 100)}% within a single bar. Verify before acting.` });
  if (zeroVol > candles.length * 0.1)
    issues.push({ code: "ZERO_VOLUME", severity: "warning", message: `${zeroVol} candle(s) reported zero volume — liquidity may be poor.` });

  // Gaps (missing intervals). Weekly candles on providers align to Monday; tolerate ±1 day drift.
  let gapCount = 0;
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].openTime - candles[i - 1].openTime;
    if (diff > interval * 1.5) gapCount += Math.round(diff / interval) - 1;
  }
  const expected = candles.length + gapCount;
  if (gapCount > 0) {
    issues.push({
      code: "GAP",
      severity: gapCount / expected > maxGapRatio ? "blocking" : "warning",
      message: `${gapCount} missing candle(s) detected in the series.`,
    });
  }

  const closed = closedOnly(candles, now);
  const last = closed[closed.length - 1];
  if (closed.length < minCandles) {
    issues.push({
      code: "INSUFFICIENT_HISTORY",
      severity: "blocking",
      message: `Only ${closed.length} closed candle(s) available; at least ${minCandles} are required for reliable indicators.`,
    });
  }
  if (last && now - last.closeTime > interval * maxStale) {
    const mins = Math.round((now - last.closeTime) / 60000);
    issues.push({ code: "STALE", severity: "blocking", message: `Latest closed candle ended ${mins} minutes ago — data is stale.` });
  }

  return {
    report: {
      ok: !issues.some((i) => i.severity === "blocking"),
      issues,
      candleCount: candles.length,
      closedCount: closed.length,
      lastClosedOpenTime: last?.openTime ?? null,
      lastClosedCloseTime: last?.closeTime ?? null,
      gapCount,
      checkedAt: now,
    },
    candles: closed,
  };
}

/** Freshness of a provider timestamp (e.g. CoinGecko last_updated). */
export function isFresh(timestamp: string | number | Date | null | undefined, maxAgeMs: number, now = Date.now()): boolean {
  if (!timestamp) return false;
  const t = new Date(timestamp).getTime();
  return Number.isFinite(t) && now - t <= maxAgeMs;
}
