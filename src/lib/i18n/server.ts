import { cookies } from "next/headers";
import { isLocale, pick, type Dict, type Locale, LOCALE_COOKIE } from "./index";

/** Current UI language (cookie set by the language switch; English by default). */
export async function getLocale(): Promise<Locale> {
  try {
    const v = (await cookies()).get(LOCALE_COOKIE)?.value;
    return isLocale(v) ? v : "en";
  } catch {
    return "en";
  }
}

/** Server components: `const t = await getL(L)`. */
export async function getL<T>(dict: Dict<T>): Promise<T> {
  return pick(dict, await getLocale());
}
