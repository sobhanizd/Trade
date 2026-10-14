import { z } from "zod";
import { buildAiContext } from "@/lib/ai/context";
import { aiConfigured, deterministicExplanation, explain } from "@/lib/ai/explainer";
import { ApiError, route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n";
import { getSettings } from "@/lib/settings/service";

const Body = z.object({
  question: z.string().trim().min(3).max(1000),
  signalId: z.string().max(50).optional(),
  symbol: z.string().trim().max(10).optional(),
});

const NOTE = {
  en: {
    disabled: "AI is disabled in your settings; showing the rule-based explanation.",
    notConfigured: "AI is not configured (no ANTHROPIC_API_KEY); showing the rule-based explanation.",
  },
  fa: {
    disabled: "هوش مصنوعی در تنظیمات شما خاموش است؛ توضیح قانون‌محور نشان داده می‌شود.",
    notConfigured: "هوش مصنوعی راه‌اندازی نشده است (ANTHROPIC_API_KEY تنظیم نشده)؛ توضیح قانون‌محور نشان داده می‌شود.",
  },
};

export const POST = route({ body: Body, rateLimit: 10 }, async ({ user, body, req }) => {
  const settings = await getSettings(user.id);
  // Answer in the language the page is shown in (cookie); fall back to the account setting.
  const cookieLocale = req.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : settings.language;
  const context = await buildAiContext(user.id, { signalId: body.signalId, symbol: body.symbol }, locale);
  if (!aiConfigured() || !settings.ai.enabled) {
    return {
      mode: "deterministic",
      answer: deterministicExplanation(context, locale),
      note: aiConfigured() ? NOTE[locale].disabled : NOTE[locale].notConfigured,
      missing: context.missing,
    };
  }
  try {
    const r = await explain(body.question, context, locale);
    await db().aiMessage.create({ data: { userId: user.id, question: body.question, answer: r.answer, model: r.servedBy, context: { focus: context.focus, signalIds: (context.signals as { id: string }[]).map((s) => s.id) } } });
    return { mode: "ai", answer: r.answer, model: r.servedBy, refused: r.refused, missing: context.missing };
  } catch (e) {
    throw new ApiError(502, (e as Error).message);
  }
});
