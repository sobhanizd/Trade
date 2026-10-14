import { z } from "zod";
import { getFx } from "@/lib/fx";
import { ApiError, route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { loadCandles, syncRecentCandles } from "@/lib/market/candles";
import { getSettings } from "@/lib/settings/service";

/** Price history for the dashboard widget: real stored candles only, in the display currency. */
const RANGES = { "1d": { tf: "1h", n: 25 }, "1w": { tf: "4h", n: 43 }, "1m": { tf: "1d", n: 31 }, "3m": { tf: "1d", n: 91 }, "1y": { tf: "1w", n: 53 } } as const;
const Range = z.enum(["1d", "1w", "1m", "3m", "1y"]);

export const GET = route({ rateLimit: 240 }, async ({ user, params, req }) => {
  const range = Range.safeParse(req.nextUrl.searchParams.get("range") ?? "1w");
  if (!range.success) throw new ApiError(400, "Invalid range.");
  const { tf, n } = RANGES[range.data];
  const asset = await db().asset.findUnique({ where: { symbol: params.symbol.toUpperCase() } });
  if (!asset) throw new ApiError(404, "Unknown asset.");
  const latest = await db().candle.findFirst({ where: { assetId: asset.id, timeframe: tf }, orderBy: { openTime: "desc" } });
  if (!latest || Date.now() - latest.updatedAt.getTime() > 5 * 60_000) await syncRecentCandles(asset, tf, 120).catch(() => undefined);
  const cs = await loadCandles(asset.id, tf, { limit: n });
  const settings = await getSettings(user.id);
  const { currency, rate } = await getFx(settings);
  return {
    currency,
    timeframe: tf,
    points: cs.map((c) => ({ t: c.openTime, p: c.close * rate, h: c.high * rate, l: c.low * rate })),
  };
});
