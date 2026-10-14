import { fetchJson } from "@/lib/http";
import type { SentimentReading } from "../types";

/** Crypto Fear & Greed Index by alternative.me (free; attribution required). */
export async function fetchFearGreed(fetchImpl?: typeof fetch): Promise<SentimentReading> {
  const res = await fetchJson<{ data: { value: string; value_classification: string; timestamp: string }[]; metadata?: { error: string | null } }>(
    "https://api.alternative.me/fng/?limit=1",
    { label: "alternative.fng", fetchImpl },
  );
  const d = res.data?.[0];
  const value = Number(d?.value);
  if (!d || !Number.isFinite(value)) throw new Error("fear&greed: unexpected response");
  return {
    value,
    classification: d.value_classification,
    timestamp: new Date(Number(d.timestamp) * 1000).toISOString(),
    source: "alternative.me Crypto Fear & Greed Index",
  };
}

/** USD→EUR reference rate from the ECB via frankfurter.dev (free, daily). */
export async function fetchUsdEur(fetchImpl?: typeof fetch): Promise<{ rate: number; date: string; source: string }> {
  const res = await fetchJson<{ date: string; rates: { EUR: number } }>("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR", {
    label: "frankfurter.fx",
    fetchImpl,
  });
  const rate = res.rates?.EUR;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("fx: unexpected response");
  return { rate, date: res.date, source: "European Central Bank reference rate (frankfurter.dev)" };
}
