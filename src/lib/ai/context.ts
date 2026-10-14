/**
 * Builds the ONLY data the AI explainer may use: deterministic analysis
 * records from our database. Anything not in this object does not exist as
 * far as the AI is concerned.
 */
import { db } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import { paperSummary } from "@/lib/paper/service";
import { getStrategy } from "@/lib/strategies/registry";
import { STATE_LABEL, type SignalState } from "@/lib/strategies/types";

export interface AiContext {
  generatedAt: string;
  focus: { signalId?: string; symbol?: string };
  signals: unknown[];
  marketSnapshot: unknown | null;
  /** Live price of the focused asset compared across Binance, Kraken and CoinGecko. */
  priceCrossCheck: unknown | null;
  marketOverview: unknown | null;
  strategies: unknown[];
  backtests: unknown[];
  paperTrading: unknown;
  missing: string[];
  /** Untrusted third-party text — headlines only. */
  untrustedHeadlines: { source: string; title: string; publishedAt: string }[];
}

/** "Missing data" notes, in the user's language (they are shown in the UI and given to the AI). */
const MISSING = {
  en: {
    signalNotFound: "The requested signal was not found.",
    noAsset: (s: string) => `No data for asset ${s}.`,
    noSignals: "No current signals matched this question.",
    noSnapshot: (s: string) => `No market snapshot stored for ${s}.`,
    noBacktest: "No backtest has been run for this asset yet, so there is no historical performance evidence.",
    noHeadlines: "No recent stored headlines for this topic.",
  },
  fa: {
    signalNotFound: "سیگنال درخواستی پیدا نشد.",
    noAsset: (s: string) => `داده‌ای برای ${s} نیست.`,
    noSignals: "هیچ سیگنال فعلی‌ای به این سؤال مربوط نبود.",
    noSnapshot: (s: string) => `اطلاعات بازار برای ${s} ذخیره نشده است.`,
    noBacktest: "هنوز برای این ارز آزمایش روی گذشته (بک‌تست) انجام نشده، پس شاهدی از عملکرد گذشته وجود ندارد.",
    noHeadlines: "خبر تازه‌ای دربارهٔ این موضوع ذخیره نشده است.",
  },
};

export async function buildAiContext(userId: string, focus: { signalId?: string; symbol?: string }, locale: Locale = "en"): Promise<AiContext> {
  const missing: string[] = [];
  const m = MISSING[locale] ?? MISSING.en;
  let symbol = focus.symbol?.toUpperCase();
  let signals: Awaited<ReturnType<ReturnType<typeof db>["signal"]["findMany"]>> = [];
  if (focus.signalId) {
    const s = await db().signal.findFirst({ where: { id: focus.signalId, userId }, include: { asset: true, statusChanges: true } });
    if (s) {
      signals = [s];
      symbol = s.asset.symbol;
    } else missing.push(m.signalNotFound);
  }
  const asset = symbol ? await db().asset.findUnique({ where: { symbol } }) : null;
  if (symbol && !asset) missing.push(m.noAsset(symbol));
  if (asset && !focus.signalId) {
    signals = await db().signal.findMany({ where: { userId, assetId: asset.id, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 12 });
  }
  if (!asset && !focus.signalId) {
    signals = await db().signal.findMany({ where: { userId, status: "ACTIVE", state: { in: ["STRONG_BUY_SETUP", "POTENTIAL_BUY", "EXIT_SETUP"] } }, orderBy: { createdAt: "desc" }, take: 10 });
  }
  if (!signals.length) missing.push(m.noSignals);

  const snapshot = asset ? await db().marketSnapshot.findUnique({ where: { kind_key_currency: { kind: "ASSET", key: asset.symbol, currency: "USD" } } }) : null;
  if (asset && !snapshot) missing.push(m.noSnapshot(asset.symbol));
  const priceCheck = asset ? await db().marketSnapshot.findUnique({ where: { kind_key_currency: { kind: "PRICECHECK", key: asset.symbol, currency: "USD" } } }) : null;
  const overview = await db().marketSnapshot.findUnique({ where: { kind_key_currency: { kind: "OVERVIEW", key: "market", currency: "USD" } } });
  const strategyIds = [...new Set(signals.map((s) => s.strategyId))];
  const backtests = asset
    ? await db().backtestRun.findMany({ where: { userId, assetId: asset.id, status: "SUCCESS" }, orderBy: { createdAt: "desc" }, take: 5 })
    : [];
  if (!backtests.length) missing.push(m.noBacktest);
  const paper = await db().paperTrade.findMany({ where: { userId, ...(asset ? { assetId: asset.id } : {}) } });
  const headlines = await db().newsItem.findMany({
    where: asset ? { assets: { has: asset.symbol } } : {},
    orderBy: { publishedAt: "desc" },
    take: 8,
  });
  if (!headlines.length) missing.push(m.noHeadlines);

  return {
    generatedAt: new Date().toISOString(),
    focus: { signalId: focus.signalId, symbol },
    signals: signals.map((s) => ({
      id: s.id,
      pair: s.pair,
      strategy: getStrategy(s.strategyId)?.name ?? s.strategyId,
      strategyId: s.strategyId,
      timeframe: s.timeframe,
      state: s.state,
      stateLabel: STATE_LABEL[s.state as SignalState],
      status: s.status,
      signalAt: s.signalAt.toISOString(),
      marketDataAt: s.marketDataAt.toISOString(),
      priceAtAnalysis: s.price,
      summary: s.summary,
      rules: `${s.rulesMet} of ${s.rulesTotal} rules met`,
      rulesMet: s.rulesMet,
      rulesTotal: s.rulesTotal,
      conditions: s.conditions,
      indicators: s.indicators,
      entryZone: s.entryLow !== null ? [s.entryLow, s.entryHigh] : null,
      invalidation: s.invalidation,
      targets: s.targets,
      riskRewardAfterCosts: s.riskReward,
      risks: s.risks,
      conflicts: s.conflicts,
      dataIssues: s.dataIssues,
      expiresAt: s.expiresAt?.toISOString() ?? null,
      backtestEvidence: s.evidence ?? null,
      secondExchangeCheck: s.sourceCheck ?? null,
    })),
    marketSnapshot: snapshot ? { ...(snapshot.data as object), source: snapshot.source, fetchedAt: snapshot.fetchedAt.toISOString() } : null,
    priceCrossCheck: priceCheck ? { ...(priceCheck.data as object), fetchedAt: priceCheck.fetchedAt.toISOString() } : null,
    marketOverview: overview ? { ...(overview.data as object), fetchedAt: overview.fetchedAt.toISOString() } : null,
    strategies: strategyIds.map((id) => {
      const d = getStrategy(id);
      return d ? { name: d.name, summary: d.summary, rules: d.rules, intendedTimeframes: d.intendedTimeframes } : { id };
    }),
    backtests: backtests.map((b) => ({
      strategy: getStrategy(b.strategyId)?.name ?? b.strategyId,
      timeframe: b.timeframe,
      period: [b.startDate.toISOString(), b.endDate.toISOString()],
      metrics: b.metrics,
      benchmark: b.benchmark,
      warnings: b.warnings,
    })),
    paperTrading: paperSummary(paper),
    missing,
    untrustedHeadlines: headlines.map((h) => ({ source: h.source, title: h.title.slice(0, 200), publishedAt: h.publishedAt.toISOString() })),
  };
}
