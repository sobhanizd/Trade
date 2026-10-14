"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Alert, Button, Input } from "@/components/ui";
import { api } from "@/lib/client-api";
import type { Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";
import { coinStyle } from "@/lib/coin-style";
import { coinLabel } from "@/lib/plain";

interface Validation { ok: boolean; checks: { label: string; passed: boolean; detail: string }[] }

const L = {
  en: {
    added: (s: string) => `${s} added. It will be scanned in the next cycle (or press Refresh).`,
    failedFilters: (s: string) => `${s} did not pass the filters.`,
    placeholder: "Name or ticker, e.g. Solana or SOL",
    tickerLabel: "Coin name or ticker",
    popular: "Popular coins — tap to add:",
    yours: "Your coins — tap ✕ to remove:",
    checking: "Checking…",
    add: "Add",
    validating: "Validating against CoinGecko, Binance and Kraken… this can take ~10 seconds.",
    passed: "passed",
    failed: "failed",
    confirmRemove: (s: string) => `Remove ${s} from your watchlist? Its historical signals are kept.`,
    removeLabel: (s: string) => `Remove ${s}`,
    remove: "Remove",
    checkLabels: {} as Record<string, string>,
  },
  fa: {
    added: (s: string) => `${s} اضافه شد. در دور بعدی بررسی می‌شود (یا دکمهٔ «به‌روزرسانی» را بزنید).`,
    failedFilters: (s: string) => `${s} شرط‌های لازم را نداشت.`,
    placeholder: "نام یا نماد ارز، مثلاً سولانا یا SOL",
    tickerLabel: "نام یا نماد ارز",
    popular: "ارزهای پرطرفدار — برای افزودن بزنید:",
    yours: "ارزهای شما — برای حذف ✕ را بزنید:",
    checking: "در حال بررسی…",
    add: "افزودن",
    validating: "در حال بررسی با CoinGecko، Binance و Kraken… ممکن است حدود ۱۰ ثانیه طول بکشد.",
    passed: "قبول",
    failed: "رد",
    confirmRemove: (s: string) => `${s} از ارزهای شما حذف شود؟ سیگنال‌های قبلی‌اش نگه داشته می‌شوند.`,
    removeLabel: (s: string) => `حذف ${s}`,
    remove: "حذف",
    checkLabels: {
      "Coin identified": "ارز شناسایی شد",
      "Minimum market cap": "حداقل ارزش بازار",
      "Minimum 24h volume": "حداقل حجم معاملات ۲۴ ساعته",
      "Candle data available": "دادهٔ قیمت (کندل) موجود است",
      "Price history": "سابقهٔ قیمت",
      "Symbol format": "شکل نماد",
      "Asset type": "نوع ارز",
      "Market-cap ranking": "رتبه از نظر ارزش بازار",
    } as Record<string, string>,
  },
} satisfies Dict<unknown>;

/** Liquid, well-known altcoins offered as one-tap chips (each is still validated on add). */
const POPULAR = ["BNB", "SOL", "XRP", "DOGE", "TON", "DOT", "LINK", "AVAX", "SHIB", "BCH", "ATOM", "UNI", "NEAR", "SUI", "ETC", "APT"];

export function AddAsset({ watched = [] }: { watched?: string[] }) {
  const router = useRouter();
  const t = useL(L);
  const locale = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string; validation?: Validation } | null>(null);
  async function add(query: string, form?: HTMLFormElement) {
    if (!query) return;
    setBusy(query);
    setResult(null);
    try {
      const r = await api<{ added: boolean; symbol?: string; validation?: Validation }>("/api/watchlist", { body: { symbol: query } });
      setResult({ ok: true, message: t.added(coinLabel(r.symbol ?? query.toUpperCase(), locale)), validation: r.validation ?? undefined });
      form?.reset();
      router.refresh();
    } catch (err) {
      const data = (err as { data?: { validation?: Validation } }).data;
      setResult({ ok: false, message: data?.validation ? t.failedFilters(query) : errorText((err as Error).message, locale), validation: data?.validation });
    } finally {
      setBusy(null);
    }
  }
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void add(String(new FormData(e.currentTarget).get("symbol") ?? "").trim(), e.currentTarget);
  }
  const suggestions = POPULAR.filter((s) => !watched.includes(s));
  return (
    <div className="space-y-3">
      {watched.length > 0 && (
        <div>
          <div className="mb-1.5 text-sm text-ink-2">{t.yours}</div>
          <div className="flex flex-wrap gap-1.5">
            {watched.map((s) => <RemoveChip key={s} symbol={s} />)}
          </div>
        </div>
      )}
      <form onSubmit={submit} className="flex max-w-md gap-2">
        <Input name="symbol" placeholder={t.placeholder} aria-label={t.tickerLabel} maxLength={40} minLength={2} required dir="auto" />
        <Button type="submit" disabled={busy !== null}>{busy ? t.checking : t.add}</Button>
      </form>
      {suggestions.length > 0 && (
        <div>
          <div className="mb-1.5 text-sm text-ink-2">{t.popular}</div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => {
              const st = coinStyle(s);
              return (
                <button key={s} type="button" disabled={busy !== null} onClick={() => void add(s)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface py-1 ps-1.5 pe-3 text-sm hover:bg-surface-2 disabled:opacity-50">
                  <span className="coin-ico h-6 w-6 text-[10px]" style={{ background: st.bg }} aria-hidden>{st.glyph}</span>
                  {busy === s ? t.checking : <>+ {coinLabel(s, locale)}</>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {busy && <p className="text-sm text-ink-2">{t.validating}</p>}
      {result && (
        <Alert tone={result.ok ? "success" : "error"} title={result.message}>
          {result.validation && Array.isArray(result.validation.checks) && (
            <ul className="mt-1 space-y-1">
              {result.validation.checks.map((c) => (
                <li key={c.label} className="flex gap-1.5">
                  {c.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good-ink" aria-label={t.passed} /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad-ink" aria-label={t.failed} />}
                  <span><b className="font-medium text-ink">{t.checkLabels[c.label] ?? c.label}:</b> {c.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
    </div>
  );
}

function RemoveChip({ symbol }: { symbol: string }) {
  const router = useRouter();
  const t = useL(L);
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const st = coinStyle(symbol);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={t.removeLabel(symbol)}
      onClick={async () => {
        if (!confirm(t.confirmRemove(coinLabel(symbol, locale)))) return;
        setBusy(true);
        await api(`/api/watchlist/${symbol}`, { method: "DELETE" }).catch((e) => alert(errorText((e as Error).message, locale)));
        router.refresh();
        setBusy(false);
      }}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2 py-1 ps-1.5 pe-2.5 text-sm hover:border-bad/60 hover:text-bad-ink disabled:opacity-50"
    >
      <span className="coin-ico h-6 w-6 text-[10px]" style={{ background: st.bg }} aria-hidden>{st.glyph}</span>
      {coinLabel(symbol, locale)} <span aria-hidden className="text-ink-2">✕</span>
    </button>
  );
}

export function RemoveAsset({ symbol }: { symbol: string }) {
  const router = useRouter();
  const t = useL(L);
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        if (!confirm(t.confirmRemove(symbol))) return;
        setBusy(true);
        await api(`/api/watchlist/${symbol}`, { method: "DELETE" }).catch((e) => alert(errorText((e as Error).message, locale)));
        router.refresh();
        setBusy(false);
      }}
      aria-label={t.removeLabel(symbol)}
    >
      {t.remove}
    </Button>
  );
}
