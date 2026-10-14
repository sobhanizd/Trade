import { ApiError, route } from "@/lib/api/handler";
import { dropStats } from "@/lib/plan/service";

export const GET = route({ rateLimit: 20 }, async ({ req }) => {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "BTC").toUpperCase();
  const pct = Number(req.nextUrl.searchParams.get("pct"));
  if (!(pct > 0 && pct < 95)) throw new ApiError(400, "pct must be between 0 and 95");
  try {
    return await dropStats(symbol, pct);
  } catch (e) {
    throw new ApiError(502, (e as Error).message);
  }
});
