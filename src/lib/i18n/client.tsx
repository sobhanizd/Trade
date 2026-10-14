"use client";
import { createContext, useContext } from "react";
import { pick, type Dict, type Locale, LOCALE_COOKIE } from "./index";

const Ctx = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export const useLocale = () => useContext(Ctx);

/** Client components: `const t = useL(L)`. */
export function useL<T>(dict: Dict<T>): T {
  return pick(dict, useContext(Ctx));
}

/** Switch language: cookie for rendering, account setting for messages (alerts, AI). Full reload re-renders with the new direction. */
export async function switchLocale(next: Locale, signedIn = true) {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  if (signedIn) {
    await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ language: next }), credentials: "same-origin" }).catch(() => undefined);
  }
  window.location.reload();
}
