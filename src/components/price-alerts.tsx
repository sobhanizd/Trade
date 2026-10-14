"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Select } from "@/components/ui";
import { api } from "@/lib/client-api";
import { fmtPrice, timeAgo } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";

interface PA { id: string; direction: "ABOVE" | "BELOW"; price: number; note: string | null; active: boolean; triggeredAt: string | null; asset: { symbol: string } }

const L = {
  en: {
    symbolPh: "Symbol (BTC)",
    symbol: "Symbol",
    direction: "Direction",
    above: "Price rises above",
    below: "Price falls below",
    pricePh: "USD price",
    price: "Price in USD",
    notePh: "Note (optional)",
    note: "Note",
    add: "Add alert",
    none: (symbol?: string) => `No price alerts${symbol ? ` for ${symbol}` : ""}.`,
    active: "active",
    triggered: (ago: string) => `triggered ${ago}`,
    deleteAlert: "Delete alert",
    delete: "Delete",
  },
  fa: {
    symbolPh: "نماد ارز (مثلاً BTC)",
    symbol: "نماد ارز",
    direction: "جهت",
    above: "قیمت بالاتر برود از",
    below: "قیمت پایین‌تر بیاید از",
    pricePh: "قیمت به دلار",
    price: "قیمت به دلار",
    notePh: "یادداشت (اختیاری)",
    note: "یادداشت",
    add: "افزودن هشدار",
    none: (symbol?: string) => (symbol ? `هیچ هشدار قیمتی برای ${symbol} ندارید.` : "هنوز هشدار قیمتی ندارید."),
    active: "فعال",
    triggered: (ago: string) => `به قیمت رسید، ${ago}`,
    deleteAlert: "حذف هشدار",
    delete: "حذف",
  },
} satisfies Dict<unknown>;

export function PriceAlerts({ symbol }: { symbol?: string }) {
  const t = useL(L);
  const locale = useLocale();
  const [alerts, setAlerts] = useState<PA[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true;
    api<{ alerts: PA[] }>("/api/alerts/price")
      .then((r) => alive && setAlerts(symbol ? r.alerts.filter((a) => a.asset.symbol === symbol) : r.alerts))
      .catch((e) => alive && setErr((e as Error).message));
    return () => {
      alive = false;
    };
  }, [symbol, version]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    try {
      await api("/api/alerts/price", { body: { symbol: symbol ?? fd.get("symbol"), direction: fd.get("direction"), price: Number(fd.get("price")), note: (fd.get("note") as string) || undefined } });
      (e.target as HTMLFormElement).reset();
      load();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    await api(`/api/alerts/price/${id}`, { method: "DELETE" }).catch((e) => setErr((e as Error).message));
    load();
  }

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {!symbol && <Input name="symbol" placeholder={t.symbolPh} required aria-label={t.symbol} />}
        <Select name="direction" aria-label={t.direction} defaultValue="ABOVE">
          <option value="ABOVE">{t.above}</option>
          <option value="BELOW">{t.below}</option>
        </Select>
        <Input name="price" type="number" step="any" min="0" placeholder={t.pricePh} required aria-label={t.price} />
        <Input name="note" placeholder={t.notePh} maxLength={200} aria-label={t.note} />
        <Button type="submit" disabled={busy}>{t.add}</Button>
      </form>
      {err && <Alert tone="error">{errorText(err, locale)}</Alert>}
      {alerts.length === 0 ? (
        <p className="text-sm text-ink-2">{t.none(symbol)}</p>
      ) : (
        <ul className="divide-y divide-line">
          {alerts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                {!symbol && <b className="me-1">{a.asset.symbol}</b>}
                <span className="ltr">{a.direction === "ABOVE" ? "≥" : "≤"} {fmtPrice(a.price, "USD")}</span> {a.note && <span className="text-ink-2">— {a.note}</span>}
              </span>
              <span className="flex items-center gap-2">
                {a.active ? <Badge tone="accent">{t.active}</Badge> : <Badge>{t.triggered(timeAgo(a.triggeredAt, undefined, locale))}</Badge>}
                <Button variant="ghost" onClick={() => remove(a.id)} aria-label={t.deleteAlert}>{t.delete}</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
