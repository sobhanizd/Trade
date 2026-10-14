import { ApiError, route } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const GET = route({}, async ({ user, params }) => {
  const signal = await db().signal.findFirst({ where: { id: params.id, userId: user.id }, include: { asset: true, statusChanges: { orderBy: { createdAt: "asc" } } } });
  if (!signal) throw new ApiError(404, "Signal not found.");
  return { signal };
});
