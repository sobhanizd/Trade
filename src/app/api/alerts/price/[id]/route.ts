import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const DELETE = route({}, async ({ user, params }) => {
  const r = await db().priceAlert.deleteMany({ where: { id: params.id, userId: user.id } });
  return { deleted: r.count };
});
