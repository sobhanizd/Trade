import { ApiError, route } from "@/lib/api/handler";
import { getFx } from "@/lib/fx";
import { db } from "@/lib/db";
import { syncRecentCandles } from "@/lib/market/candles";
import { buildChart } from "@/lib/market/chart";
import { isTimeframe } from "@/lib/market/types";
import { getSettings } from "@/lib/settings/service";
import { sideCosts } from "@/lib/settings/schema";
import { rateNews, type RatedNews } from "@/lib/analysis/news";

export const GET = route({ rateLimit: 60 }, async ({ user, params, req }) => {
  const tf = req.nextUrl.searchParams.get("tf") ?? "4h";
  if (!isTimeframe(tf)) throw new ApiError(400, "Invalid timeframe.");
  const asset = await db().asset.findUnique({ where: { symbol: params.symbol.toUpperCase() } });
  if (!asset) throw new ApiError(404, "Unknown asset.");
  let fetchError: string | null = null;
  // Refresh from the provider if our latest stored candle is older than ~1 interval (timeframes not scanned by the worker).
  const latest = await db().candle.findFirst({ where: { assetId: asset.id, timeframe: tf }, orderBy: { openTime: "desc" } });
  if (!latest || Date.now() - latest.updatedAt.getTime() > 5 * 60_000) {
    await syncRecentCandles(asset, tf, 500).catch((e) => {
      fetchError = (e as Error).message;
    });
  }
  const chart = await buildChart(asset.id, tf, user.id);
  // Show the chart in the user's display currency (prices are USD-quoted on the exchange).
  const settings = await getSettings(user.id);
  const { currency, rate } = await getFx(settings);
  if (rate !== 1) {
    const k = (v: number) => v * rate;
    const kn = (v: number | null) => (v === null ? null : v * rate);
    chart.candles = chart.candles.map((c) => ({ ...c, open: k(c.open), high: k(c.high), low: k(c.low), close: k(c.close) }));
    for (const key of ["sma50", "sma200", "ema20", "ema50", "bbUpper", "bbMiddle", "bbLower", "macd", "macdSignal", "macdHist"] as const) {
      chart.indicators[key] = chart.indicators[key].map((p) => ({ ...p, value: k(p.value) }));
    }
    chart.levels = { ...chart.levels, supports: chart.levels.supports.map((l) => ({ ...l, price: k(l.price) })), resistances: chart.levels.resistances.map((l) => ({ ...l, price: k(l.price) })) };
    const pt = (p: { time: number; value: number }) => ({ time: p.time, value: k(p.value) });
    const ln = (l: typeof chart.trend.support) => l && { ...l, from: pt(l.from), to: pt(l.to) };
    chart.trend = { ...chart.trend, support: ln(chart.trend.support), resistance: ln(chart.trend.resistance) };
    chart.signals = chart.signals.map((s) => ({ ...s, price: k(s.price), invalidation: kn(s.invalidation), entryLow: kn(s.entryLow), entryHigh: kn(s.entryHigh), targets: s.targets.map(k) }));
  }
  // Important headlines (last 30 days); the chart places each on the candle it falls in.
  const first = chart.candles[0]?.time ?? 0;
  const rawNews = await db().newsItem.findMany({ where: { publishedAt: { gte: new Date(Math.max(first * 1000, Date.now() - 31 * 86_400_000)) } }, orderBy: { publishedAt: "desc" }, take: 300 });
  const news = rawNews
    .map((n) => rateNews(n, asset.symbol))
    .filter((n): n is RatedNews => n !== null && n.level !== "low")
    .map((n) => ({ time: Math.floor(n.time / 1000), title: n.title, level: n.level, topic: n.topic, url: n.url }));
  return { ...chart, news, currency, fxRate: rate, feeRate: (settings.risk.feeRatePct + settings.risk.slippagePct) / 100, buyCost: sideCosts(settings).buy, sellCost: sideCosts(settings).sell, fetchError };
});
