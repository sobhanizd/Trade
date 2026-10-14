import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/auth/rateLimit";
import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as getSettings, PUT as putSettings } from "@/app/api/settings/route";
import { GET as listSignals } from "@/app/api/signals/route";
import { DELETE as removeWatch } from "@/app/api/watchlist/[symbol]/route";
import { PUT as putStrategy } from "@/app/api/strategies/[id]/route";
import { GET as health } from "@/app/api/health/route";
import { GET as exportData } from "@/app/api/account/export/route";
import { POST as deleteData } from "@/app/api/account/delete/route";
import { POST as ask } from "@/app/api/ai/ask/route";
import { createUser, ctx, PASSWORD, req, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
});
afterEach(() => vi.unstubAllGlobals());

describe("auth", () => {
  it("logs in with the right password and sets an httpOnly session cookie", async () => {
    await createUser();
    const res = await login(req("/api/auth/login", { body: { email: "owner@test.dev", password: PASSWORD } }), ctx());
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/cp_session=/);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    const sessions = await db().session.findMany();
    expect(sessions).toHaveLength(2); // helper session + this one
    const raw = cookie.split(";")[0].split("=")[1];
    expect(sessions.some((s) => s.tokenHash === raw)).toBe(false); // only the hash is stored
  });

  it("rejects wrong passwords and unknown users with the same message, and audits failures", async () => {
    await createUser();
    const a = await login(req("/api/auth/login", { body: { email: "owner@test.dev", password: "nope-nope-nope" } }), ctx());
    const b = await login(req("/api/auth/login", { body: { email: "ghost@test.dev", password: "nope-nope-nope" } }), ctx());
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect((await a.json()).error).toBe((await b.json()).error);
    expect(await db().auditEvent.count({ where: { type: "login.failed" } })).toBe(2);
  });

  it("rate-limits repeated login attempts", async () => {
    await createUser();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await login(req("/api/auth/login", { body: { email: "owner@test.dev", password: "wrong-wrong-wrong" }, headers: { "x-forwarded-for": "1.2.3.4" } }), ctx());
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("rejects state-changing requests without a same-origin Origin header (CSRF)", async () => {
    const { token } = await createUser();
    expect((await putSettings(req("/api/settings", { method: "PUT", body: { displayCurrency: "EUR" }, token, origin: null }), ctx())).status).toBe(403);
    expect((await putSettings(req("/api/settings", { method: "PUT", body: { displayCurrency: "EUR" }, token, origin: "https://evil.example" }), ctx())).status).toBe(403);
  });

  it("requires authentication and rejects invalid or expired tokens", async () => {
    const { user } = await createUser();
    expect((await listSignals(req("/api/signals"), ctx())).status).toBe(401);
    expect((await listSignals(req("/api/signals", { token: "forged" }), ctx())).status).toBe(401);
    await db().session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const { token } = await import("@/lib/auth/session").then((m) => m.createSession(user.id, {}));
    await db().session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await listSignals(req("/api/signals", { token }), ctx())).status).toBe(401);
  });

  it("logout deletes the session", async () => {
    const { token } = await createUser();
    expect((await logout(req("/api/auth/logout", { method: "POST", token }), ctx())).status).toBe(200);
    expect((await listSignals(req("/api/signals", { token }), ctx())).status).toBe(401);
  });
});

describe("settings & strategies persistence", () => {
  it("persists valid settings and rejects invalid ones", async () => {
    const { token } = await createUser();
    const ok = await putSettings(req("/api/settings", { method: "PUT", token, body: { displayCurrency: "EUR", alerts: { minRiskReward: 2 } } }), ctx());
    expect(ok.status).toBe(200);
    const g = await (await getSettings(req("/api/settings", { token }), ctx())).json();
    expect(g.settings.displayCurrency).toBe("EUR");
    expect(g.settings.alerts.minRiskReward).toBe(2);
    expect(g.settings.alerts.maxPerHour).toBe(6); // untouched defaults remain
    expect(g.integrations).toEqual(expect.objectContaining({ telegram: false, ai: false }));
    const bad = await putSettings(req("/api/settings", { method: "PUT", token, body: { risk: { riskPerTradePct: 50 } } }), ctx());
    expect(bad.status).toBe(400);
    const bad2 = await putSettings(req("/api/settings", { method: "PUT", token, body: { alerts: { email: "not-an-email" } } }), ctx());
    expect(bad2.status).toBe(400);
  });

  it("validates strategy parameter relations and persists toggles", async () => {
    const { token, user } = await createUser();
    const bad = await putStrategy(req("/api/strategies/trend_following", { method: "PUT", token, body: { params: { fastEma: 90, slowEma: 50 } } }), ctx({ id: "trend_following" }));
    expect(bad.status).toBe(400);
    const ok = await putStrategy(req("/api/strategies/momentum", { method: "PUT", token, body: { enabled: false, timeframes: ["1d"] } }), ctx({ id: "momentum" }));
    expect(ok.status).toBe(200);
    const row = await db().strategyConfig.findUnique({ where: { userId_strategyId: { userId: user.id, strategyId: "momentum" } } });
    expect(row?.enabled).toBe(false);
    expect(row?.timeframes).toEqual(["1d"]);
    expect((await putStrategy(req("/api/strategies/nope", { method: "PUT", token, body: {} }), ctx({ id: "nope" }))).status).toBe(404);
  });

  it("removes watchlist items", async () => {
    const { token, user } = await createUser();
    expect((await removeWatch(req("/api/watchlist/ETH", { method: "DELETE", token }), ctx({ symbol: "ETH" }))).status).toBe(200);
    expect(await db().watchlistItem.count({ where: { userId: user.id } })).toBe(1);
  });
});

describe("account data", () => {
  it("exports data without secrets and deletes data with password confirmation", async () => {
    const { token } = await createUser();
    const res = await exportData(req("/api/account/export", { token }), ctx());
    const text = await res.text();
    expect(res.headers.get("content-disposition")).toMatch(/attachment/);
    expect(text).not.toMatch(/passwordHash|tokenHash/);
    expect(JSON.parse(text).data.email).toBe("owner@test.dev");
    expect((await deleteData(req("/api/account/delete", { token, body: { password: "wrong", confirm: "DELETE", scope: "account" } }), ctx())).status).toBe(403);
    expect((await deleteData(req("/api/account/delete", { token, body: { password: PASSWORD, confirm: "DELETE", scope: "account" } }), ctx())).status).toBe(200);
    expect(await db().user.count()).toBe(0);
  });
});

describe("AI explainer without a key", () => {
  it("falls back to the deterministic explanation and never calls an external API", async () => {
    const { token } = await createUser();
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const r = await ask(req("/api/ai/ask", { token, body: { question: "Why is BTC a buy?", symbol: "BTC" } }), ctx());
    const body = await r.json();
    expect(body.mode).toBe("deterministic");
    expect(body.missing.join(" ")).toMatch(/No current signals|No backtest/);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("infrastructure", () => {
  it("health endpoint reports DB status without leaking config", async () => {
    const r = await health();
    const b = await r.json();
    expect(r.status).toBe(200);
    expect(b.db).toBe(true);
    expect(JSON.stringify(b)).not.toMatch(/postgres|secret|key/i);
  });

  it("maps database outages to 503 and hides internals", async () => {
    const h = route({ auth: false }, async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    });
    const r = await h(req("/api/x"), ctx());
    expect(r.status).toBe(503);
    expect((await r.json()).error).not.toMatch(/127\.0\.0\.1/);
  });

  it("rejects oversized and malformed bodies", async () => {
    const { token } = await createUser();
    const big = await putSettings(req("/api/settings", { method: "PUT", token, body: { x: "a".repeat(70_000) } }), ctx());
    expect(big.status).toBe(413);
    const malformed = await putSettings(
      new (await import("next/server")).NextRequest("http://localhost:3000/api/settings", { method: "PUT", body: "{not json", headers: { origin: "http://localhost:3000", cookie: `cp_session=${token}` } }),
      ctx(),
    );
    expect(malformed.status).toBe(400);
  });
});

describe("login throttling counts failures only", () => {
  it("successful logins never lock the owner out", async () => {
    await createUser();
    for (let i = 0; i < 8; i++) {
      const r = await login(req("/api/auth/login", { body: { email: "owner@test.dev", password: PASSWORD }, headers: { "x-forwarded-for": "9.9.9.9" } }), ctx());
      expect(r.status).toBe(200);
    }
  });
});
