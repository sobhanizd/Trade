"use client";
import { useState } from "react";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";
import { formatToman, useToman, type TomanState } from "./context";

const STALE_DAYS = 7;

const L = {
  en: {
    title: "Toman price",
    ask: "Show prices in Toman too? Enter today's price of 1 euro in Toman:",
    rate: (r: string) => `1 € = ${r}`,
    set: (ago: string) => `you set this ${ago}`,
    stale: (ago: string) => `set ${ago} — please update it`,
    change: "Change",
    save: "Save",
    cancel: "Cancel",
    show: "Show Toman prices",
    placeholder: "e.g. 292,600",
    aria: "Price of 1 euro in Toman",
    invalid: "Enter a number, e.g. 292600.",
    note: "You enter this yourself (for example from your exchange shop), so it is always the rate you really pay. Toman prices are the euro price × this rate.",
  },
  fa: {
    title: "قیمت تومانی",
    ask: "قیمت‌ها به تومان هم نشان داده شود؟ قیمت امروز 1 یورو را به تومان وارد کنید:",
    rate: (r: string) => `1 یورو = ${r}`,
    set: (ago: string) => `شما ${ago} وارد کردید`,
    stale: (ago: string) => `${ago} وارد شده — لطفاً به‌روز کنید`,
    change: "تغییر",
    save: "ذخیره",
    cancel: "انصراف",
    show: "نمایش قیمت تومانی",
    placeholder: "مثلاً 292,600",
    aria: "قیمت 1 یورو به تومان",
    invalid: "یک عدد وارد کنید، مثلاً 292600.",
    note: "این نرخ را خودتان وارد می‌کنید (مثلاً از صرافی)، پس همیشه همان نرخی است که واقعاً می‌پردازید. قیمت تومانی = قیمت یورویی × این نرخ.",
  },
} satisfies Dict<unknown>;

/** Accepts "292,600", "۲۹۲٬۶۰۰" or "292600". */
export function parseTomanInput(s: string): number | null {
  const latin = s.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0)).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660));
  const clean = latin.replace(/[,٬،\s_']/g, "").replace(/٫/g, ".");
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const n = Number(clean);
  return n > 0 && n <= 100_000_000 ? n : null;
}

export function TomanRateBox({ compact = false, onSaved }: { compact?: boolean; onSaved?: () => void }) {
  const t = useL(L);
  const locale = useLocale();
  const tm = useToman();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (next: Partial<TomanState>) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ settings: { toman: TomanState } }>("/api/settings", { method: "PUT", body: { toman: next } });
      tm.set(res.settings.toman);
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setErr(errorText((e as Error).message, locale));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseTomanInput(text);
    if (n === null) return setErr(t.invalid);
    void save({ perEur: n, show: true });
  };

  const ageDays = tm.updatedAt ? (Date.parse(tm.updatedAt) > 0 ? (new Date().getTime() - Date.parse(tm.updatedAt)) / 86_400_000 : null) : null;
  const stale = ageDays !== null && ageDays > STALE_DAYS;
  const ago = tm.updatedAt ? timeAgo(new Date(tm.updatedAt), undefined, locale) : "";

  const form = (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        inputMode="decimal"
        autoFocus={editing}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.placeholder}
        aria-label={t.aria}
        className="ltr min-h-10 w-40 rounded-lg border border-line bg-surface px-3"
      />
      <span className="text-sm text-ink-2">{locale === "fa" ? "تومان" : "Toman"}</span>
      <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-60">{t.save}</button>
      {tm.perEur && <button type="button" onClick={() => setEditing(false)} className="min-h-10 rounded-lg border border-line px-3 text-sm text-ink-2">{t.cancel}</button>}
      {err && <span role="alert" className="w-full text-sm text-bad-ink">{err}</span>}
    </form>
  );

  return (
    <div className={cn("rounded-2xl border bg-surface px-4 py-3 text-sm", stale ? "border-warn/60" : "border-line", compact ? "mb-4" : "")}>
      {!tm.perEur || editing ? (
        <>
          <p className="mb-2">{tm.perEur ? <b>{t.title}</b> : t.ask}</p>
          {form}
          {!compact && <p className="mt-2 text-xs text-ink-2">{t.note}</p>}
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold">{t.rate(formatToman(tm.perEur, locale))}</span>
            <span className={cn("ms-2 text-xs", stale ? "text-warn-ink" : "text-ink-2")}>{stale ? `⚠️ ${t.stale(ago)}` : t.set(ago)}</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              <input type="checkbox" checked={tm.show} disabled={busy} onChange={(e) => void save({ show: e.target.checked })} />
              {t.show}
            </label>
            <button type="button" onClick={() => { setText(String(tm.perEur)); setEditing(true); }} className="min-h-9 rounded-lg border border-line px-3 text-sm font-medium hover:bg-surface-2">{t.change}</button>
          </div>
          {!compact && <p className="w-full text-xs text-ink-2">{t.note}</p>}
        </div>
      )}
    </div>
  );
}
