export const TIMEFRAMES = ["1h", "4h", "1d", "1w"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};

export const TIMEFRAME_LABEL: Record<Timeframe, string> = {
  "1h": "1 hour",
  "4h": "4 hours",
  "1d": "1 day",
  "1w": "1 week",
};

export function isTimeframe(v: unknown): v is Timeframe {
  return typeof v === "string" && (TIMEFRAMES as readonly string[]).includes(v);
}

/** Normalised OHLCV candle. Times are epoch milliseconds (UTC). */
export interface Candle {
  openTime: number;
  closeTime: number; // inclusive end: openTime + interval - 1
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // base-asset volume
}

export interface AssetRef {
  symbol: string;
  binanceSymbol?: string | null;
  krakenPair?: string | null;
}

export interface CandleRequest {
  asset: AssetRef;
  timeframe: Timeframe;
  /** Inclusive start (ms). If omitted, the most recent `limit` candles. */
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface CandleProvider {
  id: string;
  /** Whether this provider can serve this asset/timeframe at all. */
  supports(asset: AssetRef, timeframe: Timeframe): boolean;
  fetchCandles(req: CandleRequest): Promise<Candle[]>;
  /** Max candles per single request. */
  maxPerRequest: number;
  /** Whether arbitrary historical ranges are available (for backtests). */
  supportsHistoricalRange: boolean;
}

export interface MarketRow {
  symbol: string;
  coingeckoId: string;
  name: string;
  currency: "usd" | "eur";
  price: number | null;
  marketCap: number | null;
  marketCapRank: number | null;
  volume24h: number | null;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  high24h: number | null;
  low24h: number | null;
  lastUpdated: string | null; // provider timestamp ISO
  image?: string | null;
}

export interface GlobalMarket {
  totalMarketCapUsd: number | null;
  totalVolumeUsd: number | null;
  marketCapChange24hPct: number | null;
  btcDominancePct: number | null;
  ethDominancePct: number | null;
  updatedAt: string | null;
}

export interface SentimentReading {
  value: number; // 0-100
  classification: string;
  timestamp: string;
  source: string;
}
