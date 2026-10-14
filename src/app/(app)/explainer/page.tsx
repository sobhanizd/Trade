import type { Metadata } from "next";
import { Alert, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { aiConfigured } from "@/lib/ai/explainer";
import type { Dict } from "@/lib/i18n";
import { getL } from "@/lib/i18n/server";
import { getSettings } from "@/lib/settings/service";
import { Chat } from "./chat";

const L = {
  en: {
    metaTitle: "AI explainer",
    title: "AI market explainer",
    description: "Plain-language explanations grounded only in this app's stored analysis. The AI cannot create or change signals.",
    disabled: "AI is disabled in Settings",
    notConfigured: "AI is not configured",
    fallback: "You will get the deterministic, rule-by-rule explanation instead. To enable AI, set ANTHROPIC_API_KEY on the server (see docs/SETUP.md).",
  },
  fa: {
    metaTitle: "توضیح‌دهندهٔ هوشمند",
    title: "توضیح بازار با هوش مصنوعی",
    description: "توضیح به زبان ساده، فقط بر اساس تحلیل‌هایی که همین برنامه ذخیره کرده است. هوش مصنوعی نمی‌تواند سیگنالی بسازد یا تغییر دهد.",
    disabled: "هوش مصنوعی در تنظیمات خاموش است",
    notConfigured: "هوش مصنوعی راه‌اندازی نشده است",
    fallback: "به‌جای آن، توضیح قانون‌محور (قدم‌به‌قدم بر اساس قوانین هر روش) را می‌گیرید. برای روشن کردن هوش مصنوعی، ANTHROPIC_API_KEY را روی سرور تنظیم کنید (راهنما: docs/SETUP.md).",
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.metaTitle };
}

export default async function ExplainerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const t = await getL(L);
  const sp = await searchParams;
  const [watch, settings, history] = await Promise.all([
    db().watchlistItem.findMany({ where: { userId: user.id }, include: { asset: { select: { symbol: true } } } }),
    getSettings(user.id),
    db().aiMessage.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const enabled = aiConfigured() && settings.ai.enabled;
  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      {!enabled && (
        <Alert tone="info" className="mb-4" title={aiConfigured() ? t.disabled : t.notConfigured}>
          {t.fallback}
        </Alert>
      )}
      <Chat
        symbols={watch.map((w) => w.asset.symbol)}
        initialSymbol={sp.symbol?.toUpperCase()}
        signalId={sp.signal}
        aiEnabled={enabled}
        history={history.map((h) => ({ q: h.question, a: h.answer, model: h.model, at: h.createdAt.toISOString() })).reverse()}
      />
    </>
  );
}
