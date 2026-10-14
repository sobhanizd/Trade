import { createRateLimiter, fetchJson } from "@/lib/http";
import type { GlobalMarket, MarketRow } from "../types";

/**
 * CoinGecko public API. Keyless use is heavily rate-limited (roughly 5–15
 * calls/min, varies); a free Demo key allows ~30 calls/min and a monthly cap.
 * We serialise calls and cache aggressively (snapshots are stored in the DB).
 */
function config() {
  const key = process.env.COINGECKO_API_KEY?.trim();
  const pro = process.env.COINGECKO_API_PLAN === "pro";
  return {
    base: key && pro ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3",
    headers: key ? { [pro ? "x-cg-pro-api-key" : "x-cg-demo-api-key"]: key } : ({} as Record<string, string>),
    minIntervalMs: key ? 2_100 : 6_000,
  };
}

let limiter: ReturnType<typeof createRateLimiter> | null = null;
function limited<T>(fn: () => Promise<T>) {
  if (!limiter) limiter = createRateLimiter(config().minIntervalMs);
  return limiter(fn);
}

function get<T>(path: string, label: string, fetchImpl?: typeof fetch): Promise<T> {
  const c = config();
  return limited(() => fetchJson<T>(`${c.base}${path}`, { headers: c.headers, label, fetchImpl, retries: 2, timeoutMs: 15_000 }));
}

interface CgMarket {
  id: string;
  symbol: string;
  name: string;
  image?: string;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  total_volume: number | null;
  high_24h: number | null;
  low_24h: number | null;
  last_updated: string | null;
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function mapCgMarket(m: CgMarket, currency: "usd" | "eur"): MarketRow {
  return {
    symbol: m.symbol.toUpperCase(),
    coingeckoId: m.id,
    name: m.name,
    currency,
    price: num(m.current_price),
    marketCap: num(m.market_cap),
    marketCapRank: num(m.market_cap_rank),
    volume24h: num(m.total_volume),
    change1h: num(m.price_change_percentage_1h_in_currency),
    change24h: num(m.price_change_percentage_24h_in_currency),
    change7d: num(m.price_change_percentage_7d_in_currency),
    change30d: num(m.price_change_percentage_30d_in_currency),
    high24h: num(m.high_24h),
    low24h: num(m.low_24h),
    lastUpdated: m.last_updated,
    image: m.image ?? null,
  };
}

export async function fetchMarkets(ids: string[], currency: "usd" | "eur", fetchImpl?: typeof fetch): Promise<MarketRow[]> {
  if (ids.length === 0) return [];
  const params = new URLSearchParams({
    vs_currency: currency,
    ids: ids.join(","),
    price_change_percentage: "1h,24h,7d,30d",
    per_page: "250",
    sparkline: "false",
  });
  const rows = await get<CgMarket[]>(`/coins/markets?${params}`, "coingecko.markets", fetchImpl);
  return rows.map((r) => mapCgMarket(r, currency));
}

/** Top coins by market cap — used to resolve a ticker symbol to a CoinGecko id safely. */
let topCache: { at: number; rows: MarketRow[] } | null = null;
export async function fetchTopMarkets(fetchImpl?: typeof fetch): Promise<MarketRow[]> {
  if (topCache && Date.now() - topCache.at < 60 * 60_000) return topCache.rows;
  const params = new URLSearchParams({ vs_currency: "usd", order: "market_cap_desc", per_page: "250", page: "1", price_change_percentage: "24h" });
  const rows = (await get<CgMarket[]>(`/coins/markets?${params}`, "coingecko.top", fetchImpl)).map((r) => mapCgMarket(r, "usd"));
  topCache = { at: Date.now(), rows };
  return rows;
}

export async function fetchGlobal(fetchImpl?: typeof fetch): Promise<GlobalMarket> {
  const res = await get<{
    data: {
      total_market_cap?: Record<string, number>;
      total_volume?: Record<string, number>;
      market_cap_change_percentage_24h_usd?: number;
      market_cap_percentage?: Record<string, number>;
      updated_at?: number;
    };
  }>("/global", "coingecko.global", fetchImpl);
  const d = res.data ?? {};
  return {
    totalMarketCapUsd: num(d.total_market_cap?.usd),
    totalVolumeUsd: num(d.total_volume?.usd),
    marketCapChange24hPct: num(d.market_cap_change_percentage_24h_usd),
    btcDominancePct: num(d.market_cap_percentage?.btc),
    ethDominancePct: num(d.market_cap_percentage?.eth),
    updatedAt: d.updated_at ? new Date(d.updated_at * 1000).toISOString() : null,
  };
}
