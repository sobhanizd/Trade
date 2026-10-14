import { z } from "zod";
import { ApiError, route } from "@/lib/api/handler";
import { planSmart } from "@/lib/plan/service";

const Body = z.object({
  weights: z.record(z.string().regex(/^[A-Z0-9]{2,10}$/), z.number().min(0).max(1)),
  monthly: z.number().min(1).max(1_000_000),
  years: z.number().int().min(1).max(10),
  goal: z.number().min(0).max(1e10),
  feeRate: z.union([z.number().min(0).max(0.05), z.object({ buy: z.number().min(0).max(0.5), sell: z.number().min(0).max(0.5) })]),
});

export const POST = route({ body: Body, rateLimit: 60 }, async ({ user, body }) => {
  const sum = Object.values(body.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.02 || !("BTC" in body.weights)) throw new ApiError(400, "Weights must include BTC and add up to 100%.");
  try {
    return await planSmart(user.id, body.weights, body.monthly, body.years, body.goal, body.feeRate);
  } catch (e) {
    throw new ApiError(502, `Price history could not be loaded: ${(e as Error).message}`);
  }
});
