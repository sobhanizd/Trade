/** Server-side data assembly for pages. */
import { db } from "@/lib/db";
import { atr } from "@/lib/indicators";
import { loadCandles } from "@/lib/market/candles";
import type { GlobalMarket, MarketRow, SentimentReading } from "@/lib/market/types";
import { getSettings } from "@/lib/settings/service";
import { convertRow, getFx } from "@/lib/fx";
import { getStrategy } from "@/lib/strategies/registry";
import { computeVerdict } from "@/lib/signals/verdict";

export type RiskLevel = "Low" | "Moderate" | "High" | "Unknown";

/** Risk class from daily ATR% (documented in docs/STRATEGIES.md): <3% low, 3–6% moderate, >6% high. */
export async function riskClass(assetId: string): Promise<{ level: RiskLevel; atrPct: number | null }> {
  const cs = (await loadCandles(assetId, "1d", { limit: 60 })).filter((c) => c.closeTime < Date.now());
  const a = atr(cs, 14);
  const last = a[a.length - 1];
  if (!cs.length || last === null || last === undefined) return { level: "Unknown", atrPct: null };
  const pct = (last / cs[cs.length - 1].close) * 100;
  return { level: pct < 3 ? "Low" : pct <= 6 ? "Moderate" : "High", atrPct: pct };
}

export async function getMarketView(userId: string) {
  const settings = await getSettings(userId);
  const fx = await getFx(settings);
  const cur = fx.currency;
  const watch = await db().watchlistItem.findMany({ where: { userId }, include: { asset: true }, orderBy: [{ position: "asc" }, { addedAt: "asc" }] });
  const snaps = await db().marketSnapshot.findMany({ where: { OR: [{ kind: "ASSET", currency: "USD" }, { kind: { in: ["GLOBAL", "SENTIMENT", "FX", "OVERVIEW"] } }] } });
  const get = (kind: string) => snaps.find((s) => s.kind === kind) ?? null;
  const btcEth = await db().marketSnapshot.findMany({ where: { kind: "ASSET", currency: "USD", key: { in: ["BTC", "ETH"] } } });

  const rows = await Promise.all(
    watch.map(async (w) => {
      const snap = snaps.find((s) => s.kind === "ASSET" && s.key === w.asset.symbol) ?? null;
      const signals = await db().signal.findMany({ where: { userId, assetId: w.assetId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
      const notable = signals.filter((s) => s.state !== "NO_CLEAR_OPPORTUNITY" && s.state !== "HOLD_WAIT");
      const latest = notable[0] ?? signals[0] ?? null;
      const trendSig = signals.find((s) => s.strategyId === "trend_following" && s.timeframe === "1d") ?? signals.find((s) => s.strategyId === "trend_following");
      const ind = (trendSig?.indicators ?? {}) as Record<string, number | null>;
      return {
        symbol: w.asset.symbol,
        name: w.asset.name,
        binanceSymbol: w.asset.binanceSymbol,
        market: convertRow(snap?.data as unknown as MarketRow | undefined, fx.rate),
        snapshotAt: snap?.fetchedAt ?? null,
        risk: await riskClass(w.assetId),
        latestSignal: latest
          ? { id: latest.id, state: latest.state, strategy: getStrategy(latest.strategyId)?.name ?? latest.strategyId, timeframe: latest.timeframe, at: latest.signalAt, dataAt: latest.marketDataAt }
          : null,
        signalCount: signals.length,
        verdict: computeVerdict(signals),
        counts: {
          buy: signals.filter((s) => s.state === "STRONG_BUY_SETUP" || s.state === "POTENTIAL_BUY").length,
          exit: signals.filter((s) => s.state === "EXIT_SETUP" || s.state === "POTENTIAL_SELL").length,
        },
        trend: trendSig ? { state: trendSig.state, timeframe: trendSig.timeframe, rsi: ind.rsi ?? null, adx: ind.adx ?? null } : null,
      };
    }),
  );
  return {
    settings,
    currency: cur,
    /** USD → display-currency rate (pass to live-price components). */
    rate: fx.rate,
    fxInfo: fx,
    rows,
    headline: btcEth.map((s) => ({ symbol: s.key, market: convertRow(s.data as unknown as MarketRow, fx.rate)!, fetchedAt: s.fetchedAt })),
    global: get("GLOBAL") ? { data: get("GLOBAL")!.data as unknown as GlobalMarket, fetchedAt: get("GLOBAL")!.fetchedAt, source: get("GLOBAL")!.source } : null,
    sentiment: get("SENTIMENT") ? { data: get("SENTIMENT")!.data as unknown as SentimentReading, fetchedAt: get("SENTIMENT")!.fetchedAt } : null,
    fx: get("FX") ? { data: get("FX")!.data as { rate: number; date: string; source: string }, fetchedAt: get("FX")!.fetchedAt } : null,
    overview: get("OVERVIEW")
      ? {
          data: get("OVERVIEW")!.data as {
            overall: string;
            trends: { symbol: string; label: string; close: number | null; ema50: number | null; sma200: number | null; asOf: number | null }[];
            volatility: { label: string; annualizedPct: number | null } | null;
            breadth: { above: number; known: number; pct: number } | null;
          },
          fetchedAt: get("OVERVIEW")!.fetchedAt,
          source: get("OVERVIEW")!.source,
        }
      : null,
  };
}

export async function lastScan() {
  const [ok, last] = await Promise.all([
    db().jobRun.findFirst({ where: { job: "scan", status: "SUCCESS" }, orderBy: { startedAt: "desc" } }),
    db().jobRun.findFirst({ where: { job: "scan" }, orderBy: { startedAt: "desc" } }),
  ]);
  return { lastSuccess: ok?.startedAt ?? null, last };
}

export async function providerHealth() {
  const ps = await db().providerStatus.findMany();
  return ps.map((p) => ({ provider: p.provider, ok: p.consecutiveFailures === 0, lastSuccessAt: p.lastSuccessAt, lastError: p.lastError, failures: p.consecutiveFailures }));
}
