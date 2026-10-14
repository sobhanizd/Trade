/**
 * Display-currency conversion in one place. Market data is quoted in USD
 * (Binance USDT ≈ USD); EUR uses the ECB reference rate or the user's own
 * euro rate; Toman (IRT) = EUR × the user's euro → Toman rate.
 */
import { db } from "@/lib/db";
import type { Currency } from "@/lib/format";
import type { MarketRow } from "@/lib/market/types";
import type { UserSettingsData } from "@/lib/settings/schema";

export interface Fx {
  /** The currency actually shown (falls back when a rate is missing). */
  currency: Currency;
  wanted: Currency;
  /** Multiply a USD amount by this to get the display currency. */
  rate: number;
  /** EUR per 1 USD in use (manual or automatic). */
  eurPerUsd: number | null;
  autoEurPerUsd: number | null;
  autoDate: string | null;
  manual: boolean;
  tomanPerEur: number | null;
}

export async function getFx(settings: UserSettingsData): Promise<Fx> {
  const row = await db().marketSnapshot.findUnique({ where: { kind_key_currency: { kind: "FX", key: "USD-EUR", currency: "EUR" } } });
  const data = row?.data as { rate?: number; date?: string } | null;
  return fxFrom(settings, data?.rate ?? null, data?.date ?? null);
}

export function fxFrom(settings: UserSettingsData, autoEurPerUsd: number | null, autoDate: string | null = null): Fx {
  const manual = settings.fxManual.usdPerEur;
  const eurPerUsd = manual ? 1 / manual : autoEurPerUsd;
  const tomanPerEur = settings.toman.perEur;
  const wanted = settings.displayCurrency;
  let currency: Currency = "USD";
  let rate = 1;
  if (wanted === "IRT" && eurPerUsd && tomanPerEur) {
    currency = "IRT";
    rate = eurPerUsd * tomanPerEur;
  } else if ((wanted === "EUR" || wanted === "IRT") && eurPerUsd) {
    currency = "EUR";
    rate = eurPerUsd;
  }
  return { currency, wanted, rate, eurPerUsd, autoEurPerUsd, autoDate, manual: !!manual, tomanPerEur };
}

/** A USD market row in the display currency (percentages unchanged). */
export function convertRow(row: MarketRow | null | undefined, rate: number): MarketRow | null {
  if (!row) return null;
  const k = (v: number | null) => (v === null ? null : v * rate);
  return { ...row, price: k(row.price), marketCap: k(row.marketCap), volume24h: k(row.volume24h), high24h: k(row.high24h), low24h: k(row.low24h) };
}
