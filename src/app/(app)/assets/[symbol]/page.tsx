import type { Metadata } from "next";
import { convertRow, getFx } from "@/lib/fx";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandleChart } from "@/components/charts/candle-chart";
import { VerdictCard } from "@/components/verdict-card";
import { MarketPicture } from "@/components/market-picture";
import { AdvisorCard } from "@/components/advisor/advisor-card";
import { LiveBadge, LivePrice } from "@/components/live-price";
import { computeVerdict } from "@/lib/signals/verdict";
import { PriceAlerts } from "@/components/price-alerts";
import { RiskBadge, SignalBadge } from "@/components/signal-badge";
import { Alert, ButtonLink, Card, CardHeader, Change, EmptyState, PageHeader, Stat, TableWrap, td, th } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { currencyName, fmtBig, GOLD_TOKENS, timeAgo } from "@/lib/format";
import type { MarketRow } from "@/lib/market/types";
import { getSettings } from "@/lib/settings/service";
import { STRATEGIES } from "@/lib/strategies/registry";
import { directionOf, type SignalState } from "@/lib/strategies/types";
import { DataCheckCard } from "@/components/source-check";
import { candleChecks, priceChecks, riskClass } from "@/lib/views";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { coinLabel, strategyName, timeframeWord } from "@/lib/plain";

const L = {
  en: {
    analysisPair: (pair: string, fallback: string) => `Analysis pair: ${pair} · ${fallback}`,
    krakenOnly: (s: string) => `${s}USD (Kraken)`,
    fallbackKraken: (p: string) => `fallback Kraken ${p}`,
    noFallback: "no fallback provider",
    askAbout: (s: string) => `Ask about ${s}`,
    backtest: "Backtest",
    goldTitle: "Gold-backed token",
    goldBody: (s: string) => `1 ${s} represents 1 troy ounce (31.1 g) of physical gold. The per-gram price is the token price ÷ 31.1035; the token can trade slightly above or below the spot gold price.`,
    notWatched: (s: string) => `${s} is not on your watchlist, so the scheduler does not scan it. Add it on the Watchlist page to receive signals.`,
    price: (c: string) => `Price (${c})`,
    marketCap: "Market cap",
    rank: (n: number) => `Rank #${n}`,
    volume: "Volume 24h",
    volatility: "Daily volatility",
    atr: (p: string) => `ATR ${p}% of price`,
    chart: "Chart",
    chartDesc: "Indicators are computed from the same candles the engine uses. Missing data is never filled in.",
    showAll: "Show all strategy details ▾",
    signalsTitle: "Current signals by strategy and timeframe",
    signalsDesc: "Each cell is the latest active state. Click for the full explanation.",
    conflictTitle: "Timeframes disagree",
    conflictBody: "Some timeframes show buy setups while others show exit conditions. Shorter timeframes react faster but are noisier; many traders wait for agreement.",
    noSignals: "No signals yet",
    noSignalsBody: "Signals appear after the worker scans this asset (every 5 minutes for watched assets).",
    strategy: "Strategy",
    rules: (met: number, total: number) => `${met}/${total} rules`,
    notScanned: "not scanned",
    alerts: "Price alerts",
    alertsDesc: "Informational alerts in USD (the analysis pair's quote).",
    headlines: "Recent headlines",
    headlinesDesc: "Headlines and links only — keyword-matched to this asset.",
    more: "More",
    noHeadlines: "No recent headlines mention this asset",
    opinion: " · opinion/analysis",
  },
  fa: {
    analysisPair: (pair: string, fallback: string) => `جفت‌ارز تحلیل: ${pair} · ${fallback}`,
    krakenOnly: (s: string) => `${s}USD (Kraken)`,
    fallbackKraken: (p: string) => `منبع جایگزین: Kraken ${p}`,
    noFallback: "بدون منبع جایگزین",
    askAbout: (s: string) => `دربارهٔ ${s} بپرسید`,
    backtest: "آزمایش روی گذشته (بک‌تست)",
    goldTitle: "توکن پشتوانه‌دار طلا",
    goldBody: (s: string) => `هر ۱ ${s} برابر با ۱ اونس (حدود ۳۱٫۱ گرم) طلای واقعی است. قیمت هر گرم = قیمت توکن تقسیم بر 31.1035. قیمت توکن ممکن است کمی بالاتر یا پایین‌تر از قیمت روز طلا باشد.`,
    notWatched: (s: string) => `${s} در ارزهای شما نیست، برای همین برنامه آن را خودکار بررسی نمی‌کند. برای گرفتن سیگنال، آن را در صفحهٔ «ارزهای من» اضافه کنید.`,
    price: (c: string) => `قیمت (${c})`,
    marketCap: "ارزش بازار",
    rank: (n: number) => `رتبهٔ ${n}`,
    volume: "حجم معاملات ۲۴ ساعته",
    volatility: "نوسان روزانه",
    atr: (p: string) => `میانگین نوسان روزانه (ATR): ${p}% از قیمت`,
    chart: "نمودار",
    chartDesc: "شاخص‌ها از همان کندل‌هایی (شمع‌های قیمت) حساب می‌شوند که برنامه برای تحلیل استفاده می‌کند. دادهٔ گم‌شده هرگز با حدس پر نمی‌شود.",
    showAll: "نمایش جزئیات همهٔ روش‌ها ▾",
    signalsTitle: "سیگنال‌های فعلی به تفکیک روش و بازهٔ زمانی",
    signalsDesc: "هر خانه آخرین وضعیت فعال است. برای توضیح کامل روی آن بزنید.",
    conflictTitle: "بازه‌های زمانی با هم هم‌نظر نیستند",
    conflictBody: "بعضی بازه‌های زمانی فرصت خرید نشان می‌دهند و بعضی می‌گویند وقت خروج است. بازه‌های کوتاه‌تر سریع‌تر واکنش نشان می‌دهند ولی خطای بیشتری دارند؛ خیلی‌ها صبر می‌کنند تا همه هم‌نظر شوند.",
    noSignals: "هنوز سیگنالی نیست",
    noSignalsBody: "سیگنال‌ها بعد از این‌که برنامه این ارز را بررسی کرد ظاهر می‌شوند (برای ارزهای شما هر ۵ دقیقه).",
    strategy: "روش",
    rules: (met: number, total: number) => `${met} از ${total} شرط`,
    notScanned: "بررسی نشده",
    alerts: "هشدار قیمت",
    alertsDesc: "هشدارهای اطلاع‌رسانی به دلار (USD)، همان واحد قیمت جفت‌ارز تحلیل.",
    headlines: "تازه‌ترین خبرها",
    headlinesDesc: "فقط تیتر و لینک خبر — بر اساس کلمه‌های کلیدی مربوط به این ارز.",
    more: "بیشتر",
    noHeadlines: "خبر تازه‌ای دربارهٔ این ارز نیست",
    opinion: " · نظر/تحلیل",
  },
} satisfies Dict<unknown>;

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const symbol = (await params).symbol.toUpperCase();
  const locale = await getLocale();
  return { title: locale === "fa" && symbol === "PAXG" ? `${coinLabel(symbol, locale)} (PAXG)` : symbol };
}

export default async function AssetPage({ params }: { params: Promise<{ symbol: string }> }) {
  const user = await requireUser();
  const symbol = (await params).symbol.toUpperCase();
  const t = await getL(L);
  const locale = await getLocale();
  const fa = locale === "fa";
  const tfw = (tf: string) => (fa ? timeframeWord(tf, locale) : tf);
  const coin = fa ? coinLabel(symbol, locale) : symbol;
  // eslint-disable-next-line react-hooks/purity -- server component: rendered once per request
  const now = Date.now();
  const asset = await db().asset.findUnique({ where: { symbol } });
  if (!asset) notFound();
  const settings = await getSettings(user.id);
  const fx = await getFx(settings);
  const cur = fx.currency;
  const [snap, signals, news, watched, risk, prices, candleRows] = await Promise.all([
    db().marketSnapshot.findUnique({ where: { kind_key_currency: { kind: "ASSET", key: symbol, currency: "USD" } } }),
    db().signal.findMany({ where: { userId: user.id, assetId: asset.id, status: "ACTIVE" } }),
    db().newsItem.findMany({ where: { assets: { has: symbol } }, orderBy: { publishedAt: "desc" }, take: 6 }),
    db().watchlistItem.findUnique({ where: { userId_assetId: { userId: user.id, assetId: asset.id } } }),
    riskClass(asset.id),
    priceChecks([symbol]),
    candleChecks(asset.id),
  ]);
  const m = convertRow(snap?.data as unknown as MarketRow | undefined, fx.rate) ?? undefined;
  const simple = settings.ui.simple;
  const verdict = computeVerdict(signals);
  const eurRate = fx.rate; // USD → display currency
  const tfs = ["1h", "4h", "1d", "1w"].filter((tf) => signals.some((s) => s.timeframe === tf));
  const dirs = new Set(signals.map((s) => `${s.timeframe}:${directionOf(s.state as SignalState)}`));
  const tfConflict = tfs.some((a) => dirs.has(`${a}:long`)) && tfs.some((b) => dirs.has(`${b}:exit`));

  return (
    <>
      <PageHeader
        title={`${asset.name} (${symbol})`}
        description={<span className="ltr">{t.analysisPair(asset.binanceSymbol ?? t.krakenOnly(symbol), asset.krakenPair ? t.fallbackKraken(asset.krakenPair) : t.noFallback)}</span>}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/explainer?symbol=${symbol}`}>{t.askAbout(coin)}</ButtonLink>
            <ButtonLink href={`/backtest?symbol=${symbol}`}>{t.backtest}</ButtonLink>
          </div>
        }
      />
      {GOLD_TOKENS.has(symbol) && <Alert tone="info" className="mb-4" title={t.goldTitle}>{t.goldBody(symbol)}</Alert>}
      {!watched && <Alert tone="info" className="mb-4">{t.notWatched(coin)}</Alert>}
      {watched && <AdvisorCard symbol={symbol} coin={coin} />}
      {watched && <div className="mb-4"><VerdictCard verdict={verdict} symbol={symbol} settings={settings} eurRate={eurRate} currency={cur} /></div>}
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-1"><div className="flex items-center justify-between gap-2 text-xs font-medium tracking-wide text-ink-2 uppercase">{t.price(currencyName(cur, locale))} <LiveBadge /></div><div className="mt-1"><LivePrice pair={asset.binanceSymbol} initial={m?.price ?? null} initialChange={m?.change24h} currency={cur} eurRate={eurRate} size="lg" align="left" />{GOLD_TOKENS.has(symbol) && <div className="mt-1"><LivePrice pair={asset.binanceSymbol} initial={m?.price ?? null} currency={cur} eurRate={eurRate} perGram showChange={false} align="left" /></div>}</div></div>
          <Stat label="1h" value={<Change value={m?.change1h} />} />
          <Stat label="7d / 30d" value={<Change value={m?.change7d} />} sub={<>30d <Change value={m?.change30d} /></>} />
          <Stat label={t.marketCap} value={cur === "IRT" ? <span className="block text-base whitespace-normal">{fmtBig(m?.marketCap, cur)}</span> : fmtBig(m?.marketCap, cur)} sub={m?.marketCapRank ? t.rank(m.marketCapRank) : undefined} />
          <Stat label={t.volume} value={cur === "IRT" ? <span className="block text-base whitespace-normal">{fmtBig(m?.volume24h, cur)}</span> : fmtBig(m?.volume24h, cur)} />
          <Stat label={t.volatility} value={<RiskBadge level={risk.level} />} sub={risk.atrPct !== null ? t.atr(risk.atrPct.toFixed(2)) : undefined} />
        </div>
      </Card>

      <DataCheckCard price={prices.get(symbol) ?? null} candles={candleRows} simple={simple} />

      <Card className="mb-4">
        <CardHeader title={t.chart} description={t.chartDesc} />
        <CandleChart symbol={symbol} initialTf={simple && settings.timeframes.includes("1d") ? "1d" : settings.timeframes.includes("4h") ? "4h" : settings.timeframes[0]} simple={simple} />
      </Card>

      <MarketPicture symbol={symbol} coin={coin} />

      <details className="group mb-4" open={!simple}>
        <summary className="mb-2 cursor-pointer list-none text-sm text-accent hover:underline">{simple ? t.showAll : ""}</summary>
      <Card className="mb-4">
        <CardHeader title={t.signalsTitle} description={t.signalsDesc} />
        {tfConflict && <Alert tone="warn" className="mb-3" title={t.conflictTitle}>{t.conflictBody}</Alert>}
        {signals.length === 0 ? (
          <EmptyState title={t.noSignals}>{t.noSignalsBody}</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className={th}>{t.strategy}</th>{tfs.map((tf) => <th key={tf} className={th}>{tfw(tf)}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {STRATEGIES.map((def) => (
                  <tr key={def.id}>
                    <td className={`${td} font-medium`}>{fa ? strategyName(def.id, locale) : def.name}</td>
                    {tfs.map((tf) => {
                      const s = signals.find((x) => x.strategyId === def.id && x.timeframe === tf);
                      return (
                        <td key={tf} className={td}>
                          {s ? (
                            <Link href={`/signals/${s.id}`} className="block hover:opacity-80">
                              <SignalBadge state={s.state} />
                              <div className="mt-0.5 text-xs text-ink-2">{t.rules(s.rulesMet, s.rulesTotal)} · {timeAgo(s.signalAt, now, locale)}</div>
                            </Link>
                          ) : <span className="text-xs text-ink-2">{t.notScanned}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      </details>

      <div className={simple ? "grid gap-4" : "grid gap-4 lg:grid-cols-2"}>
        <Card>
          <CardHeader title={t.alerts} description={t.alertsDesc} />
          <PriceAlerts symbol={symbol} />
        </Card>
        {!simple && <Card>
          <CardHeader title={t.headlines} description={t.headlinesDesc} action={<Link href={`/news?asset=${symbol}`} className="text-sm text-accent hover:underline">{t.more}</Link>} />
          {news.length === 0 ? <EmptyState title={t.noHeadlines} /> : (
            <ul className="space-y-2">
              {news.map((n) => (
                <li key={n.id} className="text-sm">
                  <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">{n.title}</a>
                  <div className="text-xs text-ink-2">{n.source} · {timeAgo(n.publishedAt, now, locale)}{n.kind === "OPINION" ? t.opinion : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>}
      </div>
    </>
  );
}
