import { db } from "@/lib/db";
import { STRATEGIES, defaultParams, resolveParams } from "@/lib/strategies/registry";
import type { Params, StrategyDefinition } from "@/lib/strategies/types";
import type { Timeframe } from "@/lib/market/types";
import { parseSettings, settingsSchema, type UserSettingsData } from "./schema";

export async function getSettings(userId: string): Promise<UserSettingsData> {
  const row = await db().userSettings.findUnique({ where: { userId } });
  return parseSettings(row?.data);
}

/** Deep-merge a partial update, validate the whole object, persist. */
export async function updateSettings(userId: string, patch: Record<string, unknown>): Promise<UserSettingsData> {
  const current = await getSettings(userId);
  const merged = deepMerge(current as unknown as Record<string, unknown>, patch);
  const data = settingsSchema.parse(merged);
  await db().userSettings.upsert({ where: { userId }, create: { userId, data }, update: { data } });
  return data;
}

function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) {
      out[k] = deepMerge(a[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else out[k] = v;
  }
  return out;
}

export interface ResolvedStrategyConfig {
  def: StrategyDefinition;
  enabled: boolean;
  params: Params;
  timeframes: Timeframe[];
}

/** Strategy configs for a user, with defaults for strategies never configured. */
export async function getStrategyConfigs(userId: string): Promise<ResolvedStrategyConfig[]> {
  const rows = await db().strategyConfig.findMany({ where: { userId } });
  return STRATEGIES.map((def) => {
    const row = rows.find((r) => r.strategyId === def.id);
    return {
      def,
      enabled: row?.enabled ?? true,
      params: row ? resolveParams(def.params, row.params as Record<string, unknown>) : defaultParams(def),
      timeframes: ((row?.timeframes?.length ? row.timeframes : def.defaultTimeframes) as Timeframe[]),
    };
  });
}

/** Mirror code-defined strategies into the DB (for FK integrity and versioning). */
export async function syncStrategyDefinitions() {
  for (const s of STRATEGIES) {
    const data = { name: s.name, version: s.version, description: s.description, rules: s.rules as object, paramSchema: s.params as object };
    await db().strategyDefinition.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }
}
