"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { fmtDate, fmtMoney, fmtPrice, type Currency } from "@/lib/format";
import { liveFeed } from "@/lib/live/prices";
import { coinLabel, exitReasonPlain, strategyName, timeframePlain } from "@/lib/plain";
import type { Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";

const L = {
  en: {
    rightNow: "Right now: ",
    putIn: (amt: string, price: string, at: string) => `Put in ${amt} at ${price} · ${at}`,
    auto: (name: string, tf: string) => `Added automatically from the “${name}” idea (${tf})`,
    ifSold: "If you sold now",
    priceNow: "Price now",
    safetyAt: "Safety exit at",
    noSafety: "No safety exit",
    target: "Target",
    noTarget: "No target",
    sell: "Sell now (pretend)",
    selling: "Selling…",
    nothingFinished: "{tr.nothingFinished}",
    won: "Won",
    lost: "Lost",
    q1: "1. Which coin?",
    q2: "2. How much pretend money?",
    q2b: "How much pretend money?",
    or: "or",
    amount: "Amount",
    q3: "3. Safety exit — sell automatically if it drops by…",
    noSafetyBtn: "No safety exit",
    q4: "4. Take profit — sell automatically if it rises by…",
    noTargetBtn: "No target",
    fromSignal: "The safety exit and target from this signal are used automatically.",
    done: (coin: string, money: string) => `Done — you “bought” ${coin} with ${money} of pretend money. Follow it on the Practice page.`,
    open: "Open Practice",
    buying: "Buying…",
    buy: (coin: string, money: string) => `Buy ${coin} with ${money} pretend money`,
    note: "Nothing is really bought. The app uses the live price and includes normal exchange fees so the result is realistic.",
  },
  fa: {
    rightNow: "همین الان: ",
    putIn: (amt: string, price: string, at: string) => `${amt} گذاشتید با قیمت ${price} · ${at}`,
    auto: (name: string, tf: string) => `خودکار از روش «${name}» اضافه شد (${tf})`,
    ifSold: "اگر همین الان بفروشید",
    priceNow: "قیمت فعلی",
    safetyAt: "حد ضرر در",
    noSafety: "بدون حد ضرر",
    target: "هدف سود",
    noTarget: "بدون هدف سود",
    sell: "همین الان بفروش (مجازی)",
    selling: "در حال فروش…",
    nothingFinished: "هنوز معامله‌ای تمام نشده. وقتی یک معاملهٔ تمرینی فروخته شود — توسط شما، حد ضرر یا هدف سود — اینجا نمایش داده می‌شود.",
    won: "سود",
    lost: "ضرر",
    q1: "۱. کدام ارز؟",
    q2: "۲. چقدر پول مجازی؟",
    q2b: "چقدر پول مجازی؟",
    or: "یا",
    amount: "مبلغ",
    q3: "۳. حد ضرر — اگر این‌قدر افت کرد، خودکار بفروش…",
    noSafetyBtn: "بدون حد ضرر",
    q4: "۴. هدف سود — اگر این‌قدر بالا رفت، خودکار بفروش…",
    noTargetBtn: "بدون هدف سود",
    fromSignal: "حد ضرر و هدف سودِ همین سیگنال خودکار استفاده می‌شود.",
    done: (coin: string, money: string) => `انجام شد — ${coin} را با ${money} پول مجازی «خریدید». در صفحهٔ معاملهٔ تمرینی دنبالش کنید.`,
    open: "باز کردن معاملهٔ تمرینی",
    buying: "در حال خرید…",
    buy: (coin: string, money: string) => `خرید ${coin} با ${money} پول مجازی`,
    note: "هیچ چیز واقعاً خریده نمی‌شود. برنامه از قیمت زنده استفاده می‌کند و کارمزد معمول صرافی را هم حساب می‌کند تا نتیجه واقعی باشد.",
  },
} satisfies Dict<unknown>;

export interface PracticeTrade {
  id: string;
  symbol: string;
  pair: string | null;
  source: string;
  strategyId: string | null;
  timeframe: string | null;
  status: string;
  entryPrice: number; // USD fill
  entryAt: string;
  quantity: number;
  stopPrice: number | null;
  targetPrice: number | null;
  feeRate: number;
  slippageRate: number;
  /** Real selling cost (fraction), when the trade was opened with the user's buy/sell costs. */
  sellCost?: number | null;
  exitPrice: number | null;
  exitAt: string | null;
  exitReason: string | null;
  netPnl: number | null;
}


/** Net result (USD) if sold now at `price`, including fees and slippage. */
function liveResult(t: PracticeTrade, price: number) {
  // entryPrice already includes the buying cost; selling pays out price × (1 − sellCost).
  if (t.sellCost != null) return (price * (1 - t.sellCost) - t.entryPrice) * t.quantity;
  const exitFill = price * (1 - t.slippageRate);
  const fees = (t.entryPrice + exitFill) * t.quantity * t.feeRate;
  return (exitFill - t.entryPrice) * t.quantity - fees;
}

function useLive(pairs: string[]) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const key = [...new Set(pairs)].sort().join(",");
  useEffect(() => {
    const offs = key ? key.split(",").map((p) => liveFeed().subscribe(p, (t) => setPrices((cur) => (cur[p] === t.price ? cur : { ...cur, [p]: t.price })))) : [];
    return () => offs.forEach((f) => f());
  }, [key]);
  return prices;
}

export function PracticeOpenList({ trades, currency, eurRate, title, empty }: { trades: PracticeTrade[]; currency: Currency; eurRate: number | null; title: string; empty: string }) {
  const router = useRouter();
  const tt = useL(L);
  const t = tt;
  const locale = useLocale();
  const coinName = (sym: string) => coinLabel(sym, locale);
  const prices = useLive(trades.map((t) => t.pair).filter((p): p is string => Boolean(p)));
  const [busy, setBusy] = useState<string | null>(null);
  const conv = (usd: number) => (currency !== "USD" && eurRate ? usd * eurRate : usd);
  const cur: Currency = currency !== "USD" && eurRate ? currency : "USD";
  const total = useMemo(() => trades.reduce((a, t) => (t.pair && prices[t.pair] ? a + liveResult(t, prices[t.pair]) : a), 0), [trades, prices]);

  async function sell(id: string) {
    setBusy(id);
    try {
      await api(`/api/paper/${id}/close`, { method: "POST" });
      router.refresh();
    } catch (e) {
      alert(errorText((e as Error).message, locale));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{title} <span className="text-ink-2">({trades.length})</span></h2>
        {trades.length > 0 && (
          <span className={cn("rounded-lg px-2 py-1 text-sm font-semibold tabular", total > 0 ? "bg-good/15 text-good-ink" : total < 0 ? "bg-bad/15 text-bad-ink" : "bg-surface-2 text-ink-2")}>
            {t.rightNow}<span className="ltr">{total >= 0 ? "+" : ""}{fmtMoney(conv(total), cur)}</span>
          </span>
        )}
      </div>
      {trades.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-2">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {trades.map((t) => {
            const tr = tt;
            const now = t.pair ? prices[t.pair] : undefined;
            const res = now ? liveResult(t, now) : null;
            const invested = t.entryPrice * t.quantity;
            const pct = res !== null && invested > 0 ? (res / invested) * 100 : null;
            return (
              <li key={t.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{coinName(t.symbol)}</div>
                    <div className="text-sm text-ink-2">
                      {tr.putIn(fmtMoney(conv(invested), cur), fmtPrice(conv(t.entryPrice), cur), fmtDate(t.entryAt, true, locale))}
                    </div>
                    {t.source === "AUTO_SIGNAL" && t.strategyId && <div className="text-xs text-ink-2">{tr.auto(strategyName(t.strategyId, locale), timeframePlain(t.timeframe ?? "", locale))}</div>}
                  </div>
                  <div className="text-end">
                    <div className="text-xs text-ink-2">{tr.ifSold}</div>
                    <div className={cn("ltr rounded-lg px-2 py-1 text-lg font-bold tabular transition-colors", res === null ? "text-ink-2" : res >= 0 ? "bg-good/15 text-good-ink" : "bg-bad/15 text-bad-ink")}>
                      {res === null ? "…" : `${res >= 0 ? "+" : ""}${fmtMoney(conv(res), cur)}`}
                      {pct !== null && <span className="ms-1 text-sm font-medium">({pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)</span>}
                    </div>
                    {now && <div className="mt-1 text-xs text-ink-2">{tr.priceNow} <span className="ltr">{fmtPrice(conv(now), cur)}</span></div>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-ink-2">
                    {t.stopPrice ? <>{tr.safetyAt} <b className="ltr text-bad-ink">{fmtPrice(conv(t.stopPrice), cur)}</b></> : tr.noSafety}
                    {" · "}
                    {t.targetPrice ? <>{tr.target} <b className="ltr text-good-ink">{fmtPrice(conv(t.targetPrice), cur)}</b></> : tr.noTarget}
                  </span>
                  <Button variant="secondary" disabled={busy === t.id} onClick={() => sell(t.id)}>{busy === t.id ? tr.selling : tr.sell}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function PracticeHistory({ trades, currency, eurRate }: { trades: PracticeTrade[]; currency: Currency; eurRate: number | null }) {
  const tr = useL(L);
  const locale = useLocale();
  const coinName = (sym: string) => coinLabel(sym, locale);
  const conv = (usd: number) => (currency !== "USD" && eurRate ? usd * eurRate : usd);
  const cur: Currency = currency !== "USD" && eurRate ? currency : "USD";
  if (!trades.length) return <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-2">Nothing finished yet. When a practice trade is sold — by you, the safety exit or the target — it appears here.</p>;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {trades.map((t) => {
        const won = (t.netPnl ?? 0) > 0;
        return (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <div>
              <b>{coinName(t.symbol)}</b> <span className="text-ink-2">· {exitReasonPlain(t.exitReason, locale)} · {fmtDate(t.exitAt, true, locale)}</span>
            </div>
            <span className={cn("rounded-lg px-2 py-0.5 font-semibold tabular", won ? "bg-good/15 text-good-ink" : "bg-bad/15 text-bad-ink")}>
              {won ? tr.won : tr.lost} <span className="ltr">{fmtMoney(Math.abs(conv(t.netPnl ?? 0)), cur)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const AMOUNTS = [50, 100, 250, 500];
const STOPS = [null, 3, 5, 10, 20];
const TARGETS = [null, 5, 10, 20, 50];

export function PracticeNew({ symbols, currency, signalId, defaultSymbol, stopPrice, targetPrice }: { symbols: string[]; currency: Currency; signalId?: string; defaultSymbol?: string; stopPrice?: number | null; targetPrice?: number | null }) {
  const router = useRouter();
  const tr = useL(L);
  const locale = useLocale();
  const coinName = (sym: string) => coinLabel(sym, locale);
  const [symbol, setSymbol] = useState(defaultSymbol ?? symbols[0] ?? "");
  const [amount, setAmount] = useState("100");
  const [stopPct, setStopPct] = useState<number | null>(5);
  const [targetPct, setTargetPct] = useState<number | null>(10);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fromSignal = Boolean(signalId);
  // Practice amounts are typed in euros or dollars (Toman mode uses euros).
  const sym = currency === "USD" ? "$" : "€";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/paper", {
        body: {
          symbol,
          amount: Number(amount),
          amountCurrency: currency,
          signalId: signalId ?? null,
          ...(fromSignal ? { stopPrice: stopPrice ?? null, targetPrice: targetPrice ?? null } : { stopPct, targetPct }),
          notes: fromSignal ? "From a signal" : "Practice",
        },
      });
      setMsg({ tone: "success", text: tr.done(coinName(symbol), `${sym}${amount}`) });
      router.refresh();
    } catch (e2) {
      setMsg({ tone: "error", text: errorText((e2 as Error).message, locale) });
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean) => cn("min-h-10 rounded-lg px-3 text-sm ring-1", active ? "bg-accent text-accent-ink ring-accent" : "bg-surface text-ink ring-line hover:bg-surface-2");
  return (
    <form onSubmit={submit} className="space-y-4">
      {!fromSignal && (
        <div>
          <div className="mb-1.5 text-sm font-medium">{tr.q1}</div>
          <div className="flex flex-wrap gap-2">
            {symbols.map((s) => (
              <button key={s} type="button" className={chip(symbol === s)} onClick={() => setSymbol(s)} aria-pressed={symbol === s}>{coinName(s)}</button>
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="mb-1.5 text-sm font-medium">{fromSignal ? tr.q2b : tr.q2}</div>
        <div className="flex flex-wrap items-center gap-2">
          {AMOUNTS.map((a) => (
            <button key={a} type="button" className={chip(amount === String(a))} onClick={() => setAmount(String(a))} aria-pressed={amount === String(a)}>{sym}{a}</button>
          ))}
          <label className="inline-flex items-center gap-1 text-sm text-ink-2">
            {tr.or}
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="1" step="any" aria-label={tr.amount} className="ltr min-h-10 w-28 rounded-lg border border-line bg-surface px-3 text-ink" />
          </label>
        </div>
      </div>
      {!fromSignal && (
        <>
          <div>
            <div className="mb-1 text-sm font-medium">{tr.q3}</div>
            <div className="flex flex-wrap gap-2">
              {STOPS.map((s) => (
                <button key={String(s)} type="button" className={chip(stopPct === s)} onClick={() => setStopPct(s)} aria-pressed={stopPct === s}>{s ? <span className="ltr">−{s}%</span> : tr.noSafetyBtn}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">{tr.q4}</div>
            <div className="flex flex-wrap gap-2">
              {TARGETS.map((t) => (
                <button key={String(t)} type="button" className={chip(targetPct === t)} onClick={() => setTargetPct(t)} aria-pressed={targetPct === t}>{t ? <span className="ltr">+{t}%</span> : tr.noTargetBtn}</button>
              ))}
            </div>
          </div>
        </>
      )}
      {fromSignal && <p className="text-sm text-ink-2">{tr.fromSignal}</p>}
      {msg && <Alert tone={msg.tone}>{msg.text}{msg.tone === "success" && <> <Link className="underline" href="/paper">{tr.open}</Link></>}</Alert>}
      <Button type="submit" disabled={busy || !symbol || !(Number(amount) > 0)} className="w-full sm:w-auto">
        {busy ? tr.buying : tr.buy(coinName(symbol), `${sym}${amount || 0}`)}
      </Button>
      <p className="text-xs text-ink-2">{tr.note}</p>
    </form>
  );
}
