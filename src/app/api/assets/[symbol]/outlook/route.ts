import { ApiError, route } from "@/lib/api/handler";
import { getOutlook } from "@/lib/analysis/outlook";

export const GET = route({ rateLimit: 60 }, async ({ user, params }) => {
  const out = await getOutlook(params.symbol.toUpperCase(), user.id);
  if (!out) throw new ApiError(404, "Unknown asset.");
  return out;
});
