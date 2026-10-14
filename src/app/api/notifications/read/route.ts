import { z } from "zod";
import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const POST = route({ body: z.object({ ids: z.array(z.string().max(50)).max(500).optional() }) }, async ({ user, body }) => {
  const r = await db().notification.updateMany({ where: { userId: user.id, readAt: null, ...(body.ids ? { id: { in: body.ids } } : {}) }, data: { readAt: new Date() } });
  return { updated: r.count };
});
