import { NextResponse } from "next/server";
import { z } from "zod";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { audit } from "@/lib/audit";
import { route } from "@/lib/api/handler";
import { integrationStatus } from "@/lib/env";
import { getSettings, updateSettings } from "@/lib/settings/service";

export const GET = route({}, async ({ user }) => ({ settings: await getSettings(user.id), integrations: integrationStatus() }));

export const PUT = route({ body: z.record(z.string(), z.unknown()), rateLimit: 30 }, async ({ user, body }) => {
  // The time a Toman rate was entered is recorded by the server (only when the rate actually changes).
  if (body.toman && typeof body.toman === "object") {
    const { updatedAt: _ignored, ...toman } = body.toman as Record<string, unknown>;
    const current = await getSettings(user.id);
    body.toman = "perEur" in toman && toman.perEur !== current.toman.perEur ? { ...toman, updatedAt: new Date().toISOString() } : toman;
  }
  const settings = await updateSettings(user.id, body);
  await audit("settings.updated", user.id, { sections: Object.keys(body) });
  const res = NextResponse.json({ settings });
  if ("language" in body) res.cookies.set(LOCALE_COOKIE, settings.language, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
});
