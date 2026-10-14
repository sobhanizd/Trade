import { z } from "zod";
import { ApiError, route } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const GET = route({}, async ({ user }) => ({
  alerts: await db().priceAlert.findMany({ where: { userId: user.id }, include: { asset: { select: { symbol: true } } }, orderBy: { createdAt: "desc" } }),
}));

const Body = z.object({ symbol: z.string().trim().min(2).max(10), direction: z.enum(["ABOVE", "BELOW"]), price: z.number().positive().max(1e9), note: z.string().max(200).optional() });

export const POST = route({ body: Body, rateLimit: 20 }, async ({ user, body }) => {
  const asset = await db().asset.findUnique({ where: { symbol: body.symbol.toUpperCase() } });
  if (!asset) throw new ApiError(404, "Unknown asset.");
  const active = await db().priceAlert.count({ where: { userId: user.id, active: true } });
  if (active >= 50) throw new ApiError(400, "Maximum of 50 active price alerts.");
  const alert = await db().priceAlert.create({ data: { userId: user.id, assetId: asset.id, direction: body.direction, price: body.price, note: body.note } });
  return { alert };
});
