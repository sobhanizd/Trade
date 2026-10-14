import type { Metadata } from "next";
import Link from "next/link";
import { OverviewTiles } from "@/components/market/overview-tiles";
import { RiskBadge } from "@/components/signal-badge";
import { Card, CardHeader, Change, EmptyState, PageHeader, TableWrap, td, th } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { currencyName, fmtBig, fmtDate, fmtPrice, perGram, timeAgo, type Currency } from "@/lib/format";
import { getMarketView } from "@/lib/views";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";

const L = {
  en: {
    title: "Market overview",
    description: (cur: string) => `Prices in ${currencyName(cur as Currency)} from CoinGecko${cur !== "USD" ? " (USD values converted with the euro rate in the currency menu; % changes are USD-based)" : ""}. Analysis uses USD-quoted exchange pairs (USDT on Binance, USD on Kraken).`,
    watched: "Watched assets",
    watchedDesc: "Price changes as reported by the provider; “—” means the provider did not return that value.",
    noAssets: "No assets in your watchlist",
    thAsset: "Asset",
    thPrice: "Price",
    thCap: "Market cap",
    thVol: "Volume 24h",
    thAtr: "Daily ATR",
    thUpdated: "Updated",
    trendTitle: "Trend detail (daily)",
    trend: {} as Record<string, string>,
    trendLine: (close: string, ema50: string, sma200: string) => `close ${close} · EMA50 ${ema50} · SMA200 ${sma200}`,
    trendNone: "Trend data unavailable",
    currency: "Currency",
    fxRate: (rate: string) => `${rate} EUR`,
    fxInfo: (source: string, date: string) => ` (${source}, rate date ${date}). Used to convert USD-quoted signal levels when EUR display is selected.`,
    fxNone: "FX rate unavailable — EUR conversions of signal levels are hidden.",
  },
  fa: {
    title: "نمای کلی بازار",
    description: (cur: string) => `قیمت‌ها به ${currencyName(cur as Currency, "fa")} از CoinGecko${cur !== "USD" ? " (مقدارهای دلاری با نرخ‌های منوی واحد پول تبدیل شده‌اند؛ درصد تغییرها بر پایهٔ دلار است)" : ""}. تحلیل با جفت‌ارزهای دلاری صرافی‌ها انجام می‌شود (USDT در Binance و USD در Kraken).`,
    watched: "ارزهای من",
    watchedDesc: "تغییر قیمت‌ها همان‌طور که منبع داده گزارش کرده؛ «—» یعنی منبع داده آن مقدار را نداده است.",
    noAssets: "هنوز ارزی در «ارزهای من» نیست",
    thAsset: "ارز",
    thPrice: "قیمت",
    thCap: "ارزش بازار",
    thVol: "حجم معاملات ۲۴ ساعته",
    thAtr: "نوسان روزانه (ATR)",
    thUpdated: "به‌روزرسانی",
    trendTitle: "جزئیات روند (روزانه)",
    trend: { Uptrend: "روند صعودی", Downtrend: "روند نزولی", "Mixed / sideways": "نامشخص / درجا", Unknown: "نامعلوم" } as Record<string, string>,
    trendLine: (close: string, ema50: string, sma200: string) => `قیمت پایانی ${close} · EMA50 ${ema50} · SMA200 ${sma200}`,
    trendNone: "دادهٔ روند در دسترس نیست",
    currency: "ارز (پول رایج)",
    fxRate: (rate: string) => `${rate} EUR`,
    fxInfo: (source: string, date: string) => ` (${source}، تاریخ نرخ ${date}). برای تبدیل سطح‌های دلاری سیگنال‌ها به یورو، وقتی نمایش یورو انتخاب شده باشد.`,
    fxNone: "نرخ تبدیل ارز در دسترس نیست — تبدیل سطح‌های سیگنال به یورو نمایش داده نمی‌شود.",
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.title };
}

export default async function MarketPage() {
  const user = await requireUser();
  const view = await getMarketView(user.id);
  const cur = view.currency;
  const t = await getL(L);
  const locale = await getLocale();
  // eslint-disable-next-line react-hooks/purity -- server component: rendered once per request
  const now = Date.now();
  return (
    <>
      <PageHeader title={t.title} description={t.description(cur)} />
      <OverviewTiles view={view} />
      <Card className="mt-4">
        <CardHeader title={t.watched} description={t.watchedDesc} />
        {view.rows.length === 0 ? (
          <EmptyState title={t.noAssets} />
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>{t.thAsset}</th><th className={th}>{t.thPrice}</th><th className={th}>1h</th><th className={th}>24h</th><th className={th}>7d</th><th className={th}>30d</th>
                  <th className={th}>{t.thCap}</th><th className={th}>{t.thVol}</th><th className={th}>{t.thAtr}</th><th className={th}>{t.thUpdated}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {view.rows.map((r) => (
                  <tr key={r.symbol}>
                    <td className={td}><Link href={`/assets/${r.symbol}`} className="font-medium hover:underline">{r.symbol}</Link> <span className="text-ink-2">{r.name}</span></td>
                    <td className={`${td} tabular`}>{fmtPrice(r.market?.price, cur)}{perGram(r.symbol, r.market?.price, cur) && <div className="text-xs text-ink-2">{perGram(r.symbol, r.market?.price, cur)}</div>}</td>
                    <td className={td}><Change value={r.market?.change1h} /></td>
                    <td className={td}><Change value={r.market?.change24h} /></td>
                    <td className={td}><Change value={r.market?.change7d} /></td>
                    <td className={td}><Change value={r.market?.change30d} /></td>
                    <td className={`${td} tabular`}>{fmtBig(r.market?.marketCap, cur)}</td>
                    <td className={`${td} tabular`}>{fmtBig(r.market?.volume24h, cur)}</td>
                    <td className={td}><RiskBadge level={r.risk.level} /> <span className="text-xs text-ink-2">{r.risk.atrPct !== null ? `${r.risk.atrPct.toFixed(1)}%` : ""}</span></td>
                    <td className={`${td} text-xs text-ink-2`} title={fmtDate(r.market?.lastUpdated, true, locale)}>{timeAgo(r.market?.lastUpdated, now, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title={t.trendTitle} description={view.overview?.source} />
          {view.overview?.data.trends.length ? (
            <ul className="space-y-2 text-sm">
              {view.overview.data.trends.map((x) => (
                <li key={x.symbol} className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{x.symbol}: {t.trend[x.label] ?? x.label}</span>
                  <span className={locale === "fa" ? "text-ink-2" : "text-ink-2 tabular"}>{t.trendLine(fmtPrice(x.close), fmtPrice(x.ema50), fmtPrice(x.sma200))}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title={t.trendNone} />}
        </Card>
        <Card>
          <CardHeader title={t.currency} />
          {view.fx ? (
            <p className="text-sm text-ink-2"><span className="ltr">1 USD = <span className="font-medium text-ink">{t.fxRate(view.fx.data.rate.toFixed(4))}</span></span>{t.fxInfo(view.fx.data.source, view.fx.data.date)}</p>
          ) : <p className="text-sm text-ink-2">{t.fxNone}</p>}
        </Card>
      </div>
    </>
  );
}
