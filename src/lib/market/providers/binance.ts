import { fetchJson, HttpError } from "@/lib/http";
import type { Candle, CandleProvider, CandleRequest, Timeframe } from "../types";

// Public market-data endpoints only. No API key, no account endpoints.
const HOSTS = ["https://api.binance.com", "https://data-api.binance.vision"];

type RawKline = [number, string, string, string, string, string, number, ...unknown[]];

export function parseBinanceKlines(rows: RawKline[]): Candle[] {
  return rows.map((r) => ({
    openTime: Number(r[0]),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
    closeTime: Number(r[6]),
  }));
}

export function createBinanceProvider(fetchImpl?: typeof fetch): CandleProvider {
  return {
    id: "binance",
    maxPerRequest: 1000,
    supportsHistoricalRange: true,
    supports: (asset, _tf: Timeframe) => Boolean(asset.binanceSymbol),
    async fetchCandles(req: CandleRequest): Promise<Candle[]> {
      const symbol = req.asset.binanceSymbol;
      if (!symbol) throw new HttpError("binance: asset has no Binance symbol", null, false);
      const params = new URLSearchParams({ symbol, interval: req.timeframe, limit: String(Math.min(req.limit ?? 500, 1000)) });
      if (req.startTime !== undefined) params.set("startTime", String(req.startTime));
      if (req.endTime !== undefined) params.set("endTime", String(req.endTime));
      let lastErr: unknown;
      for (const host of HOSTS) {
        try {
          const rows = await fetchJson<RawKline[]>(`${host}/api/v3/klines?${params}`, { label: "binance.klines", fetchImpl, retries: 1 });
          if (!Array.isArray(rows)) throw new HttpError("binance: unexpected response shape", null, false);
          return parseBinanceKlines(rows);
        } catch (e) {
          lastErr = e;
          // 400 = bad symbol: don't try the mirror.
          if (e instanceof HttpError && e.status === 400) break;
        }
      }
      throw lastErr;
    },
  };
}

/** Latest trade price for several symbols in one call. */
export async function fetchBinancePrices(symbols: string[], fetchImpl?: typeof fetch): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!symbols.length) return out;
  const q = encodeURIComponent(JSON.stringify(symbols));
  let lastErr: unknown;
  for (const host of HOSTS) {
    try {
      const rows = await fetchJson<{ symbol: string; price: string }[]>(`${host}/api/v3/ticker/price?symbols=${q}`, { label: "binance.price", fetchImpl, retries: 1 });
      if (!Array.isArray(rows)) throw new HttpError("binance: unexpected response shape", null, false);
      for (const r of rows) {
        const price = Number(r.price);
        if (Number.isFinite(price) && price > 0) out.set(r.symbol, price);
      }
      return out;
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status === 400) break;
    }
  }
  throw lastErr;
}

/** Validate that a symbol exists and is trading on Binance (public exchangeInfo). */
export async function binanceSymbolStatus(symbol: string, fetchImpl?: typeof fetch): Promise<"TRADING" | "NOT_TRADING" | "NOT_FOUND"> {
  try {
    const info = await fetchJson<{ symbols: { symbol: string; status: string }[] }>(
      `${HOSTS[0]}/api/v3/exchangeInfo?symbol=${encodeURIComponent(symbol)}`,
      { label: "binance.exchangeInfo", fetchImpl, retries: 1 },
    );
    const s = info.symbols?.find((x) => x.symbol === symbol);
    if (!s) return "NOT_FOUND";
    return s.status === "TRADING" ? "TRADING" : "NOT_TRADING";
  } catch (e) {
    if (e instanceof HttpError && e.status === 400) return "NOT_FOUND";
    throw e;
  }
}
