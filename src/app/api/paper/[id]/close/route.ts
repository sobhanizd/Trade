import { ApiError, route } from "@/lib/api/handler";
import { closePaperTrade } from "@/lib/paper/service";

export const POST = route({ rateLimit: 20 }, async ({ user, params }) => {
  try {
    return { trade: await closePaperTrade(user.id, params.id) };
  } catch (e) {
    throw new ApiError(400, (e as Error).message);
  }
});
