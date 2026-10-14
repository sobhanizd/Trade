"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/client-api";
import type { Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";

const L = {
  en: {
    recorded: "Hypothetical trade recorded at the current live price.",
    already1: "This signal is already tracked in ",
    paperLink: "paper trading",
    already2: ".",
    label: "Paper-trade this setup (no real money)",
    hint: "Hypothetical amount you would accept losing if the invalidation level is hit (USD).",
    record: "Record hypothetical trade",
  },
  fa: {
    recorded: "معاملهٔ فرضی با قیمت زندهٔ فعلی ثبت شد.",
    already1: "این سیگنال از قبل در ",
    paperLink: "معاملهٔ تمرینی",
    already2: " دنبال می‌شود.",
    label: "این فرصت را با پول مجازی تمرین کنید (بدون پول واقعی)",
    hint: "مبلغ فرضی که حاضرید از دست بدهید اگر قیمت به حد ضرر برسد (به دلار).",
    record: "ثبت معاملهٔ فرضی",
  },
} satisfies Dict<unknown>;

export function OpenPaperFromSignal({ signalId, symbol, stop, target, already }: { signalId: string; symbol: string; stop: number | null; target: number | null; already: boolean }) {
  const t = useL(L);
  const locale = useLocale();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const risk = Number(new FormData(e.currentTarget).get("risk"));
    setBusy(true);
    try {
      await api("/api/paper", { body: { symbol, signalId, riskAmount: risk, stopPrice: stop, targetPrice: target, notes: "Opened from signal" } });
      setMsg({ tone: "success", text: t.recorded });
    } catch (e2) {
      setMsg({ tone: "error", text: errorText((e2 as Error).message, locale) });
    } finally {
      setBusy(false);
    }
  }
  if (already) return <p className="text-sm text-ink-2">{t.already1}<Link className="text-accent underline" href="/paper">{t.paperLink}</Link>{t.already2}</p>;
  return (
    <form onSubmit={submit} className="space-y-2">
      <Field label={t.label} hint={t.hint} htmlFor="risk">
        <Input id="risk" name="risk" type="number" min="1" step="any" defaultValue={10} required />
      </Field>
      <Button type="submit" variant="secondary" disabled={busy || stop === null}>{t.record}</Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </form>
  );
}
