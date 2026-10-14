import { db } from "@/lib/db";
import { getFx } from "@/lib/fx";
import { fetchLivePrice } from "@/lib/market/assets";
import { ensureHistoricalCandles, loadCandles } from "@/lib/market/candles";
import type { MarketRow } from "@/lib/market/types";
import { getSettings, updateSettings } from "@/lib/settings/service";
import { sideCosts } from "@/lib/settings/schema";
import { computeVerdict } from "@/lib/signals/verdict";
import { allocateMonth, planPeriod, requiredGrowth, type CoinState } from "./allocate";
import type { CoinFeatures } from "./smart";
import { riskClass } from "@/lib/views";
import { dipWaitTest, dropFrequency, goalNeeds, historyTest, searchMixes, type DailySeries, type Fees } from "./history";


export async function getPlanView(userId: string, now = new Date()) {
  const settings = await getSettings(userId);
  const plan = settings.plan;
  // The plan is in euros; uses the user's own euro rate when set.
  const rate = (await getFx(settings)).eurPerUsd;
  const watch = await db().watchlistItem.findMany({ where: { userId }, include: { asset: true }, orderBy: [{ position: "asc" }, { addedAt: "asc" }] });
  const active = await db().signal.findMany({ where: { userId, status: "ACTIVE", assetId: { in: watch.map((w) => w.assetId) } } });
  const snaps = await db().marketSnapshot.findMany({ where: { kind: "ASSET", currency: "USD", assetId: { in: watch.map((w) => w.assetId) } } });
  const coins: (CoinState & { name: string; pair: string | null; assetId: string })[] = watch.map((w) => {
    const sigs = active.filter((s) => s.assetId === w.assetId);
    const usd = (snaps.find((s) => s.assetId === w.assetId)?.data as MarketRow | undefined)?.price ?? null;
    return {
      symbol: w.asset.symbol,
      name: w.asset.name,
      pair: w.asset.binanceSymbol,
      assetId: w.assetId,
      verdict: computeVerdict(sigs).action,
      dailyBuyIdeas: sigs.filter((s) => s.timeframe === "1d" && (s.state === "STRONG_BUY_SETUP" || s.state === "POTENTIAL_BUY")).length,
      priceEur: usd !== null && rate ? usd * rate : null,
    };
  });
  // Facts used by the smart split: price vs 30-day average, jumpiness, daily trend.
  const features: (CoinFeatures & { name: string; pair: string | null })[] = await Promise.all(
    coins.map(async (c) => {
      const daily = (await loadCandles(c.assetId, "1d", { limit: 31 })).filter((k) => k.closeTime < now.getTime());
      const last30 = daily.slice(-30);
      const avg = last30.length >= 20 ? last30.reduce((a, k) => a + k.close, 0) / last30.length : null;
      const usd = (snaps.find((x) => x.assetId === c.assetId)?.data as MarketRow | undefined)?.price ?? daily[daily.length - 1]?.close ?? null;
      const tfSig = active.find((x) => x.assetId === c.assetId && x.strategyId === "trend_following" && x.timeframe === "1d");
      return {
        symbol: c.symbol,
        name: c.name,
        pair: c.pair,
        verdict: c.verdict,
        dailyBuyIdeas: c.dailyBuyIdeas,
        priceEur: c.priceEur,
        vs30dPct: avg && usd ? (usd / avg - 1) * 100 : null,
        atrPct: (await riskClass(c.assetId)).atrPct,
        trendDown: tfSig ? tfSig.state === "EXIT_SETUP" || tfSig.state === "POTENTIAL_SELL" : false,
      };
    }),
  );
  const extraPerMonth = plan.extraAmount > 0 ? plan.extraAmount / plan.spreadMonths : 0;
  const total = Math.round((plan.monthlyAmount + extraPerMonth) * 100) / 100;
  const { period, nextBuy, periodStart } = planPeriod(now, plan.buyDay);
  const allocation = allocateMonth(total, plan.style, coins, plan.minOrderEur, plan.custom);

  const purchases = await db().planPurchase.findMany({ where: { userId }, include: { asset: { select: { symbol: true, binanceSymbol: true } } }, orderBy: { boughtAt: "desc" } });
  const holdings = new Map<string, { symbol: string; pair: string | null; quantity: number; invested: number; priceEur: number | null }>();
  for (const p of purchases) {
    const h = holdings.get(p.asset.symbol) ?? { symbol: p.asset.symbol, pair: p.asset.binanceSymbol, quantity: 0, invested: 0, priceEur: coins.find((c) => c.symbol === p.asset.symbol)?.priceEur ?? null };
    h.quantity += p.quantity;
    h.invested += p.amountEur;
    holdings.set(p.asset.symbol, h);
  }
  const months = plan.goalYears * 12;
  return {
    settings: plan,
    currency: settings.displayCurrency,
    eurRate: rate,
    feeRatePct: settings.risk.feeRatePct,
    /** Real cost when buying / selling, in % (falls back to fee + slippage). */
    buyCostPct: sideCosts(settings).buy * 100,
    sellCostPct: sideCosts(settings).sell * 100,
    period,
    periodStart: periodStart.toISOString(),
    nextBuy: nextBuy.toISOString(),
    total,
    extraPerMonth,
    allocation,
    coins: coins.map((c) => ({ symbol: c.symbol, name: c.name, pair: c.pair, priceEur: c.priceEur, verdict: c.verdict })),
    features,
    now: now.toISOString(),
    doneThisPeriod: purchases.filter((p) => p.period === period).map((p) => ({ id: p.id, symbol: p.asset.symbol, amountEur: p.amountEur, priceEur: p.priceEur, quantity: p.quantity, boughtAt: p.boughtAt.toISOString() })),
    holdings: [...holdings.values()],
    investedTotal: purchases.reduce((a, p) => a + p.amountEur, 0),
    monthsDone: new Set(purchases.map((p) => p.period)).size,
    required: requiredGrowth(plan.monthlyAmount, months, plan.goalAmount, plan.extraAmount),
  };
}

/** Record purchases the user made themselves. Prices = live market price now (EUR). */
export async function recordPurchases(userId: string, lines: { symbol: string; amountEur: number }[], period: string) {
  const settings = await getSettings(userId);
  // The plan is in euros; uses the user's own euro rate when set.
  const rate = (await getFx(settings)).eurPerUsd;
  if (!rate) throw new Error("The euro exchange rate is not available yet. Try again in a few minutes.");
  const fee = sideCosts(settings).buy;
  const created = [];
  for (const l of lines) {
    if (!(l.amountEur > 0)) continue;
    const asset = await db().asset.findUnique({ where: { symbol: l.symbol } });
    if (!asset) throw new Error(`Unknown coin ${l.symbol}`);
    const live = await fetchLivePrice(asset);
    const priceEur = live.price * rate;
    created.push(
      await db().planPurchase.create({
        data: { userId, assetId: asset.id, period, amountEur: l.amountEur, priceEur, quantity: (l.amountEur * (1 - fee)) / priceEur, note: `Live price ${live.source}` },
      }),
    );
  }
  // Spread-out extra money: one month of it is now used up.
  const plan = settings.plan;
  if (plan.extraAmount > 0 && created.length) {
    const per = plan.extraAmount / plan.spreadMonths;
    const left = Math.max(0, Math.round((plan.extraAmount - per) * 100) / 100);
    await updateSettings(userId, { plan: { extraAmount: left, spreadMonths: left > 0 ? Math.max(1, plan.spreadMonths - 1) : plan.spreadMonths } });
  }
  return created;
}

const HISTORY_FROM = new Date(Date.UTC(2017, 7, 17));
const cache = new Map<string, { at: number; value: unknown }>();

async function dailySeries(symbols: string[]): Promise<DailySeries[]> {
  const out: DailySeries[] = [];
  for (const symbol of symbols) {
    const asset = await db().asset.findUnique({ where: { symbol } });
    if (!asset?.binanceSymbol) continue;
    const { candles } = await ensureHistoricalCandles(asset, "1d", HISTORY_FROM, new Date());
    const closed = candles.filter((c) => c.closeTime < Date.now());
    out.push({ symbol, times: closed.map((c) => c.openTime), closes: closed.map((c) => c.close) });
  }
  return out;
}

/** History test for weights (fractions per symbol). Results are converted to EUR with today's rate (ratios are what matter). */
export async function planHistory(weights: Record<string, number>, monthlyEur: number, years: number, goalEur: number, feeRate: Fees) {
  const key = JSON.stringify({ weights, monthlyEur, years, goalEur, feeRate });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.value as ReturnType<typeof historyTest>;
  const series = await dailySeries(Object.keys(weights));
  const value = historyTest(series, weights, monthlyEur, years, goalEur, feeRate);
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** How often BTC (or another coin) fell by `pct`% within a year, historically. */
export async function dropStats(symbol: string, pct: number) {
  const asset = await db().asset.findUnique({ where: { symbol } });
  if (!asset) throw new Error("Unknown coin");
  await ensureHistoricalCandles(asset, "1d", HISTORY_FROM, new Date());
  const cs = (await loadCandles(asset.id, "1d", { from: HISTORY_FROM, limit: 50_000 })).filter((c) => c.closeTime < Date.now());
  return { ...dropFrequency(cs.map((c) => c.openTime), cs.map((c) => c.low), cs.map((c) => c.close), pct, 365), since: cs[0]?.openTime ?? null };
}

/** Smart pick: test every BTC/ETH/Gold mix on the same past periods, plus what the goal needs and whether waiting for dips paid off. */
export async function planSmart(userId: string, current: Record<string, number>, monthlyEur: number, years: number, goalEur: number, feeRate: Fees) {
  const withGold = !!(await db().watchlistItem.findFirst({ where: { userId, asset: { symbol: "PAXG" } } }));
  const key = JSON.stringify({ smart: 1, current, monthlyEur, years, goalEur, feeRate, withGold });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.value as ReturnType<typeof compute>;
  const series = await dailySeries([...new Set(["BTC", "ETH", ...(withGold ? ["PAXG"] : []), ...Object.keys(current)])]);
  const value = compute();
  cache.set(key, { at: Date.now(), value });
  return value;

  function compute() {
    const search = searchMixes(series, current, monthlyEur, years, goalEur, feeRate, withGold);
    const pick = search.goal?.weights ?? current;
    return {
      withGold,
      search,
      needsCurrent: goalNeeds(series, current, monthlyEur, years, goalEur, feeRate),
      needsPick: goalNeeds(series, pick, monthlyEur, years, goalEur, feeRate),
      dip: dipWaitTest(series, current, years, feeRate),
    };
  }
}
