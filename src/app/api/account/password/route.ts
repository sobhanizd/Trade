import { z } from "zod";
import { audit } from "@/lib/audit";
import { ApiError, route } from "@/lib/api/handler";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";

export const POST = route({ body: z.object({ current: z.string().min(1).max(256), next: z.string().min(1).max(256) }), rateLimit: 5 }, async ({ user, body }) => {
  const u = await db().user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(u.passwordHash, body.current))) throw new ApiError(403, "Current password is incorrect.");
  const weak = validatePasswordStrength(body.next);
  if (weak) throw new ApiError(400, weak);
  await db().user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.next) } });
  // Revoke every other session.
  await db().session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } });
  await audit("account.password_changed", user.id);
  return { changed: true };
});
