"use client";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Hourglass, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtNum, fmtPrice, type Currency } from "@/lib/format";
import { costsFromSettings } from "@/lib/settings/schema";
import type { Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { actionWord, verdictText } from "@/lib/i18n/texts";
import { timeframeWord } from "@/lib/plain";
import { calculateRisk } from "@/lib/risk/calculator";
import type { UserSettingsData } from "@/lib/settings/schema";
import type { Action, Verdict } from "@/lib/signals/verdict";

export const ACTION_STYLE: Record<Action, { cls: string; Icon: typeof ArrowUpRight }> = {
  BUY: { cls: "bg-good/15 text-good-ink ring-good/40", Icon: ArrowUpRight },
  WAIT: { cls: "bg-surface-2 text-ink-2 ring-line", Icon: Hourglass },
  SELL: { cls: "bg-bad/15 text-bad-ink ring-bad/40", Icon: ArrowDownRight },
  NO_DATA: { cls: "bg-warn/15 text-warn-ink ring-warn/40", Icon: ShieldAlert },
};

const L = {
  en: {
    region: "What the rules say now",
    buyAround: "Buy around",
    getOut: "Get out if it falls below",
    target: "First target",
    sizing: (budget: string, pct: number, qty: string, sym: string, value: string, loss: string) =>
      `With your settings (${budget} budget, max ${pct}% loss per trade): about ${qty} ${sym} (≈ ${value}). If the stop is hit you would lose about ${loss}.`,
    sellCancel: "This sell signal is cancelled if the price closes back above",
    why: "Why? See the details",
    adjust: "Adjust the amount",
    practise: "Practise it first (no real money)",
    basedOn: (n: number, tf: string, timing: string | null) =>
      `Based on ${n} ${tf} strategy checks${timing ? ` plus the ${timing} chart for timing` : ""}. Rules can be wrong — prices can fall right after a buy signal. You decide and place any order yourself on your exchange.`,
  },
  fa: {
    region: "قوانین الان چه می‌گویند",
    buyAround: "محدودهٔ خرید",
    getOut: "حد ضرر (اگر پایین‌تر از این رفت، بفروشید)",
    target: "اولین هدف سود",
    sizing: (budget: string, pct: number, qty: string, sym: string, value: string, loss: string) =>
      `با تنظیمات شما (بودجهٔ ${budget}، حداکثر ${pct}٪ ضرر در هر معامله): حدود ${qty} ${sym} (≈ ${value}). اگر به حد ضرر برسد، حدود ${loss} ضرر می‌کنید.`,
    sellCancel: "این سیگنال فروش لغو می‌شود اگر قیمت دوباره بالای این عدد بسته شود:",
    why: "چرا؟ جزئیات را ببینید",
    adjust: "تغییر مبلغ",
    practise: "اول تمرین کنید (بدون پول واقعی)",
    basedOn: (n: number, tf: string, timing: string | null) =>
      `بر اساس ${n} بررسیِ روش‌های ${tf}${timing ? ` به‌علاوهٔ نمودار ${timing} برای زمان‌بندی` : ""}. قوانین ممکن است اشتباه کنند — قیمت می‌تواند درست بعد از سیگنال خرید پایین بیاید. تصمیم با شماست و سفارش را خودتان در صرافی ثبت می‌کنید.`,
  },
} satisfies Dict<unknown>;

/** Compact pill used in lists. Icon + word, never color alone. */
export function ActionPill({ action, className }: { action: Action; className?: string }) {
  const l = useLocale();
  const a = ACTION_STYLE[action];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-bold tracking-wide ring-1", a.cls, className)}>
      <a.Icon className="h-4 w-4" aria-hidden />
      {actionWord(action, l)}
    </span>
  );
}

/** The main decision box on a coin's page. Levels are in the analysis pair's USD quote; € shown when selected. */
export function VerdictCard({ verdict, symbol, settings, eurRate, currency = "USD" }: { verdict: Verdict; symbol: string; settings: UserSettingsData; eurRate: number | null; currency?: Currency }) {
  const l = useLocale();
  const t = useL(L);
  const v = verdict;
  const vt = verdictText(v, l);
  const a = ACTION_STYLE[v.action];
  const b = v.best;
  // eurRate = USD → display-currency rate.
  const eur = currency !== "USD" && eurRate;
  const money = (usd: number | null | undefined) => (usd == null ? "—" : eur ? fmtPrice(usd * (eurRate as number), currency) : fmtPrice(usd, "USD"));
  const sizing =
    v.action === "BUY" && b && b.invalidation !== null
      ? calculateRisk({
          accountBalance: settings.risk.accountBalance,
          maxLoss: (settings.risk.accountBalance * settings.risk.riskPerTradePct) / 100,
          entryPrice: b.price,
          stopPrice: b.invalidation,
          targetPrice: b.targets[0] ?? null,
          ...costsFromSettings(settings),
          maxPositionPct: settings.risk.maxPositionPct,
        })
      : null;
  const conv = (usd: number) => (eur ? fmtMoney(usd * (eurRate as number), currency) : fmtMoney(usd, "USD"));
  return (
    <section className={cn("rounded-2xl p-5 ring-1", a.cls)} aria-label={t.region}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 text-3xl font-extrabold tracking-wide">
          <a.Icon className="h-8 w-8" aria-hidden />
          {actionWord(v.action, l)}
        </span>
        <span className="text-base font-medium text-ink">{vt.headline}</span>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-ink">
        {vt.reasons.map((r) => <li key={r}>• {r}</li>)}
      </ul>

      {v.action === "BUY" && b && (
        <div className="mt-4 grid gap-3 rounded-xl bg-surface/80 p-4 text-sm sm:grid-cols-3">
          <div><div className="text-ink-2">{t.buyAround}</div><div className="ltr text-lg font-semibold tabular">{money(b.entryLow)} – {money(b.entryHigh)}</div></div>
          <div><div className="text-ink-2">{t.getOut}</div><div className="text-lg font-semibold tabular text-bad-ink">{money(b.invalidation)}</div></div>
          <div><div className="text-ink-2">{t.target}</div><div className="text-lg font-semibold tabular text-good-ink">{money(b.targets[0])}</div></div>
          {sizing?.valid && (
            <p className="text-ink-2 sm:col-span-3">
              {t.sizing(fmtMoney(settings.risk.accountBalance, null), settings.risk.riskPerTradePct, fmtNum(sizing.quantity, 6), symbol, conv(sizing.positionValue), conv(sizing.potentialLoss))}
            </p>
          )}
        </div>
      )}
      {v.action === "SELL" && b?.invalidation != null && (
        <p className="mt-3 text-sm text-ink">{t.sellCancel} <b className="tabular">{money(b.invalidation)}</b>.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {b && <Link className="text-accent underline" href={`/signals/${b.id}`}>{t.why}</Link>}
        {v.action === "BUY" && b?.invalidation != null && <Link className="text-accent underline" href={`/risk?entry=${b.price}&stop=${b.invalidation}${b.targets[0] ? `&target=${b.targets[0]}` : ""}`}>{t.adjust}</Link>}
        {v.action === "BUY" && <Link className="text-accent underline" href="/paper">{t.practise}</Link>}
      </div>
      <p className="mt-3 text-xs text-ink-2">{t.basedOn(v.total, timeframeWord(v.primaryTimeframe ?? "", l), v.timingTimeframe ? timeframeWord(v.timingTimeframe, l) : null)}</p>
    </section>
  );
}
