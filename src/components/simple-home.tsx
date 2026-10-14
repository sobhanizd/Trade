import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Alert, ButtonLink, Disclaimer, EmptyState } from "@/components/ui";
import { ActionPill } from "@/components/verdict-card";
import { CoinHero } from "@/components/neo/coin-hero";
import { coinStyle } from "@/lib/coin-style";
import { LiveBadge, LivePrice } from "@/components/live-price";
import { currencyName, fmtMoney, GOLD_TOKENS, timeAgo, type Currency } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { verdictText } from "@/lib/i18n/texts";
import { coinFullName } from "@/lib/plain";
import type { getMarketView } from "@/lib/views";
import type { urgentForWatchlist } from "@/lib/analysis/outlook";
import type { adviceForWatchlist } from "@/lib/analysis/advice-service";
import { TodayList } from "@/components/advisor/today-list";

type View = Awaited<ReturnType<typeof getMarketView>>;

const L = {
  en: {
    editCoins: "✎ Add / remove coins",
    urgentTitle: "⚠️ Needs your attention today",
    urgentMove: (p: string) => `moved ${p} in 24 hours — much more than usual.`,
    urgentHint: "Tap the coin to see what it means. Don't buy or sell in a panic.",
    title: "Your coins",
    intro: "BUY / WAIT / SELL is what the app's rules say right now. Tap a coin to see why and at what prices.",
    pricesIn: (cur: string) => `prices in ${currencyName(cur as Currency)}`,
    checked: (ago: string) => `BUY/WAIT/SELL checked ${ago}`,
    problemTitle: "Some data could not be refreshed",
    market: "Overall market: ",
    mood: "Mood: ",
    noCoins: "No coins yet",
    addCoins: "Add coins",
    planLabel: "Monthly plan",
    planCta: "See what to buy this month →",
    practiceLabel: "Practice trades (no real money)",
    practice: (open: number) => `${open} open · `,
    result: " result",
    beforeLabel: "Before you buy",
    beforeCta: "Check your risk →",
    footnote:
      "BUY needs at least 2 of the daily strategies to agree, no warnings, a reward at least 1.5× the risk, and a calm short-term chart; SELL needs 2+ exit signals. “Uptrend / Downtrend” comes from the Trend Following rules. Signals can be wrong — you place any order yourself.",
    trend: {
      up: "Uptrend",
      upWeak: "Uptrend, not confirmed",
      weak: "Weakening",
      down: "Downtrend",
      none: "No clear trend",
      data: "Data problem",
      first: "Waiting for first scan",
    },
    market_: { Uptrend: "Uptrend", Downtrend: "Downtrend", "Mixed / sideways": "Mixed / sideways", Unknown: "Unknown" } as Record<string, string>,
    mood_: {} as Record<string, string>,
  },
  fa: {
    editCoins: "✎ افزودن / حذف ارز",
    urgentTitle: "⚠️ امروز به این توجه کنید",
    urgentMove: (p: string) => `در 24 ساعت ${p} تغییر کرده — خیلی بیشتر از معمول.`,
    urgentHint: "روی ارز بزنید تا ببینید یعنی چه. با ترس خرید یا فروش نکنید.",
    title: "ارزهای شما",
    intro: "«خرید / صبر / فروش» یعنی قوانین برنامه همین الان چه می‌گویند. روی هر ارز بزنید تا ببینید چرا و در چه قیمتی.",
    pricesIn: (cur: string) => `قیمت‌ها به ${currencyName(cur as Currency, "fa")}`,
    checked: (ago: string) => `آخرین بررسی خرید/صبر/فروش: ${ago}`,
    problemTitle: "بعضی داده‌ها به‌روز نشدند",
    market: "وضعیت کلی بازار: ",
    mood: "حال‌وهوای بازار: ",
    noCoins: "هنوز ارزی اضافه نکرده‌اید",
    addCoins: "افزودن ارز",
    planLabel: "برنامهٔ ماهانه",
    planCta: "ببینید این ماه چه بخرید ←",
    practiceLabel: "معاملهٔ تمرینی (بدون پول واقعی)",
    practice: (open: number) => `${open} معاملهٔ باز · `,
    result: " نتیجه",
    beforeLabel: "قبل از خرید",
    beforeCta: "ریسک خود را بسنجید ←",
    footnote:
      "«خرید» یعنی دست‌کم 2 روش روزانه موافق‌اند، هیچ هشداری نیست، سود احتمالی دست‌کم 1.5 برابر ریسک است و نمودار کوتاه‌مدت آرام است. «فروش» یعنی دست‌کم 2 سیگنال خروج آمده است. «روند صعودی / نزولی» از روش «همراه با روند» می‌آید. سیگنال‌ها ممکن است اشتباه باشند — هر سفارشی را خودتان ثبت می‌کنید.",
    trend: {
      up: "روند صعودی",
      upWeak: "روند صعودی، هنوز تأیید نشده",
      weak: "در حال ضعیف شدن",
      down: "روند نزولی",
      none: "روند مشخصی ندارد",
      data: "مشکل داده",
      first: "منتظر اولین بررسی",
    },
    market_: { Uptrend: "صعودی", Downtrend: "نزولی", "Mixed / sideways": "نامشخص / درجا", Unknown: "نامعلوم" } as Record<string, string>,
    mood_: { "Extreme Fear": "ترس شدید", Fear: "ترس", Neutral: "خنثی", Greed: "طمع", "Extreme Greed": "طمع شدید" } as Record<string, string>,
  },
} satisfies Dict<unknown>;

type T = (typeof L)["en"];

/** Plain-language trend from the Trend Following strategy (daily if scanned). */
export function trendWords(state: string | undefined, t: T = L.en): { text: string; tone: string } {
  switch (state) {
    case "STRONG_BUY_SETUP":
    case "POTENTIAL_BUY":
      return { text: t.trend.up, tone: "text-good-ink" };
    case "HOLD_WAIT":
      return { text: t.trend.upWeak, tone: "text-ink-2" };
    case "POTENTIAL_SELL":
      return { text: t.trend.weak, tone: "text-warn-ink" };
    case "EXIT_SETUP":
      return { text: t.trend.down, tone: "text-bad-ink" };
    case "NO_CLEAR_OPPORTUNITY":
      return { text: t.trend.none, tone: "text-ink-2" };
    case "NO_SIGNAL":
      return { text: t.trend.data, tone: "text-warn-ink" };
    default:
      return { text: t.trend.first, tone: "text-ink-2" };
  }
}

export async function SimpleHome({ view, lastScan, providerProblem, paper, urgent = [], advice = null }: { view: View; lastScan: Date | null; providerProblem: string | null; paper: { open: number; netPnl: number }; urgent?: Awaited<ReturnType<typeof urgentForWatchlist>>; advice?: Awaited<ReturnType<typeof adviceForWatchlist>> | null }) {
  const t = await getL(L);
  const locale = await getLocale();
  const cur = view.currency;
  const eurRate = view.rate; // USD → display currency
  const o = view.overview?.data;
  const s = view.sentiment?.data;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <Link href="/watchlist" className="rounded-full border border-line px-3 py-1.5 text-sm font-medium hover:bg-surface-2">{t.editCoins}</Link>
        </div>
        <p className="mt-1 text-sm text-ink">{t.intro}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-1 text-sm text-ink-2">
          <LiveBadge /> <span className="mx-1">·</span> {t.pricesIn(cur)} · {t.checked(timeAgo(lastScan, undefined, locale))}
        </p>
      </div>

      {providerProblem && <Alert tone="warn" className="mb-4" title={t.problemTitle}>{providerProblem}</Alert>}
      {urgent.length > 0 && (
        <Alert tone="error" className="mb-4" title={t.urgentTitle}>
          <ul className="space-y-1">
            {urgent.flatMap((u) => u.items.map((it, i) => (
              <li key={`${u.symbol}-${i}`}>
                <Link href={`/assets/${u.symbol}`} className="font-semibold underline">{coinFullName(u.symbol, u.symbol, locale)}</Link>:{" "}
                {it.kind === "move" ? t.urgentMove(`\u2066${(it.changePct ?? 0) > 0 ? "+" : ""}${(it.changePct ?? 0).toFixed(1)}%\u2069`) : <span dir="ltr">{it.news!.title}</span>}
              </li>
            )))}
          </ul>
          <p className="mt-1 text-ink-2">{t.urgentHint}</p>
        </Alert>
      )}

      {advice && <TodayList items={advice.items} currency={advice.currency} rate={advice.rate} locale={locale} />}

      {view.rows.length > 0 && (
        <CoinHero
          currency={cur}
          eurRate={eurRate}
          coins={view.rows.map((r) => ({
            symbol: r.symbol, name: r.name, pair: r.binanceSymbol, action: r.verdict.action, headline: verdictText(r.verdict, locale).headline,
            price: r.market?.price ?? null, change24h: r.market?.change24h ?? null, high24h: r.market?.high24h ?? null, low24h: r.market?.low24h ?? null,
            volume24h: r.market?.volume24h ?? null, marketCap: r.market?.marketCap ?? null,
          }))}
        />
      )}

      {(o || s) && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {o && (
            <div className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="text-xs tracking-wide text-ink-2 uppercase">{t.market.replace(/[:：]\s*$/, "")}</div>
              <div className={`mt-0.5 text-lg font-semibold ${o.overall === "Uptrend" ? "text-good-ink" : o.overall === "Downtrend" ? "text-bad-ink" : ""}`}>{t.market_[o.overall] ?? o.overall}</div>
            </div>
          )}
          {s && (
            <div className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="text-xs tracking-wide text-ink-2 uppercase">{t.mood.replace(/[:：]\s*$/, "")}</div>
              <div className="mt-0.5 flex items-center gap-3">
                <span className="text-lg font-semibold">{t.mood_[s.classification] ?? s.classification}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <span className="absolute inset-y-0 start-0 rounded-full" style={{ width: `${s.value}%`, background: "linear-gradient(90deg, var(--bad), var(--warn), var(--good))" }} />
                </span>
                <span className="ltr text-sm text-ink-2">{s.value}/100</span>
              </div>
            </div>
          )}
        </div>
      )}

      {view.rows.length === 0 ? (
        <EmptyState title={t.noCoins} action={<ButtonLink href="/watchlist" variant="primary">{t.addCoins}</ButtonLink>} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {view.rows.map((r) => {
            const tw = trendWords(r.trend?.state, t);
            const vt = verdictText(r.verdict, locale);
            return (
              <li key={r.symbol}>
                <Link href={`/assets/${r.symbol}`} className="block px-4 py-4 hover:bg-surface-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <span className="coin-ico mt-0.5 h-9 w-9 text-sm" style={{ background: coinStyle(r.symbol).bg }} aria-hidden>{coinStyle(r.symbol).glyph}</span>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-semibold">{r.symbol}</span>
                        <span className="truncate text-sm text-ink-2">{coinFullName(r.symbol, r.name, locale)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <ActionPill action={r.verdict.action} />
                        <span className={`text-sm ${tw.tone}`}>{tw.text}</span>
                      </div>
                    </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <LivePrice pair={r.binanceSymbol} initial={r.market?.price ?? null} initialChange={r.market?.change24h} currency={cur} eurRate={eurRate} perGram={GOLD_TOKENS.has(r.symbol)} />
                      <ChevronRight className="flip-rtl h-5 w-5 shrink-0 text-ink-2" aria-hidden />
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-ink-2">{vt.firstReason}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link href="/plan" className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 hover:bg-accent/15 sm:col-span-2">
          <div className="text-sm text-ink-2">{t.planLabel}</div>
          <div className="mt-0.5 font-semibold">{t.planCta}</div>
        </Link>
        <Link href="/paper" className="rounded-xl border border-line bg-surface px-4 py-3 hover:bg-surface-2">
          <div className="text-sm text-ink-2">{t.practiceLabel}</div>
          <div className="mt-0.5 font-semibold">{t.practice(paper.open)}<span className={`ltr ${paper.netPnl >= 0 ? "text-good-ink" : "text-bad-ink"}`}>{fmtMoney(paper.netPnl)}</span>{t.result}</div>
        </Link>
        <Link href="/risk" className="rounded-xl border border-line bg-surface px-4 py-3 hover:bg-surface-2">
          <div className="text-sm text-ink-2">{t.beforeLabel}</div>
          <div className="mt-0.5 font-semibold">{t.beforeCta}</div>
        </Link>
      </div>

      <p className="mt-6 text-xs text-ink-2">{t.footnote}</p>
      <div className="mt-2"><Disclaimer /></div>
    </div>
  );
}
