import { z } from "zod";
import { ApiError, route } from "@/lib/api/handler";
import { runAndStoreBacktest } from "@/lib/backtest/service";
import { db } from "@/lib/db";
import { TIMEFRAMES } from "@/lib/market/types";

const Body = z.object({
  symbol: z.string().trim().min(2).max(10),
  strategyId: z.string().min(1).max(50),
  timeframe: z.enum(TIMEFRAMES),
  params: z.record(z.string(), z.number()).optional(),
  from: z.coerce.date(),
  to: z.coerce.date(),
  settings: z.object({
    initialCapital: z.number().positive().max(1e10).default(10_000),
    riskPerTradePct: z.number().min(0.1).max(10).default(1),
    feeRate: z.number().min(0).max(0.02).default(0.001),
    slippageRate: z.number().min(0).max(0.05).default(0.0005),
    minEntryState: z.enum(["STRONG_BUY_SETUP", "POTENTIAL_BUY"]).default("STRONG_BUY_SETUP"),
    exitOnSignal: z.boolean().default(true),
    targetIndex: z.number().int().min(-1).max(1).default(1),
    maxBarsInTrade: z.number().int().min(0).max(10_000).default(0),
    cooldownBars: z.number().int().min(0).max(1000).default(0),
    outOfSampleFraction: z.number().min(0).max(0.5).default(0.3),
  }).prefault({}),
});

export const POST = route({ body: Body, rateLimit: 10 }, async ({ user, body }) => {
  try {
    const run = await runAndStoreBacktest(user.id, body);
    return { run };
  } catch (e) {
    throw new ApiError(400, (e as Error).message);
  }
});

export const GET = route({}, async ({ user }) => {
  const runs = await db().backtestRun.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, strategyId: true, timeframe: true, startDate: true, endDate: true, status: true, metrics: true, benchmark: true, createdAt: true, error: true, asset: { select: { symbol: true } } },
  });
  return { runs };
});
