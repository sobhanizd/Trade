import { ApiError, route } from "@/lib/api/handler";
import { getAdvice } from "@/lib/analysis/advice-service";

export const GET = route({ rateLimit: 60 }, async ({ user, params }) => {
  const out = await getAdvice(params.symbol.toUpperCase(), user.id);
  if (!out) throw new ApiError(404, "Unknown asset.");
  return out;
});
