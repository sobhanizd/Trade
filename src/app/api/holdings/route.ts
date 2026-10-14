import { z } from "zod";
import { clearAdvice } from "@/lib/analysis/advice-service";
import { audit } from "@/lib/audit";
import { ApiError, route } from "@/lib/api/handler";
import { addHolding, getHoldingsView, HoldingInputError, PriceInput as Price } from "@/lib/holdings/service";

const Body = z.object({
  coin: z.string().trim().min(2).max(40),
  amount: z.number().positive().max(1e15),
  unit: z.enum(["coin", "gram"]).optional(),
  price: Price,
  boughtAt: z.string().max(40).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});

export const GET = route({}, async ({ user }) => getHoldingsView(user.id));

export const POST = route({ body: Body, rateLimit: 30 }, async ({ user, body }) => {
  try {
    const h = await addHolding(user.id, body);
    clearAdvice(user.id);
    await audit("holding.add", user.id, { id: h.id });
    return { holding: h };
  } catch (e) {
    if (e instanceof HoldingInputError) throw new ApiError(400, e.message);
    throw e;
  }
});
