import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { ApiError, route } from "@/lib/api/handler";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clearFailures, recordFailure, tooManyFailures } from "@/lib/auth/rateLimit";
import { createSession, hashIp, sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { db } from "@/lib/db";

/** "email" holds the login name: a username (e.g. "alex") or an email address; matched case-insensitively. */
const Body = z.object({ email: z.string().trim().toLowerCase().min(1).max(254), password: z.string().min(1).max(256) });
// Constant-time-ish behaviour for unknown emails: verify against a dummy hash.
let dummyHash: Promise<string> | null = null;

export const POST = route({ auth: false, body: Body, rateLimit: 20 }, async ({ body, req, ip }) => {
  // Brute-force protection: max 5 failed attempts per IP per 15 min and 10 per account per hour.
  const ipKey = `login:${ip}`;
  const emailKey = `login-email:${body.email}`;
  if (tooManyFailures(ipKey, 5) || tooManyFailures(emailKey, 10)) {
    await audit("login.rate_limited", null, { email: body.email }, hashIp(ip));
    throw new ApiError(429, "Too many login attempts. Please wait and try again later.");
  }
  const user = await db().user.findUnique({ where: { email: body.email } });
  if (!dummyHash) dummyHash = hashPassword("dummy-password-for-timing-1");
  const ok = user ? await verifyPassword(user.passwordHash, body.password) : (await verifyPassword(await dummyHash, body.password), false);
  if (!user || !ok) {
    recordFailure(ipKey, 15 * 60_000);
    recordFailure(emailKey, 60 * 60_000);
    await audit("login.failed", user?.id ?? null, { email: body.email }, hashIp(ip));
    throw new ApiError(401, "Invalid email or password.");
  }
  clearFailures(ipKey);
  clearFailures(emailKey);
  const { token, expiresAt } = await createSession(user.id, { userAgent: req.headers.get("user-agent"), ip });
  await db().user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit("login.success", user.id, undefined, hashIp(ip));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName(), token, sessionCookieOptions(expiresAt));
  return res;
});
