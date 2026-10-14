"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert, Button, Field, Input, Select, Toggle } from "@/components/ui";
import { backtestErrorText } from "@/lib/backtest/i18n";
import { api } from "@/lib/client-api";
import type { Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { timeframeWord } from "@/lib/plain";
import { paramErrorText, paramText } from "@/lib/strategies/i18n";
import type { ParamSpec } from "@/lib/strategies/types";

const L = {
  en: {
    noAssets: "Add at least one asset to your watchlist to backtest it.",
    asset: "Asset",
    strategy: "Strategy",
    timeframe: "Timeframe",
    intended: (tfs: string) => `Intended: ${tfs}`,
    from: "From",
    to: "To",
    execution: "Execution assumptions",
    capital: "Starting capital (USD)",
    risk: "Risk per trade (%)",
    riskHint: "Of current equity, to the invalidation level.",
    fee: "Fee per side (%)",
    feeHint: "Binance spot taker ≈ 0.1%.",
    slip: "Slippage per side (%)",
    enterOn: "Enter on",
    enterStrong: "Strong buy setups only",
    enterPotential: "Potential buy or stronger",
    takeProfit: "Take profit at",
    target1: "Target 1",
    target2: "Target 2 (or last available)",
    noTarget: "No target (exit by rules/stop)",
    maxBars: "Max bars in trade (0 = none)",
    cooldown: "Cooldown after exit (bars)",
    oos: "Out-of-sample share (%)",
    oosHint: "Last part of the period, reported separately to expose overfitting.",
    exitOnSignal: "Exit on EXIT SETUP",
    exitOnSignalDesc: "Close at next open when the strategy flags an exit",
    custom: "Custom parameters (default: your saved/default parameters) ",
    customNote: "Tuning parameters until a backtest looks good is overfitting. Prefer defaults and check the out-of-sample section.",
    failed: "Backtest failed",
    running: "Fetching history & simulating…",
    run: "Run backtest",
  },
  fa: {
    noAssets: "برای آزمایش روی گذشته، دست‌کم یک ارز به «ارزهای من» اضافه کنید.",
    asset: "ارز",
    strategy: "روش",
    timeframe: "بازهٔ زمانی",
    intended: (tfs: string) => `مناسب برای: ${tfs}`,
    from: "از تاریخ",
    to: "تا تاریخ",
    execution: "فرض‌های اجرای معامله",
    capital: "سرمایهٔ اولیه (دلار)",
    risk: "ریسک هر معامله (%)",
    riskHint: "درصدی از ارزش فعلی حساب که تا حد ضرر در خطر است.",
    fee: "کارمزد هر طرف معامله (%)",
    feeHint: "کارمزد معاملهٔ فوری در بایننس ≈ 0.1%.",
    slip: "لغزش قیمت هر طرف (%)",
    enterOn: "ورود وقتی",
    enterStrong: "فقط فرصت‌های خرید قوی",
    enterPotential: "خرید احتمالی یا قوی‌تر",
    takeProfit: "برداشت سود در",
    target1: "هدف سود ۱",
    target2: "هدف سود ۲ (یا آخرین هدف موجود)",
    noTarget: "بدون هدف (خروج با قوانین یا حد ضرر)",
    maxBars: "حداکثر کندل در یک معامله (0 = بدون محدودیت)",
    cooldown: "استراحت بعد از خروج (کندل)",
    oos: "سهم بخش آخر برای سنجش (خارج از نمونه، %)",
    oosHint: "بخش آخرِ دوره جداگانه گزارش می‌شود تا «تنظیم بیش از حد روی گذشته» (بیش‌برازش) معلوم شود.",
    exitOnSignal: "خروج با «سیگنال فروش»",
    exitOnSignalDesc: "وقتی روش سیگنال فروش بدهد، با قیمت باز شدنِ کندل بعدی می‌فروشد",
    custom: "تنظیمات دلخواه (پیش‌فرض: تنظیمات ذخیره‌شده یا پیش‌فرض شما) ",
    customNote: "دست‌کاری تنظیمات تا وقتی نتیجهٔ آزمایش خوب به نظر برسد، یعنی تنظیم بیش از حد روی گذشته (بیش‌برازش). بهتر است پیش‌فرض‌ها را نگه دارید و بخش «خارج از نمونه» را بررسی کنید.",
    failed: "آزمایش ناموفق بود",
    running: "در حال دریافت داده‌های گذشته و شبیه‌سازی…",
    run: "اجرای آزمایش",
  },
} satisfies Dict<unknown>;

interface Props {
  symbols: string[];
  strategies: { id: string; name: string; params: ParamSpec[]; intendedTimeframes: string[] }[];
  initial: { symbol?: string; strategy?: string; tf?: string };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function BacktestForm({ symbols, strategies, initial }: Props) {
  const t = useL(L);
  const locale = useLocale();
  const tfName = (tf: string) => (locale === "fa" ? timeframeWord(tf, "fa") : tf);
  const router = useRouter();
  const [strategyId, setStrategyId] = useState(initial.strategy && strategies.some((s) => s.id === initial.strategy) ? initial.strategy : strategies[0].id);
  const strat = useMemo(() => strategies.find((s) => s.id === strategyId)!, [strategies, strategyId]);
  const [params, setParams] = useState<Record<string, number>>({});
  const [custom, setCustom] = useState(false);
  const [exitOnSignal, setExitOnSignal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const now = new Date();
  const yearAgo = new Date(now.getTime() - 2 * 365 * 86_400_000);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ run: { id: string } }>("/api/backtests", {
        body: {
          symbol: fd.get("symbol"),
          strategyId,
          timeframe: fd.get("timeframe"),
          from: fd.get("from"),
          to: fd.get("to"),
          params: custom ? params : undefined,
          settings: {
            initialCapital: Number(fd.get("capital")),
            riskPerTradePct: Number(fd.get("risk")),
            feeRate: Number(fd.get("fee")) / 100,
            slippageRate: Number(fd.get("slip")) / 100,
            minEntryState: fd.get("minEntry"),
            exitOnSignal,
            targetIndex: Number(fd.get("target")),
            maxBarsInTrade: Number(fd.get("maxBars")),
            cooldownBars: Number(fd.get("cooldown")),
            outOfSampleFraction: Number(fd.get("oos")) / 100,
          },
        },
      });
      router.push(`/backtest/${r.run.id}`);
    } catch (e2) {
      setErr(backtestErrorText(paramErrorText((e2 as Error).message, strat, locale), locale));
      setBusy(false);
    }
  }

  if (!symbols.length) return <Alert tone="info">{t.noAssets}</Alert>;
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={t.asset} htmlFor="bt-symbol"><Select id="bt-symbol" name="symbol" defaultValue={initial.symbol && symbols.includes(initial.symbol) ? initial.symbol : symbols[0]}>{symbols.map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label={t.strategy} htmlFor="bt-strategy"><Select id="bt-strategy" value={strategyId} onChange={(e) => { setStrategyId(e.target.value); setParams({}); }}>{strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label={t.timeframe} htmlFor="bt-tf" hint={t.intended(strat.intendedTimeframes.map(tfName).join(locale === "fa" ? "، " : ", "))}><Select id="bt-tf" name="timeframe" defaultValue={initial.tf ?? strat.intendedTimeframes[0]}>{["1h", "4h", "1d", "1w"].map((tf) => <option key={tf} value={tf}>{tfName(tf)}</option>)}</Select></Field>
        <Field label={t.from} htmlFor="bt-from"><Input id="bt-from" name="from" type="date" defaultValue={iso(yearAgo)} max={iso(now)} required /></Field>
        <Field label={t.to} htmlFor="bt-to"><Input id="bt-to" name="to" type="date" defaultValue={iso(now)} max={iso(now)} required /></Field>
      </div>
      <details className="rounded-lg border border-line p-3" open>
        <summary className="cursor-pointer text-sm font-medium">{t.execution}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.capital} htmlFor="bt-cap"><Input id="bt-cap" name="capital" type="number" min="100" step="any" defaultValue={10000} /></Field>
          <Field label={t.risk} htmlFor="bt-risk" hint={t.riskHint}><Input id="bt-risk" name="risk" type="number" min="0.1" max="10" step="0.1" defaultValue={1} /></Field>
          <Field label={t.fee} htmlFor="bt-fee" hint={t.feeHint}><Input id="bt-fee" name="fee" type="number" min="0" max="2" step="0.01" defaultValue={0.1} /></Field>
          <Field label={t.slip} htmlFor="bt-slip"><Input id="bt-slip" name="slip" type="number" min="0" max="5" step="0.01" defaultValue={0.05} /></Field>
          <Field label={t.enterOn} htmlFor="bt-min"><Select id="bt-min" name="minEntry" defaultValue="STRONG_BUY_SETUP"><option value="STRONG_BUY_SETUP">{t.enterStrong}</option><option value="POTENTIAL_BUY">{t.enterPotential}</option></Select></Field>
          <Field label={t.takeProfit} htmlFor="bt-target"><Select id="bt-target" name="target" defaultValue="1"><option value="0">{t.target1}</option><option value="1">{t.target2}</option><option value="-1">{t.noTarget}</option></Select></Field>
          <Field label={t.maxBars} htmlFor="bt-maxbars"><Input id="bt-maxbars" name="maxBars" type="number" min="0" step="1" defaultValue={0} /></Field>
          <Field label={t.cooldown} htmlFor="bt-cool"><Input id="bt-cool" name="cooldown" type="number" min="0" step="1" defaultValue={0} /></Field>
          <Field label={t.oos} htmlFor="bt-oos" hint={t.oosHint}><Input id="bt-oos" name="oos" type="number" min="0" max="50" step="5" defaultValue={30} /></Field>
          <div className="pt-6"><Toggle checked={exitOnSignal} onChange={setExitOnSignal} label={t.exitOnSignal} description={t.exitOnSignalDesc} /></div>
        </div>
      </details>
      <details className="rounded-lg border border-line p-3" open={custom} onToggle={(e) => setCustom((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-sm font-medium">{t.custom}</summary>
        <p className="mt-2 text-xs text-ink-2">{t.customNote}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {strat.params.map((p) => (
            <Field key={p.key} label={paramText(strat.id, p, locale).label} htmlFor={`bt-${p.key}`}>
              <Input id={`bt-${p.key}`} type="number" min={p.min} max={p.max} step={p.step} value={params[p.key] ?? p.default} onChange={(e) => setParams({ ...params, [p.key]: Number(e.target.value) })} />
            </Field>
          ))}
        </div>
      </details>
      {err && <Alert tone="error" title={t.failed}>{err}</Alert>}
      <Button type="submit" disabled={busy}>{busy ? t.running : t.run}</Button>
    </form>
  );
}
