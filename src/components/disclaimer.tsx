"use client";
import type { Dict } from "@/lib/i18n";
import { useL } from "@/lib/i18n/client";

const L = {
  en: { text: "Analysis and decision support only — not financial advice, not a guarantee, and never an instruction to trade. CryptoPilot AI cannot place orders or access funds." },
  fa: { text: "این برنامه فقط برای تحلیل و کمک به تصمیم‌گیری است — توصیهٔ مالی نیست، تضمینی نمی‌دهد و هیچ‌وقت دستور معامله نیست. کریپتوپایلوت نمی‌تواند سفارش ثبت کند یا به پول شما دسترسی داشته باشد." },
} satisfies Dict<unknown>;

export function Disclaimer() {
  const t = useL(L);
  return <p className="text-xs text-ink-2">{t.text}</p>;
}
