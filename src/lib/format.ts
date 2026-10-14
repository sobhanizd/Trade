/** Client-safe formatting helpers (no server imports). */
import { dateLocale, type Locale } from "@/lib/i18n";
export const currencyName = (c: Currency, l: Locale = "en") => (c === "IRT" ? (l === "fa" ? "تومان" : "Toman") : l === "fa" ? (c === "EUR" ? "یورو" : "دلار") : c);

/** IRT = Toman (converted with the user's own euro → Toman rate). */
export type Currency = "USD" | "EUR" | "IRT";

const SYM: Record<Currency, string> = { USD: "$", EUR: "€", IRT: "" };
/**
 * Toman amounts: whole numbers with "تومان", kept in Persian order (number, then the word)
 * by a right-to-left isolate; the signed number itself stays left-to-right.
 */
function toman(v: number, sign = ""): string {
  const n = Math.abs(v) >= 100 ? Math.round(Math.abs(v)).toLocaleString("en-US") : Number(Math.abs(v).toPrecision(3)).toLocaleString("en-US");
  return `\u2067\u2066${sign}${n}\u2069 تومان\u2069`;
}

export function fmtPrice(v: number | null | undefined, currency?: Currency | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (currency === "IRT") return toman(v, v < 0 ? "-" : "");
  const abs = Math.abs(v);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 5 : 8;
  const s = abs.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: abs >= 1 ? 2 : 0 });
  const sign = v < 0 ? "-" : "";
  return `${sign}${currency ? SYM[currency] : ""}${s}`;
}

/** Monetary amounts (P/L, fees, balances): always 2 decimals, sign before the symbol. */
export function fmtMoney(v: number | null | undefined, currency: Currency | null = "USD"): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (currency === "IRT") return toman(v, v < 0 ? "-" : "");
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}${currency ? SYM[currency] : ""}${s}`;
}

export function fmtPct(v: number | null | undefined, digits = 2, sign = true): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${sign && v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtBig(v: number | null | undefined, currency?: Currency): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (currency === "IRT") {
    // Persian scale words: هزار میلیارد = 10^12, میلیارد = 10^9, میلیون = 10^6.
    const [d, w] = a >= 1e12 ? [1e12, "هزار میلیارد"] : a >= 1e9 ? [1e9, "میلیارد"] : a >= 1e6 ? [1e6, "میلیون"] : [1, ""];
    const n = (v / d).toLocaleString("en-US", { maximumFractionDigits: d === 1 ? 0 : a / d >= 100 ? 0 : 1 });
    return `\u2067\u2066${n}\u2069${w ? ` ${w}` : ""} تومان\u2069`;
  }
  const sym = currency ? SYM[currency] : "";
  if (a >= 1e12) return `${sym}${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sym}${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sym}${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sym}${(v / 1e3).toFixed(1)}K`;
  return `${sym}${v.toFixed(2)}`;
}

export function timeAgo(d: Date | string | number | null | undefined, now = Date.now(), locale: Locale = "en"): string {
  const fa = locale === "fa";
  if (!d) return fa ? "هرگز" : "never";
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return "—";
  const s = Math.round((now - t) / 1000);
  if (s < 0) return fa ? "همین الان" : "just now";
  if (s < 60) return fa ? `${s} ثانیه پیش` : `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return fa ? `${m} دقیقه پیش` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return fa ? `${h} ساعت پیش` : `${h} h ago`;
  return fa ? `${Math.round(h / 24)} روز پیش` : `${Math.round(h / 24)} d ago`;
}

export function fmtDate(d: Date | string | number | null | undefined, withTime = true, locale: Locale = "en"): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const opts: Intl.DateTimeFormatOptions = withTime ? { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" } : { dateStyle: "medium", timeZone: "UTC" };
  return date.toLocaleString(dateLocale(locale), opts) + (withTime ? " UTC" : "");
}

export function changeTone(v: number | null | undefined): "up" | "down" | "flat" {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return "flat";
  return v > 0 ? "up" : "down";
}

/** Gold-backed tokens: 1 token = 1 troy ounce of gold. */
export const GOLD_TOKENS = new Set(["PAXG", "XAUT"]);
export const TROY_OUNCE_GRAMS = 31.1034768;

/** "≈ $X / gram" for gold tokens, otherwise null. */
export function perGram(symbol: string, price: number | null | undefined, currency?: Currency): string | null {
  if (!GOLD_TOKENS.has(symbol) || price === null || price === undefined || !Number.isFinite(price)) return null;
  return `≈ ${fmtMoney(price / TROY_OUNCE_GRAMS, currency ?? "USD")} / gram`;
}
