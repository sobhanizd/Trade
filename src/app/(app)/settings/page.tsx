import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { integrationStatus } from "@/lib/env";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { strategyName } from "@/lib/plain";
import { getSettings } from "@/lib/settings/service";
import { STRATEGIES } from "@/lib/strategies/registry";
import { SettingsForm } from "./form";

const L = {
  en: {
    title: "Settings",
    description: "Saved to the database for your account. Secrets (API keys, SMTP password, bot token) live only in server environment variables.",
  },
  fa: {
    title: "تنظیمات",
    description: "برای حساب شما در پایگاه داده ذخیره می‌شود. اطلاعات محرمانه (کلیدهای API، رمز ایمیل، توکن ربات) فقط روی سرور نگه داشته می‌شوند.",
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getL(L)).title };
}

export default async function SettingsPage() {
  const user = await requireUser();
  const [t, locale] = await Promise.all([getL(L), getLocale()]);
  const [settings, watch, subs] = await Promise.all([
    getSettings(user.id),
    db().watchlistItem.findMany({ where: { userId: user.id }, include: { asset: { select: { symbol: true } } } }),
    db().pushSubscription.count({ where: { userId: user.id } }),
  ]);
  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <SettingsForm
        initial={settings}
        integrations={integrationStatus()}
        symbols={watch.map((w) => w.asset.symbol)}
        strategies={STRATEGIES.map((s) => ({ id: s.id, name: locale === "fa" ? strategyName(s.id, locale) : s.name }))}
        vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        pushSubscriptions={subs}
      />
    </>
  );
}
