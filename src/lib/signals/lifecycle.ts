import { db } from "@/lib/db";
import type { Signal } from "@/generated/prisma/client";
import { formatChangeAlert, formatInvalidationAlert, formatSignalAlert, type SignalLike } from "@/lib/notifications/format";
import { notify } from "@/lib/notifications/dispatch";
import type { SignalSourceCheck } from "@/lib/market/crosscheck";
import type { UserSettingsData } from "@/lib/settings/schema";
import { getStrategy } from "@/lib/strategies/registry";
import { BUY_STATES, STATE_RANK, type SignalState } from "@/lib/strategies/types";
import type { SignalResult } from "./evaluate";

export function toSignalLike(s: Signal): SignalLike {
  return {
    id: s.id,
    pair: s.pair,
    strategyName: getStrategy(s.strategyId)?.name ?? s.strategyId,
    timeframe: s.timeframe,
    state: s.state as SignalState,
    summary: s.summary,
    invalidation: s.invalidation,
    riskReward: s.riskReward,
    risks: (s.risks as string[]) ?? [],
    conflicts: (s.conflicts as string[]) ?? [],
    price: s.price,
  };
}

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export interface ProcessOutcome {
  signal: Signal;
  created: boolean;
  previous: Signal | null;
  notified: boolean;
}

/**
 * Persist a strategy result. Only a CHANGE of state creates a new signal row;
 * an unchanged state just refreshes the existing one (no duplicate alerts).
 */
export async function processResult(
  userId: string,
  asset: { id: string; symbol: string },
  pair: string,
  result: SignalResult,
  analysisRunId: string | null,
  settings: UserSettingsData,
  evidence: unknown | null,
  now = new Date(),
  sourceCheck: SignalSourceCheck | null = null,
): Promise<ProcessOutcome> {
  const active = await db().signal.findFirst({
    where: { userId, assetId: asset.id, timeframe: result.timeframe, strategyId: result.strategyId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  if (active && active.fingerprint === result.fingerprint) {
    const updated = await db().signal.update({
      where: { id: active.id },
      // The second-exchange check reflects the latest candle, so it is refreshed even when the state is unchanged.
      data: { lastEvaluatedAt: now, expiresAt: result.expiresAt ? new Date(result.expiresAt) : active.expiresAt, ...(sourceCheck ? { sourceCheck: sourceCheck as object } : {}) },
    });
    return { signal: updated, created: false, previous: null, notified: false };
  }

  const signal = await db().$transaction(async (tx) => {
    if (active) {
      await tx.signal.update({ where: { id: active.id }, data: { status: "SUPERSEDED" } });
      await tx.signalStatusChange.create({
        data: { signalId: active.id, fromStatus: "ACTIVE", toStatus: "SUPERSEDED", reason:
            active.state === result.state
              ? `Re-evaluated with changed strategy version or parameters (state unchanged: ${result.state})`
              : `State changed from ${active.state} to ${result.state}`,
          price: result.price,
        },
      });
    }
    const created = await tx.signal.create({
      data: {
        userId,
        assetId: asset.id,
        pair,
        strategyId: result.strategyId,
        strategyVersion: result.strategyVersion,
        timeframe: result.timeframe,
        state: result.state,
        signalAt: now,
        marketDataAt: new Date(result.marketDataAt ?? now.getTime()),
        price: result.price ?? 0,
        summary: result.summary,
        conditions: result.conditions as object,
        indicators: result.indicators as object,
        entryLow: result.entryLow,
        entryHigh: result.entryHigh,
        invalidation: result.invalidation,
        targets: result.targets,
        riskReward: result.riskReward,
        risks: result.risks,
        conflicts: result.conflicts,
        dataIssues: result.dataIssues,
        rulesMet: result.rulesMet,
        rulesTotal: result.rulesTotal,
        expiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
        fingerprint: result.fingerprint,
        params: result.params as object,
        evidence: (evidence ?? undefined) as object | undefined,
        sourceCheck: (sourceCheck ?? undefined) as object | undefined,
        analysisRunId,
        lastEvaluatedAt: now,
      },
    });
    await tx.signalStatusChange.create({
      data: { signalId: created.id, fromStatus: null, toStatus: "ACTIVE", reason: active ? `Replaced previous ${active.state} signal` : "First evaluation", price: result.price },
    });
    return created;
  });

  const notified = await alertForChange(userId, asset, signal, active, settings, now);
  return { signal, created: true, previous: active, notified };
}

function passesFilters(settings: UserSettingsData, s: Signal, symbol: string) {
  const a = settings.alerts;
  if (a.strategies.length && !a.strategies.includes(s.strategyId)) return false;
  if (a.assets.length && !a.assets.includes(symbol)) return false;
  if (a.timeframes.length && !a.timeframes.includes(s.timeframe as never)) return false;
  return true;
}

export function shouldAlertBuy(settings: UserSettingsData, state: SignalState, riskReward: number | null) {
  return STATE_RANK[state] >= STATE_RANK[settings.alerts.minState] && BUY_STATES.includes(state) && (riskReward ?? 0) >= settings.alerts.minRiskReward;
}

async function alertForChange(userId: string, asset: { id: string; symbol: string }, s: Signal, prev: Signal | null, settings: UserSettingsData, now: Date) {
  if (!passesFilters(settings, s, asset.symbol)) return false;
  const state = s.state as SignalState;
  const bucket = Math.floor(now.getTime() / (settings.alerts.cooldownMinutes * 60_000));
  const base = `${asset.id}:${s.strategyId}:${s.timeframe}`;

  // New qualifying buy setup.
  if (shouldAlertBuy(settings, state, s.riskReward)) {
    const msg = formatSignalAlert(toSignalLike(s), appUrl(), settings.language);
    return Boolean(await notify(userId, settings, { kind: "SIGNAL", ...msg, dedupeKey: `sig:${base}:${state}:${bucket}`, signalId: s.id }, { now }));
  }

  const prevWasAlertedBuy = prev && BUY_STATES.includes(prev.state as SignalState) && (await db().notification.count({ where: { signalId: prev.id } })) > 0;

  // Exit setups: only when they relate to something the user was told about or is tracking.
  if (state === "EXIT_SETUP" && settings.alerts.notifyExits) {
    // Manual hypothetical positions on this asset, or the auto-tracked trade of this exact strategy/timeframe.
    const openPaper = await db().paperTrade.count({
      where: { userId, assetId: asset.id, status: "OPEN", OR: [{ source: "MANUAL" }, { strategyId: s.strategyId, timeframe: s.timeframe }] },
    });
    if (prevWasAlertedBuy || openPaper > 0) {
      const msg = formatSignalAlert(toSignalLike(s), appUrl(), settings.language);
      return Boolean(await notify(userId, settings, { kind: "SIGNAL", ...msg, dedupeKey: `sig:${base}:${state}:${bucket}`, signalId: s.id }, { now }));
    }
  }

  // A previously alerted buy setup weakened or changed materially.
  if (prev && prevWasAlertedBuy && settings.alerts.notifyCancellations) {
    const msg = formatChangeAlert(toSignalLike(prev), toSignalLike(s), appUrl(), settings.language);
    return Boolean(await notify(userId, settings, { kind: "SIGNAL_CHANGE", ...msg, dedupeKey: `chg:${prev.id}`, signalId: s.id }, { now }));
  }
  return false;
}

/**
 * Invalidate active long signals whose invalidation level has been traded
 * through (using the lowest price since the signal), and expire stale ones.
 */
export async function checkInvalidationsAndExpiry(
  userId: string,
  asset: { id: string; symbol: string },
  timeframe: string,
  lowSince: (since: Date) => number | null,
  settings: UserSettingsData,
  now = new Date(),
) {
  const active = await db().signal.findMany({ where: { userId, assetId: asset.id, timeframe, status: "ACTIVE" } });
  let invalidated = 0;
  let expired = 0;
  for (const s of active) {
    const state = s.state as SignalState;
    if (BUY_STATES.includes(state) && s.invalidation !== null) {
      const low = lowSince(s.marketDataAt);
      if (low !== null && low <= s.invalidation) {
        await db().$transaction([
          db().signal.update({ where: { id: s.id }, data: { status: "INVALIDATED" } }),
          db().signalStatusChange.create({ data: { signalId: s.id, fromStatus: "ACTIVE", toStatus: "INVALIDATED", reason: `Price traded at ${low} (≤ invalidation ${s.invalidation})`, price: low } }),
        ]);
        invalidated++;
        if (settings.alerts.notifyInvalidations && passesFilters(settings, s, asset.symbol) && (await db().notification.count({ where: { signalId: s.id } })) > 0) {
          const msg = formatInvalidationAlert(toSignalLike(s), low, appUrl(), settings.language);
          await notify(userId, settings, { kind: "SIGNAL_INVALIDATED", ...msg, dedupeKey: `inv:${s.id}`, signalId: s.id }, { now });
        }
        continue;
      }
    }
    if (s.expiresAt && s.expiresAt < now && s.lastEvaluatedAt < s.expiresAt) {
      // Not re-confirmed by a newer evaluation before expiry (e.g. data outage).
      await db().$transaction([
        db().signal.update({ where: { id: s.id }, data: { status: "EXPIRED" } }),
        db().signalStatusChange.create({ data: { signalId: s.id, fromStatus: "ACTIVE", toStatus: "EXPIRED", reason: "Not re-confirmed within the expiry window" } }),
      ]);
      expired++;
    }
  }
  return { invalidated, expired };
}
