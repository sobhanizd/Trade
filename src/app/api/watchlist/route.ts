import { z } from "zod";
import { audit } from "@/lib/audit";
import { ApiError, route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { resolveAsset } from "@/lib/market/assets";
import { toSymbol } from "@/lib/market/find-coin";
import { getSettings } from "@/lib/settings/service";

export const GET = route({}, async ({ user }) => {
  const items = await db().watchlistItem.findMany({ where: { userId: user.id }, include: { asset: true }, orderBy: [{ position: "asc" }, { addedAt: "asc" }] });
  return { items: items.map((i) => ({ symbol: i.asset.symbol, name: i.asset.name, addedAt: i.addedAt })) };
});

export const POST = route({ body: z.object({ symbol: z.string().trim().min(2).max(40) }), rateLimit: 20 }, async ({ user, body }) => {
  const settings = await getSettings(user.id);
  const count = await db().watchlistItem.count({ where: { userId: user.id } });
  if (count >= 25) throw new ApiError(400, "Watchlist limit (25) reached — this keeps scans within free API limits.");
  const symbol = await toSymbol(body.symbol);
  let asset = await db().asset.findUnique({ where: { symbol } });
  let validation = asset?.validation ?? null;
  if (!asset || !asset.lastValidatedAt || Date.now() - asset.lastValidatedAt.getTime() > 7 * 86_400_000) {
    const r = await resolveAsset(symbol, settings.liquidity);
    validation = r.validation as object;
    if (!r.validation.ok || !r.asset) return Response.json({ added: false, validation: r.validation }, { status: 422 });
    asset = await db().asset.upsert({
      where: { symbol },
      create: { ...r.asset, lastValidatedAt: new Date(), validation: r.validation as object },
      update: { ...r.asset, lastValidatedAt: new Date(), validation: r.validation as object },
    });
  }
  await db().watchlistItem.upsert({ where: { userId_assetId: { userId: user.id, assetId: asset.id } }, create: { userId: user.id, assetId: asset.id, position: count }, update: {} });
  await audit("watchlist.add", user.id, { symbol });
  return { added: true, symbol, validation };
});
