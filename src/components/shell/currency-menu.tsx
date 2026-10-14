"use client";
/**
 * Header currency switch (Euro / Dollar / Toman), like the language switch,
 * plus the two rates the user can type in: 1 € in Toman, and optionally 1 € in dollars.
 */
import { useState } from "react";
import { parseTomanInput, TomanRateBox } from "@/components/toman/rate-box";
import { useToman } from "@/components/toman/context";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import type { Currency } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";

export interface ShellFx {
  wanted: Currency;
  shown: Currency;
  autoUsdPerEur: number | null;
  autoDate: string | null;
  manualUsdPerEur: number | null;
  manualAt: string | null;
}

const L = {
  en: {
    aria: "Currency",
    title: "Show prices in",
    names: { EUR: "Euro €", USD: "Dollar $", IRT: "Toman" } as Record<Currency, string>,
    short: { EUR: "€", USD: "$", IRT: "Toman" } as Record<Currency, string>,
    needToman: "Enter the Toman rate below to see prices in Toman.",
    noEur: "The euro rate isn't available yet — prices are shown in dollars for now.",
    eurTitle: "Euro rate",
    eurAuto: (r: string, d: string | null) => `Automatic: 1 € = ${r} $${d ? ` (European Central Bank, ${d})` : ""}`,
    eurManual: (r: string) => `Your rate: 1 € = ${r} $`,
    eurAsk: "Prices look off? Enter your own rate (what your exchange shows):",
    useAuto: "Use automatic",
    save: "Save",
    invalid: "Enter a number between 0.5 and 2, e.g. 1.08.",
    note: "Coin prices come from Binance in dollars and are converted with these rates.",
  },
  fa: {
    aria: "واحد پول",
    title: "نمایش قیمت‌ها به",
    names: { EUR: "یورو €", USD: "دلار $", IRT: "تومان" } as Record<Currency, string>,
    short: { EUR: "€", USD: "$", IRT: "تومان" } as Record<Currency, string>,
    needToman: "برای دیدن قیمت‌ها به تومان، نرخ تومان را پایین وارد کنید.",
    noEur: "نرخ یورو هنوز در دسترس نیست — فعلاً قیمت‌ها به دلار نشان داده می‌شوند.",
    eurTitle: "نرخ یورو",
    eurAuto: (r: string, d: string | null) => `خودکار: 1 یورو = ${r} دلار${d ? ` (بانک مرکزی اروپا، \u2066${d}\u2069)` : ""}`,
    eurManual: (r: string) => `نرخ شما: 1 یورو = ${r} دلار`,
    eurAsk: "قیمت‌ها درست به نظر نمی‌رسند؟ نرخ خودتان را وارد کنید (همان که صرافی نشان می‌دهد):",
    useAuto: "استفاده از نرخ خودکار",
    save: "ذخیره",
    invalid: "عددی بین 0.5 و 2 وارد کنید، مثلاً 1.08.",
    note: "قیمت ارزها از Binance به دلار می‌آید و با این نرخ‌ها تبدیل می‌شود.",
  },
} satisfies Dict<unknown>;

const reload = () => window.location.reload();

export function CurrencyMenu({ fx }: { fx: ShellFx }) {
  const t = useL(L);
  const locale = useLocale();
  const tm = useToman();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [eurText, setEurText] = useState(fx.manualUsdPerEur ? String(fx.manualUsdPerEur) : "");

  const put = async (body: object) => {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/settings", { method: "PUT", body });
      reload();
    } catch (e) {
      setErr(errorText((e as Error).message, locale));
      setBusy(false);
    }
  };
  const saveEur = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseTomanInput(eurText);
    if (n === null || n < 0.5 || n > 2) return setErr(t.invalid);
    void put({ fxManual: { usdPerEur: n, updatedAt: new Date().toISOString() } });
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog" aria-label={`${t.aria}: ${t.names[fx.wanted]}`} title={t.aria}
        className={cn("rounded-lg px-2 py-2 text-sm font-semibold hover:bg-surface-2 hover:text-ink", open ? "bg-surface-2 text-ink" : "text-ink-2")}>
        {t.short[fx.wanted]}
      </button>
      {open && (
        <>
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label={t.aria} className="fixed inset-x-3 top-14 z-50 max-h-[calc(100dvh-5rem)] space-y-3 overflow-y-auto rounded-2xl border border-line bg-surface p-3 shadow-xl sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-1 sm:w-[22rem]">
            <div>
              <div className="mb-1.5 text-xs font-semibold tracking-wide text-ink-2 uppercase">{t.title}</div>
              <div role="radiogroup" aria-label={t.title} className="grid grid-cols-3 gap-1.5">
                {(["EUR", "USD", "IRT"] as const).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={fx.wanted === c} disabled={busy} onClick={() => (c === fx.wanted ? setOpen(false) : void put({ displayCurrency: c }))}
                    className={cn("min-h-10 rounded-lg px-2 text-sm font-semibold ring-1", fx.wanted === c ? "bg-accent text-accent-ink ring-accent" : "ring-line hover:bg-surface-2")}>
                    {t.names[c]}
                  </button>
                ))}
              </div>
              {fx.wanted === "IRT" && !tm.perEur && <p className="mt-2 text-xs text-warn-ink">{t.needToman}</p>}
              {fx.wanted !== "USD" && fx.shown === "USD" && tm.perEur !== null && <p className="mt-2 text-xs text-warn-ink">{t.noEur}</p>}
            </div>

            <TomanRateBox compact onSaved={reload} />

            <div className="rounded-2xl border border-line px-4 py-3 text-sm">
              <div className="font-semibold">{t.eurTitle}</div>
              {fx.manualUsdPerEur ? (
                <p className="mt-1">{t.eurManual(fx.manualUsdPerEur.toFixed(4))}</p>
              ) : fx.autoUsdPerEur ? (
                <p className="mt-1 text-ink-2">{t.eurAuto(fx.autoUsdPerEur.toFixed(4), fx.autoDate)}</p>
              ) : null}
              {fx.manualUsdPerEur && fx.autoUsdPerEur && <p className="text-xs text-ink-2">{t.eurAuto(fx.autoUsdPerEur.toFixed(4), fx.autoDate)}</p>}
              <p className="mt-2 text-xs text-ink-2">{t.eurAsk}</p>
              <form onSubmit={saveEur} className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-sm">{locale === "fa" ? "1 یورو =" : "1 € ="}</span>
                <input inputMode="decimal" value={eurText} onChange={(e) => setEurText(e.target.value)} placeholder={fx.autoUsdPerEur?.toFixed(4) ?? "1.08"} aria-label={t.eurTitle} className="ltr min-h-10 w-24 rounded-lg border border-line bg-surface px-2" />
                <span className="text-sm">{locale === "fa" ? "دلار" : "$"}</span>
                <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-ink disabled:opacity-60">{t.save}</button>
                {fx.manualUsdPerEur && <button type="button" disabled={busy} onClick={() => void put({ fxManual: { usdPerEur: null, updatedAt: null } })} className="min-h-10 rounded-lg border border-line px-3 text-sm text-ink-2">{t.useAuto}</button>}
              </form>
              <p className="mt-2 text-xs text-ink-2">{t.note}</p>
            </div>
            {err && <p role="alert" className="text-sm text-bad-ink">{err}</p>}
          </div>
        </>
      )}
    </div>
  );
}
