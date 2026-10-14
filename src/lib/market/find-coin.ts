/** Turn what the user typed (ticker, English or Persian name) into a known coin. */
import { db } from "@/lib/db";
import { fetchTopMarkets } from "@/lib/market/providers/coingecko";
import { symbolFromPersianName } from "@/lib/plain";

/** Ticker ("SOL"), English name ("Solana") or Persian name ("سولانا") → ticker. */
export async function toSymbol(q: string): Promise<string> {
  const fa = symbolFromPersianName(q);
  if (fa) return fa;
  if (/^\s*(gold|pax ?gold)\s*$/i.test(q)) return "PAXG";
  const up = q.trim().toUpperCase();
  if (/^[A-Z0-9]{2,10}$/.test(up) && (await db().asset.findUnique({ where: { symbol: up } }))) return up;
  const top = await fetchTopMarkets().catch(() => []);
  if (top.some((m) => m.symbol === up)) return up;
  const lower = q.trim().toLowerCase();
  const byName = top.filter((m) => m.name.toLowerCase() === lower || m.coingeckoId === lower.replace(/\s+/g, "-")).sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))[0];
  return byName?.symbol ?? up;
}
