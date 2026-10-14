"use client";
/**
 * Toman prices: the user types in today's euro → Toman rate; every price can
 * then show a small Toman line under it. No online source is used for Toman.
 */
import { createContext, useContext, useState } from "react";
import { fmtPrice, type Currency } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n/client";

export interface TomanState { show: boolean; perEur: number | null; updatedAt: string | null }
interface Ctx extends TomanState { usdEur: number | null; set: (s: TomanState) => void }

const TomanCtx = createContext<Ctx>({ show: false, perEur: null, updatedAt: null, usdEur: null, set: () => undefined });

export function TomanProvider({ initial, usdEur, children }: { initial: TomanState; usdEur: number | null; children: React.ReactNode }) {
  const [state, set] = useState(initial);
  return <TomanCtx.Provider value={{ ...state, usdEur, set }}>{children}</TomanCtx.Provider>;
}

export const useToman = () => useContext(TomanCtx);

/** "52,668 تومان", "29,260,000 تومان", "21.73 میلیارد تومان". */
export function formatToman(v: number, l: Locale) {
  const unit = l === "fa" ? "تومان" : "Toman";
  if (v >= 1e9) return `${(v / 1e9).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${l === "fa" ? "میلیارد" : "billion"} ${unit}`;
  const r = v >= 1e6 ? Math.round(v / 1000) * 1000 : v >= 100 ? Math.round(v) : Number(v.toPrecision(3));
  return `${r.toLocaleString("en-US")} ${unit}`;
}

/** Converts a EUR (or USD) amount to Toman with the user's rate. */
export function useTomanValue() {
  const t = useToman();
  return (value: number | null | undefined, currency: Currency | null | undefined) => {
    if (!t.show || !t.perEur || value === null || value === undefined || !Number.isFinite(value)) return null;
    const eur = currency === "EUR" ? value : currency === "USD" && t.usdEur ? value * t.usdEur : null;
    return eur === null ? null : eur * t.perEur;
  };
}

/** Small Toman line, e.g. under a euro price. Renders nothing until a rate is set. */
export function Toman({ value, currency, className, prefix = "≈ ", suffix = "" }: { value: number | null | undefined; currency: Currency | null | undefined; className?: string; prefix?: string; suffix?: string }) {
  const l = useLocale();
  const tm = useToman();
  const toToman = useTomanValue();
  // When Toman is the main currency, the small line shows the euro price instead.
  if (currency === "IRT") {
    if (!tm.show || !tm.perEur || value === null || value === undefined || !Number.isFinite(value)) return null;
    return <span className={className ?? "text-xs text-ink-2"} dir={l === "fa" ? "rtl" : "ltr"} style={{ unicodeBidi: "isolate" }}>{prefix}<span dir="ltr" style={{ unicodeBidi: "isolate" }}>{fmtPrice(value / tm.perEur, "EUR")}</span>{suffix}</span>;
  }
  const v = toToman(value, currency);
  if (v === null) return null;
  return <span className={className ?? "text-xs text-ink-2"} dir={l === "fa" ? "rtl" : "ltr"} style={{ unicodeBidi: "isolate" }}>{prefix}{formatToman(v, l)}{suffix}</span>;
}
