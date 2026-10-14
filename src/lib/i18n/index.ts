/** Shared i18n primitives (safe on client and server). */
export const LOCALES = ["en", "fa"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "cp_lang";
export const isLocale = (v: unknown): v is Locale => v === "en" || v === "fa";
export const dirOf = (l: Locale) => (l === "fa" ? "rtl" : "ltr");

/** A per-component dictionary: same shape in every language. */
export type Dict<T> = { en: T; fa: T };
export function pick<T>(dict: Dict<T>, locale: Locale): T {
  return dict[locale] ?? dict.en;
}

/** Intl locale for dates: Persian (Jalali) calendar with Latin digits in FA. */
export const dateLocale = (l: Locale) => (l === "fa" ? "fa-IR-u-nu-latn" : "en-GB");
