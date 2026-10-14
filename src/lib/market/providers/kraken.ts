import { fetchJson, HttpError } from "@/lib/http";
import { TIMEFRAME_MS, type Candle, type CandleProvider, type CandleRequest, type Timeframe } from "../types";

const BASE = "https://api.kraken.com/0/public";
const INTERVAL_MIN: Record<Timeframe, number> = { "1h": 60, "4h": 240, "1d": 1440, "1w": 10080 };

type KrakenResponse = { error: string[]; result: Record<string, unknown> & { last?: number } };

export function parseKrakenOhlc(res: KrakenResponse, timeframe: Timeframe): Candle[] {
  if (res.error?.length) throw new HttpError(`kraken: ${res.error.join(", ")}`, null, false);
  const key = Object.keys(res.result).find((k) => k !== "last");
  if (!key) return [];
  const rows = res.result[key] as [number, string, string, string, string, string, string, number][];
  const ms = TIMEFRAME_MS[timeframe];
  return rows.map((r) => ({
    openTime: r[0] * 1000,
    closeTime: r[0] * 1000 + ms - 1,
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[6]),
  }));
}

/** Kraken uses XBT for bitcoin; quote is USD (not USDT). */
export function defaultKrakenPair(symbol: string): string {
  return `${symbol === "BTC" ? "XBT" : symbol}USD`;
}

export function createKrakenProvider(fetchImpl?: typeof fetch): CandleProvider {
  return {
    id: "kraken",
    maxPerRequest: 720,
    // Kraken OHLC only returns the most recent 720 candles.
    supportsHistoricalRange: false,
    supports: (asset) => Boolean(asset.krakenPair),
    async fetchCandles(req: CandleRequest): Promise<Candle[]> {
      const pair = req.asset.krakenPair;
      if (!pair) throw new HttpError("kraken: asset has no Kraken pair", null, false);
      const params = new URLSearchParams({ pair, interval: String(INTERVAL_MIN[req.timeframe]) });
      if (req.startTime !== undefined) params.set("since", String(Math.floor(req.startTime / 1000) - 1));
      const res = await fetchJson<KrakenResponse>(`${BASE}/OHLC?${params}`, { label: "kraken.ohlc", fetchImpl, retries: 1 });
      let candles = parseKrakenOhlc(res, req.timeframe);
      if (req.endTime !== undefined) candles = candles.filter((c) => c.openTime <= req.endTime!);
      if (req.limit) candles = candles.slice(-req.limit);
      return candles;
    },
  };
}

export async function krakenPairExists(pair: string, fetchImpl?: typeof fetch): Promise<boolean> {
  const res = await fetchJson<KrakenResponse>(`${BASE}/AssetPairs?pair=${encodeURIComponent(pair)}`, { label: "kraken.pairs", fetchImpl, retries: 1 }).catch(
    () => null,
  );
  return Boolean(res && !res.error?.length && Object.keys(res.result ?? {}).length > 0);
}
