/**
 * "Market picture" for one coin: direction, recent changes, trend lines,
 * if-then levels, similar moments in the past, and news around big moves.
 * Prices are converted to the user's display currency; percentages are
 * currency-independent (computed on the exchange's USD prices).
 */
import { getFx } from "@/lib/fx";
import type { Currency } from "@/lib/format";
import { db } from "@/lib/db";
import { atr, supportResistance } from "@/lib/indicators";
import { ensureHistoricalCandles, loadCandles, syncRecentCandles } from "@/lib/market/candles";
import type { Candle, MarketRow } from "@/lib/market/types";
import { getSettings } from "@/lib/settings/service";
import { linkMoves, rateNews, urgentItems, type RatedNews } from "./news";
import { analogs, bigMoves, direction, scenarios, trendLines } from "./structure";

const HISTORY_FROM = new Date(Date.UTC(2017, 7, 17));
const historyTried = new Set<string>();
const cache = new Map<string, { at: number; value: Awaited<ReturnType<typeof compute>> }>();

export async function dailyCandles(asset: { id: string; symbol: string; binanceSymbol: string | null; krakenPair: string | null }): Promise<Candle[]> {
  const latest = await db().candle.findFirst({ where: { assetId: asset.id, timeframe: "1d" }, orderBy: { openTime: "desc" } });
  if (!latest || Date.now() - latest.updatedAt.getTime() > 30 * 60_000) await syncRecentCandles(asset, "1d", 60).catch(() => undefined);
  let cs = await loadCandles(asset.id, "1d", { limit: 5000 });
  // Long history is needed for "similar moments"; fetch it once per process when missing.
  if (cs.length < 1000 && !historyTried.has(asset.symbol)) {
    historyTried.add(asset.symbol);
    await ensureHistoricalCandles(asset, "1d", HISTORY_FROM, new Date()).catch(() => undefined);
    cs = await loadCandles(asset.id, "1d", { limit: 5000 });
  }
  return cs;
}

async function compute(symbol: string, currency: Currency, rate: number) {
  const asset = await db().asset.findUnique({ where: { symbol } });
  if (!asset) return null;
  const now = Date.now();
  const daily = await dailyCandles(asset);
  const k = (v: number | null) => (v === null ? null : v * rate);
  const closed = daily.filter((c) => c.closeTime < now);
  const last = closed.length - 1;
  const atrAll = last >= 14 ? atr(closed) : [];
  const atrNow = atrAll[last] ?? null;
  const atrPct = atrNow !== null ? (atrNow / closed[last].close) * 100 : null;

  const dir = direction(closed, now);
  const tl = trendLines(closed, now);
  const sr = last >= 30 && atrNow ? supportResistance(closed, last, { lookback: 365, tolerance: 0.5 * atrNow }) : { supports: [], resistances: [] };
  const sc = dir ? scenarios(dir.close, tl, sr.supports.map((l) => l.price), sr.resistances.map((l) => l.price)) : null;
  const an = analogs(closed, now);

  const snap = await db().marketSnapshot.findUnique({ where: { kind_key_currency: { kind: "ASSET", key: symbol, currency: "USD" } } });
  const change24h = (snap?.data as MarketRow | undefined)?.change24h ?? null;
  const rawNews = await db().newsItem.findMany({ where: { publishedAt: { gte: new Date(now - 31 * 86_400_000) } }, orderBy: { publishedAt: "desc" }, take: 400 });
  const news = rawNews.map((n) => rateNews(n, symbol)).filter((n): n is RatedNews => n !== null);
  const moves = linkMoves(bigMoves(closed, 30, now), news);
  const urgent = urgentItems(news, change24h, atrPct, now);

  return {
    symbol,
    currency,
    asOf: closed[last]?.closeTime ?? null,
    atrPct,
    direction: dir && { ...dir, close: dir.close * rate, ema20: k(dir.ema20), ema50: k(dir.ema50), sma200: k(dir.sma200) },
    trend: { pattern: tl.pattern, brokeSupport: tl.brokeSupport, brokeResistance: tl.brokeResistance, support: tl.support && { dir: tl.support.dir, now: tl.support.pEnd * rate, touches: tl.support.touches, from: tl.support.t1 }, resistance: tl.resistance && { dir: tl.resistance.dir, now: tl.resistance.pEnd * rate, touches: tl.resistance.touches, from: tl.resistance.t1 } },
    scenarios: sc && { upTrigger: k(sc.upTrigger), upNext: k(sc.upNext), downTrigger: k(sc.downTrigger), downNext: k(sc.downNext) },
    analogs: an,
    /** Daily closes for the last ~13 months (month-by-month changes are grouped in the viewer's calendar). */
    recent: closed.slice(-400).map((c) => ({ t: c.openTime, c: c.close * rate })),
    news: news.filter((n) => n.level !== "low").slice(0, 12),
    moves,
    urgent,
    newsSince: rawNews.length ? new Date(rawNews[rawNews.length - 1].publishedAt).getTime() : null,
  };
}

export type Outlook = NonNullable<Awaited<ReturnType<typeof compute>>>;

export async function getOutlook(symbol: string, userId: string): Promise<Outlook | null> {
  const settings = await getSettings(userId);
  const { currency, rate } = await getFx(settings);
  const key = `${symbol}:${currency}:${rate}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const value = await compute(symbol, currency, rate);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Urgent items for each watched coin (home page banner and alerts). */
export async function urgentForWatchlist(userId: string) {
  const watch = await db().watchlistItem.findMany({ where: { userId }, include: { asset: true } });
  const since = new Date(Date.now() - 24 * 3_600_000);
  const rawNews = await db().newsItem.findMany({ where: { publishedAt: { gte: since } }, orderBy: { publishedAt: "desc" }, take: 200 });
  const snaps = await db().marketSnapshot.findMany({ where: { kind: "ASSET", currency: "USD", assetId: { in: watch.map((w) => w.assetId) } } });
  const out: { symbol: string; items: ReturnType<typeof urgentItems> }[] = [];
  for (const w of watch) {
    const news = rawNews.map((n) => rateNews(n, w.asset.symbol)).filter((n): n is RatedNews => n !== null);
    const row = snaps.find((s) => s.assetId === w.assetId)?.data as MarketRow | undefined;
    const cs = (await loadCandles(w.assetId, "1d", { limit: 30 })).filter((c) => c.closeTime < Date.now());
    const a = cs.length > 15 ? atr(cs)[cs.length - 1] : null;
    const items = urgentItems(news, row?.change24h ?? null, a ? (a / cs[cs.length - 1].close) * 100 : null);
    if (items.length) out.push({ symbol: w.asset.symbol, items });
  }
  return out;
}
