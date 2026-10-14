import { z } from "zod";
import { audit } from "@/lib/audit";
import { ApiError, route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { TIMEFRAMES } from "@/lib/market/types";
import { defaultParams, getStrategy, resolveParams, validateStrategyParams } from "@/lib/strategies/registry";

const Body = z.object({
  enabled: z.boolean().optional(),
  params: z.record(z.string(), z.number()).optional(),
  timeframes: z.array(z.enum(TIMEFRAMES)).min(1).optional(),
  reset: z.boolean().optional(),
});

export const PUT = route({ body: Body, rateLimit: 30 }, async ({ user, params, body }) => {
  const def = getStrategy(params.id);
  if (!def) throw new ApiError(404, "Unknown strategy.");
  const existing = await db().strategyConfig.findUnique({ where: { userId_strategyId: { userId: user.id, strategyId: def.id } } });
  const p = body.reset ? defaultParams(def) : resolveParams(def.params, { ...((existing?.params as object) ?? {}), ...(body.params ?? {}) });
  const errs = validateStrategyParams(def, p);
  if (errs.length) throw new ApiError(400, errs.join(" "));
  const data = {
    enabled: body.enabled ?? existing?.enabled ?? true,
    params: p,
    timeframes: body.reset ? def.defaultTimeframes : (body.timeframes ?? existing?.timeframes ?? def.defaultTimeframes),
  };
  const saved = await db().strategyConfig.upsert({ where: { userId_strategyId: { userId: user.id, strategyId: def.id } }, create: { userId: user.id, strategyId: def.id, ...data }, update: data });
  await audit("strategy.updated", user.id, { strategyId: def.id, enabled: data.enabled, reset: Boolean(body.reset) });
  return { config: saved };
});
