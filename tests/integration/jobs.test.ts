import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { runJob } from "@/lib/jobs/runner";
import { runScan } from "@/lib/jobs/scan";
import { updateOpenPaperTrades } from "@/lib/paper/service";
import { checkInvalidationsAndExpiry } from "@/lib/signals/lifecycle";
import { updateSettings } from "@/lib/settings/service";
import { createUser, json, mockFetch, resetDb, syntheticKlines } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterEach(() => vi.unstubAllGlobals());

const NOW = Date.now();

function binanceOk(step = 0.003) {
  return (url: URL) => {
    if (url.pathname === "/api/v3/klines") {
      const tf = url.searchParams.get("interval") as "4h" | "1d";
      const limit = Number(url.searchParams.get("limit") ?? 500);
      return json(syntheticKlines(tf, Math.min(limit, 600), NOW, { step }));
    }
    return null;
  };
}

describe("scheduled scan", () => {
  it("creates explainable signals from closed candles and is idempotent per candle", async () => {
    const { user } = await createUser("owner@test.dev", ["BTC"]);
    mockFetch(binanceOk());
    const first = await runScan();
    expect(first.items).toBe(2); // BTC × (4h, 1d)
    expect(first.analysed).toBe(2);
    const signals = await db().signal.findMany({ where: { userId: user.id } });
    expect(signals.length).toBe(8); // 4 strategies on 4h + 4 on 1d (default timeframes)
    for (const s of signals) {
      expect(s.marketDataAt.getTime()).toBeLessThan(NOW); // only closed candles
      expect(s.summary.length).toBeGreaterThan(10);
      expect(Array.isArray(s.conditions)).toBe(true);
    }
    expect(signals.some((s) => s.state === "STRONG_BUY_SETUP" || s.state === "POTENTIAL_BUY")).toBe(true);
    const tf = signals.find((s) => s.strategyId === "trend_following" && s.timeframe === "1d")!;
    expect(tf.invalidation).not.toBeNull();
    expect(tf.invalidation!).toBeLessThan(tf.price);

    const second = await runScan();
    expect(second.analysed).toBe(0);
    expect(second.skippedAlreadyAnalysed).toBe(2);
    expect(await db().signal.count()).toBe(8);
    expect(await db().analysisRun.count()).toBe(2);
  });

  it("auto-tracks qualifying buy signals as paper trades (one per signal)", async () => {
    const { user } = await createUser("owner@test.dev", ["BTC"]);
    mockFetch(binanceOk());
    await runScan();
    await runScan();
    const buys = await db().signal.count({ where: { userId: user.id, state: { in: ["STRONG_BUY_SETUP", "POTENTIAL_BUY"] } } });
    const paper = await db().paperTrade.count({ where: { userId: user.id, source: "AUTO_SIGNAL" } });
    expect(paper).toBeGreaterThan(0);
    expect(paper).toBeLessThanOrEqual(buys);
  });

  it("re-evaluates immediately after a strategy parameter change", async () => {
    const { user } = await createUser("owner@test.dev", ["BTC"]);
    mockFetch(binanceOk());
    await runScan();
    await db().strategyConfig.create({ data: { userId: user.id, strategyId: "trend_following", enabled: true, params: { fastEma: 10, slowEma: 40 }, timeframes: ["1d"] } });
    const r = await runScan();
    expect(r.analysed).toBeGreaterThan(0);
    const active = await db().signal.findFirst({ where: { userId: user.id, strategyId: "trend_following", timeframe: "1d", status: "ACTIVE" } });
    expect((active?.params as Record<string, number>).fastEma).toBe(10);
    expect(await db().signal.count({ where: { userId: user.id, strategyId: "trend_following", timeframe: "4h", status: "ACTIVE" } })).toBe(0); // timeframe removed → no new 4h evaluation
  });

  it("fails over to Kraken when Binance is down", async () => {
    await createUser("owner@test.dev", ["BTC"]);
    mockFetch((url) => {
      if (url.host.includes("binance")) return json({ msg: "down" }, 503);
      if (url.pathname === "/0/public/OHLC") {
        const interval = Number(url.searchParams.get("interval"));
        const tf = interval === 240 ? "4h" : "1d";
        const rows = syntheticKlines(tf, 600, NOW).map((k) => [Number(k[0]) / 1000, k[1], k[2], k[3], k[4], "0", k[5], 10]);
        return json({ error: [], result: { XXBTZUSD: rows, last: 0 } });
      }
      return null;
    });
    const r = await runScan();
    expect(r.fetchErrors).toBe(0);
    const s = await db().signal.findFirst();
    expect(s?.pair).toBe("BTCUSD");
    const status = await db().providerStatus.findUnique({ where: { provider: "binance" } });
    expect(status?.consecutiveFailures).toBeGreaterThan(0);
  });

  it("returns NO SIGNAL on stale data and raises a deduplicated system alert when providers fail", async () => {
    const { user } = await createUser("owner@test.dev", ["BTC"]);
    // Old data only (ends 3 days ago).
    mockFetch((url) => (url.pathname === "/api/v3/klines" ? json(syntheticKlines(url.searchParams.get("interval") as "4h", 600, NOW - 3 * 86_400_000)) : null));
    await runScan();
    const sigs = await db().signal.findMany({ where: { userId: user.id, timeframe: "4h" } });
    expect(sigs.every((s) => s.state === "NO_SIGNAL")).toBe(true);
    expect((sigs[0].dataIssues as string[]).join(" ")).toMatch(/stale/);
    expect(await db().notification.count({ where: { kind: "SYSTEM", title: { contains: "stale" } } })).toBe(1);

    mockFetch(() => json({ error: "boom" }, 500));
    const r = await runScan();
    expect(r.fetchErrors).toBe(2);
    await runScan();
    expect(await db().notification.count({ where: { kind: "SYSTEM", title: { contains: "provider" } } })).toBe(1); // deduped
  }, 60_000);

  it("job runner records runs and prevents overlap", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p1 = runJob("t", async () => {
      await gate;
      return { ok: 1 };
    });
    const p2 = await runJob("t", async () => ({ ok: 2 }));
    expect(p2.status).toBe("SKIPPED");
    release();
    expect((await p1).status).toBe("SUCCESS");
    const failed = await runJob("t", async () => {
      throw new Error("kaput");
    });
    expect(failed.status).toBe("FAILED");
    expect(await db().jobRun.count({ where: { job: "t" } })).toBe(2);
  });
});

describe("signal invalidation & paper exits", () => {
  it("invalidates an active buy signal when price trades through its level, and notifies only if it was alerted", async () => {
    const { user } = await createUser("owner@test.dev", ["BTC"]);
    const asset = await db().asset.findUniqueOrThrow({ where: { symbol: "BTC" } });
    const s = await db().signal.create({
      data: {
        userId: user.id, assetId: asset.id, pair: "BTCUSDT", strategyId: "trend_following", strategyVersion: 1, timeframe: "4h", state: "POTENTIAL_BUY",
        marketDataAt: new Date(NOW - 3_600_000), price: 100, summary: "x", conditions: [], indicators: {}, invalidation: 95, targets: [110], risks: [], conflicts: [], dataIssues: [],
        rulesMet: 5, rulesTotal: 7, fingerprint: "f", params: {},
      },
    });
    await db().notification.create({ data: { userId: user.id, kind: "SIGNAL", title: "t", body: "b", dedupeKey: "k", signalId: s.id } });
    const settings = await updateSettings(user.id, {});
    const r = await checkInvalidationsAndExpiry(user.id, asset, "4h", () => 94.5, settings);
    expect(r.invalidated).toBe(1);
    const after = await db().signal.findUniqueOrThrow({ where: { id: s.id }, include: { statusChanges: true } });
    expect(after.status).toBe("INVALIDATED");
    expect(after.statusChanges[0].reason).toMatch(/invalidation/);
    expect(await db().notification.count({ where: { kind: "SIGNAL_INVALIDATED" } })).toBe(1);
  });

  it("closes paper trades at the stop (stop first when both levels are hit in one candle)", async () => {
    const { user } = await createUser("owner@test.dev", ["BTC"]);
    const asset = await db().asset.findUniqueOrThrow({ where: { symbol: "BTC" } });
    const entryAt = new Date(NOW - 10 * 3_600_000);
    const t = await db().paperTrade.create({
      data: { userId: user.id, assetId: asset.id, source: "MANUAL", entryPrice: 100.05, entryAt, quantity: 2, stopPrice: 95, targetPrice: 110, feeRate: 0.001, slippageRate: 0.0005, priceSource: "test" },
    });
    const candles = [{ openTime: entryAt.getTime() + 3_600_000, closeTime: entryAt.getTime() + 7_200_000 - 1, open: 100, high: 112, low: 94, close: 105, volume: 1 }];
    const r = await updateOpenPaperTrades(async () => candles);
    expect(r.closed).toBe(1);
    const closed = await db().paperTrade.findUniqueOrThrow({ where: { id: t.id } });
    expect(closed.exitReason).toBe("STOP");
    expect(closed.netPnl!).toBeLessThan(0);
    expect(closed.netPnl!).toBeCloseTo(closed.grossPnl! - closed.fees! - (100.05 - 100) * 2 - (95 - closed.exitPrice!) * 2, 6);
  });
});
