import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ActionPill } from "@/components/verdict-card";
import { cn } from "@/lib/cn";
import type { Currency } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { verdictText } from "@/lib/i18n/texts";
import { coinFullName, statePlain, strategyName, timeframePlain } from "@/lib/plain";
import type { Verdict } from "@/lib/signals/verdict";
import { moneyFmt } from "./money";

export interface PlainSig {
  id: string;
  state: string;
  strategyId: string;
  timeframe: string;
  entryHigh: number | null;
  invalidation: number | null;
  targets: number[];
}

export interface PlainCoin {
  symbol: string;
  name: string;
  verdict: Verdict;
  signals: PlainSig[];
}

const L = {
  en: {
    howTitle: "How to read this:",
    how1: "the app looks at each coin with 5 different \"ideas\". The big label (BUY / WAIT / SELL) is the combined answer. Below it you see which ideas currently say ",
    buy: "buy",
    or: " or ",
    sell: "sell",
    how2: ". Tap a line to see why.",
    none: "No buy or sell ideas right now.",
    gold: "Gold (PAXG)",
    levels: (b: string, e: string, t: string) => `buy ~${b} · exit ${e} · target ${t}`,
    footExit: "exit",
    foot: " = safety exit: the price where the idea is proven wrong; many people sell there to limit a loss. Sell ideas only matter if you already own the coin. Ideas can be wrong.",
    table: "Show the detailed table",
  },
  fa: {
    howTitle: "این صفحه را چطور بخوانید:",
    how1: "برنامه هر ارز را با ۵ «روش» مختلف بررسی می‌کند. برچسب بزرگ (خرید / صبر / فروش) جواب نهایی است. زیر آن می‌بینید کدام روش‌ها الان می‌گویند ",
    buy: "بخر",
    or: " یا ",
    sell: "بفروش",
    how2: ". روی هر خط بزنید تا دلیلش را ببینید.",
    none: "فعلاً نه فرصت خرید هست، نه سیگنال فروش.",
    gold: "طلا (PAXG)",
    levels: (b: string, e: string, t: string) => `خرید حدود ${b} · حد ضرر ${e} · هدف ${t}`,
    footExit: "حد ضرر",
    foot: " = قیمتی که اگر به آن برسد، یعنی ایده اشتباه بوده؛ خیلی‌ها آنجا می‌فروشند تا ضرر بیشتر نشود. سیگنال‌های فروش فقط وقتی مهم‌اند که آن ارز را داشته باشید. ایده‌ها ممکن است اشتباه باشند.",
    table: "نمایش جدول کامل",
  },
} satisfies Dict<unknown>;

const BUY = new Set(["STRONG_BUY_SETUP", "POTENTIAL_BUY"]);
const SELL = new Set(["EXIT_SETUP", "POTENTIAL_SELL"]);
const TF_ORDER: Record<string, number> = { "1w": 0, "1d": 1, "4h": 2, "1h": 3 };
const TONE = { good: "text-good-ink", bad: "text-bad-ink", warn: "text-warn-ink", neutral: "text-ink-2" };

export async function SignalsPlain({ coins, currency, eurRate }: { coins: PlainCoin[]; currency: Currency; eurRate: number | null }) {
  const t = await getL(L);
  const locale = await getLocale();
  const { fmt } = moneyFmt(currency, eurRate);
  const rank = (c: PlainCoin) => (c.verdict.action === "BUY" ? 0 : c.signals.some((s) => BUY.has(s.state)) ? 1 : c.verdict.action === "SELL" ? 2 : 3);
  const sorted = [...coins].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-2">
        <b className="text-ink">{t.howTitle}</b> {t.how1}
        <span className="text-good-ink">{t.buy}</span>{t.or}<span className="text-bad-ink">{t.sell}</span>{t.how2}
      </div>

      <ul className="space-y-3">
        {sorted.map((c) => {
          const vt = verdictText(c.verdict, locale);
          const ideas = c.signals
            .filter((s) => BUY.has(s.state) || SELL.has(s.state))
            .sort((a, b) => Number(SELL.has(a.state)) - Number(SELL.has(b.state)) || (TF_ORDER[a.timeframe] ?? 9) - (TF_ORDER[b.timeframe] ?? 9));
          return (
            <li key={c.symbol} className="rounded-xl border border-line bg-surface">
              <Link href={`/assets/${c.symbol}`} className="flex items-center gap-3 px-4 pt-4 pb-2 hover:opacity-90">
                <ActionPill action={c.verdict.action} className="w-24 justify-center" />
                <div className="min-w-0">
                  <div className="text-lg font-semibold">{`${coinFullName(c.symbol, c.name, locale)} (${c.symbol})`}</div>
                  <div className="text-sm text-ink-2">{vt.firstReason}</div>
                </div>
              </Link>
              {ideas.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-ink-2">{t.none}</p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {ideas.map((s) => {
                    const p = statePlain(s.state, locale);
                    const buy = BUY.has(s.state);
                    return (
                      <li key={s.id}>
                        <Link href={`/signals/${s.id}`} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2">
                          <span className={cn("w-32 shrink-0 font-semibold", TONE[p.tone])}>{buy ? "▲" : "▼"} {p.label}</span>
                          <span className="min-w-0 flex-1 text-ink-2">
                            {strategyName(s.strategyId, locale)} · {timeframePlain(s.timeframe, locale)}
                            {buy && <span className="block text-xs tabular sm:inline sm:ps-2">{t.levels(fmt(s.entryHigh), fmt(s.invalidation), fmt(s.targets[0]))}</span>}
                          </span>
                          <ChevronRight className="flip-rtl h-4 w-4 shrink-0 text-ink-2" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-ink-2">
        <b>{t.footExit}</b>{t.foot}{" "}
        <Link className="underline" href="/signals?all=1">{t.table}</Link>
      </p>
    </div>
  );
}
