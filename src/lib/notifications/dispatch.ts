import { db } from "@/lib/db";
import type { DeliveryChannel, NotificationKind } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { integrationStatus } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { UserSettingsData } from "@/lib/settings/schema";
import { sendEmail } from "./channels/email";
import { sendTelegram } from "./channels/telegram";
import { sendWebPush } from "./channels/webpush";

export interface ChannelSenders {
  TELEGRAM: (args: { chatId: string; title: string; body: string; url?: string | null }) => Promise<void>;
  EMAIL: (args: { to: string; title: string; body: string; url?: string | null }) => Promise<void>;
  WEBPUSH: (args: { userId: string; title: string; body: string; url?: string | null; tag: string }) => Promise<void>;
}

export const defaultSenders: ChannelSenders = {
  TELEGRAM: ({ chatId, title, body, url }) => sendTelegram(chatId, `${title}\n\n${body}${url ? `\n\n${url}` : ""}`),
  EMAIL: ({ to, title, body, url }) => sendEmail(to, title, body, url),
  WEBPUSH: ({ userId, title, body, url, tag }) => sendWebPush(userId, { title, body: body.split("\n").slice(0, 4).join("\n"), url, tag }),
};

let senders: ChannelSenders = defaultSenders;
/** Test hook. */
export function setChannelSenders(s: ChannelSenders | null) {
  senders = s ?? defaultSenders;
}

export const MAX_ATTEMPTS = 3;
const BACKOFF_MIN = [1, 5, 30];

export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body: string;
  url?: string | null;
  dedupeKey: string;
  signalId?: string | null;
}

/** Minutes since midnight in the given IANA timezone. */
export function minutesInZone(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    return h * 60 + m;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

export function inQuietHours(q: UserSettingsData["alerts"]["quietHours"], now = new Date()): boolean {
  if (!q.enabled) return false;
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const start = toMin(q.start);
  const end = toMin(q.end);
  const cur = minutesInZone(now, q.timezone);
  if (start === end) return false;
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

export function enabledChannels(settings: UserSettingsData): DeliveryChannel[] {
  const status = integrationStatus();
  const out: DeliveryChannel[] = [];
  if (settings.alerts.channels.telegram && status.telegram && settings.alerts.telegramChatId) out.push("TELEGRAM");
  if (settings.alerts.channels.email && status.email && settings.alerts.email) out.push("EMAIL");
  if (settings.alerts.channels.webpush && status.webpush) out.push("WEBPUSH");
  return out;
}

/**
 * Create an in-app notification and queue external deliveries.
 * Returns null when the dedupe key already exists (duplicate suppressed).
 */
export async function notify(userId: string, settings: UserSettingsData, input: NotifyInput, opts: { now?: Date; channels?: DeliveryChannel[] } = {}) {
  const now = opts.now ?? new Date();
  let notification;
  try {
    notification = await db().notification.create({
      data: { userId, kind: input.kind, title: input.title, body: input.body, url: input.url ?? null, dedupeKey: input.dedupeKey, signalId: input.signalId ?? null, createdAt: now },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }

  const channels = opts.channels ?? (settings.alerts.enabled || input.kind === "TEST" ? enabledChannels(settings) : []);
  if (!channels.length) return notification;

  // Global hourly cap (system and test messages are exempt).
  let capped = false;
  if (input.kind !== "SYSTEM" && input.kind !== "TEST") {
    const recent = await db().notification.count({
      where: { userId, createdAt: { gt: new Date(now.getTime() - 3_600_000) }, kind: { notIn: ["SYSTEM", "TEST"] }, deliveries: { some: { status: { in: ["SENT", "PENDING", "DEFERRED"] } } } },
    });
    capped = recent >= settings.alerts.maxPerHour;
  }
  const quiet = input.kind !== "TEST" && inQuietHours(settings.alerts.quietHours, now);

  await db().notificationDelivery.createMany({
    data: channels.map((channel) => ({
      notificationId: notification.id,
      channel,
      status: capped ? ("SKIPPED" as const) : quiet ? ("DEFERRED" as const) : ("PENDING" as const),
      lastError: capped ? `Hourly alert limit (${settings.alerts.maxPerHour}) reached` : quiet ? "Quiet hours" : null,
      nextAttemptAt: capped ? null : quiet ? new Date(now.getTime() + 15 * 60_000) : now,
    })),
  });
  if (!capped && !quiet) await deliverForNotification(notification.id, settings, now);
  return notification;
}

async function attempt(
  delivery: { id: string; channel: DeliveryChannel; attempts: number },
  n: { userId: string; title: string; body: string; url: string | null; dedupeKey: string },
  settings: UserSettingsData,
  now: Date,
) {
  try {
    if (delivery.channel === "TELEGRAM") await senders.TELEGRAM({ chatId: settings.alerts.telegramChatId, title: n.title, body: n.body, url: n.url });
    else if (delivery.channel === "EMAIL") await senders.EMAIL({ to: settings.alerts.email, title: n.title, body: n.body, url: n.url });
    else await senders.WEBPUSH({ userId: n.userId, title: n.title, body: n.body, url: n.url, tag: n.dedupeKey.slice(0, 60) });
    await db().notificationDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", attempts: { increment: 1 }, sentAt: now, lastError: null, nextAttemptAt: null } });
    return true;
  } catch (e) {
    const attempts = delivery.attempts + 1;
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    logger.warn("notification delivery failed", { channel: delivery.channel, attempts, error: msg });
    await db().notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        attempts,
        lastError: msg,
        nextAttemptAt: attempts < MAX_ATTEMPTS ? new Date(now.getTime() + BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length - 1)] * 60_000) : null,
      },
    });
    return false;
  }
}

async function deliverForNotification(notificationId: string, settings: UserSettingsData, now: Date) {
  const n = await db().notification.findUnique({ where: { id: notificationId }, include: { deliveries: true } });
  if (!n) return;
  for (const d of n.deliveries.filter((x) => x.status === "PENDING")) await attempt(d, n, settings, now);
}

/** Retry failed deliveries and release deferred (quiet-hours) ones. Called by the worker. */
export async function processPendingDeliveries(getSettingsFn: (userId: string) => Promise<UserSettingsData>, now = new Date()) {
  const due = await db().notificationDelivery.findMany({
    where: { status: { in: ["PENDING", "DEFERRED", "FAILED"] }, attempts: { lt: MAX_ATTEMPTS }, nextAttemptAt: { lte: now } },
    include: { notification: true },
    take: 100,
    orderBy: { createdAt: "asc" },
  });
  let sent = 0;
  let failed = 0;
  for (const d of due) {
    const settings = await getSettingsFn(d.notification.userId);
    if (d.status === "DEFERRED" && inQuietHours(settings.alerts.quietHours, now)) {
      await db().notificationDelivery.update({ where: { id: d.id }, data: { nextAttemptAt: new Date(now.getTime() + 15 * 60_000) } });
      continue;
    }
    // Drop stale deferred alerts (older than 12h) instead of sending outdated analysis.
    if (now.getTime() - d.notification.createdAt.getTime() > 12 * 3_600_000 && d.notification.kind !== "SYSTEM") {
      await db().notificationDelivery.update({ where: { id: d.id }, data: { status: "SKIPPED", lastError: "Expired before delivery", nextAttemptAt: null } });
      continue;
    }
    if (await attempt(d, d.notification, settings, now)) sent++;
    else failed++;
  }
  return { processed: due.length, sent, failed };
}
