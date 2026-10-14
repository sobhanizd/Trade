import { z } from "zod";
import { getFx } from "@/lib/fx";
import { ApiError, route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { openManualPaperTrade, paperSummary } from "@/lib/paper/service";
import { getSettings } from "@/lib/settings/service";

export const GET = route({}, async ({ user }) => {
  const trades = await db().paperTrade.findMany({ where: { userId: user.id }, include: { asset: { select: { symbol: true } } }, orderBy: { entryAt: "desc" }, take: 500 });
  return { trades, summary: paperSummary(trades) };
});

const Body = z.object({
  symbol: z.string().trim().min(2).max(10),
  quantity: z.number().positive().optional(),
  riskAmount: z.number().positive().optional(),
  stopPrice: z.number().positive().nullable().optional(),
  targetPrice: z.number().positive().nullable().optional(),
  notes: z.string().max(1000).optional(),
  signalId: z.string().max(50).nullable().optional(),
  amount: z.number().positive().max(1e9).optional(),
  amountCurrency: z.enum(["USD", "EUR"]).optional(),
  stopPct: z.number().min(0.5).max(90).nullable().optional(),
  targetPct: z.number().min(0.5).max(1000).nullable().optional(),
});

export const POST = route({ body: Body, rateLimit: 20 }, async ({ user, body }) => {
  const asset = await db().asset.findUnique({ where: { symbol: body.symbol.toUpperCase() } });
  if (!asset) throw new ApiError(404, "Unknown asset.");
  let amountUsd: number | undefined;
  if (body.amount) {
    if (body.amountCurrency === "EUR") {
      const rate = (await getFx(await getSettings(user.id))).eurPerUsd;
      if (!rate) throw new ApiError(503, "The euro exchange rate is not available yet. Try again in a few minutes.");
      amountUsd = body.amount / rate;
    } else amountUsd = body.amount;
  }
  try {
    const trade = await openManualPaperTrade(user.id, await getSettings(user.id), { ...body, amountUsd, assetId: asset.id });
    return { trade };
  } catch (e) {
    throw new ApiError(400, (e as Error).message);
  }
});
