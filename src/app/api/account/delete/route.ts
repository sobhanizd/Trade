import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, route } from "@/lib/api/handler";
import { verifyPassword } from "@/lib/auth/password";
import { sessionCookieName } from "@/lib/auth/session";
import { db } from "@/lib/db";

const Body = z.object({ password: z.string().min(1).max(256), confirm: z.literal("DELETE"), scope: z.enum(["data", "account"]) });

/** scope=data: delete signals, backtests, paper trades, notifications, AI history (keep login & settings). scope=account: delete everything. */
export const POST = route({ body: Body, rateLimit: 5 }, async ({ user, body }) => {
  const u = await db().user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(u.passwordHash, body.password))) throw new ApiError(403, "Password is incorrect.");
  if (body.scope === "account") {
    await db().user.delete({ where: { id: user.id } }); // cascades to all user-owned rows
    const res = NextResponse.json({ deleted: "account" });
    res.cookies.set(sessionCookieName(), "", { path: "/", expires: new Date(0), httpOnly: true });
    return res;
  }
  await db().$transaction([
    db().notification.deleteMany({ where: { userId: user.id } }),
    db().paperTrade.deleteMany({ where: { userId: user.id } }),
    db().signal.deleteMany({ where: { userId: user.id } }),
    db().backtestRun.deleteMany({ where: { userId: user.id } }),
    db().aiMessage.deleteMany({ where: { userId: user.id } }),
    db().priceAlert.deleteMany({ where: { userId: user.id } }),
    db().auditEvent.deleteMany({ where: { userId: user.id } }),
  ]);
  return { deleted: "data" };
});
