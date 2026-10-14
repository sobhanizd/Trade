import { z } from "zod";
import { audit } from "@/lib/audit";
import { ApiError, route } from "@/lib/api/handler";
import { recordPurchases } from "@/lib/plan/service";
import { clearAdvice } from "@/lib/analysis/advice-service";

const Body = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  lines: z.array(z.object({ symbol: z.string().trim().min(2).max(10), amountEur: z.number().min(0).max(10_000_000) })).min(1).max(20),
});

export const POST = route({ body: Body, rateLimit: 10 }, async ({ user, body }) => {
  try {
    const created = await recordPurchases(user.id, body.lines, body.period);
    clearAdvice(user.id);
    await audit("plan.purchases_recorded", user.id, { period: body.period, count: created.length });
    return { recorded: created.length };
  } catch (e) {
    throw new ApiError(400, (e as Error).message);
  }
});
