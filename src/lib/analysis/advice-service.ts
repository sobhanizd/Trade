/** Builds the trader's advice for a coin (or every watched coin) from stored data. */
import { db } from "@/lib/db";
import { getFx } from "@/lib/fx";
import { atr, supportResistance } from "@/lib/indicators";
import type { MarketRow } from "@/lib/market/types";
import { sideCosts, type UserSettingsData } from "@/lib/settings/schema";
import { getSettings } from "@/lib/settings/service";
import { computeVerdict } from "@/lib/signals/verdict";
import { advise, type Advice } from "./advisor";
import { rateNews, urgentItems, type RatedNews } from "./news";
import { dailyCandles } from "./outlook";
import { activePatterns, type PatternHit } from "./patterns";
import { analogs, direction, scenarios, trendLines } from "./structure";
import { entryTiming, exitOdds } from "./timing";

export type CoinAdvice = Advice & { symbol: string; name: string; patterns: PatternHit[] };

const cache = new Map<string, { at: number; value: CoinAdvice | null }>();

/**
 * What the user owns of a coin. "My assets" (Holding) is the source of truth; plan purchases
 * count only when there is no Holding row for the coin (so nothing is counted twice).
 * Each lot's cost is compared in its own currency: converting it to USD at today's rate gives
 * the same gain % as comparing today's price in that currency with the price paid.
 */
async function holdingOf(userId: string, assetId: string, eurPerUsd: number | null, tomanPerEur: number | null): Promise<{ quantity: number; investedUsd: number | null } | null> {
  const lots = await db().holding.findMany({ where: { userId, assetId } });
  if (lots.length) {
    let quantity = 0;
    let invested: number | null = 0;
    for (const h of lots) {
      quantity += h.quantity;
      const perUsd = h.buyCurrency === "USD" ? 1 : h.buyCurrency === "EUR" ? eurPerUsd : h.buyCurrency === "IRT" && eurPerUsd && tomanPerEur ? eurPerUsd * tomanPerEur : null;
      if (h.buyPrice == null || !perUsd || invested === null) invested = null;
      else invested += (h.quantity * h.buyPrice) / perUsd;
    }
    return quantity > 0 ? { quantity, investedUsd: invested } : null;
  }
  const buys = await db().planPurchase.findMany({ where: { userId, assetId } });
  const quantity = buys.reduce((a, b) => a + b.quantity, 0);
  const investedEur = buys.reduce((a, b) => a + b.amountEur, 0);
  return quantity > 0 ? { quantity, investedUsd: eurPerUsd ? investedEur / eurPerUsd : null } : null;
}

async function build(userId: string, asset: { id: string; symbol: string; name: string; binanceSymbol: string | null; krakenPair: string | null }, eurPerUsd: number | null, settings: UserSettingsData): Promise<CoinAdvice | null> {
  const now = Date.now();
  const daily = await dailyCandles(asset);
  const closed = daily.filter((c) => c.closeTime < now);
  if (closed.length < 60) return null;
  const last = closed.length - 1;
  const atrNow = atr(closed)[last];
  const dir = direction(closed, now);
  const lines = trendLines(closed, now);
  const sr = atrNow ? supportResistance(closed, last, { lookback: 365, tolerance: 0.5 * atrNow }) : { supports: [], resistances: [] };
  const sc = dir ? scenarios(dir.close, lines, sr.supports.map((l) => l.price), sr.resistances.map((l) => l.price)) : null;
  const patterns = activePatterns(closed, now);
  const signals = await db().signal.findMany({ where: { userId, assetId: asset.id, status: "ACTIVE" } });
  const verdict = computeVerdict(signals);

  const snap = await db().marketSnapshot.findUnique({ where: { kind_key_currency: { kind: "ASSET", key: asset.symbol, currency: "USD" } } });
  const change24h = (snap?.data as MarketRow | undefined)?.change24h ?? null;
  const raw = await db().newsItem.findMany({ where: { publishedAt: { gte: new Date(now - 24 * 3_600_000) } }, take: 200 });
  const news = raw.map((n) => rateNews(n, asset.symbol)).filter((n): n is RatedNews => n !== null);
  const urgent = urgentItems(news, change24h, atrNow ? (atrNow / closed[last].close) * 100 : null, now);

  const own = await holdingOf(userId, asset.id, eurPerUsd, settings.toman.perEur);
  const holding = own ? { ...own, sellCost: sideCosts(settings).sell } : null;

  const timing = entryTiming(closed, now);
  const base = advise({
    daily: closed,
    now,
    verdict: verdict.action,
    direction: dir,
    lines,
    scenarios: sc,
    analogs: analogs(closed, now),
    patterns,
    urgentNews: urgent.filter((u) => u.kind === "news").map((u) => u.news!.title),
    holding,
    timing,
  });
  if (!base) return null;
  const odds = exitOdds(closed, { target: base.upTrigger, stop: base.stopLevel }, [7, 30, 90], now);
  return { ...base, exitOdds: odds, symbol: asset.symbol, name: asset.name, patterns };
}

/** Advice for one coin, plus the USD → display-currency rate for showing prices. */
export async function getAdvice(symbol: string, userId: string) {
  const settings = await getSettings(userId);
  const fx = await getFx(settings);
  const asset = await db().asset.findUnique({ where: { symbol } });
  if (!asset) return null;
  const key = `${userId}:${symbol}`;
  const hit = cache.get(key);
  const advice = hit && Date.now() - hit.at < 10 * 60_000 ? hit.value : await build(userId, asset, fx.eurPerUsd, settings);
  if (!hit || hit.value !== advice) cache.set(key, { at: Date.now(), value: advice });
  return { advice, currency: fx.currency, rate: fx.rate };
}

/** Advice for every watched coin, most urgent first. */
export async function adviceForWatchlist(userId: string) {
  const watch = await db().watchlistItem.findMany({ where: { userId }, include: { asset: true }, orderBy: [{ position: "asc" }, { addedAt: "asc" }] });
  const out = await Promise.all(watch.map((w) => getAdvice(w.asset.symbol, userId).catch(() => null)));
  const items = out.map((o) => o?.advice).filter((a): a is CoinAdvice => !!a);
  const order: Record<string, number> = { sellPart: 0, pause: 1, protect: 2, takeProfit: 3, buyNow: 4, buyParts: 5, waitDip: 6, noEdge: 7, hold: 8, avoid: 9 };
  items.sort((a, b) => order[a.action] - order[b.action] || b.score - a.score);
  return { items, currency: out[0]?.currency ?? "USD", rate: out[0]?.rate ?? 1 };
}

/** Clear cached advice (e.g. after the user records a purchase). */
export function clearAdvice(userId: string) {
  for (const k of cache.keys()) if (k.startsWith(`${userId}:`)) cache.delete(k);
}
