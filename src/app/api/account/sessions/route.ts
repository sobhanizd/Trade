import { z } from "zod";
import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const GET = route({}, async ({ user }) => {
  const sessions = await db().session.findMany({ where: { userId: user.id }, orderBy: { lastSeenAt: "desc" }, select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, userAgent: true } });
  return { sessions: sessions.map((s) => ({ ...s, current: s.id === user.sessionId })) };
});

export const DELETE = route({ body: z.object({ id: z.string().max(50).optional(), others: z.boolean().optional() }) }, async ({ user, body }) => {
  const where = body.others ? { userId: user.id, id: { not: user.sessionId } } : { userId: user.id, id: body.id };
  const r = await db().session.deleteMany({ where });
  return { revoked: r.count };
});
