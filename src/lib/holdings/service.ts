/** "My assets": coins the user owns, typed in by hand. Read-only bookkeeping — nothing touches an exchange. */
import { z } from "zod";
import { db } from "@/lib/db";
import { getFx } from "@/lib/fx";
import { resolveAsset } from "@/lib/market/assets";
import { toSymbol } from "@/lib/market/find-coin";
import { GOLD_TOKENS, TROY_OUNCE_GRAMS, type Currency } from "@/lib/format";
import type { MarketRow } from "@/lib/market/types";
import { sideCosts } from "@/lib/settings/schema";
import { getSettings } from "@/lib/settings/service";

export class HoldingInputError extends Error {}

/** Optional purchase price as sent by the page (validated in the API routes). */
export const PriceInput = z.object({ kind: z.enum(["perCoin", "total"]), value: z.number().positive().max(1e15), currency: z.enum(["EUR", "USD", "IRT"]) }).nullable().optional();

export interface HoldingInput {
  coin: string;
  amount: number;
  /** "gram" only for gold tokens (1 token = 1 troy ounce). */
  unit?: "coin" | "gram";
  /** Either the price of one coin, or the total paid — only when the user remembers. */
  price?: { kind: "perCoin" | "total"; value: number; currency: Currency } | null;
  boughtAt?: string | null;
  note?: string | null;
}

/** Find (or validate and create) the coin the user typed. */
async function assetFor(userId: string, coin: string) {
  const symbol = await toSymbol(coin);
  const existing = await db().asset.findUnique({ where: { symbol } });
  if (existing) return existing;
  const r = await resolveAsset(symbol, (await getSettings(userId)).liquidity);
  if (!r.validation.ok || !r.asset) throw new HoldingInputError(`"${coin}" was not found as a coin with reliable price data. Try its ticker, e.g. SOL.`);
  return db().asset.upsert({ where: { symbol }, create: { ...r.asset, lastValidatedAt: new Date(), validation: r.validation as object }, update: {} });
}

function normalize(symbol: string, input: HoldingInput) {
  if (!(input.amount > 0)) throw new HoldingInputError("Enter how much of the coin you have.");
  const quantity = input.unit === "gram" && GOLD_TOKENS.has(symbol) ? input.amount / TROY_OUNCE_GRAMS : input.amount;
  let buyPrice: number | null = null;
  let buyCurrency: Currency | null = null;
  if (input.price && input.price.value > 0) {
    buyPrice = input.price.kind === "total" ? input.price.value / quantity : input.price.value;
    // A per-gram price for gold is converted to the per-token (troy ounce) price.
    if (input.price.kind === "perCoin" && input.unit === "gram" && GOLD_TOKENS.has(symbol)) buyPrice = input.price.value * TROY_OUNCE_GRAMS;
    buyCurrency = input.price.currency;
  }
  const boughtAt = input.boughtAt ? new Date(input.boughtAt) : null;
  if (boughtAt && (Number.isNaN(boughtAt.getTime()) || boughtAt.getTime() > Date.now() + 86_400_000)) throw new HoldingInputError("The purchase date is not valid.");
  return { quantity, buyPrice, buyCurrency, boughtAt, note: input.note?.slice(0, 300) || null };
}

export async function addHolding(userId: string, input: HoldingInput) {
  const asset = await assetFor(userId, input.coin);
  return db().holding.create({ data: { userId, assetId: asset.id, ...normalize(asset.symbol, input) } });
}

export async function updateHolding(userId: string, id: string, input: Omit<HoldingInput, "coin">) {
  const h = await db().holding.findFirst({ where: { id, userId }, include: { asset: true } });
  if (!h) throw new HoldingInputError("Not found.");
  return db().holding.update({ where: { id }, data: normalize(h.asset.symbol, { ...input, coin: h.asset.symbol }) });
}

export async function deleteHolding(userId: string, id: string) {
  const r = await db().holding.deleteMany({ where: { id, userId } });
  if (!r.count) throw new HoldingInputError("Not found.");
}

/** Everything the "My assets" page needs: lots, prices (USD), rates and the user's selling cost. */
export async function getHoldingsView(userId: string) {
  const settings = await getSettings(userId);
  const fx = await getFx(settings);
  const lots = await db().holding.findMany({ where: { userId }, include: { asset: true }, orderBy: [{ createdAt: "asc" }] });
  const assetIds = [...new Set(lots.map((l) => l.assetId))];
  const snaps = await db().marketSnapshot.findMany({ where: { kind: "ASSET", currency: "USD", assetId: { in: assetIds } } });
  const watch = await db().watchlistItem.findMany({ where: { userId }, include: { asset: { select: { symbol: true, name: true } } }, orderBy: [{ position: "asc" }] });
  return {
    currency: fx.currency,
    /** USD → display currency. */
    rate: fx.rate,
    eurPerUsd: fx.eurPerUsd,
    tomanPerEur: fx.tomanPerEur,
    sellCost: sideCosts(settings).sell,
    watchlist: watch.map((w) => ({ symbol: w.asset.symbol, name: w.asset.name })),
    lots: lots.map((l) => {
      const row = snaps.find((s) => s.assetId === l.assetId)?.data as MarketRow | undefined;
      return {
        id: l.id,
        symbol: l.asset.symbol,
        name: l.asset.name,
        pair: l.asset.binanceSymbol,
        quantity: l.quantity,
        buyPrice: l.buyPrice,
        buyCurrency: (l.buyCurrency as Currency | null) ?? null,
        boughtAt: l.boughtAt?.toISOString() ?? null,
        note: l.note,
        priceUsd: row?.price ?? null,
        change24h: row?.change24h ?? null,
      };
    }),
  };
}
export type HoldingsView = Awaited<ReturnType<typeof getHoldingsView>>;
