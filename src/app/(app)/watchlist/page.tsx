import type { Metadata } from "next";
import Link from "next/link";
import { RiskBadge, SignalBadge } from "@/components/signal-badge";
import { Card, CardHeader, Change, EmptyState, PageHeader, TableWrap, td, th } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { fmtNum, timeAgo } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { strategyName, timeframeWord } from "@/lib/plain";
import { STRATEGIES } from "@/lib/strategies/registry";
import { getMarketView } from "@/lib/views";
import { AddAsset, RemoveAsset } from "./manage";
import { LiveBadge, LivePrice } from "@/components/live-price";
import { ActionPill } from "@/components/verdict-card";
import { GOLD_TOKENS } from "@/lib/format";

const L = {
  en: {
    metaTitle: "Watchlist",
    title: "My coins",
    description: "Add or remove coins. New coins must pass liquidity and data-quality checks.",
    addTitle: "Add an asset",
    filters: (mc: string, vol: string, days: number) =>
      `Filters (change in Settings): market cap ≥ $${mc}M, 24h volume ≥ $${vol}M, ≥ ${days} days of history, a USD(T) pair on Binance or Kraken. Stablecoins and wrapped tokens are excluded.`,
    emptyTitle: "Your watchlist is empty",
    emptyBody: "Add BTC, ETH or another liquid asset above.",
    thNow: "Now",
    thAsset: "Asset",
    thPrice: "Price (live)",
    thTrend: "Trend (rule engine)",
    thSignal: "Latest signal",
    thAge: "Age",
    thRisk: "Risk",
    thActions: "Actions",
    goldPerGram: "Gold (per gram)",
    pendingScan: "pending scan",
    footnote: "Trend column = Trend Following strategy state (daily if scanned). Risk = daily ATR as % of price: <3% low, 3–6% moderate, >6% high.",
  },
  fa: {
    metaTitle: "ارزهای من",
    title: "ارزهای من",
    description: "ارز اضافه یا حذف کنید. ارز جدید باید بررسی‌های نقدشوندگی (حجم معاملهٔ کافی) و کیفیت داده را با موفقیت بگذراند.",
    addTitle: "افزودن ارز",
    filters: (mc: string, vol: string, days: number) =>
      `شرط‌ها (در تنظیمات قابل تغییر است): ارزش بازار دست‌کم ${mc} میلیون دلار، حجم معاملات ۲۴ ساعته دست‌کم ${vol} میلیون دلار، دست‌کم ${days} روز سابقهٔ قیمت، و یک جفت‌ارز دلاری (USD یا USDT) در صرافی Binance یا Kraken. استیبل‌کوین‌ها (ارزهای هم‌ارز دلار) و توکن‌های پوشش‌داده‌شده (wrapped) پذیرفته نمی‌شوند.`,
    emptyTitle: "هنوز ارزی اضافه نکرده‌اید",
    emptyBody: "از بالا BTC، ETH یا یک ارز پرمعاملهٔ دیگر اضافه کنید.",
    thNow: "الان",
    thAsset: "ارز",
    thPrice: "قیمت (زنده)",
    thTrend: "روند (طبق قوانین)",
    thSignal: "آخرین سیگنال",
    thAge: "زمان",
    thRisk: "ریسک",
    thActions: "کارها",
    goldPerGram: "طلا (هر گرم)",
    pendingScan: "در انتظار بررسی",
    footnote: "ستون روند = وضعیت روش «همراه با روند» (روی نمودار روزانه، اگر بررسی شده باشد). ریسک = میانگین نوسان روزانه (ATR) به درصدی از قیمت: کمتر از ۳٪ کم، ۳ تا ۶٪ متوسط، بیشتر از ۶٪ زیاد.",
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.metaTitle };
}

export default async function WatchlistPage() {
  const user = await requireUser();
  const view = await getMarketView(user.id);
  const t = await getL(L);
  const locale = await getLocale();
  const fa = locale === "fa";
  // eslint-disable-next-line react-hooks/purity -- server component: rendered once per request
  const now = Date.now();
  const tfw = (tf: string) => (fa ? timeframeWord(tf, locale) : tf);
  const stratLabel = (name: string) => (fa ? strategyName(STRATEGIES.find((d) => d.name === name)?.id ?? name, locale) : name);
  const cur = view.currency;
  const f = view.settings.liquidity;
  return (
    <>
      <PageHeader title={t.title} description={<span className="inline-flex flex-wrap items-center gap-2"><LiveBadge /> · {t.description}</span>} />
      <Card className="mb-4">
        <CardHeader
          title={t.addTitle}
          description={t.filters((f.minMarketCapUsd / 1e6).toLocaleString("en-US"), (f.minVolume24hUsd / 1e6).toLocaleString("en-US"), f.minHistoryDays)}
        />
        <AddAsset watched={view.rows.map((r) => r.symbol)} />
      </Card>
      <Card>
        {view.rows.length === 0 ? (
          <EmptyState title={t.emptyTitle}>{t.emptyBody}</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr><th className={th}>{t.thNow}</th><th className={th}>{t.thAsset}</th><th className={th}>{t.thPrice}</th><th className={th}>1h</th><th className={th}>7d</th><th className={th}>30d</th><th className={th}>{t.thTrend}</th><th className={th}>RSI / ADX</th><th className={th}>{t.thSignal}</th><th className={th}>{t.thAge}</th><th className={th}>{t.thRisk}</th><th className={th}><span className="sr-only">{t.thActions}</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {view.rows.map((r) => (
                  <tr key={r.symbol}>
                    <td className={td}><ActionPill action={r.verdict.action} /></td>
                    <td className={td}><Link href={`/assets/${r.symbol}`} className="font-medium hover:underline">{r.symbol}</Link><div className="text-xs text-ink-2">{r.symbol === "PAXG" ? t.goldPerGram : r.name}</div></td>
                    <td className={td}><LivePrice pair={r.binanceSymbol} initial={r.market?.price ?? null} initialChange={r.market?.change24h} currency={cur} eurRate={view.rate} perGram={GOLD_TOKENS.has(r.symbol)} align="left" /></td>
                    <td className={td}><Change value={r.market?.change1h} /></td>
                    <td className={td}><Change value={r.market?.change7d} /></td>
                    <td className={td}><Change value={r.market?.change30d} /></td>
                    <td className={td}>{r.trend ? <span className="inline-flex items-center gap-1"><SignalBadge state={r.trend.state} /><span className="text-xs text-ink-2">{tfw(r.trend.timeframe)}</span></span> : <span className="text-ink-2">{t.pendingScan}</span>}</td>
                    <td className={`${td} tabular text-ink-2`}>{fmtNum(r.trend?.rsi ?? null, 1)} / {fmtNum(r.trend?.adx ?? null, 1)}</td>
                    <td className={td}>{r.latestSignal ? <Link href={`/signals/${r.latestSignal.id}`} className="inline-flex flex-col"><SignalBadge state={r.latestSignal.state} /><span className="text-xs text-ink-2">{stratLabel(r.latestSignal.strategy)} · {tfw(r.latestSignal.timeframe)}</span></Link> : "—"}</td>
                    <td className={`${td} text-ink-2`}>{r.latestSignal ? timeAgo(r.latestSignal.at, now, locale) : "—"}</td>
                    <td className={td}><RiskBadge level={r.risk.level} /></td>
                    <td className={td}><RemoveAsset symbol={r.symbol} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="mt-3 text-xs text-ink-2">{t.footnote}</p>
      </Card>
    </>
  );
}
