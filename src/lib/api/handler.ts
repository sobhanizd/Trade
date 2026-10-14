import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { rateLimit } from "@/lib/auth/rateLimit";
import { sessionCookieName, validateToken, type SessionUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

interface Ctx<B> {
  req: NextRequest;
  user: SessionUser;
  body: B;
  params: Record<string, string>;
  ip: string;
}

interface Options<B> {
  auth?: boolean;
  body?: ZodType<B>;
  /** Requests per minute per IP+route. */
  rateLimit?: number;
}

const MAX_BODY = 64 * 1024;

/** Reject cross-site state-changing requests (CSRF defence in depth on top of SameSite=Lax). */
export function checkOrigin(req: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set<string>();
  try {
    if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
  } catch {
    /* ignore */
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  if (host) allowed.add(`${proto}://${host}`);
  return allowed.has(origin);
}

export function route<B = undefined>(opts: Options<B>, fn: (ctx: Ctx<B>) => Promise<unknown>) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
    try {
      const rl = rateLimit(`${ip}:${req.method}:${req.nextUrl.pathname}`, opts.rateLimit ?? 120, 60_000);
      if (!rl.ok) throw new ApiError(429, "Too many requests. Please slow down.");
      if (!checkOrigin(req)) throw new ApiError(403, "Cross-origin request rejected.");

      let user: SessionUser | null = null;
      if (opts.auth !== false) {
        user = await validateToken(req.cookies.get(sessionCookieName())?.value);
        if (!user) throw new ApiError(401, "Authentication required.");
      }

      let body = undefined as B;
      if (opts.body) {
        const len = Number(req.headers.get("content-length") ?? 0);
        if (len > MAX_BODY) throw new ApiError(413, "Request body too large.");
        const text = await req.text();
        if (text.length > MAX_BODY) throw new ApiError(413, "Request body too large.");
        let json: unknown;
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          throw new ApiError(400, "Invalid JSON body.");
        }
        const parsed = opts.body.safeParse(json);
        if (!parsed.success) throw new ApiError(400, "Invalid input.", z.flattenError(parsed.error as never));
        body = parsed.data;
      }
      const params = (await context?.params) ?? {};
      const out = await fn({ req, user: user as SessionUser, body, params, ip });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true }, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
      if (e instanceof z.ZodError) return NextResponse.json({ error: "Invalid input.", details: z.flattenError(e as never) }, { status: 400 });
      logger.error("api error", { path: req.nextUrl.pathname, method: req.method, error: e });
      const dbDown = e instanceof Error && /ECONNREFUSED|Can't reach database|connect/i.test(e.message);
      return NextResponse.json(
        { error: dbDown ? "The database is unavailable. Please try again shortly." : "Internal server error." },
        { status: dbDown ? 503 : 500 },
      );
    }
  };
}
