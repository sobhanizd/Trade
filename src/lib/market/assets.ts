import { db } from "@/lib/db";
import { fetchJson } from "@/lib/http";
import { logger } from "@/lib/logger";
import type { UserSettingsData } from "@/lib/settings/schema";
import { binanceSymbolStatus } from "./providers/binance";
import { fetchTopMarkets } from "./providers/coingecko";
import { defaultKrakenPair, krakenPairExists } from "./providers/kraken";
import { fetchRecentCandles } from "./candles";
import type { AssetRef } from "./types";

export const DEFAULT_ASSETS = [
  { symbol: "BTC", name: "Bitcoin", coingeckoId: "bitcoin", binanceSymbol: "BTCUSDT", krakenPair: "XBTUSD" },
  { symbol: "ETH", name: "Ethereum", coingeckoId: "ethereum", binanceSymbol: "ETHUSDT", krakenPair: "ETHUSD" },
  { symbol: "SOL", name: "Solana", coingeckoId: "solana", binanceSymbol: "SOLUSDT", krakenPair: "SOLUSD" },
  { symbol: "XRP", name: "XRP", coingeckoId: "ripple", binanceSymbol: "XRPUSDT", krakenPair: "XRPUSD" },
  { symbol: "BNB", name: "BNB", coingeckoId: "binancecoin", binanceSymbol: "BNBUSDT", krakenPair: "BNBUSD" },
];

/** Stablecoins and wrapped tokens track other assets; technical signals on them are meaningless. */
const EXCLUDED = new Set(["USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "USDS", "PYUSD", "USDD", "BUSD", "WBTC", "WETH", "STETH", "WSTETH", "WEETH", "CBBTC", "USD1", "RLUSD", "EURC"]);

export async function ensureDefaultAssets() {
  for (const a of DEFAULT_ASSETS) {
    await db().asset.upsert({ where: { symbol: a.symbol }, create: a, update: {} });
  }
}

export interface AssetValidation {
  ok: boolean;
  checks: { label: string; passed: boolean; detail: string }[];
  checkedAt: string;
}

/**
 * Resolve a ticker to a specific coin and validate it against the user's
 * liquidity & data-quality filters before it can be added to the watchlist.
 */
export async function resolveAsset(
  rawSymbol: string,
  filters: UserSettingsData["liquidity"],
): Promise<{ asset?: { symbol: string; name: string; coingeckoId: string; binanceSymbol: string | null; krakenPair: string | null; marketCapRank: number | null }; validation: AssetValidation }> {
  const symbol = rawSymbol.trim().toUpperCase();
  const checks: AssetValidation["checks"] = [];
  const done = (ok: boolean) => ({ ok, checks, checkedAt: new Date().toISOString() });
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
    checks.push({ label: "Symbol format", passed: false, detail: "Use 2–10 letters/digits, e.g. ADA." });
    return { validation: done(false) };
  }
  if (EXCLUDED.has(symbol)) {
    checks.push({ label: "Asset type", passed: false, detail: "Stablecoins and wrapped tokens are excluded — they track another asset's price." });
    return { validation: done(false) };
  }

  const top = await fetchTopMarkets();
  const match = top.filter((m) => m.symbol === symbol).sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))[0];
  if (!match) {
    checks.push({ label: "Market-cap ranking", passed: false, detail: "Not among the top 250 coins by market cap on CoinGecko (liquidity filter)." });
    return { validation: done(false) };
  }
  checks.push({ label: "Coin identified", passed: true, detail: `${match.name} (CoinGecko id "${match.coingeckoId}", rank #${match.marketCapRank ?? "?"})` });
  const mcOk = (match.marketCap ?? 0) >= filters.minMarketCapUsd;
  checks.push({ label: "Minimum market cap", passed: mcOk, detail: `$${fmtBig(match.marketCap)} vs required $${fmtBig(filters.minMarketCapUsd)}` });
  const volOk = (match.volume24h ?? 0) >= filters.minVolume24hUsd;
  checks.push({ label: "Minimum 24h volume", passed: volOk, detail: `$${fmtBig(match.volume24h)} vs required $${fmtBig(filters.minVolume24hUsd)}` });

  const binanceSymbol = `${symbol}USDT`;
  const bStatus = await binanceSymbolStatus(binanceSymbol).catch(() => "NOT_FOUND" as const);
  const kPair = defaultKrakenPair(symbol);
  const kOk = await krakenPairExists(kPair).catch(() => false);
  const providers = [bStatus === "TRADING" ? `Binance ${binanceSymbol}` : null, kOk ? `Kraken ${kPair}` : null].filter(Boolean);
  checks.push({ label: "Candle data available", passed: providers.length > 0, detail: providers.length ? providers.join(", ") : "No supported exchange lists a USD(T) pair for this coin." });

  let historyOk = false;
  if (providers.length) {
    const ref: AssetRef = { symbol, binanceSymbol: bStatus === "TRADING" ? binanceSymbol : null, krakenPair: kOk ? kPair : null };
    try {
      const res = await fetchRecentCandles(ref, "1d", 1000);
      historyOk = res.candles.length >= filters.minHistoryDays;
      checks.push({ label: "Price history", passed: historyOk, detail: `${res.candles.length} daily candles (${res.provider}); required ${filters.minHistoryDays}` });
    } catch (e) {
      checks.push({ label: "Price history", passed: false, detail: e instanceof Error ? e.message : "fetch failed" });
    }
  }
  const ok = mcOk && volOk && providers.length > 0 && historyOk;
  return {
    asset: {
      symbol,
      name: match.name,
      coingeckoId: match.coingeckoId,
      binanceSymbol: bStatus === "TRADING" ? binanceSymbol : null,
      krakenPair: kOk ? kPair : null,
      marketCapRank: match.marketCapRank,
    },
    validation: done(ok),
  };
}

function fmtBig(v: number | null | undefined) {
  if (v === null || v === undefined) return "n/a";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toLocaleString("en-US");
}

/** Latest traded price from public tickers (Binance → Kraken). */
export async function fetchLivePrice(asset: AssetRef): Promise<{ price: number; source: string; at: string }> {
  if (asset.binanceSymbol) {
    try {
      const r = await fetchJson<{ price: string }>(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(asset.binanceSymbol)}`, {
        label: "binance.ticker",
        retries: 1,
      });
      const price = Number(r.price);
      if (price > 0) return { price, source: `Binance ${asset.binanceSymbol}`, at: new Date().toISOString() };
    } catch (e) {
      logger.warn("binance ticker failed", { error: e });
    }
  }
  if (asset.krakenPair) {
    const r = await fetchJson<{ error: string[]; result: Record<string, { c: [string, string] }> }>(
      `https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(asset.krakenPair)}`,
      { label: "kraken.ticker", retries: 1 },
    );
    const first = Object.values(r.result ?? {})[0];
    const price = Number(first?.c?.[0]);
    if (price > 0) return { price, source: `Kraken ${asset.krakenPair}`, at: new Date().toISOString() };
  }
  throw new Error(`No live price available for ${asset.symbol}`);
}
