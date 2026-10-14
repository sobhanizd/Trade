/**
 * Paper trading: hypothetical positions only. Nothing here talks to an
 * exchange account — prices come from public market data.
 */
import { db } from "@/lib/db";
import type { PaperTrade, Signal } from "@/generated/prisma/client";
import { fetchLivePrice } from "@/lib/market/assets";
import type { Candle } from "@/lib/market/types";
import { calculateRisk, roundTrip } from "@/lib/risk/calculator";
import { costsFromSettings, type UserSettingsData } from "@/lib/settings/schema";
import { STATE_RANK, type SignalState } from "@/lib/strategies/types";

export function settlePaper(trade: Pick<PaperTrade, "entryPrice" | "quantity" | "feeRate" | "slippageRate"> & Partial<Pick<PaperTrade, "buyCost" | "sellCost">>, exitRaw: number) {
  // entryPrice is stored as the FILL (incl. slippage or the buying cost); recover raw for gross figures.
  const side = trade.buyCost != null || trade.sellCost != null;
  const entryRaw = side ? trade.entryPrice * (1 - (trade.buyCost ?? 0)) : trade.entryPrice / (1 + trade.slippageRate);
  const rt = roundTrip(entryRaw, exitRaw, { feeRate: trade.feeRate, slippageRate: trade.slippageRate, ...(side ? { buyCost: trade.buyCost ?? 0, sellCost: trade.sellCost ?? 0 } : {}) });
  return {
    exitPrice: rt.exitFill,
    grossPnl: rt.gross * trade.quantity,
    fees: rt.fees * trade.quantity,
    netPnl: rt.net * trade.quantity,
  };
}

/** Decide whether stop/target were hit by candles after entry (stop first if both in one candle). */
export function checkExit(trade: Pick<PaperTrade, "stopPrice" | "targetPrice" | "entryAt">, candles: Candle[]): { price: number; at: number; reason: "STOP" | "TARGET" } | null {
  for (const c of candles) {
    if (c.closeTime < trade.entryAt.getTime()) continue;
    const pastEntryOpen = c.openTime >= trade.entryAt.getTime();
    if (trade.stopPrice !== null) {
      if (pastEntryOpen && c.open <= trade.stopPrice) return { price: c.open, at: c.openTime, reason: "STOP" };
      if (c.low <= trade.stopPrice) return { price: trade.stopPrice, at: c.openTime, reason: "STOP" };
    }
    if (trade.targetPrice !== null) {
      if (pastEntryOpen && c.open >= trade.targetPrice) return { price: c.open, at: c.openTime, reason: "TARGET" };
      if (c.high >= trade.targetPrice) return { price: trade.targetPrice, at: c.openTime, reason: "TARGET" };
    }
  }
  return null;
}

export async function openManualPaperTrade(
  userId: string,
  settings: UserSettingsData,
  input: {
    assetId: string; quantity?: number; riskAmount?: number; stopPrice?: number | null; targetPrice?: number | null; notes?: string; signalId?: string | null;
    /** Simple mode: amount of (pretend) money to put in, in USD. */
    amountUsd?: number;
    /** Simple mode: safety exit / target as % below / above the entry price. */
    stopPct?: number | null;
    targetPct?: number | null;
  },
) {
  const asset = await db().asset.findUniqueOrThrow({ where: { id: input.assetId } });
  const live = await fetchLivePrice(asset);
  const costs = costsFromSettings(settings);
  if (input.stopPct) input.stopPrice = live.price * (1 - input.stopPct / 100);
  if (input.targetPct) input.targetPrice = live.price * (1 + input.targetPct / 100);
  // Money in → coins received after costs (e.g. 3 % buying cost: €1,000 buys €970 of coin).
  const entryFill = roundTrip(live.price, live.price, costs).entryFill;
  if (input.amountUsd && !input.quantity) input.quantity = costs.buyCost !== undefined ? input.amountUsd / entryFill : input.amountUsd / (live.price * (1 + costs.slippageRate) * (1 + costs.feeRate));
  if (input.stopPrice != null && input.stopPrice >= live.price) throw new Error(`Stop must be below the current price (${live.price}).`);
  if (input.targetPrice != null && input.targetPrice <= live.price) throw new Error(`Target must be above the current price (${live.price}).`);
  let quantity = input.quantity ?? 0;
  if (!quantity && input.riskAmount && input.stopPrice) {
    const r = calculateRisk({
      accountBalance: settings.risk.accountBalance,
      maxLoss: input.riskAmount,
      entryPrice: live.price,
      stopPrice: input.stopPrice,
      targetPrice: input.targetPrice ?? null,
      ...costs,
      maxPositionPct: settings.risk.maxPositionPct,
    });
    if (!r.valid) throw new Error(r.errors.join(" "));
    quantity = r.quantity;
  }
  if (!(quantity > 0)) throw new Error("Enter how much money to put in.");
  return db().paperTrade.create({
    data: {
      userId,
      assetId: asset.id,
      signalId: input.signalId ?? null,
      source: "MANUAL",
      entryPrice: costs.buyCost !== undefined ? entryFill : live.price * (1 + costs.slippageRate),
      entryAt: new Date(),
      quantity,
      stopPrice: input.stopPrice ?? null,
      targetPrice: input.targetPrice ?? null,
      feeRate: costs.feeRate,
      slippageRate: costs.slippageRate,
      buyCost: costs.buyCost ?? null,
      sellCost: costs.sellCost ?? null,
      notes: input.notes?.slice(0, 1000) ?? null,
      priceSource: `${live.source} at ${live.at}`,
    },
  });
}

export async function closePaperTrade(userId: string, id: string, reason = "MANUAL") {
  const t = await db().paperTrade.findFirst({ where: { id, userId, status: "OPEN" }, include: { asset: true } });
  if (!t) throw new Error("Open paper trade not found.");
  const live = await fetchLivePrice(t.asset);
  const s = settlePaper(t, live.price);
  return db().paperTrade.update({ where: { id: t.id }, data: { status: "CLOSED", exitAt: new Date(), exitReason: reason, ...s, priceSource: `${t.priceSource}; exit ${live.source}` } });
}

/** Automatically record a hypothetical trade for a qualifying buy signal (every one, winners and losers). */
export async function autoTrackSignal(userId: string, settings: UserSettingsData, signal: Signal) {
  if (!settings.paper.autoTrackSignals) return null;
  const state = signal.state as SignalState;
  if (STATE_RANK[state] < STATE_RANK[settings.paper.autoTrackMinState] || signal.invalidation === null || signal.invalidation >= signal.price) return null;
  const costs = costsFromSettings(settings);
  const r = calculateRisk({
    accountBalance: settings.risk.accountBalance,
    maxLoss: (settings.risk.accountBalance * settings.risk.riskPerTradePct) / 100,
    entryPrice: signal.price,
    stopPrice: signal.invalidation,
    targetPrice: signal.targets[0] ?? null,
    ...costs,
    maxPositionPct: settings.risk.maxPositionPct,
  });
  if (!r.valid) return null;
  return db()
    .paperTrade.create({
      data: {
        userId,
        assetId: signal.assetId,
        signalId: signal.id,
        source: "AUTO_SIGNAL",
        strategyId: signal.strategyId,
        timeframe: signal.timeframe,
        entryPrice: r.entryFill,
        entryAt: new Date(signal.marketDataAt.getTime() + 1),
        quantity: r.quantity,
        stopPrice: signal.invalidation,
        targetPrice: signal.targets[0] ?? null,
        feeRate: costs.feeRate,
        slippageRate: costs.slippageRate,
        buyCost: costs.buyCost ?? null,
        sellCost: costs.sellCost ?? null,
        priceSource: `Signal-candle close ${signal.price} (${signal.pair}); hypothetical fill incl. slippage`,
      },
    })
    .catch(() => null); // unique(userId, signalId): already tracked
}

/** Close auto-tracked trades when their strategy reports an exit on the same asset/timeframe. */
export async function closeAutoTradesOnExit(userId: string, signal: Signal) {
  if (signal.state !== "EXIT_SETUP") return 0;
  const open = await db().paperTrade.findMany({
    where: { userId, assetId: signal.assetId, strategyId: signal.strategyId, timeframe: signal.timeframe, status: "OPEN", source: "AUTO_SIGNAL" },
  });
  for (const t of open) {
    const s = settlePaper(t, signal.price);
    await db().paperTrade.update({ where: { id: t.id }, data: { status: "CLOSED", exitAt: signal.marketDataAt, exitReason: "EXIT_SIGNAL", ...s } });
  }
  return open.length;
}

/** Apply stop/target exits to open paper trades using stored candles. */
export async function updateOpenPaperTrades(loadCandlesFor: (assetId: string, since: Date) => Promise<Candle[]>) {
  const open = await db().paperTrade.findMany({ where: { status: "OPEN", OR: [{ stopPrice: { not: null } }, { targetPrice: { not: null } }] } });
  let closed = 0;
  for (const t of open) {
    const candles = await loadCandlesFor(t.assetId, t.entryAt);
    const hit = checkExit(t, candles);
    if (!hit) continue;
    const s = settlePaper(t, hit.price);
    await db().paperTrade.update({ where: { id: t.id }, data: { status: "CLOSED", exitAt: new Date(hit.at), exitReason: hit.reason, ...s } });
    closed++;
  }
  return { checked: open.length, closed };
}

export function paperSummary(trades: PaperTrade[]) {
  const closed = trades.filter((t) => t.status === "CLOSED");
  const wins = closed.filter((t) => (t.netPnl ?? 0) > 0);
  const net = closed.reduce((a, t) => a + (t.netPnl ?? 0), 0);
  const fees = closed.reduce((a, t) => a + (t.fees ?? 0), 0);
  return {
    open: trades.length - closed.length,
    closed: closed.length,
    wins: wins.length,
    losses: closed.length - wins.length,
    winRatePct: closed.length ? (wins.length / closed.length) * 100 : null,
    netPnl: net,
    fees,
  };
}
