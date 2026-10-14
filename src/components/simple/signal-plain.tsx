import Link from "next/link";
import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { secondOpinionLine } from "@/components/source-check";
import { Alert } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { SignalSourceCheck } from "@/lib/market/crosscheck";
import type { Currency } from "@/lib/format";
import { fmtDate, timeAgo } from "@/lib/format";
import type { Dict, Locale } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { coinFullName, conditionPlain, rrPlain, statePlain, strategyIdea, strategyName, timeframePlain } from "@/lib/plain";
import type { Condition } from "@/lib/strategies/types";
import { moneyFmt } from "./money";
import { PracticeNew } from "./practice";

interface Props {
  signal: {
    id: string; state: string; status: string; strategyId: string; timeframe: string; signalAt: Date; marketDataAt: Date; price: number;
    entryLow: number | null; entryHigh: number | null; invalidation: number | null; targets: number[]; riskReward: number | null;
    conditions: unknown; risks: unknown; conflicts: unknown; asset: { symbol: string; name: string }; paperTrades: unknown[];
    sourceCheck?: unknown;
  };
  currency: Currency;
  eurRate: number | null;
}

const L = {
  en: {
    back: "← All signals",
    idea: "Idea:",
    based: (tf: string, ago: string) => `Based on the ${tf}, found ${ago}.`,
    status: { INVALIDATED: "no longer valid — the price hit the safety exit", EXPIRED: "expired", SUPERSEDED: "out of date — a newer one replaced it" } as Record<string, string>,
    statusPre: "This idea is ",
    statusPost: ". It is kept for your history.",
    buyAround: "1. Buy around",
    safety: "2. Safety exit (sell if it drops to)",
    below: (p: string) => `about ${p}% below the buy price`,
    target: "3. Target (take profit at)",
    above: (p: string) => `about ${p}% above the buy price`,
    feesFound: (rr: string, price: string, at: string) => `${rr} (after fees). Price when found: ${price} on ${at}.`,
    sellGone: "This sell warning goes away if the price climbs back above",
    tryTitle: "Try it without real money",
    tryText: "Practise first: the app pretends to buy at today's price and follows it for you.",
    already: "This idea is already being followed with pretend money — see",
    practiceLink: "Practice trades",
    howMuch: "How much should I buy? →",
    checked: "What the app checked",
    yes: "yes", no: "no", nodata: "not enough data",
    wrong: "What could go wrong",
    news: "Crypto prices can drop suddenly because of news — no rule can see that coming.",
    fast: "When prices fall fast, a safety exit can sell lower than planned.",
    foot: "This is the app's rule-based opinion, not a guarantee. You decide and place any order yourself.",
    tech: "Show technical details",
    risks: {
      vol: "The price is jumping around more than usual — bigger swings both ways.",
      big: "The last move was unusually big.",
      hot: "The price rose fast recently; quick drops are common after that.",
      rr: "The possible gain is small compared to the possible loss.",
      res: "There is a price level just above where it got stuck before — it may struggle to pass it.",
      contra: "Another idea on the same chart says the opposite (sell). Mixed messages mean more risk.",
      volume: "Fewer people than usual are trading it — the move may not last.",
      fail: "Breakouts often fail and fall back.",
      long: "The long-term picture does not support it yet.",
    },
  },
  fa: {
    back: "→ همهٔ سیگنال‌ها",
    idea: "روش:",
    based: (tf: string, ago: string) => `بر اساس ${tf}، ${ago} پیدا شد.`,
    status: { INVALIDATED: "دیگر معتبر نیست — قیمت به حد ضرر رسید", EXPIRED: "منقضی شده", SUPERSEDED: "قدیمی شده — یک سیگنال جدیدتر جایش آمده" } as Record<string, string>,
    statusPre: "این ایده ",
    statusPost: ". برای سابقهٔ شما نگه داشته شده است.",
    buyAround: "۱. محدودهٔ خرید",
    safety: "۲. حد ضرر (اگر تا اینجا پایین آمد، بفروشید)",
    below: (p: string) => `حدود ${p}٪ پایین‌تر از قیمت خرید`,
    target: "۳. هدف سود (در این قیمت سود بگیرید)",
    above: (p: string) => `حدود ${p}٪ بالاتر از قیمت خرید`,
    feesFound: (rr: string, price: string, at: string) => `${rr} (با احتساب کارمزد). قیمت هنگام پیدا شدن: ${price} در ${at}.`,
    sellGone: "این هشدار فروش از بین می‌رود اگر قیمت دوباره بالای این عدد برود:",
    tryTitle: "بدون پول واقعی امتحان کنید",
    tryText: "اول تمرین کنید: برنامه با قیمت امروز به‌صورت مجازی می‌خرد و آن را برایتان دنبال می‌کند.",
    already: "این ایده همین حالا با پول مجازی دنبال می‌شود — ببینید:",
    practiceLink: "معاملهٔ تمرینی",
    howMuch: "چقدر بخرم؟ ←",
    checked: "برنامه چه چیزهایی را بررسی کرد",
    yes: "بله", no: "خیر", nodata: "دادهٔ کافی نیست",
    wrong: "چه چیزی ممکن است خراب شود",
    news: "قیمت ارزهای دیجیتال ممکن است به‌خاطر یک خبر ناگهان بریزد — هیچ قانونی این را از قبل نمی‌بیند.",
    fast: "وقتی قیمت سریع می‌ریزد، حد ضرر ممکن است پایین‌تر از برنامه بفروشد.",
    foot: "این نظر قانون‌محورِ برنامه است، نه تضمین. تصمیم با شماست و هر سفارشی را خودتان ثبت می‌کنید.",
    tech: "نمایش جزئیات فنی",
    risks: {
      vol: "قیمت بیشتر از معمول بالا و پایین می‌پرد — نوسان بزرگ‌تر در هر دو جهت.",
      big: "آخرین حرکت قیمت به‌طور غیرعادی بزرگ بود.",
      hot: "قیمت اخیراً تند بالا رفته؛ بعد از چنین رشدی افت سریع رایج است.",
      rr: "سود احتمالی در مقایسه با ضرر احتمالی کم است.",
      res: "کمی بالاتر قیمتی هست که قبلاً آنجا گیر کرده — شاید سخت از آن رد شود.",
      contra: "روش دیگری روی همین نمودار برعکس می‌گوید (فروش). پیام‌های متناقض یعنی ریسک بیشتر.",
      volume: "کمتر از معمول معامله می‌شود — شاید این حرکت ادامه پیدا نکند.",
      fail: "شکست سقف‌ها خیلی وقت‌ها ناموفق است و قیمت برمی‌گردد.",
      long: "تصویر بلندمدت هنوز از آن پشتیبانی نمی‌کند.",
    },
  },
} satisfies Dict<unknown>;

const BOX = { good: "bg-good/12 ring-good/40", bad: "bg-bad/12 ring-bad/40", warn: "bg-warn/12 ring-warn/40", neutral: "bg-surface ring-line" };

/** Turn technical risk notes into short plain sentences. */
function plainRisk(r: string, t: (typeof L)["en"], l: Locale) {
  if (/volatility/i.test(r)) return t.risks.vol;
  if (/3× ATR/.test(r)) return t.risks.big;
  if (/overbought|RSI .* (above|is overbought)/i.test(r)) return t.risks.hot;
  if (/Reward\/risk/i.test(r)) return t.risks.rr;
  if (/Resistance/i.test(r)) return t.risks.res;
  if (/Contradiction/i.test(r)) return t.risks.contra;
  if (/volume/i.test(r)) return t.risks.volume;
  if (/Breakouts frequently fail/i.test(r)) return t.risks.fail;
  if (/200|long-term/i.test(r)) return t.risks.long;
  return l === "fa" ? null : r;
}

export async function SignalPlain({ signal: s, currency, eurRate }: Props) {
  const t = await getL(L);
  const locale = await getLocale();
  const { fmt } = moneyFmt(currency, eurRate);
  const p = statePlain(s.state, locale);
  const isBuy = s.state === "STRONG_BUY_SETUP" || s.state === "POTENTIAL_BUY";
  const isSell = s.state === "EXIT_SETUP" || s.state === "POTENTIAL_SELL";
  const conds = ((s.conditions as Condition[]) ?? []).filter((c) => (isSell ? c.group === "exit" : c.group !== "exit"));
  const worries = [...new Set([...(s.conflicts as string[]), ...(s.risks as string[])].map((r) => plainRisk(r, t, locale)).filter((x): x is string => Boolean(x)))];
  const drop = isBuy && s.invalidation !== null ? ((s.price - s.invalidation) / s.price) * 100 : null;
  const gain = isBuy && s.targets[0] ? ((s.targets[0] - s.price) / s.price) * 100 : null;
  const coin = `${coinFullName(s.asset.symbol, s.asset.name, locale)} (${s.asset.symbol})`;
  const second = s.state === "NO_SIGNAL" ? null : secondOpinionLine((s.sourceCheck ?? null) as SignalSourceCheck | null, locale);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/signals" className="text-sm text-accent hover:underline">{t.back}</Link>
        <h1 className="mt-2 text-2xl font-semibold">{coin}</h1>
        <p className="text-sm text-ink-2">{t.idea} <b className="text-ink">{strategyName(s.strategyId, locale)}</b> — {strategyIdea(s.strategyId, locale)} {t.based(timeframePlain(s.timeframe, locale), timeAgo(s.signalAt, undefined, locale))}</p>
      </div>

      {s.status !== "ACTIVE" && (
        <div className="rounded-xl bg-warn/12 p-3 text-sm ring-1 ring-warn/40">{t.statusPre}<b>{t.status[s.status] ?? s.status}</b>{t.statusPost}</div>
      )}

      <section className={cn("rounded-2xl p-5 ring-1", BOX[p.tone])}>
        <div className="text-2xl font-bold">{p.label}</div>
        <p className="mt-2 text-base">{p.meaning}</p>
        {isBuy && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface/80 p-3">
              <div className="text-sm text-ink-2">{t.buyAround}</div>
              <div className="text-xl font-semibold tabular">{s.entryLow !== null && s.entryHigh !== null && Math.abs(s.entryHigh - s.entryLow) / s.entryHigh > 0.001 ? `${fmt(s.entryLow)} – ${fmt(s.entryHigh)}` : fmt(s.entryHigh)}</div>
            </div>
            <div className="rounded-xl bg-surface/80 p-3">
              <div className="text-sm text-ink-2">{t.safety}</div>
              <div className="text-xl font-semibold tabular text-bad-ink">{fmt(s.invalidation)}</div>
              {drop !== null && <div className="text-xs text-ink-2">{t.below(drop.toFixed(1))}</div>}
            </div>
            <div className="rounded-xl bg-surface/80 p-3">
              <div className="text-sm text-ink-2">{t.target}</div>
              <div className="text-xl font-semibold tabular text-good-ink">{fmt(s.targets[0])}</div>
              {gain !== null && <div className="text-xs text-ink-2">{t.above(gain.toFixed(1))}</div>}
            </div>
            {rrPlain(s.riskReward, locale) && <p className="text-sm text-ink-2 sm:col-span-3">{t.feesFound(rrPlain(s.riskReward, locale)!, fmt(s.price), fmtDate(s.marketDataAt, true, locale))}</p>}
          </div>
        )}
        {isSell && s.invalidation !== null && <p className="mt-3 text-sm">{t.sellGone} <b className="tabular">{fmt(s.invalidation)}</b>.</p>}
      </section>

      {second && <Alert tone={second.tone}>{second.text}</Alert>}

      {isBuy && s.status === "ACTIVE" && (
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="font-semibold">{t.tryTitle}</h2>
          <p className="mb-3 text-sm text-ink-2">{t.tryText}</p>
          {s.paperTrades.length > 0 ? (
            <p className="text-sm">{t.already} <Link className="text-accent underline" href="/paper">{t.practiceLink}</Link>.</p>
          ) : (
            <PracticeNew symbols={[s.asset.symbol]} defaultSymbol={s.asset.symbol} currency={currency === "IRT" ? "EUR" : currency} signalId={s.id} stopPrice={s.invalidation} targetPrice={s.targets[0] ?? null} />
          )}
          <p className="mt-3 text-sm"><Link className="text-accent underline" href={`/risk?entry=${s.price}&stop=${s.invalidation}${s.targets[0] ? `&target=${s.targets[0]}` : ""}`}>{t.howMuch}</Link></p>
        </section>
      )}

      {conds.length > 0 && (
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-2 font-semibold">{t.checked}</h2>
          <ul className="space-y-2">
            {conds.map((c) => (
              <li key={c.id} className="flex gap-2 text-sm">
                {c.passed === true ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-good-ink" aria-label={t.yes} /> : c.passed === false ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-bad-ink" aria-label={t.no} /> : <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-warn-ink" aria-label={t.nodata} />}
                <span>{conditionPlain(c.id, c.label, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-2 font-semibold">{t.wrong}</h2>
        <ul className="list-disc space-y-1 ps-5 text-sm">
          {worries.map((w) => <li key={w}>{w}</li>)}
          <li>{t.news}</li>
          <li>{t.fast}</li>
        </ul>
      </section>

      <p className="text-xs text-ink-2">
        {t.foot} <Link className="underline" href={`/signals/${s.id}?full=1`}>{t.tech}</Link>
      </p>
    </div>
  );
}
