import { z } from "zod";
import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { enabledChannels, notify } from "@/lib/notifications/dispatch";
import { formatTestAlert } from "@/lib/notifications/format";
import { getSettings } from "@/lib/settings/service";

export const POST = route({ body: z.object({ channel: z.enum(["TELEGRAM", "EMAIL", "WEBPUSH"]).optional() }), rateLimit: 6 }, async ({ user, body }) => {
  const settings = await getSettings(user.id);
  const channels = body.channel ? [body.channel] : enabledChannels(settings);
  const n = await notify(user.id, settings, {
    kind: "TEST",
    ...formatTestAlert(body.channel, settings.language),
    url: `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/notifications`,
    dedupeKey: `test:${Date.now()}`,
  }, { channels });
  const deliveries = n ? await db().notificationDelivery.findMany({ where: { notificationId: n.id } }) : [];
  return { channels, deliveries: deliveries.map((d) => ({ channel: d.channel, status: d.status, error: d.lastError })) };
});
