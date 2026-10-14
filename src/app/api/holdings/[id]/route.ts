import { z } from "zod";
import { clearAdvice } from "@/lib/analysis/advice-service";
import { audit } from "@/lib/audit";
import { ApiError, route } from "@/lib/api/handler";
import { deleteHolding, HoldingInputError, PriceInput as Price, updateHolding } from "@/lib/holdings/service";

const Body = z.object({
  amount: z.number().positive().max(1e15),
  unit: z.enum(["coin", "gram"]).optional(),
  price: Price,
  boughtAt: z.string().max(40).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
});

const wrap = async <T>(f: () => Promise<T>) => {
  try {
    return await f();
  } catch (e) {
    if (e instanceof HoldingInputError) throw new ApiError(e.message === "Not found." ? 404 : 400, e.message);
    throw e;
  }
};

export const PATCH = route({ body: Body, rateLimit: 30 }, async ({ user, params, body }) =>
  wrap(async () => {
    const h = await updateHolding(user.id, params.id, body);
    clearAdvice(user.id);
    await audit("holding.update", user.id, { id: h.id });
    return { holding: h };
  }),
);

export const DELETE = route({ rateLimit: 30 }, async ({ user, params }) =>
  wrap(async () => {
    await deleteHolding(user.id, params.id);
    clearAdvice(user.id);
    await audit("holding.remove", user.id, { id: params.id });
    return { removed: true };
  }),
);
