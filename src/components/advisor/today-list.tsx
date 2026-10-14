/** Home: one line per coin — what the trader's advice says to do, and when. Server component. */
import Link from "next/link";
import type { CoinAdvice } from "@/lib/analysis/advice-service";
import { coinStyle } from "@/lib/coin-style";
import { cn } from "@/lib/cn";
import { fmtPrice, type Currency } from "@/lib/format";
import { dateLocale, type Locale } from "@/lib/i18n";
import { coinFullName } from "@/lib/plain";
import { ACTION, TONE_CLS, whenText, type Fmt } from "./texts";

const T = {
  en: { title: "🧑‍💼 What to do today", sub: "One clear step per coin, from its chart, patterns, history and news. Tap a coin for the full reasons.", plan: "Your monthly plan still buys its normal amount on top of this.", own: "you own it" },
  fa: { title: "🧑‍💼 امروز چه کنم؟", sub: "برای هر ارز یک قدم روشن، از روی نمودار، الگوها، تاریخچه و خبرها. برای دیدن دلیل‌ها روی ارز بزنید.", plan: "برنامهٔ ماهانهٔ شما جدا از این، مبلغ معمولش را می‌خرد.", own: "دارید" },
};

export function TodayList({ items, currency, rate, locale }: { items: CoinAdvice[]; currency: Currency; rate: number; locale: Locale }) {
  if (!items.length) return null;
  const t = T[locale];
  return (
    <section className="mb-4 rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-lg font-semibold">{t.title}</h2>
      <p className="mt-0.5 text-sm text-ink-2">{t.sub}</p>
      <ul className="mt-3 space-y-2">
        {items.map((a) => {
          const act = ACTION[a.action];
          const f: Fmt = {
            l: locale,
            coin: a.symbol === "PAXG" ? (locale === "fa" ? "طلا" : "Gold") : a.symbol,
            money: (usd) => (usd == null ? "—" : fmtPrice(usd * rate, currency)),
            date: (ms) => new Date(ms).toLocaleDateString(dateLocale(locale), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
          };
          const st = coinStyle(a.symbol);
          return (
            <li key={a.symbol}>
              <Link href={`/assets/${a.symbol}`} className="flex gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                <span className="coin-ico mt-0.5 h-8 w-8 text-xs" style={{ background: st.bg }} aria-hidden>{st.glyph}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <b>{coinFullName(a.symbol, a.name, locale)}</b>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1", TONE_CLS[act.tone])}>{act.icon} {act[locale]}</span>
                    {a.holding && <span className="text-xs text-ink-2">({t.own})</span>}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-2">{whenText(a, a.action, f)}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-2">{t.plan}</p>
    </section>
  );
}
