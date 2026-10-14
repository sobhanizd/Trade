import { audit } from "@/lib/audit";
import { ApiError, route } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const DELETE = route({}, async ({ user, params }) => {
  const asset = await db().asset.findUnique({ where: { symbol: params.symbol.toUpperCase() } });
  if (!asset) throw new ApiError(404, "Unknown asset.");
  await db().watchlistItem.deleteMany({ where: { userId: user.id, assetId: asset.id } });
  await audit("watchlist.remove", user.id, { symbol: asset.symbol });
  return { removed: true };
});
