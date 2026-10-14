import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const GET = route({}, async ({ user }) => {
  const items = await db().notification.findMany({ where: { userId: user.id }, include: { deliveries: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const unread = await db().notification.count({ where: { userId: user.id, readAt: null } });
  return { items, unread };
});
