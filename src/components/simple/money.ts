import { fmtPrice, type Currency } from "@/lib/format";

/** Signal/paper prices are stored in USD (the exchange pair's quote). Show them in the display currency. */
export function moneyFmt(currency: Currency, eurRate: number | null) {
  const conv = (usd: number) => (currency !== "USD" && eurRate ? usd * eurRate : usd);
  return {
    conv,
    fmt: (usd: number | null | undefined) => (usd === null || usd === undefined ? "—" : fmtPrice(conv(usd), currency !== "USD" && !eurRate ? "USD" : currency)),
  };
}
