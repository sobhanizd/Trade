import { z } from "zod";
import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";

const Sub = z.object({ endpoint: z.string().url().max(2000).startsWith("https://"), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

export const GET = route({}, async () => ({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null }));

export const POST = route({ body: Sub, rateLimit: 10 }, async ({ user, body, req }) => {
  await db().pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    create: { userId: user.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: req.headers.get("user-agent")?.slice(0, 300) },
    update: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
  });
  return { subscribed: true };
});

export const DELETE = route({ body: z.object({ endpoint: z.string().max(2000) }) }, async ({ user, body }) => {
  await db().pushSubscription.deleteMany({ where: { userId: user.id, endpoint: body.endpoint } });
  return { unsubscribed: true };
});
