/**
 * Market overview snapshot: prices / % changes / market cap / volume (USD &
 * EUR), global market, sentiment and FX, plus derived trend & volatility.
 * Every watched asset's live price is cross-checked across Binance, Kraken and
 * CoinGecko (kind "PRICECHECK").
 * Also evaluates price alerts and volatility alerts.
 */
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { DEFAULT_ASSETS } from "@/lib/market/assets";
import { loadCandles, syncRecentCandles } from "@/lib/market/candles";
import { priceConsensus, type SourcePrice } from "@/lib/market/crosscheck";
import { fetchBinancePrices } from "@/lib/market/providers/binance";
import { fetchKrakenPrices } from "@/lib/market/providers/kraken";
import { dailyTrend, overallTrend, volatilityRegime } from "@/lib/market/overview";
import { fetchGlobal, fetchMarkets } from "@/lib/market/providers/coingecko";
import { fetchFearGreed, fetchUsdEur } from "@/lib/market/providers/extras";
import { tracked } from "@/lib/market/status";
import type { MarketRow } from "@/lib/market/types";
import { notify } from "@/lib/notifications/dispatch";
import { formatPriceAlert, formatVolatilityAlert } from "@/lib/notifications/format";
import { getSettings } from "@/lib/settings/service";

async function upsertSnapshot(kind: string, key: string, currency: string, data: unknown, source: string, dataTimestamp: string | null, assetId?: string | null) {
  const payload = { data: data as object, source, dataTimestamp: dataTimestamp ? new Date(dataTimestamp) : null, fetchedAt: new Date(), assetId: assetId ?? null };
  await db().marketSnapshot.upsert({ where: { kind_key_currency: { kind, key, currency } }, create: { kind, key, currency, ...payload }, update: payload });
}

export async function runSnapshot(now = new Date()) {
  const watched = await db().asset.findMany({ where: { OR: [{ watchlistItems: { some: {} } }, { symbol: { in: ["BTC", "ETH"] } }] } });
  const ids = watched.map((a) => a.coingeckoId).filter((x): x is string => Boolean(x));
  const stats: Record<string, unknown> = { assets: watched.length };
  const errors: string[] = [];
  let usdRows: MarketRow[] = [];

  // FX first: EUR values are derived from USD × ECB reference rate, which halves CoinGecko usage.
  let fx: { rate: number; date: string; source: string } | null = null;
  try {
    fx = await tracked("frankfurter", () => fetchUsdEur());
    await upsertSnapshot("FX", "USD-EUR", "EUR", fx, fx.source, fx.date);
  } catch (e) {
    errors.push(`fx: ${(e as Error).message}`);
    const prev = await db().marketSnapshot.findUnique({ where: { kind_key_currency: { kind: "FX", key: "USD-EUR", currency: "EUR" } } });
    fx = (prev?.data as typeof fx) ?? null;
  }

  // One CoinGecko markets call per snapshot (USD).
  try {
    usdRows = await tracked("coingecko", () => fetchMarkets(ids, "usd"));
    for (const r of usdRows) {
      const asset = watched.find((a) => a.coingeckoId === r.coingeckoId);
      if (!asset) continue;
      await upsertSnapshot("ASSET", asset.symbol, "USD", r, "CoinGecko /coins/markets", r.lastUpdated, asset.id);
      if (fx) await upsertSnapshot("ASSET", asset.symbol, "EUR", toEur(r, fx), `CoinGecko USD × ECB rate ${fx.rate} (${fx.date})`, r.lastUpdated, asset.id);
    }
    stats.markets = usdRows.length;
  } catch (e) {
    errors.push(`coingecko markets: ${(e as Error).message}`);
  }
  // Cross-check live prices: CoinGecko (aggregate of many exchanges) vs Binance vs Kraken.
  try {
    stats.priceChecks = await crossCheckPrices(watched, usdRows, now);
  } catch (e) {
    errors.push(`price cross-check: ${(e as Error).message}`);
  }
  // Global market data changes slowly: refresh at most every 30 minutes.
  const prevGlobal = await db().marketSnapshot.findUnique({ where: { kind_key_currency: { kind: "GLOBAL", key: "global", currency: "USD" } }, select: { fetchedAt: true } });
  if (!prevGlobal || now.getTime() - prevGlobal.fetchedAt.getTime() > 29 * 60_000) {
    try {
      const g = await tracked("coingecko", () => fetchGlobal());
      await upsertSnapshot("GLOBAL", "global", "USD", g, "CoinGecko /global", g.updatedAt);
    } catch (e) {
      errors.push(`coingecko global: ${(e as Error).message}`);
    }
  }
  if ((process.env.SENTIMENT_ENABLED ?? "true") !== "false") {
    try {
      const s = await tracked("alternative.me", () => fetchFearGreed());
      await upsertSnapshot("SENTIMENT", "fear_greed", "USD", s, s.source, s.timestamp);
    } catch (e) {
      errors.push(`sentiment: ${(e as Error).message}`);
    }
  }
  // Derived daily trend & volatility for BTC/ETH + breadth across the watchlist.
  try {
    const trends = [];
    let vol = null;
    let above = 0;
    let known = 0;
    for (const a of watched) {
      try {
        const synced = await syncRecentCandles(a, "1d", 400);
        const t = dailyTrend(a.symbol, synced.candles.filter((c) => c.closeTime < now.getTime()));
        if (t.label !== "Unknown" && t.ema50 !== null && t.close !== null) {
          known++;
          if (t.close > t.ema50) above++;
        }
        if (a.symbol === "BTC" || a.symbol === "ETH") trends.push(t);
        if (a.symbol === "BTC") vol = volatilityRegime(synced.candles.filter((c) => c.closeTime < now.getTime()));
      } catch (e) {
        errors.push(`daily candles ${a.symbol}: ${(e as Error).message}`);
      }
    }
    await upsertSnapshot(
      "OVERVIEW",
      "market",
      "USD",
      { overall: overallTrend(trends), trends, volatility: vol, breadth: known ? { above, known, pct: (above / known) * 100 } : null },
      "Computed from daily candles (EMA50/SMA200 trend; 30-day realised volatility)",
      trends[0]?.asOf ? new Date(trends[0].asOf).toISOString() : null,
    );
  } catch (e) {
    errors.push(`overview: ${(e as Error).message}`);
  }

  stats.alerts = await evaluatePriceAndVolatilityAlerts(usdRows, watched, now).catch((e) => {
    logger.warn("price/volatility alerts failed", { error: e });
    return 0;
  });
  stats.errors = errors;
  if (errors.length >= 3) throw new Error(errors.join(" | "));
  return stats;
}

type CheckAsset = { id: string; symbol: string; coingeckoId: string | null; binanceSymbol: string | null; krakenPair: string | null };

/** Compare each asset's price on every source; one batch request per exchange. */
async function crossCheckPrices(assets: CheckAsset[], usdRows: MarketRow[], now: Date) {
  const fetched = async (provider: string, fn: () => Promise<Map<string, number>>) => {
    try {
      return { prices: await tracked(provider, fn), at: new Date().toISOString(), error: undefined };
    } catch (e) {
      return { prices: new Map<string, number>(), at: null, error: (e as Error).message.slice(0, 200) };
    }
  };
  const [bin, kra] = await Promise.all([
    fetched("binance", () => fetchBinancePrices(assets.map((a) => a.binanceSymbol).filter((x): x is string => Boolean(x)))),
    fetched("kraken", () => fetchKrakenPrices(assets.map((a) => a.krakenPair).filter((x): x is string => Boolean(x)))),
  ]);
  const counts = { agree: 0, smallDiff: 0, disagree: 0, singleSource: 0 };
  for (const a of assets) {
    const cg = usdRows.find((r) => r.coingeckoId === a.coingeckoId);
    const sources: SourcePrice[] = [];
    const add = (source: string, listed: boolean, f: { prices: Map<string, number>; at: string | null; error?: string }, key: string | null) => {
      if (!listed || !key) return;
      const price = f.prices.get(key) ?? null;
      sources.push({ source, price, at: price !== null ? f.at : null, ...(price === null ? { error: f.error ?? "no price returned" } : {}) });
    };
    add("binance", Boolean(a.binanceSymbol), bin, a.binanceSymbol);
    add("kraken", Boolean(a.krakenPair), kra, a.krakenPair);
    if (a.coingeckoId) sources.push({ source: "coingecko", price: cg?.price ?? null, at: cg?.lastUpdated ?? null, ...(cg?.price == null ? { error: "not refreshed in this snapshot" } : {}) });
    const check = priceConsensus(a.symbol, sources, now);
    counts[check.verdict === "AGREE" ? "agree" : check.verdict === "SMALL_DIFF" ? "smallDiff" : check.verdict === "DISAGREE" ? "disagree" : "singleSource"]++;
    if (check.verdict === "DISAGREE") logger.warn("price sources disagree", { symbol: a.symbol, spreadPct: check.spreadPct, outlier: check.outlier });
    await upsertSnapshot("PRICECHECK", a.symbol, "USD", check, sources.map((x) => x.source).join(" + "), check.checkedAt, a.id);
  }
  return counts;
}

async function evaluatePriceAndVolatilityAlerts(rows: MarketRow[], assets: { id: string; symbol: string; coingeckoId: string | null }[], now: Date) {
  let sent = 0;
  const priceOf = (assetId: string) => {
    const a = assets.find((x) => x.id === assetId);
    return rows.find((r) => r.coingeckoId === a?.coingeckoId)?.price ?? null;
  };
  // Price alerts (USD).
  const alerts = await db().priceAlert.findMany({ where: { active: true }, include: { asset: true } });
  for (const al of alerts) {
    let price = priceOf(al.assetId);
    if (price === null) {
      const cs = await loadCandles(al.assetId, "1h", { limit: 1 });
      price = cs[0]?.close ?? null;
    }
    if (price === null) continue;
    const hit = al.direction === "ABOVE" ? price >= al.price : price <= al.price;
    if (!hit) continue;
    await db().priceAlert.update({ where: { id: al.id }, data: { active: false, triggeredAt: now } });
    const settings = await getSettings(al.userId);
    const n = await notify(al.userId, settings, {
      kind: "PRICE_ALERT",
      ...formatPriceAlert({ symbol: al.asset.symbol, direction: al.direction, level: al.price, price, note: al.note }, settings.language),
      url: `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/assets/${al.asset.symbol}`,
      dedupeKey: `price:${al.id}`,
    }, { now });
    if (n) sent++;
  }
  // Volatility alerts: 1h move beyond the user's threshold, once per asset per hour.
  const users = await db().user.findMany({ include: { watchlist: true } });
  const hour = Math.floor(now.getTime() / 3_600_000);
  for (const u of users) {
    const settings = await getSettings(u.id);
    if (!settings.alerts.volatility.enabled) continue;
    for (const w of u.watchlist) {
      const a = assets.find((x) => x.id === w.assetId);
      const row = rows.find((r) => r.coingeckoId === a?.coingeckoId);
      if (!a || !row || row.change1h === null) continue;
      if (Math.abs(row.change1h) < settings.alerts.volatility.movePct) continue;
      const n = await notify(u.id, settings, {
        kind: "VOLATILITY_ALERT",
        ...formatVolatilityAlert({ symbol: a.symbol, change1h: row.change1h, lastUpdated: row.lastUpdated }, settings.language),
        url: `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/assets/${a.symbol}`,
        dedupeKey: `vol:${a.id}:${hour}`,
      }, { now });
      if (n) sent++;
    }
  }
  return sent;
}

/** EUR view of a USD market row. Percentage changes stay USD-based (documented in the UI). */
export function toEur(r: MarketRow, fx: { rate: number; date: string }): MarketRow & { fxConverted: true; fxRate: number; fxDate: string } {
  const c = (v: number | null) => (v === null ? null : v * fx.rate);
  return { ...r, currency: "eur", price: c(r.price), marketCap: c(r.marketCap), volume24h: c(r.volume24h), high24h: c(r.high24h), low24h: c(r.low24h), fxConverted: true, fxRate: fx.rate, fxDate: fx.date };
}

export const SNAPSHOT_DEFAULT_SYMBOLS = DEFAULT_ASSETS.map((a) => a.symbol);
