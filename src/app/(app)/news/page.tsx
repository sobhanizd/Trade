import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { integrationStatus } from "@/lib/env";
import { fmtDate, timeAgo } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import type { SentimentReading } from "@/lib/market/types";

const L = {
  en: {
    title: "News & sentiment",
    description: "Headlines with source, time and link — never full articles. Classification below is a keyword heuristic, not verified analysis.",
    notConfiguredTitle: "News is not configured",
    notConfigured: "Set NEWS_ENABLED=true and NEWS_RSS_FEEDS to show headlines. No headlines are ever generated.",
    headlines: "Headlines",
    headlinesNote: "Social-media hype and sentiment alone are not reliable trading signals.",
    all: "All",
    significantOnly: "Potentially significant only",
    noHeadlines: "No headlines",
    noHeadlinesBody: "Nothing stored for this filter yet (refreshed every 30 minutes).",
    opinion: "opinion / analysis",
    whyMatters: (tags: string) => `Why it may matter: headlines about ${tags.toLowerCase()} have historically coincided with volatility. Read the original source and verify before drawing conclusions.`,
    tags: {} as Record<string, string>,
    tagJoin: ", ",
    sentiment: "Market sentiment",
    fearGreed: "Fear & Greed Index",
    classes: {} as Record<string, string>,
    sentimentAria: (v: number) => `Sentiment ${v} of 100`,
    sentimentNote: (source: string, date: string) => `Source: ${source}. Published ${date}. Extreme fear or greed describes the crowd mood, not where price will go.`,
    sentimentUnavailable: "Sentiment unavailable",
    sentimentUnavailableBody: "Enable SENTIMENT_ENABLED; no value is shown unless fetched from the source.",
  },
  fa: {
    title: "اخبار و حال‌وهوای بازار",
    description: "تیتر خبرها با منبع، زمان و لینک — هیچ‌وقت متن کامل خبر نیست. دسته‌بندی پایین فقط بر اساس کلمه‌های کلیدی است، نه تحلیل تأییدشده.",
    notConfiguredTitle: "اخبار راه‌اندازی نشده است",
    notConfigured: "برای نمایش تیتر خبرها، NEWS_ENABLED=true و NEWS_RSS_FEEDS را تنظیم کنید. برنامه هیچ‌وقت خودش خبر نمی‌سازد.",
    headlines: "تیتر خبرها",
    headlinesNote: "هیاهوی شبکه‌های اجتماعی و حال‌وهوای بازار به‌تنهایی سیگنال قابل‌اعتمادی برای خرید و فروش نیستند.",
    all: "همه",
    significantOnly: "فقط خبرهای احتمالاً مهم",
    noHeadlines: "خبری نیست",
    noHeadlinesBody: "هنوز خبری برای این فیلتر ذخیره نشده است (هر ۳۰ دقیقه به‌روز می‌شود).",
    opinion: "نظر / تحلیل",
    whyMatters: (tags: string) => `چرا ممکن است مهم باشد: خبرهایی دربارهٔ ${tags} در گذشته معمولاً با نوسان قیمت همراه بوده‌اند. پیش از هر نتیجه‌گیری، خبر اصلی را بخوانید و درستی‌اش را بررسی کنید.`,
    tags: {
      ETF: "صندوق ETF",
      "Regulation/legal": "قانون و مقررات",
      "Security incident": "حادثهٔ امنیتی (هک)",
      Macro: "اقتصاد کلان (بهره، تورم)",
      "Network event": "رویداد شبکه",
      "Market stress": "فشار و بحران بازار",
      Corporate: "خبر شرکتی",
    } as Record<string, string>,
    tagJoin: "، ",
    sentiment: "حال‌وهوای بازار",
    fearGreed: "شاخص ترس و طمع",
    classes: {
      "Extreme Fear": "ترس شدید",
      Fear: "ترس",
      Neutral: "خنثی",
      Greed: "طمع",
      "Extreme Greed": "طمع شدید",
    } as Record<string, string>,
    sentimentAria: (v: number) => `حال‌وهوای بازار: ${v} از ۱۰۰`,
    sentimentNote: (source: string, date: string) => `منبع: ${source}. تاریخ انتشار: ${date}. ترس یا طمعِ شدید فقط حال جمعیت را نشان می‌دهد، نه این‌که قیمت به کدام سمت می‌رود.`,
    sentimentUnavailable: "حال‌وهوای بازار در دسترس نیست",
    sentimentUnavailableBody: "SENTIMENT_ENABLED را روشن کنید؛ تا وقتی عددی از منبع گرفته نشود، چیزی نشان داده نمی‌شود.",
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.title };
}

export default async function NewsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const [t, locale] = await Promise.all([getL(L), getLocale()]);
  const sp = await searchParams;
  const asset = sp.asset?.toUpperCase();
  const onlySignificant = sp.significant === "1";
  const [items, watch, sent] = await Promise.all([
    db().newsItem.findMany({ where: { ...(asset ? { assets: { has: asset } } : {}), ...(onlySignificant ? { significance: "POTENTIAL" } : {}) }, orderBy: { publishedAt: "desc" }, take: 80 }),
    db().watchlistItem.findMany({ where: { userId: user.id }, include: { asset: { select: { symbol: true } } } }),
    db().marketSnapshot.findUnique({ where: { kind_key_currency: { kind: "SENTIMENT", key: "fear_greed", currency: "USD" } } }),
  ]);
  const st = integrationStatus();
  const s = sent?.data as unknown as SentimentReading | undefined;
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ asset, significant: onlySignificant ? "1" : undefined, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/news${p.size ? `?${p}` : ""}`;
  };
  const tag = (x: string) => t.tags[x] ?? x;
  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      {!st.news && <Alert tone="info" className="mb-4" title={t.notConfiguredTitle}>{t.notConfigured}</Alert>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t.headlines} description={t.headlinesNote} />
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <Link href={q({ asset: undefined })} className={!asset ? "font-semibold text-accent" : "text-ink-2 hover:underline"}>{t.all}</Link>
            {watch.map((w) => <Link key={w.asset.symbol} href={q({ asset: w.asset.symbol })} className={asset === w.asset.symbol ? "font-semibold text-accent" : "text-ink-2 hover:underline"}>{w.asset.symbol}</Link>)}
            <span className="text-ink-2">·</span>
            <Link href={q({ significant: onlySignificant ? undefined : "1" })} className={onlySignificant ? "font-semibold text-accent" : "text-ink-2 hover:underline"}>{t.significantOnly}</Link>
          </div>
          {items.length === 0 ? <EmptyState title={t.noHeadlines}>{t.noHeadlinesBody}</EmptyState> : (
            <ul className="divide-y divide-line">
              {items.map((n) => (
                <li key={n.id} className="py-3">
                  <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" dir="auto" className="text-sm font-medium hover:underline">{n.title}</a>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
                    <span>{n.source}</span><span>·</span><span title={fmtDate(n.publishedAt, true, locale)}>{timeAgo(n.publishedAt, undefined, locale)}</span>
                    {n.kind === "OPINION" && <Badge>{t.opinion}</Badge>}
                    {n.tags.map((x) => <Badge key={x} tone="warn">{tag(x)}</Badge>)}
                    {n.assets.map((a) => <Badge key={a} tone="accent">{a}</Badge>)}
                  </div>
                  {n.significance === "POTENTIAL" && <p className="mt-1 text-xs text-ink-2">{t.whyMatters(n.tags.map(tag).join(t.tagJoin))}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t.sentiment} />
          {s ? (
            <>
              <Stat label={t.fearGreed} value={`${s.value} / 100`} sub={t.classes[s.classification] ?? s.classification} />
              <div className="mt-3 h-2 w-full rounded-full bg-surface-2" role="img" aria-label={t.sentimentAria(s.value)}><div className="h-2 rounded-full bg-accent" style={{ width: `${s.value}%` }} /></div>
              <p className="mt-3 text-xs text-ink-2">{t.sentimentNote(s.source, fmtDate(s.timestamp, false, locale))}</p>
            </>
          ) : <EmptyState title={t.sentimentUnavailable}>{t.sentimentUnavailableBody}</EmptyState>}
        </Card>
      </div>
    </>
  );
}
