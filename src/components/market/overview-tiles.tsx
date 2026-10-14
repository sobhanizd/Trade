import { Card, Stat } from "@/components/ui";
import { fmtBig, fmtDate, fmtPct, timeAgo } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import type { getMarketView } from "@/lib/views";

type View = Awaited<ReturnType<typeof getMarketView>>;

const L = {
  en: {
    trend: {} as Record<string, string>,
    trendHelp: {
      Uptrend: "BTC & ETH: price above EMA50 above SMA200 on daily candles",
      Downtrend: "BTC & ETH: price below EMA50 below SMA200 on daily candles",
      "Mixed / sideways": "BTC and ETH disagree or averages are tangled",
      Unknown: "Not enough daily data yet",
    } as Record<string, string>,
    vol: {} as Record<string, string>,
    mood: {} as Record<string, string>,
    marketTrend: "Market trend",
    unavailable: "Unavailable",
    waiting: "Waiting for the first snapshot",
    volatility: "Volatility (BTC 30d)",
    volSub: "Annualised realised vol. <40% low, >75% high",
    sentiment: "Sentiment",
    notConfigured: "Not configured",
    sentimentSub: (date: string) => `Fear & Greed Index (alternative.me), ${date}`,
    sentimentOff: "Enable SENTIMENT_ENABLED to show",
    totalCap: "Total market cap",
    capSub: (chg: string, dom: string) => `${chg} 24h · BTC dominance ${dom}%`,
    capSource: "CoinGecko /global",
    breadth1: "Breadth: ",
    breadthOf: (a: number, k: number) => `${a} of ${k}`,
    breadth2: (ago: string) => ` watchlist assets close above their daily EMA50. Overview computed ${ago}.`,
  },
  fa: {
    trend: { Uptrend: "روند صعودی", Downtrend: "روند نزولی", "Mixed / sideways": "نامشخص / درجا", Unknown: "نامعلوم" } as Record<string, string>,
    trendHelp: {
      Uptrend: "بیت‌کوین و اتریوم: در نمودار روزانه، قیمت بالای میانگین ۵۰ روزه (EMA50) و آن هم بالای میانگین ۲۰۰ روزه (SMA200) است",
      Downtrend: "بیت‌کوین و اتریوم: در نمودار روزانه، قیمت زیر میانگین ۵۰ روزه (EMA50) و آن هم زیر میانگین ۲۰۰ روزه (SMA200) است",
      "Mixed / sideways": "بیت‌کوین و اتریوم هم‌جهت نیستند یا میانگین‌ها درهم‌اند",
      Unknown: "هنوز دادهٔ روزانهٔ کافی نیست",
    } as Record<string, string>,
    vol: { Low: "کم", Normal: "عادی", High: "زیاد", Unknown: "نامعلوم" } as Record<string, string>,
    mood: { "Extreme Fear": "ترس شدید", Fear: "ترس", Neutral: "خنثی", Greed: "طمع", "Extreme Greed": "طمع شدید" } as Record<string, string>,
    marketTrend: "روند بازار",
    unavailable: "در دسترس نیست",
    waiting: "در انتظار اولین داده",
    volatility: "نوسان (بیت‌کوین، ۳۰ روز)",
    volSub: "نوسان سالانه‌شده: زیر ۴۰٪ کم، بالای ۷۵٪ زیاد",
    sentiment: "حال‌وهوای بازار (ترس و طمع)",
    notConfigured: "تنظیم نشده",
    sentimentSub: (date: string) => `شاخص ترس و طمع (alternative.me)، ${date}`,
    sentimentOff: "برای نمایش، SENTIMENT_ENABLED را فعال کنید",
    totalCap: "ارزش کل بازار",
    capSub: (chg: string, dom: string) => `${chg} در ۲۴ ساعت · سهم بیت‌کوین ${dom}%`,
    capSource: "CoinGecko /global",
    breadth1: "گستردگی بازار: ",
    breadthOf: (a: number, k: number) => `${a} از ${k}`,
    breadth2: (ago: string) => ` ارزِ شما بالای میانگین ۵۰ روزه (EMA50) روزانه‌شان بسته شده‌اند. این خلاصه ${ago} حساب شده است.`,
  },
} satisfies Dict<unknown>;

export async function OverviewTiles({ view }: { view: View }) {
  const t = await getL(L);
  const locale = await getLocale();
  // eslint-disable-next-line react-hooks/purity -- server component: rendered once per request
  const now = Date.now();
  const o = view.overview?.data;
  const s = view.sentiment?.data;
  const g = view.global?.data;
  const tr = (map: Record<string, string>, v: string) => map[v] ?? v;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card className="p-4">
        <Stat label={t.marketTrend} value={o?.overall ? tr(t.trend, o.overall) : t.unavailable} sub={o ? t.trendHelp[o.overall] : t.waiting} />
      </Card>
      <Card className="p-4">
        <Stat
          label={t.volatility}
          value={o?.volatility?.annualizedPct != null ? `${tr(t.vol, o.volatility.label)} · ${o.volatility.annualizedPct.toFixed(0)}%` : t.unavailable}
          sub={t.volSub}
        />
      </Card>
      <Card className="p-4">
        <Stat
          label={t.sentiment}
          value={s ? `${s.value} · ${tr(t.mood, s.classification)}` : t.notConfigured}
          sub={s ? t.sentimentSub(fmtDate(s.timestamp, false, locale)) : t.sentimentOff}
        />
      </Card>
      <Card className="p-4">
        <Stat
          label={t.totalCap}
          value={g ? fmtBig(g.totalMarketCapUsd, "USD") : t.unavailable}
          sub={g ? t.capSub(fmtPct(g.marketCapChange24hPct), g.btcDominancePct?.toFixed(1) ?? "—") : t.capSource}
        />
      </Card>
      {o?.breadth && (
        <Card className="col-span-2 p-4 lg:col-span-4">
          <p className="text-sm text-ink-2">
            {t.breadth1}<span className="font-medium text-ink">{t.breadthOf(o.breadth.above, o.breadth.known)}</span>{t.breadth2(timeAgo(view.overview?.fetchedAt, now, locale))}
          </p>
        </Card>
      )}
    </div>
  );
}
