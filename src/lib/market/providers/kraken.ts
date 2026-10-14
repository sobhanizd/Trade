import { fetchJson, HttpError } from "@/lib/http";
import { TIMEFRAME_MS, type Candle, type CandleProvider, type CandleRequest, type Timeframe } from "../types";

const BASE = "https://api.kraken.com/0/public";
// Kraken's native weekly candles start on Thursday (Binance and most charts use Monday),
// so weekly candles are built from daily ones instead — see weeklyFromDaily.
const INTERVAL_MIN: Record<Timeframe, number> = { "1h": 60, "4h": 240, "1d": 1440, "1w": 1440 };
const DAY = 86_400_000;
const WEEK = 7 * DAY;
// 1970-01-05 was a Monday.
const MONDAY0 = 4 * DAY;

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

/**
 * Aggregate daily candles into Monday-00:00-UTC weeks (the Binance convention).
 * Weeks missing their first day are dropped so no partial week poses as a full one;
 * the current (in-progress) week is kept, like any live candle.
 */
export function weeklyFromDaily(daily: Candle[]): Candle[] {
  const weeks = new Map<number, Candle[]>();
  for (const d of daily) {
    const start = d.openTime - ((((d.openTime - MONDAY0) % WEEK) + WEEK) % WEEK);
    const w = weeks.get(start);
    if (w) w.push(d);
    else weeks.set(start, [d]);
  }
  const out: Candle[] = [];
  for (const [start, days] of [...weeks.entries()].sort((a, b) => a[0] - b[0])) {
    days.sort((a, b) => a.openTime - b.openTime);
    if (days[0].openTime !== start) continue;
    out.push({
      openTime: start,
      closeTime: start + WEEK - 1,
      open: days[0].open,
      high: Math.max(...days.map((x) => x.high)),
      low: Math.min(...days.map((x) => x.low)),
      close: days[days.length - 1].close,
      volume: days.reduce((sum, x) => sum + x.volume, 0),
    });
  }
  return out;
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
      let candles = req.timeframe === "1w" ? weeklyFromDaily(parseKrakenOhlc(res, "1d")) : parseKrakenOhlc(res, req.timeframe);
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

type KrakenTicker = { c?: [string, string] };

/** Kraken answers with its own pair keys (XBTUSD → XXBTZUSD, ETHUSD → XETHZUSD, ADAUSD → ADAUSD). */
function tickerFor(result: Record<string, unknown>, pair: string): KrakenTicker | undefined {
  const keys = [pair, `X${pair.slice(0, -3)}Z${pair.slice(-3)}`];
  const k = keys.find((x) => x in result);
  return k ? (result[k] as KrakenTicker) : undefined;
}

/** Last trade price for several pairs in one call. Pairs Kraken does not return are omitted. */
export async function fetchKrakenPrices(pairs: string[], fetchImpl?: typeof fetch): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!pairs.length) return out;
  const res = await fetchJson<KrakenResponse>(`${BASE}/Ticker?pair=${pairs.map(encodeURIComponent).join(",")}`, { label: "kraken.ticker", fetchImpl, retries: 1 });
  if (res.error?.length) throw new HttpError(`kraken: ${res.error.join(", ")}`, null, false);
  for (const p of pairs) {
    const price = Number(tickerFor(res.result ?? {}, p)?.c?.[0]);
    if (Number.isFinite(price) && price > 0) out.set(p, price);
  }
  return out;
}
