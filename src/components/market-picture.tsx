"use client";
/**
 * "Market picture" under the chart: up or down (days / weeks / months),
 * month-by-month changes, trend lines in words, if-then levels, what happened
 * after similar moments in the past, and news around big price days.
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, Card, CardHeader, Skeleton } from "@/components/ui";
import type { Outlook } from "@/lib/analysis/outlook";
import type { NewsTopic, RatedNews } from "@/lib/analysis/news";
import type { Dir, HorizonStats } from "@/lib/analysis/structure";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { fmtPrice } from "@/lib/format";
import { dateLocale, type Dict, type Locale } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";

const pct = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}%`;
/** Keeps numbers left-to-right inside Persian sentences. */
const iso = (x: string) => `⁦${x}⁩`;

const L = {
  en: {
    title: "Market picture — going up or down?",
    desc: "Worked out from the daily chart with written rules. It describes the past and present — it is not a promise about the future.",
    loading: "Reading the market…",
    error: "The market picture could not be loaded",
    // urgent
    urgentTitle: "⚠️ Needs your attention today",
    urgentMove: (c: string, p: string) => `${c} moved ${p} in the last 24 hours — much more than usual.`,
    urgentDo: "What you can do: if you own it, check that your safety exit (stop) is set. Don't buy or sell in a panic — big moves often partly reverse. Wait for today's daily candle to close, and read the full news at the source.",
    calm: (c: string) => `✅ No breaking news and no unusual price move for ${c} in the last 24 hours. Nothing you need to do in a hurry.`,
    // direction
    overall: { bull: "🐂 Bullish — the trend is up", bear: "🐻 Bearish — the trend is down", sideways: "↔️ Sideways / mixed — no clear trend" },
    overallText: {
      bull: "Most signs point up. Dips are normal inside an uptrend, but buying after a big jump is still riskier than buying a dip.",
      bear: "Most signs point down. Rises inside a downtrend often fade — be patient and careful with buying.",
      sideways: "The signs disagree. In a market like this, buying near the floor and being careful near the ceiling works better than chasing moves.",
    },
    horizon: { short: "Next days", medium: "Next weeks", long: "Months" },
    dirWord: { up: "↑ Up", down: "↓ Down", mixed: "↔ Unclear" } as Record<Dir, string>,
    shortWhy: { up: (r: string) => `${r} this week and above its 20-day average.`, down: (r: string) => `${r} this week and below its 20-day average.`, mixed: (r: string) => `${r} this week — no clear direction.` } as Record<Dir, (r: string) => string>,
    mediumWhy: { up: "Above its 50-day average, which is rising.", down: "Below its 50-day average, which is falling.", mixed: "Around its 50-day average — undecided." } as Record<Dir, string>,
    longWhy: { up: "Above its 200-day average, which is rising — the big trend is up.", down: "Below its 200-day average, which is falling — the big trend is down.", mixed: "Around its 200-day average — the big trend is unclear." } as Record<Dir, string>,
    swings: { up: "Recent highs and lows are getting higher — a healthy uptrend.", down: "Recent highs and lows are getting lower — a downtrend.", mixed: "" } as Record<Dir, string>,
    // changes
    lately: "Up or down lately?",
    d7: "7 days", d30: "30 days", d90: "90 days", d365: "1 year",
    monthsTitle: "Month by month",
    soFar: "so far",
    lastMonth: (m: string, p: string, up: boolean) => `Last month (${m}) it went ${up ? "up" : "down"} ${p}.`,
    thisMonth: (m: string, p: string) => `This month (${m}) so far: ${p}.`,
    // lines
    linesTitle: "The lines on the chart",
    linesNote: "Dashed lines on the daily chart: the green floor line connects the recent low points, the orange ceiling line connects the recent high points.",
    pattern: {
      upChannel: "📈 Rising channel: the floor and ceiling both go up — buyers are in control. Buying near the floor line is usually safer than near the ceiling.",
      downChannel: "📉 Falling channel: both lines go down — sellers are in control. Rises often stop at the ceiling line.",
      squeeze: "🔺 Squeeze: the floor rises while the ceiling falls. A bigger move often comes next, but which way is unknown until the price breaks out.",
      widening: "〰️ Widening: the swings are getting bigger — a nervous market with higher risk.",
      range: "↔️ Sideways range: the price bounces between a flat floor and ceiling. Cheaper near the floor, expensive near the ceiling.",
      ascending: "📈 Rising floor under a flat ceiling: buyers keep paying more. A daily close above the ceiling would be a good sign.",
      descending: "📉 Falling ceiling over a flat floor: sellers keep pushing. A daily close below the floor would be a bad sign.",
      none: "No clear trend lines right now.",
    } as Record<string, string>,
    brokeSupport: (p: string) => `⚠️ The price closed below its rising floor line (now about ${p}). That is a warning sign: the move up is losing strength.`,
    brokeResistance: (p: string) => `✅ The price closed above its ceiling line (now about ${p}). That is a sign of strength.`,
    ifTitle: "What to watch",
    ifUp: (a: string, b: string | null, d: string | null) => `🟢 If a day closes above ${a}: a sign of strength${b ? ` — the next level is about ${b} (${d})` : ""}.`,
    ifDown: (a: string, b: string | null, d: string | null) => `🔴 If a day closes below ${a}: a sign of weakness${b ? ` — the next level is about ${b} (${d})` : ""}.`,
    ifBetween: "In between: no clear signal — waiting is fine.",
    // analogs
    anTitle: "What happened after similar moments? (history, not a promise)",
    anIntro: (n: number, year: string, today: string) => `We searched every day since ${year} for the ${n} moments that looked most like today (${today}) and checked what the price did next.`,
    today: (r30: string, r7: string, ema: string, above: boolean) => `${r30} in 30 days, ${r7} this week, ${ema} vs its 50-day average, ${above ? "above" : "below"} its 200-day average`,
    after: { h7: "After 7 days", h30: "After 30 days", h90: "After 90 days" },
    upOf: (up: number, n: number) => `Went up ${up} of ${n} times`,
    typical: "Typical result",
    middle: "Most results between",
    worstBest: "Worst / best",
    normally: (p: string) => `Normally: up ${p} of the time`,
    leanUp: "➡️ Similar moments were followed by rises more often than usual.",
    leanDown: "➡️ Similar moments were followed by falls more often than usual — a reason for caution.",
    leanNone: "➡️ Similar moments did not lean clearly either way.",
    examples: "Most recent similar days",
    later30: (p: string) => `30 days later: ${p}`,
    anCaveat: "This is history, not a prediction. The market can behave differently this time — always keep a safety exit.",
    anNone: "Not enough price history yet to compare.",
    // news
    newsTitle: "News and the price",
    bigDays: "Big price days (last 30 days)",
    noBigDays: "No unusually big price days in the last 30 days.",
    aroundNews: "Headlines around that day (they may or may not be the cause):",
    noNewsAround: (since: string | null) => `No important headline found around this day${since ? ` (news history starts ${since})` : ""}.`,
    important: "Important headlines (last 30 days)",
    noImportant: "No important headlines in the last 30 days.",
    level: { high: "Serious", medium: "Worth knowing", low: "Minor" },
    about: { coin: "about this coin", market: "whole market" },
    topic: {
      security: "Hacks and thefts can cause sudden drops. If your coins are on the affected service, follow its official updates.",
      stress: "Bankruptcies and forced selling can push prices down fast for a while.",
      legal: "Rules and court news can move prices for days. Wait for the price to confirm before acting.",
      etf: "ETF money flows show big investors' demand: money flowing in tends to support the price, money flowing out weighs on it.",
      macro: "US inflation and interest-rate news often causes sharp moves on the day it is released. Avoid buying right before it.",
      network: "Upgrades and network events can bring bigger swings around the date.",
      corporate: "Company news (listings, deals) usually has a short effect.",
      other: "",
    } as Record<NewsTopic, string>,
    newsCaveat: "News is matched by keywords in headlines from CoinDesk, Cointelegraph and Decrypt, so the app can miss news or over-rate a headline. A headline alone is never a reason to buy or sell.",
  },
  fa: {
    title: "تصویر بازار — رو به بالا یا پایین؟",
    desc: "از نمودار روزانه و با قانون‌های مکتوب به دست آمده. گذشته و حال را توضیح می‌دهد — قولی دربارهٔ آینده نیست.",
    loading: "در حال بررسی بازار…",
    error: "تصویر بازار بارگذاری نشد",
    urgentTitle: "⚠️ امروز به این توجه کنید",
    urgentMove: (c: string, p: string) => `${c} در 24 ساعت گذشته ${p} تغییر کرده — خیلی بیشتر از معمول.`,
    urgentDo: "کاری که می‌توانید بکنید: اگر این ارز را دارید، مطمئن شوید حد ضرر (خروج امن) را گذاشته‌اید. با ترس نخرید و نفروشید — حرکت‌های تند معمولاً بخشی‌شان برمی‌گردد. صبر کنید کندل روزانهٔ امروز بسته شود و خبر کامل را از منبع بخوانید.",
    calm: (c: string) => `✅ در 24 ساعت گذشته خبر فوری یا حرکت غیرعادی قیمت برای ${c} نبوده. کار عجله‌ای لازم نیست.`,
    overall: { bull: "🐂 صعودی — روند رو به بالاست", bear: "🐻 نزولی — روند رو به پایین است", sideways: "↔️ خنثی / نامشخص — روند واضحی نیست" },
    overallText: {
      bull: "بیشتر نشانه‌ها رو به بالا هستند. افت‌های کوتاه در روند صعودی عادی است، ولی خریدن بعد از یک جهش بزرگ باز هم پرریسک‌تر از خریدن در افت است.",
      bear: "بیشتر نشانه‌ها رو به پایین هستند. در روند نزولی، بالا رفتن‌ها معمولاً دوام نمی‌آورند — برای خرید صبور و محتاط باشید.",
      sideways: "نشانه‌ها با هم هم‌نظر نیستند. در چنین بازاری، خرید نزدیک کف و احتیاط نزدیک سقف بهتر از دنبال کردن حرکت‌هاست.",
    },
    horizon: { short: "روزهای آینده", medium: "هفته‌های آینده", long: "ماه‌ها" },
    dirWord: { up: "↑ بالا", down: "↓ پایین", mixed: "↔ نامشخص" } as Record<Dir, string>,
    shortWhy: { up: (r: string) => `${r} در این هفته و بالای میانگین 20 روزه.`, down: (r: string) => `${r} در این هفته و زیر میانگین 20 روزه.`, mixed: (r: string) => `${r} در این هفته — جهت واضحی ندارد.` } as Record<Dir, (r: string) => string>,
    mediumWhy: { up: "بالای میانگین 50 روزه‌اش است و آن میانگین رو به بالاست.", down: "زیر میانگین 50 روزه‌اش است و آن میانگین رو به پایین است.", mixed: "نزدیک میانگین 50 روزه — بلاتکلیف." } as Record<Dir, string>,
    longWhy: { up: "بالای میانگین 200 روزه‌اش است و آن میانگین رو به بالاست — روند بزرگ صعودی است.", down: "زیر میانگین 200 روزه‌اش است و آن میانگین رو به پایین است — روند بزرگ نزولی است.", mixed: "نزدیک میانگین 200 روزه — روند بزرگ نامشخص است." } as Record<Dir, string>,
    swings: { up: "سقف‌ها و کف‌های اخیر بالاتر می‌روند — یک روند صعودی سالم.", down: "سقف‌ها و کف‌های اخیر پایین‌تر می‌آیند — روند نزولی.", mixed: "" } as Record<Dir, string>,
    lately: "اخیراً بالا رفته یا پایین آمده؟",
    d7: "7 روز", d30: "30 روز", d90: "90 روز", d365: "1 سال",
    monthsTitle: "ماه به ماه",
    soFar: "تا امروز",
    lastMonth: (m: string, p: string, up: boolean) => `ماه گذشته (${m}) ${p} ${up ? "بالا رفت" : "پایین آمد"}.`,
    thisMonth: (m: string, p: string) => `این ماه (${m}) تا امروز: ${p}.`,
    linesTitle: "خط‌های روی نمودار",
    linesNote: "خط‌چین‌های روی نمودار روزانه: خط سبزِ کف، پایین‌ترین نقطه‌های اخیر را به هم وصل می‌کند و خط نارنجیِ سقف، بالاترین نقطه‌های اخیر را.",
    pattern: {
      upChannel: "📈 کانال صعودی: کف و سقف هر دو بالا می‌روند — کنترل دست خریداران است. خرید نزدیک خط کف معمولاً امن‌تر از نزدیک سقف است.",
      downChannel: "📉 کانال نزولی: هر دو خط پایین می‌آیند — کنترل دست فروشندگان است. بالا رفتن‌ها معمولاً زیر خط سقف متوقف می‌شوند.",
      squeeze: "🔺 فشردگی (مثلث): کف بالا می‌آید و سقف پایین می‌رود. معمولاً بعدش حرکت بزرگ‌تری می‌آید، ولی جهتش تا شکسته شدن یکی از خط‌ها معلوم نیست.",
      widening: "〰️ بازشونده: نوسان‌ها بزرگ‌تر می‌شوند — بازاری عصبی با ریسک بیشتر.",
      range: "↔️ محدودهٔ خنثی: قیمت بین یک کف و سقف صاف بالا و پایین می‌رود. نزدیک کف ارزان‌تر، نزدیک سقف گران.",
      ascending: "📈 کفِ رو به بالا زیر سقفِ صاف: خریداران هر بار قیمت بالاتری می‌پردازند. بسته شدن روزانه بالای سقف نشانهٔ خوبی است.",
      descending: "📉 سقفِ رو به پایین روی کفِ صاف: فروشندگان مدام فشار می‌آورند. بسته شدن روزانه زیر کف نشانهٔ بدی است.",
      none: "الان خط روند واضحی دیده نمی‌شود.",
    } as Record<string, string>,
    brokeSupport: (p: string) => `⚠️ قیمت زیر خط کفِ رو به بالا بسته شد (الان حدود ${p}). این یک نشانهٔ هشدار است: حرکت رو به بالا دارد قدرتش را از دست می‌دهد.`,
    brokeResistance: (p: string) => `✅ قیمت بالای خط سقف بسته شد (الان حدود ${p}). این نشانهٔ قدرت است.`,
    ifTitle: "به چه چیزی نگاه کنید",
    ifUp: (a: string, b: string | null, d: string | null) => `🟢 اگر یک روز بالای ${a} بسته شود: نشانهٔ قدرت${b ? ` — سطح بعدی حدود ${b} است (${d})` : ""}.`,
    ifDown: (a: string, b: string | null, d: string | null) => `🔴 اگر یک روز زیر ${a} بسته شود: نشانهٔ ضعف${b ? ` — سطح بعدی حدود ${b} است (${d})` : ""}.`,
    ifBetween: "بین این دو: نشانهٔ واضحی نیست — صبر کردن اشکالی ندارد.",
    anTitle: "بعد از لحظه‌های مشابه چه شد؟ (تاریخچه، نه قول)",
    anIntro: (n: number, year: string, today: string) => `همهٔ روزهای از سال ${year} به بعد را گشتیم تا ${n} لحظه‌ای را پیدا کنیم که بیشترین شباهت را به امروز داشتند (${today}) و دیدیم قیمت بعدش چه کرد.`,
    today: (r30: string, r7: string, ema: string, above: boolean) => `${r30} در 30 روز، ${r7} در این هفته، ${ema} نسبت به میانگین 50 روزه، ${above ? "بالای" : "زیر"} میانگین 200 روزه`,
    after: { h7: "بعد از 7 روز", h30: "بعد از 30 روز", h90: "بعد از 90 روز" },
    upOf: (up: number, n: number) => `${up} بار از ${n} بار بالا رفت`,
    typical: "نتیجهٔ معمول",
    middle: "بیشتر نتیجه‌ها بین",
    worstBest: "بدترین / بهترین",
    normally: (p: string) => `در حالت عادی: ${p} مواقع بالا رفته`,
    leanUp: "⬅️ بعد از لحظه‌های مشابه، بیشتر از معمول قیمت بالا رفته است.",
    leanDown: "⬅️ بعد از لحظه‌های مشابه، بیشتر از معمول قیمت پایین آمده — دلیلی برای احتیاط.",
    leanNone: "⬅️ لحظه‌های مشابه به طرف خاصی متمایل نبودند.",
    examples: "تازه‌ترین روزهای مشابه",
    later30: (p: string) => `30 روز بعد: ${p}`,
    anCaveat: "این تاریخچه است، نه پیش‌بینی. بازار ممکن است این بار جور دیگری رفتار کند — همیشه حد ضرر داشته باشید.",
    anNone: "هنوز تاریخچهٔ قیمت کافی برای مقایسه نیست.",
    newsTitle: "خبرها و قیمت",
    bigDays: "روزهای با تغییر بزرگ قیمت (30 روز اخیر)",
    noBigDays: "در 30 روز اخیر روزی با تغییر غیرعادی قیمت نبوده.",
    aroundNews: "تیترهای حوالی آن روز (ممکن است علت باشند یا نباشند):",
    noNewsAround: (since: string | null) => `خبر مهمی حوالی این روز پیدا نشد${since ? ` (تاریخچهٔ خبرها از ${since} شروع می‌شود)` : ""}.`,
    important: "تیترهای مهم (30 روز اخیر)",
    noImportant: "در 30 روز اخیر تیتر مهمی نبوده.",
    level: { high: "جدی", medium: "خوب است بدانید", low: "کم‌اهمیت" },
    about: { coin: "دربارهٔ همین ارز", market: "کل بازار" },
    topic: {
      security: "هک و سرقت می‌تواند باعث ریزش ناگهانی شود. اگر ارزهای شما روی سرویس آسیب‌دیده است، اطلاعیه‌های رسمی‌اش را دنبال کنید.",
      stress: "ورشکستگی و فروش اجباری می‌تواند مدتی قیمت را سریع پایین بیاورد.",
      legal: "خبرهای قانونی و دادگاهی می‌توانند چند روز روی قیمت اثر بگذارند. قبل از هر کاری صبر کنید قیمت هم تأیید کند.",
      etf: "جریان پول صندوق‌های ETF تقاضای سرمایه‌گذاران بزرگ را نشان می‌دهد: ورود پول معمولاً به قیمت کمک می‌کند و خروج پول به آن فشار می‌آورد.",
      macro: "خبرهای تورم و نرخ بهرهٔ آمریکا معمولاً در روز انتشار حرکت تندی ایجاد می‌کنند. درست قبل از انتشارشان نخرید.",
      network: "ارتقا و رویدادهای شبکه ممکن است حوالی آن تاریخ نوسان بیشتری بیاورند.",
      corporate: "خبرهای شرکتی (لیست شدن، قرارداد) معمولاً اثر کوتاهی دارند.",
      other: "",
    } as Record<NewsTopic, string>,
    newsCaveat: "خبرها با کلمه‌های کلیدی در تیترهای CoinDesk، Cointelegraph و Decrypt پیدا می‌شوند؛ پس ممکن است خبری جا بماند یا اهمیت تیتری بیشتر از واقع نشان داده شود. یک تیتر به‌تنهایی هیچ‌وقت دلیل خرید یا فروش نیست.",
  },
} satisfies Dict<unknown>;
type T = (typeof L)["en"];

const fmtDay = (ms: number, l: Locale) => new Date(ms).toLocaleDateString(dateLocale(l), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Month-by-month change in the viewer's calendar (Gregorian in English, Persian in Farsi). */
function months(recent: Outlook["recent"], l: Locale, count = 6) {
  const fmt = new Intl.DateTimeFormat(dateLocale(l), { year: "numeric", month: "numeric", timeZone: "UTC" });
  const name = new Intl.DateTimeFormat(dateLocale(l), { month: "long", timeZone: "UTC" });
  const groups: { key: string; name: string; last: number }[] = [];
  for (const p of recent) {
    const parts = fmt.formatToParts(new Date(p.t));
    const key = `${parts.find((x) => x.type === "year")?.value}-${parts.find((x) => x.type === "month")?.value}`;
    const g = groups[groups.length - 1];
    if (g?.key === key) g.last = p.c;
    else groups.push({ key, name: name.format(new Date(p.t)), last: p.c });
  }
  const out: { name: string; change: number; partial: boolean }[] = [];
  for (let i = 1; i < groups.length; i++) out.push({ name: groups[i].name, change: (groups[i].last / groups[i - 1].last - 1) * 100, partial: i === groups.length - 1 });
  return out.slice(-count);
}

export function MarketPicture({ symbol, coin }: { symbol: string; coin: string }) {
  const t = useL(L);
  const locale = useLocale();
  const [res, setRes] = useState<{ data: Outlook | null; error: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    api<Outlook>(`/api/assets/${encodeURIComponent(symbol)}/outlook`)
      .then((d) => alive && setRes({ data: d, error: null }))
      .catch((e) => alive && setRes({ data: null, error: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [symbol]);

  return (
    <Card className="mb-4">
      <CardHeader title={t.title} description={t.desc} />
      {!res && <><span className="text-sm text-ink-2">{t.loading}</span><Skeleton className="mt-2 h-64 w-full" /></>}
      {res?.error && <Alert tone="error" title={t.error}>{errorText(res.error, locale)}</Alert>}
      {res?.data && <Body o={res.data} coin={coin} t={t} l={locale} />}
    </Card>
  );
}

function Body({ o, coin, t, l }: { o: Outlook; coin: string; t: T; l: Locale }) {
  const price = (v: number) => iso(fmtPrice(v, o.currency));
  const ms = useMemo(() => months(o.recent, l), [o.recent, l]);
  const d = o.direction;
  const h = "mb-2 text-sm font-semibold";
  const box = "rounded-xl border border-line bg-surface-2 p-4 text-sm leading-7";
  return (
    <div className="space-y-4">
      {/* Urgent */}
      {o.urgent.length > 0 ? (
        <div className="rounded-xl border border-bad/50 bg-bad/10 p-4 text-sm leading-7">
          <div className="mb-1 text-base font-semibold text-bad-ink">{t.urgentTitle}</div>
          <ul className="space-y-1">
            {o.urgent.map((u, i) =>
              u.kind === "move" ? (
                <li key={i} className="font-medium">{t.urgentMove(coin, iso(pct(u.changePct ?? 0)))}</li>
              ) : (
                <li key={i}>
                  <a href={u.news!.url} target="_blank" rel="noopener noreferrer nofollow" className="font-medium underline" dir="ltr">{u.news!.title}</a>
                  {t.topic[u.news!.topic] && <div className="text-ink-2">{t.topic[u.news!.topic]}</div>}
                </li>
              ),
            )}
          </ul>
          <p className="mt-2">{t.urgentDo}</p>
        </div>
      ) : (
        <p className="rounded-xl border border-good/40 bg-good/10 p-3 text-sm">{t.calm(coin)}</p>
      )}

      {/* Direction */}
      {d && (
        <div className={box}>
          <div className={cn("text-lg font-bold", d.overall === "bull" ? "text-good-ink" : d.overall === "bear" ? "text-bad-ink" : "text-ink")}>{t.overall[d.overall]}</div>
          <p>{t.overallText[d.overall]}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {(["short", "medium", "long"] as const).map((k) => (
              <div key={k} className="rounded-lg border border-line bg-surface p-3">
                <div className="text-xs text-ink-2">{t.horizon[k]}</div>
                <div className={cn("font-semibold", d[k] === "up" ? "text-good-ink" : d[k] === "down" ? "text-bad-ink" : "text-ink")}>{t.dirWord[d[k]]}</div>
                <div className="text-xs leading-5 text-ink-2">
                  {k === "short" ? t.shortWhy[d.short](iso(pct((d.ret7 ?? 0) * 100))) : k === "medium" ? t.mediumWhy[d.medium] : t.longWhy[d.long]}
                </div>
              </div>
            ))}
          </div>
          {t.swings[d.swings] && <p className="mt-2 text-ink-2">{t.swings[d.swings]}</p>}
        </div>
      )}

      {/* Changes */}
      {d && (
        <div className={box}>
          <div className={h}>{t.lately}</div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {([[t.d7, d.ret7], [t.d30, d.ret30], [t.d90, d.ret90], [t.d365, d.ret365]] as const).map(([label, v]) => (
              <div key={label} className="rounded-lg border border-line bg-surface p-2">
                <div className="text-xs text-ink-2">{label}</div>
                <div className={cn("ltr font-semibold", v === null ? "" : v > 0 ? "text-good-ink" : "text-bad-ink")}>{v === null ? "—" : pct(v * 100)}</div>
              </div>
            ))}
          </div>
          {ms.length > 0 && (
            <>
              <div className="mt-3 mb-1 text-xs font-semibold text-ink-2">{t.monthsTitle}</div>
              <MonthBars ms={ms} t={t} />
              <p className="mt-2">
                {ms.length >= 2 && t.lastMonth(ms[ms.length - 2].name, iso(pct(ms[ms.length - 2].change)), ms[ms.length - 2].change >= 0)}{" "}
                {t.thisMonth(ms[ms.length - 1].name, iso(pct(ms[ms.length - 1].change)))}
              </p>
            </>
          )}
        </div>
      )}

      {/* Lines & scenarios */}
      <div className={box}>
        <div className={h}>{t.linesTitle}</div>
        <p className="text-ink-2">{t.linesNote}</p>
        {o.trend.brokeSupport && o.trend.support ? (
          <p className="mt-1 font-medium text-bad-ink">{t.brokeSupport(price(o.trend.support.now))}</p>
        ) : o.trend.brokeResistance && o.trend.resistance ? (
          <p className="mt-1 font-medium text-good-ink">{t.brokeResistance(price(o.trend.resistance.now))}</p>
        ) : (
          <p className="mt-1">{t.pattern[o.trend.pattern] ?? t.pattern.none}</p>
        )}
        {o.scenarios && d && (o.scenarios.upTrigger !== null || o.scenarios.downTrigger !== null) && (
          <>
            <div className="mt-3 font-semibold">{t.ifTitle}</div>
            <ul className="space-y-1">
              {o.scenarios.upTrigger !== null && <li>{t.ifUp(price(o.scenarios.upTrigger), o.scenarios.upNext !== null ? price(o.scenarios.upNext) : null, o.scenarios.upNext !== null ? iso(pct((o.scenarios.upNext / d.close - 1) * 100)) : null)}</li>}
              {o.scenarios.downTrigger !== null && <li>{t.ifDown(price(o.scenarios.downTrigger), o.scenarios.downNext !== null ? price(o.scenarios.downNext) : null, o.scenarios.downNext !== null ? iso(pct((o.scenarios.downNext / d.close - 1) * 100)) : null)}</li>}
              <li className="text-ink-2">{t.ifBetween}</li>
            </ul>
          </>
        )}
      </div>

      {/* Similar moments */}
      <div className={box}>
        <div className={h}>{t.anTitle}</div>
        {!o.analogs ? <p>{t.anNone}</p> : (
          <>
            <p>{t.anIntro(o.analogs.cases.length, new Date(o.analogs.since).toLocaleDateString(dateLocale(l), { year: "numeric", timeZone: "UTC" }), t.today(iso(pct(o.analogs.today.ret30 * 100)), iso(pct(o.analogs.today.ret7 * 100)), iso(pct(o.analogs.today.vsEma50 * 100)), o.analogs.today.aboveSma200))}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {(["h7", "h30", "h90"] as const).map((k) => o.analogs![k] && <HorizonCard key={k} title={t.after[k]} s={o.analogs![k]!} t={t} />)}
            </div>
            {o.analogs.h30 && <p className="mt-3 font-medium">{lean(o.analogs.h30, t)}</p>}
            <div className="mt-3 text-xs font-semibold text-ink-2">{t.examples}</div>
            <ul className="mt-1 grid gap-x-4 text-xs sm:grid-cols-2">
              {o.analogs.cases.slice(0, 6).map((c) => (
                <li key={c.time}>
                  {fmtDay(c.time, l)} — {c.after30 !== null && <span className={c.after30 >= 0 ? "text-good-ink" : "text-bad-ink"}>{t.later30(iso(pct(c.after30 * 100)))}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-2">{t.anCaveat}</p>
          </>
        )}
      </div>

      {/* News */}
      <div className={box}>
        <div className={h}>{t.newsTitle}</div>
        <div className="font-semibold">{t.bigDays}</div>
        {o.moves.length === 0 ? <p className="text-ink-2">{t.noBigDays}</p> : (
          <ul className="mt-1 space-y-2">
            {o.moves.map((m) => (
              <li key={m.time}>
                <span className="font-medium">{fmtDay(m.time, l)}</span>{" "}
                <span className={cn("ltr inline-block rounded px-1.5 font-semibold", m.changePct >= 0 ? "bg-good/15 text-good-ink" : "bg-bad/15 text-bad-ink")}>{pct(m.changePct)}</span>
                {m.news.length ? (
                  <div className="text-xs text-ink-2">{t.aroundNews}<NewsList items={m.news} t={t} /></div>
                ) : (
                  <div className="text-xs text-ink-2">{t.noNewsAround(o.newsSince && o.newsSince > m.time - 86_400_000 ? fmtDay(o.newsSince, l) : null)}</div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 font-semibold">{t.important}</div>
        {o.news.length === 0 ? <p className="text-ink-2">{t.noImportant}</p> : <NewsList items={o.news} t={t} withWhy l={l} />}
        <p className="mt-2 text-xs text-ink-2">{t.newsCaveat}</p>
      </div>
    </div>
  );
}

function lean(s: HorizonStats, t: T) {
  const r = s.up / s.n;
  return r >= s.baseUp + 0.15 ? t.leanUp : r <= s.baseUp - 0.15 ? t.leanDown : t.leanNone;
}

function HorizonCard({ title, s, t }: { title: string; s: HorizonStats; t: T }) {
  const r = s.up / s.n;
  return (
    <div className="rounded-lg border border-line bg-surface p-3 text-xs leading-6">
      <div className="text-sm font-semibold">{title}</div>
      <div className={cn("font-semibold", r > 0.55 ? "text-good-ink" : r < 0.45 ? "text-bad-ink" : "")}>{t.upOf(s.up, s.n)}</div>
      <div className="my-1 h-2 w-full overflow-hidden rounded-full bg-bad/30" aria-hidden><div className="h-full rounded-full bg-good" style={{ width: `${r * 100}%` }} /></div>
      <div>{t.typical}: <b className={cn("ltr", s.median >= 0 ? "text-good-ink" : "text-bad-ink")}>{pct(s.median * 100)}</b></div>
      <div>{t.middle}: <span className="ltr">{pct(s.p25 * 100)} … {pct(s.p75 * 100)}</span></div>
      <div>{t.worstBest}: <span className="ltr">{pct(s.worst * 100, 0)} / {pct(s.best * 100, 0)}</span></div>
      <div className="text-ink-2">{t.normally(iso(`${Math.round(s.baseUp * 100)}%`))}</div>
    </div>
  );
}

function MonthBars({ ms, t }: { ms: { name: string; change: number; partial: boolean }[]; t: T }) {
  const max = Math.max(...ms.map((m) => Math.abs(m.change)), 1);
  return (
    <ul className="space-y-1">
      {ms.map((m, i) => (
        <li key={i} className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-2 text-xs">
          <span className="truncate">{m.name}{m.partial ? ` (${t.soFar})` : ""}</span>
          <span className="relative h-3 rounded bg-surface" aria-hidden>
            <span className={cn("absolute top-0 h-3 rounded", m.change >= 0 ? "bg-good" : "bg-bad")} style={{ width: `${(Math.abs(m.change) / max) * 100}%`, insetInlineStart: 0 }} />
          </span>
          <span className={cn("ltr text-end font-semibold", m.change >= 0 ? "text-good-ink" : "text-bad-ink")}>{pct(m.change)}</span>
        </li>
      ))}
    </ul>
  );
}

function NewsList({ items, t, withWhy = false, l }: { items: RatedNews[]; t: T; withWhy?: boolean; l?: Locale }) {
  return (
    <ul className="mt-1 space-y-2">
      {items.map((n) => (
        <li key={n.id} className="text-sm">
          <span className={cn("me-1 rounded px-1.5 py-0.5 text-[11px] font-semibold", n.level === "high" ? "bg-bad/15 text-bad-ink" : "bg-warn/15 text-warn-ink")}>{t.level[n.level]}</span>
          <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline" dir="ltr">{n.title}</a>
          <div className="text-xs text-ink-2">
            {n.source}{l ? ` · ${fmtDay(n.time, l)}` : ""} · {n.aboutCoin ? t.about.coin : t.about.market}
            {withWhy && t.topic[n.topic] ? <> — {t.topic[n.topic]}</> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
