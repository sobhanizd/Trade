import type { CandleProvider } from "../types";
import { createBinanceProvider } from "./binance";
import { createKrakenProvider } from "./kraken";

const factories: Record<string, (f?: typeof fetch) => CandleProvider> = {
  binance: createBinanceProvider,
  kraken: createKrakenProvider,
};

export const CANDLE_PROVIDER_IDS = Object.keys(factories);

/** Ordered candle providers (env CANDLE_PROVIDERS, optionally re-ordered by user preference). */
export function candleProviders(preferred?: string[], fetchImpl?: typeof fetch): CandleProvider[] {
  const fromEnv = (process.env.CANDLE_PROVIDERS ?? "binance,kraken")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s in factories);
  const order = preferred?.length ? [...preferred.filter((p) => fromEnv.includes(p)), ...fromEnv.filter((p) => !preferred.includes(p))] : fromEnv;
  return [...new Set(order)].map((id) => factories[id](fetchImpl));
}
