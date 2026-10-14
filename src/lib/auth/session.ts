import { createHmac, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

const DAY = 86_400_000;

export function sessionCookieName() {
  // __Host- prefix forces Secure, Path=/ and no Domain in production.
  return process.env.NODE_ENV === "production" ? "__Host-cp_session" : "cp_session";
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is missing or too short");
  return s;
}

export function hashToken(token: string) {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

/** Hash IPs before storage (privacy): only used to spot unusual logins. */
export function hashIp(ip: string | null | undefined) {
  return ip ? createHmac("sha256", secret()).update(`ip:${ip}`).digest("hex").slice(0, 32) : null;
}

function ttlMs() {
  return Number(process.env.SESSION_TTL_DAYS ?? 30) * DAY;
}

export async function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs());
  await db().session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, userAgent: meta.userAgent?.slice(0, 300) ?? null, ipHash: hashIp(meta.ip) },
  });
  return { token, expiresAt };
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export interface SessionUser {
  id: string;
  email: string;
  sessionId: string;
}

/** Validate a raw token; slides expiry at most once per day. */
export async function validateToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const s = await db().session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { id: true, email: true } } } });
  if (!s) return null;
  const now = Date.now();
  if (s.expiresAt.getTime() <= now) {
    await db().session.delete({ where: { id: s.id } }).catch(() => undefined);
    return null;
  }
  if (now - s.lastSeenAt.getTime() > DAY) {
    await db().session.update({ where: { id: s.id }, data: { lastSeenAt: new Date(now), expiresAt: new Date(now + ttlMs()) } }).catch(() => undefined);
  }
  return { id: s.user.id, email: s.user.email, sessionId: s.id };
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return validateToken(jar.get(sessionCookieName())?.value);
}

/** For server components/pages: redirect to /login when not authenticated. */
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}
