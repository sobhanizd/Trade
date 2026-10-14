import webpush from "web-push";
import { db } from "@/lib/db";

let configured = false;
function configure() {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) throw new Error("Browser push is not configured (VAPID keys missing)");
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

/** Sends to all of the user's subscriptions; removes expired ones. Throws if none succeeded. */
export async function sendWebPush(userId: string, payload: { title: string; body: string; url?: string | null; tag?: string }) {
  configure();
  const subs = await db().pushSubscription.findMany({ where: { userId } });
  if (!subs.length) throw new Error("No browser has subscribed to push notifications yet (enable them in Settings).");
  let sent = 0;
  const errors: string[] = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db().pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
      errors.push(`${status ?? ""} ${(e as Error).message}`.trim());
    }
  }
  if (sent === 0) throw new Error(`Push failed: ${errors.join("; ")}`);
}
