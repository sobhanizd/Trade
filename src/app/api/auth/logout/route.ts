import { NextResponse } from "next/server";
import { route } from "@/lib/api/handler";
import { sessionCookieName } from "@/lib/auth/session";
import { db } from "@/lib/db";

export const POST = route({}, async ({ user }) => {
  await db().session.delete({ where: { id: user.sessionId } }).catch(() => undefined);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName(), "", { httpOnly: true, path: "/", expires: new Date(0), secure: process.env.NODE_ENV === "production", sameSite: "lax" });
  return res;
});
