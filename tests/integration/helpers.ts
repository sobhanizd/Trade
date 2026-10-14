import { NextRequest } from "next/server";
import { vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { createSession, sessionCookieName } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DEFAULT_ASSETS, ensureDefaultAssets } from "@/lib/market/assets";
import { syncStrategyDefinitions } from "@/lib/settings/service";
import { TIMEFRAME_MS, type Timeframe } from "@/lib/market/types";
import { defaultSettings } from "@/lib/settings/schema";

export async function resetDb() {
  const tables = await db().$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db().$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  // Re-seed directly (bootstrap() memoises per process).
  await ensureDefaultAssets();
  await syncStrategyDefinitions();
}

export const PASSWORD = "correct-horse-battery-9";

export async function createUser(email = "owner@test.dev", symbols = ["BTC", "ETH"]) {
  const user = await db().user.create({ data: { email, passwordHash: await hashPassword(PASSWORD), settings: { create: { data: defaultSettings() } } } });
  const assets = await db().asset.findMany({ where: { symbol: { in: symbols } } });
  await db().watchlistItem.createMany({ data: assets.map((a, i) => ({ userId: user.id, assetId: a.id, position: i })) });
  const { token } = await createSession(user.id, { userAgent: "vitest" });
  return { user, token };
}

export function req(path: string, init: { method?: string; body?: unknown; token?: string; origin?: string | null; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...(init.headers ?? {}) };
  if (init.origin !== null) headers.origin = init.origin ?? "http://localhost:3000";
  if (init.token) headers.cookie = `${sessionCookieName()}=${init.token}`;
  headers["x-forwarded-for"] = headers["x-forwarded-for"] ?? `10.0.0.${Math.floor(Math.random() * 250)}`;
  return new NextRequest(`http://localhost:3000${path}`, { method: init.method ?? (init.body ? "POST" : "GET"), headers, body: init.body ? JSON.stringify(init.body) : undefined });
}
export const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

/** Deterministic synthetic up-trend, aligned to interval boundaries, ending with the in-progress candle at `now`. */
export function syntheticKlines(timeframe: Timeframe, count: number, now = Date.now(), opts: { step?: number; start?: number } = {}) {
  const ms = TIMEFRAME_MS[timeframe];
  const lastOpen = Math.floor(now / ms) * ms;
  const rows: (string | number)[][] = [];
  let p = opts.start ?? 100;
  for (let i = count - 1; i >= 0; i--) {
    const open = p;
    p = p * (1 + (opts.step ?? 0.003) + Math.sin(i / 3) * 0.002);
    const close = p;
    const openTime = lastOpen - i * ms;
    rows.push([openTime, String(open), String(Math.max(open, close) * 1.002), String(Math.min(open, close) * 0.998), String(close), "1000", openTime + ms - 1]);
  }
  return rows;
}

type Handler = (url: URL) => Response | Promise<Response> | null;

/** Replace global fetch: route by URL; unknown URLs fail loudly (no real network in tests). */
export function mockFetch(handler: Handler) {
  const f = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const r = await handler(url);
    if (r) return r;
    throw new Error(`unexpected fetch in test: ${url.host}${url.pathname}`);
  });
  vi.stubGlobal("fetch", f);
  return f;
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export { DEFAULT_ASSETS };
