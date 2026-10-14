import { ema, realizedVolatility, sma } from "@/lib/indicators";
import type { Candle } from "./types";

export type TrendLabel = "Uptrend" | "Downtrend" | "Mixed / sideways" | "Unknown";

export interface AssetTrend {
  symbol: string;
  label: TrendLabel;
  close: number | null;
  ema50: number | null;
  sma200: number | null;
  asOf: number | null;
}

/** Daily trend: price vs EMA50 vs SMA200. Documented in docs/STRATEGIES.md. */
export function dailyTrend(symbol: string, daily: Candle[]): AssetTrend {
  if (daily.length < 60) return { symbol, label: "Unknown", close: null, ema50: null, sma200: null, asOf: null };
  const closes = daily.map((c) => c.close);
  const i = closes.length - 1;
  const e = ema(closes, 50)[i];
  const s = sma(closes, 200)[i];
  const c = closes[i];
  let label: TrendLabel = "Mixed / sideways";
  if (e !== null && s !== null) {
    if (c > e && e > s) label = "Uptrend";
    else if (c < e && e < s) label = "Downtrend";
  } else if (e !== null) label = c > e ? "Uptrend" : "Downtrend";
  return { symbol, label, close: c, ema50: e, sma200: s, asOf: daily[i].closeTime };
}

export type VolLabel = "Low" | "Normal" | "High" | "Unknown";

/** 30-day annualised realised volatility of daily closes. Thresholds: <40% low, 40–75% normal, >75% high. */
export function volatilityRegime(daily: Candle[]): { label: VolLabel; annualizedPct: number | null } {
  const rv = realizedVolatility(daily.map((c) => c.close), 30, 365);
  const v = rv[rv.length - 1] ?? null;
  if (v === null) return { label: "Unknown", annualizedPct: null };
  return { label: v < 40 ? "Low" : v > 75 ? "High" : "Normal", annualizedPct: v };
}

export function overallTrend(trends: AssetTrend[]): TrendLabel {
  const known = trends.filter((t) => t.label !== "Unknown");
  if (!known.length) return "Unknown";
  if (known.every((t) => t.label === "Uptrend")) return "Uptrend";
  if (known.every((t) => t.label === "Downtrend")) return "Downtrend";
  return "Mixed / sideways";
}
