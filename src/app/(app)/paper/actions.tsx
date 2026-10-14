"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/client-api";
import type { Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";

const L = {
  en: {
    addFirst: "Add assets to your watchlist first.",
    recorded: "Hypothetical position recorded.",
    asset: "Asset",
    stop: "Stop (USD)",
    target: "Target (USD)",
    risk: "Risk amount (USD)",
    riskHint: "Sizes the position from the stop.",
    qty: "…or quantity",
    notes: "Notes",
    recording: "Recording…",
    record: "Record hypothetical trade",
    close: "Close at market",
  },
  fa: {
    addFirst: "اول چند ارز به «ارزهای من» اضافه کنید.",
    recorded: "معاملهٔ فرضی ثبت شد.",
    asset: "ارز",
    stop: "حد ضرر (USD)",
    target: "هدف سود (USD)",
    risk: "مبلغ ریسک (USD)",
    riskHint: "اندازهٔ معامله از روی فاصلهٔ قیمت تا حد ضرر حساب می‌شود.",
    qty: "…یا تعداد",
    notes: "یادداشت",
    recording: "در حال ثبت…",
    record: "ثبت معاملهٔ فرضی",
    close: "بستن با قیمت فعلی بازار",
  },
} satisfies Dict<unknown>;

export function NewPaperTrade({ symbols, defaultRisk }: { symbols: string[]; defaultRisk: number }) {
  const router = useRouter();
  const t = useL(L);
  const locale = useLocale();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!symbols.length) return <Alert tone="info">{t.addFirst}</Alert>;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const num = (k: string) => (fd.get(k) ? Number(fd.get(k)) : undefined);
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/paper", { body: { symbol: fd.get("symbol"), riskAmount: num("risk"), quantity: num("qty"), stopPrice: num("stop") ?? null, targetPrice: num("target") ?? null, notes: fd.get("notes") || undefined } });
      setMsg({ tone: "success", text: t.recorded });
      form.reset();
      router.refresh();
    } catch (e2) {
      setMsg({ tone: "error", text: errorText((e2 as Error).message, locale) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label={t.asset} htmlFor="p-sym"><Select id="p-sym" name="symbol">{symbols.map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label={t.stop} htmlFor="p-stop"><Input id="p-stop" name="stop" type="number" step="any" min="0" /></Field>
        <Field label={t.target} htmlFor="p-target"><Input id="p-target" name="target" type="number" step="any" min="0" /></Field>
        <Field label={t.risk} htmlFor="p-risk" hint={t.riskHint}><Input id="p-risk" name="risk" type="number" step="any" min="0" defaultValue={defaultRisk.toFixed(2)} /></Field>
        <Field label={t.qty} htmlFor="p-qty"><Input id="p-qty" name="qty" type="number" step="any" min="0" /></Field>
        <Field label={t.notes} htmlFor="p-notes"><Input id="p-notes" name="notes" maxLength={1000} /></Field>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button type="submit" disabled={busy}>{busy ? t.recording : t.record}</Button>
    </form>
  );
}

export function CloseTrade({ id }: { id: string }) {
  const router = useRouter();
  const t = useL(L);
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api(`/api/paper/${id}/close`, { method: "POST" });
          router.refresh();
        } catch (e) {
          alert(errorText((e as Error).message, locale));
        } finally {
          setBusy(false);
        }
      }}
    >
      {t.close}
    </Button>
  );
}
