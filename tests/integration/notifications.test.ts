import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { inQuietHours, notify, processPendingDeliveries, setChannelSenders, type ChannelSenders } from "@/lib/notifications/dispatch";
import { getSettings, updateSettings } from "@/lib/settings/service";
import { createUser, resetDb } from "./helpers";

let sent: { channel: string; title: string }[] = [];
let failTelegram = false;
const senders: ChannelSenders = {
  TELEGRAM: async ({ title }) => {
    if (failTelegram) throw new Error("telegram down");
    sent.push({ channel: "TELEGRAM", title });
  },
  EMAIL: async ({ title }) => void sent.push({ channel: "EMAIL", title }),
  WEBPUSH: async ({ title }) => void sent.push({ channel: "WEBPUSH", title }),
};

beforeEach(async () => {
  await resetDb();
  sent = [];
  failTelegram = false;
  setChannelSenders(senders);
  process.env.TELEGRAM_BOT_TOKEN = "123456:test-token-not-real";
  process.env.SMTP_HOST = "smtp.test";
  process.env.EMAIL_FROM = "a@test.dev";
  const { resetEnvCache } = await import("@/lib/env");
  resetEnvCache();
});
afterEach(async () => {
  setChannelSenders(null);
  process.env.TELEGRAM_BOT_TOKEN = "";
  process.env.SMTP_HOST = "";
  (await import("@/lib/env")).resetEnvCache();
  vi.useRealTimers();
});

async function setup(extra: Record<string, unknown> = {}) {
  const { user } = await createUser();
  const settings = await updateSettings(user.id, { alerts: { channels: { telegram: true, email: true, webpush: false }, telegramChatId: "42", email: "me@test.dev", ...extra } });
  return { user, settings };
}

describe("notification dispatch", () => {
  it("delivers to enabled channels and suppresses duplicates by dedupe key", async () => {
    const { user, settings } = await setup();
    const a = await notify(user.id, settings, { kind: "SIGNAL", title: "T1", body: "b", dedupeKey: "sig:x" });
    const b = await notify(user.id, settings, { kind: "SIGNAL", title: "T1", body: "b", dedupeKey: "sig:x" });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    expect(sent.map((s) => s.channel).sort()).toEqual(["EMAIL", "TELEGRAM"]);
    expect(await db().notification.count()).toBe(1);
  });

  it("records failed deliveries and retries them later", async () => {
    const { user, settings } = await setup();
    failTelegram = true;
    await notify(user.id, settings, { kind: "SIGNAL", title: "T", body: "b", dedupeKey: "k1" });
    const d = await db().notificationDelivery.findFirstOrThrow({ where: { channel: "TELEGRAM" } });
    expect(d.status).toBe("FAILED");
    expect(d.attempts).toBe(1);
    expect(d.lastError).toMatch(/telegram down/);
    failTelegram = false;
    const r = await processPendingDeliveries(getSettings, new Date(Date.now() + 10 * 60_000));
    expect(r.sent).toBe(1);
    expect((await db().notificationDelivery.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("SENT");
  });

  it("stops retrying after the maximum attempts", async () => {
    const { user, settings } = await setup();
    failTelegram = true;
    await notify(user.id, settings, { kind: "SIGNAL", title: "T", body: "b", dedupeKey: "k2" });
    for (let i = 1; i <= 4; i++) await processPendingDeliveries(getSettings, new Date(Date.now() + i * 60 * 60_000));
    const d = await db().notificationDelivery.findFirstOrThrow({ where: { channel: "TELEGRAM" } });
    expect(d.attempts).toBe(3);
    expect(d.status).toBe("FAILED");
    expect(d.nextAttemptAt).toBeNull();
  });

  it("defers external delivery during quiet hours (in-app record still created)", async () => {
    const { user, settings } = await setup({ quietHours: { enabled: true, start: "00:00", end: "23:59", timezone: "UTC" } });
    await notify(user.id, settings, { kind: "SIGNAL", title: "Q", body: "b", dedupeKey: "q" }, { now: new Date("2026-01-01T12:00:00Z") });
    expect(sent).toHaveLength(0);
    expect(await db().notificationDelivery.count({ where: { status: "DEFERRED" } })).toBe(2);
    expect(await db().notification.count()).toBe(1);
  });

  it("enforces the hourly cap", async () => {
    const { user, settings } = await setup({ maxPerHour: 2 });
    for (let i = 0; i < 3; i++) await notify(user.id, settings, { kind: "SIGNAL", title: `n${i}`, body: "b", dedupeKey: `cap${i}` });
    expect(await db().notificationDelivery.count({ where: { status: "SKIPPED" } })).toBe(2); // 3rd notification, both channels
  });

  it("quiet-hours window math handles overnight ranges and time zones", () => {
    const q = { enabled: true, start: "22:00", end: "07:00", timezone: "Europe/Vienna" };
    expect(inQuietHours(q, new Date("2026-01-15T22:30:00Z"))).toBe(true); // 23:30 Vienna
    expect(inQuietHours(q, new Date("2026-01-15T05:30:00Z"))).toBe(true); // 06:30 Vienna
    expect(inQuietHours(q, new Date("2026-01-15T07:30:00Z"))).toBe(false); // 08:30 Vienna
    expect(inQuietHours({ ...q, enabled: false }, new Date("2026-01-15T22:30:00Z"))).toBe(false);
  });

  it("does not send external alerts when alerts are disabled", async () => {
    const { user } = await setup();
    const settings = await updateSettings(user.id, { alerts: { enabled: false } });
    await notify(user.id, settings, { kind: "SIGNAL", title: "x", body: "b", dedupeKey: "off" });
    expect(sent).toHaveLength(0);
    expect(await db().notification.count()).toBe(1);
  });
});
