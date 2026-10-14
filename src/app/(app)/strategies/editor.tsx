"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert, Badge, Button, Card, Field, Input, Toggle } from "@/components/ui";
import { api } from "@/lib/client-api";
import type { Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";
import { timeframeWord } from "@/lib/plain";
import { STRATEGY_TERMS_FA, paramErrorText, strategyText } from "@/lib/strategies/i18n";
import type { ParamSpec, StrategyRules } from "@/lib/strategies/types";

const TFS = ["1h", "4h", "1d", "1w"] as const;

const L = {
  en: {
    saved: "Saved. Takes effect at the next candle close (or press Refresh).",
    intended: (tf: string) => `intended ${tf}`,
    disabledBadge: "disabled",
    enabled: "Enabled",
    disabled: "Disabled",
    rulesSummary: "Rules, invalidation and limitations",
    terms: "",
    setup: "Setup",
    confirmation: "Confirmation",
    exit: "Exit / sell",
    invalidation: "Invalidation:",
    targets: "Targets:",
    expiry: "Expiry:",
    closedOnly: "All rules are evaluated on closed candles only (no future data). Fees and slippage are included in R/R estimates and backtests.",
    timeframes: "Timeframes",
    range: (min: number, max: number) => `Range ${min}–${max}.`,
    save: "Save parameters",
    reset: "Reset to defaults",
    backtest: "Backtest this strategy →",
  },
  fa: {
    saved: "ذخیره شد. از پایان کندل بعدی اعمال می‌شود (یا «تازه‌سازی» را بزنید).",
    intended: (tf: string) => `مناسب برای ${tf}`,
    disabledBadge: "خاموش",
    enabled: "روشن",
    disabled: "خاموش",
    rulesSummary: "قوانین، حد ضرر و محدودیت‌ها",
    terms: STRATEGY_TERMS_FA,
    setup: "شرط‌های اصلی",
    confirmation: "تأییدها",
    exit: "خروج / فروش",
    invalidation: "حد ضرر:",
    targets: "هدف‌های سود:",
    expiry: "مدت اعتبار:",
    closedOnly: "همهٔ قوانین فقط روی کندل‌های کامل‌شده بررسی می‌شوند (بدون استفاده از داده‌های آینده). کارمزد و لغزش قیمت (اختلاف قیمت اجرا) در تخمین نسبت سود به ضرر و در آزمایش روی گذشته حساب شده‌اند.",
    timeframes: "بازه‌های زمانی",
    range: (min: number, max: number) => `محدوده: ${min} تا ${max}.`,
    save: "ذخیرهٔ تنظیمات",
    reset: "برگرداندن به پیش‌فرض",
    backtest: "آزمایش این روش روی گذشته (بک‌تست) ←",
  },
} satisfies Dict<unknown>;

interface Props {
  strategy: { id: string; name: string; version: number; summary: string; description: string; rules: StrategyRules; intendedTimeframes: string[]; params: ParamSpec[] };
  config: { enabled: boolean; params: Record<string, number>; timeframes: string[] };
}

export function StrategyEditor({ strategy, config }: Props) {
  const t = useL(L);
  const locale = useLocale();
  const text = strategyText(strategy, locale);
  const tfName = (tf: string) => (locale === "fa" ? timeframeWord(tf, "fa") : tf);
  const [enabled, setEnabled] = useState(config.enabled);
  const [params, setParams] = useState<Record<string, number>>(config.params);
  const [tfs, setTfs] = useState<string[]>(config.timeframes);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ config: { enabled: boolean; params: Record<string, number>; timeframes: string[] } }>(`/api/strategies/${strategy.id}`, { method: "PUT", body });
      setEnabled(r.config.enabled);
      setParams(r.config.params);
      setTfs(r.config.timeframes);
      setMsg({ tone: "success", text: t.saved });
    } catch (e) {
      setMsg({ tone: "error", text: errorText(paramErrorText((e as Error).message, strategy, locale), locale) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{text.name} <span className="text-sm font-normal text-ink-2">v{strategy.version}</span></h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">{text.summary}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {strategy.intendedTimeframes.map((tf) => <Badge key={tf}>{t.intended(tfName(tf))}</Badge>)}
            {!enabled && <Badge tone="warn">{t.disabledBadge}</Badge>}
          </div>
        </div>
        <Toggle checked={enabled} onChange={(v) => save({ enabled: v })} label={enabled ? t.enabled : t.disabled} />
      </div>

      <details className="mt-4 rounded-lg border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium">{t.rulesSummary}</summary>
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-ink-2">{text.description}</p>
          {t.terms && <p className="rounded-md bg-surface-2 p-2 text-xs text-ink-2">{t.terms}</p>}
          <RuleList title={t.setup} items={text.rules.setup} />
          <RuleList title={t.confirmation} items={text.rules.confirmation} />
          <RuleList title={t.exit} items={text.rules.exit} />
          <p><b>{t.invalidation}</b> <span className="text-ink-2">{text.rules.invalidation}</span></p>
          <p><b>{t.targets}</b> <span className="text-ink-2">{text.rules.targets}</span></p>
          <p><b>{t.expiry}</b> <span className="text-ink-2">{text.rules.expiry}</span></p>
          <p className="text-ink-2">{t.closedOnly}</p>
        </div>
      </details>

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ params, timeframes: tfs });
        }}
      >
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t.timeframes}</legend>
          <div className="flex flex-wrap gap-3">
            {TFS.map((tf) => (
              <label key={tf} className="inline-flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={tfs.includes(tf)} onChange={(e) => setTfs(e.target.checked ? [...tfs, tf] : tfs.filter((x) => x !== tf))} />
                {tfName(tf)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {strategy.params.map((p) => (
            <Field key={p.key} label={text.params[p.key]?.label ?? p.label} hint={`${text.params[p.key]?.help ?? p.help} ${t.range(p.min, p.max)}`} htmlFor={`${strategy.id}-${p.key}`}>
              <Input
                id={`${strategy.id}-${p.key}`}
                type="number"
                min={p.min}
                max={p.max}
                step={p.step}
                value={params[p.key] ?? p.default}
                onChange={(e) => setParams({ ...params, [p.key]: Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || tfs.length === 0}>{t.save}</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => save({ reset: true })}>{t.reset}</Button>
          <Link href={`/backtest?strategy=${strategy.id}`} className="inline-flex min-h-10 items-center px-2 text-sm text-accent hover:underline">{t.backtest}</Link>
        </div>
      </form>
    </Card>
  );
}

function RuleList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <b>{title}</b>
      <ul className="mt-1 list-disc ps-5 text-ink-2">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
