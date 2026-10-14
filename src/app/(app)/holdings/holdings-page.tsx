"use client";
/**
 * "My assets": the coins the user owns, typed in by hand. Shows what each is worth
 * right now (live), what the user would receive after the selling cost, and — only
 * for purchases where the user entered a price — the profit or loss.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { coinStyle } from "@/lib/coin-style";
import { fmtMoney, fmtNum, GOLD_TOKENS, TROY_OUNCE_GRAMS, type Currency } from "@/lib/format";
import type { HoldingsView } from "@/lib/holdings/service";
import { dateLocale, type Dict, type Locale } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";
import { liveFeed } from "@/lib/live/prices";
import { coinFullName, coinLabel } from "@/lib/plain";

const L = {
  en: {
    title: "My assets",
    intro: "Write down the coins you own. The app shows what they are worth right now — each coin and all together.",
    total: "All my assets now",
    afterSell: (v: string, pct: string) => `If you sold everything now you would receive about ${v} (after your ${pct}% selling cost).`,
    profit: "Profit / loss",
    profitNote: (n: number) => `Only for purchases where you entered a price${n ? ` (${n} without a price are not counted)` : ""}.`,
    noProfit: "Enter a purchase price to see your profit or loss.",
    empty: "You haven't added any coins yet. Add the first one below.",
    add: "Add a coin I own",
    edit: "Change this purchase",
    coin: "Coin",
    coinPh: "Name or ticker, e.g. Bitcoin or BTC",
    amount: "How much do you have?",
    grams: "grams",
    coins: (s: string) => s,
    remember: "I remember what I paid (optional)",
    perCoin: "Price of 1 coin",
    perGram: "Price of 1 gram",
    totalPaid: "Total I paid",
    date: "Date (optional)",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    remove: "Remove",
    confirmRemove: (c: string) => `Remove this ${c} entry?`,
    change: "Change",
    worth: "worth now",
    share: (p: string) => `${p} of all`,
    paid: (v: string) => `you paid ${v}`,
    lots: (n: number) => `${n} purchases`,
    noPrice: "no price entered",
    noLivePrice: "price not available",
    bought: (d: string) => `bought ${d}`,
    sinceBuy: "since you bought",
    tomanNote: "Prices you entered in Toman are compared in Toman, so inflation of the Toman is included in the result.",
    costNote: (pct: string) => `“Worth now” is the market value. When you sell, your exchange keeps about ${pct}%.`,
    chart: "Chart & advice →",
    invalid: "Enter an amount greater than zero.",
  },
  fa: {
    title: "دارایی‌های من",
    intro: "ارزهایی را که دارید یادداشت کنید. برنامه نشان می‌دهد همین الان چقدر می‌ارزند — هر ارز جدا و همه با هم.",
    total: "همهٔ دارایی‌های من الان",
    afterSell: (v: string, pct: string) => `اگر همین الان همه را بفروشید حدود ${v} دریافت می‌کنید (بعد از ${pct}٪ هزینهٔ فروش).`,
    profit: "سود / زیان",
    profitNote: (n: number) => `فقط برای خریدهایی که قیمتش را وارد کرده‌اید${n ? ` (${n} خرید بدون قیمت حساب نشده)` : ""}.`,
    noProfit: "برای دیدن سود یا زیان، قیمت خرید را وارد کنید.",
    empty: "هنوز ارزی اضافه نکرده‌اید. اولین را پایین اضافه کنید.",
    add: "افزودن ارزی که دارم",
    edit: "تغییر این خرید",
    coin: "ارز",
    coinPh: "نام یا نماد، مثلاً بیت‌کوین یا BTC",
    amount: "چقدر دارید؟",
    grams: "گرم",
    coins: (s: string) => s,
    remember: "قیمتی که پرداختم را یادم هست (اختیاری)",
    perCoin: "قیمت 1 واحد",
    perGram: "قیمت 1 گرم",
    totalPaid: "کل مبلغی که پرداختم",
    date: "تاریخ (اختیاری)",
    save: "ذخیره",
    saving: "در حال ذخیره…",
    cancel: "انصراف",
    remove: "حذف",
    confirmRemove: (c: string) => `این خرید ${c} حذف شود؟`,
    change: "تغییر",
    worth: "ارزش الان",
    share: (p: string) => `${p} از کل`,
    paid: (v: string) => `پرداختی شما ${v}`,
    lots: (n: number) => `${n} خرید`,
    noPrice: "قیمت وارد نشده",
    noLivePrice: "قیمت در دسترس نیست",
    bought: (d: string) => `خرید ${d}`,
    sinceBuy: "از زمان خرید",
    tomanNote: "قیمت‌هایی که به تومان وارد کرده‌اید به تومان مقایسه می‌شوند؛ پس اثر تورم تومان هم در نتیجه هست.",
    costNote: (pct: string) => `«ارزش الان» قیمت بازار است. هنگام فروش، صرافی حدود ${pct}٪ برمی‌دارد.`,
    chart: "نمودار و پیشنهاد ←",
    invalid: "مقداری بیشتر از صفر وارد کنید.",
  },
} satisfies Dict<unknown>;
type T = (typeof L)["en"];
type Lot = HoldingsView["lots"][number];

/** Keeps numbers left-to-right inside Persian sentences. */
const iso = (x: string) => `⁦${x}⁩`;
const pctText = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
const parseNum = (s: string) => {
  const n = Number(s.replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0)).replace(/[,٬،\s]/g, "").replace(/٫/g, "."));
  return Number.isFinite(n) ? n : NaN;
};

function useLivePrices(pairs: (string | null)[]) {
  const [p, setP] = useState<Record<string, number>>({});
  const key = [...new Set(pairs.filter(Boolean) as string[])].sort().join(",");
  useEffect(() => {
    const offs = key ? key.split(",").map((pair) => liveFeed().subscribe(pair, (t) => setP((c) => (c[pair] === t.price ? c : { ...c, [pair]: t.price })))) : [];
    return () => offs.forEach((f) => f());
  }, [key]);
  return p;
}

export function HoldingsPage({ initial }: { initial: HoldingsView }) {
  const t = useL(L);
  const locale = useLocale();
  const [view, setView] = useState(initial);
  const [editing, setEditing] = useState<Lot | null>(null);
  const live = useLivePrices(view.lots.map((l) => l.pair));
  const cur = view.currency;
  const reload = async () => setView(await api<HoldingsView>("/api/holdings"));

  /** Multiply a USD amount by this to get `c`; null when the rate is missing. */
  const usdTo = (c: Currency) => (c === "USD" ? 1 : c === "EUR" ? view.eurPerUsd : view.eurPerUsd && view.tomanPerEur ? view.eurPerUsd * view.tomanPerEur : null);
  const priceUsd = (l: Lot) => (l.pair && live[l.pair] ? live[l.pair] : l.priceUsd);

  const coins = useMemo(() => {
    const by = new Map<string, { symbol: string; name: string; qty: number; value: number | null; pl: number; cost: number; unpriced: number; lots: Lot[] }>();
    for (const l of view.lots) {
      const g = by.get(l.symbol) ?? { symbol: l.symbol, name: l.name, qty: 0, value: 0, pl: 0, cost: 0, unpriced: 0, lots: [] };
      g.lots.push(l);
      g.qty += l.quantity;
      const p = priceUsd(l);
      if (p === null || g.value === null) g.value = null;
      else g.value += l.quantity * p * view.rate;
      const k = l.buyCurrency ? usdTo(l.buyCurrency) : null;
      if (l.buyPrice !== null && l.buyCurrency && k && p !== null) {
        // Profit in the purchase currency (after the selling cost), shown in the display currency.
        const plInCur = l.quantity * p * k * (1 - view.sellCost) - l.quantity * l.buyPrice;
        g.pl += (plInCur / k) * view.rate;
        g.cost += ((l.quantity * l.buyPrice) / k) * view.rate;
      } else g.unpriced++;
      by.set(l.symbol, g);
    }
    return [...by.values()].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from view + live prices
  }, [view, live]);

  const total = coins.reduce((a, c) => a + (c.value ?? 0), 0);
  const totalPl = coins.reduce((a, c) => a + c.pl, 0);
  const totalCost = coins.reduce((a, c) => a + c.cost, 0);
  const unpriced = coins.reduce((a, c) => a + c.unpriced, 0);
  const sellPct = (view.sellCost * 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const money = (v: number) => fmtMoney(v, cur);
  const hasToman = view.lots.some((l) => l.buyCurrency === "IRT");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="mt-1 text-ink-2">{t.intro}</p>
      </div>

      {/* Total */}
      <section className="neo p-5 sm:p-7">
        <div className="f-m lo text-xs tracking-wide uppercase">{t.total}</div>
        <div className="f-d ltr mt-1 w-fit text-3xl font-bold sm:text-4xl">{money(total)}</div>
        {total > 0 && <p className="mid mt-2 text-sm">{t.afterSell(iso(money(total * (1 - view.sellCost))), sellPct)}</p>}
        <div className="mt-4 border-t line-b0 pt-4">
          <div className="f-m lo text-xs tracking-wide uppercase">{t.profit}</div>
          {totalCost > 0 ? (
            <>
              <div className={cn("f-d ltr mt-1 w-fit text-2xl font-bold", totalPl >= 0 ? "up" : "down")}>{totalPl >= 0 ? "+" : "−"}{fmtMoney(Math.abs(totalPl), cur)} <span className="text-base">({pctText((totalPl / totalCost) * 100)})</span></div>
              <p className="lo mt-1 text-xs">{t.profitNote(unpriced)}</p>
            </>
          ) : (
            <p className="mid mt-1 text-sm">{t.noProfit}</p>
          )}
        </div>
        {/* Share of each coin */}
        {total > 0 && coins.length > 1 && (
          <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full" aria-hidden>
            {coins.map((c) => (c.value ? <span key={c.symbol} style={{ width: `${(c.value / total) * 100}%`, background: coinStyle(c.symbol).bg }} className="border-e-2 border-[#161624] last:border-e-0" /> : null))}
          </div>
        )}
      </section>

      {/* Per coin */}
      {coins.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-ink-2">{t.empty}</p>
      ) : (
        <ul className="space-y-3">
          {coins.map((c) => {
            const st = coinStyle(c.symbol);
            const gold = GOLD_TOKENS.has(c.symbol);
            const amount = gold ? `${fmtNum(c.qty * TROY_OUNCE_GRAMS, 2)} ${t.grams}` : `${fmtNum(c.qty, c.qty >= 100 ? 2 : 6)} ${c.symbol}`;
            return (
              <li key={c.symbol} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="coin-ico h-10 w-10 text-sm" style={{ background: st.bg }} aria-hidden>{st.glyph}</span>
                    <div className="min-w-0">
                      <div className="text-lg font-semibold">{coinLabel(c.symbol, locale)} <span className="text-sm font-normal text-ink-2">{coinFullName(c.symbol, c.name, locale)}</span></div>
                      <div className="ltr w-fit text-sm text-ink-2">{amount}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-start sm:items-end">
                    <div className="ltr w-fit text-xl font-semibold tabular">{c.value === null ? "—" : money(c.value)}</div>
                    <div className="text-xs text-ink-2">{c.value === null ? t.noLivePrice : `${t.worth} · ${t.share(iso(`${total ? Math.round((c.value / total) * 100) : 0}%`))}`}</div>
                    {c.cost > 0 && <div className={cn("ltr mt-1 w-fit rounded-md px-1.5 text-sm font-semibold", c.pl >= 0 ? "bg-good/15 text-good-ink" : "bg-bad/15 text-bad-ink")}>{c.pl >= 0 ? "+" : "−"}{money(Math.abs(c.pl))} ({pctText((c.pl / c.cost) * 100)})</div>}
                  </div>
                </div>
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-ink-2">{t.lots(c.lots.length)}</summary>
                  <ul className="mt-2 divide-y divide-line">
                    {c.lots.map((l) => <LotRow key={l.id} l={l} t={t} locale={locale} gold={gold} onEdit={() => setEditing(l)} onRemoved={reload} />)}
                  </ul>
                </details>
                <Link href={`/assets/${c.symbol}`} className="mt-2 inline-block text-sm text-accent">{t.chart}</Link>
              </li>
            );
          })}
        </ul>
      )}

      <HoldingForm key={editing?.id ?? "new"} t={t} locale={locale} view={view} editing={editing} onDone={async () => { setEditing(null); await reload(); }} onCancel={() => setEditing(null)} />

      <div className="space-y-1 text-xs text-ink-2">
        <p>{t.costNote(sellPct)}</p>
        {hasToman && <p>{t.tomanNote}</p>}
      </div>
    </div>
  );
}

function LotRow({ l, t, locale, gold, onEdit, onRemoved }: { l: Lot; t: T; locale: Locale; gold: boolean; onEdit: () => void; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false);
  const amount = gold ? `${fmtNum(l.quantity * TROY_OUNCE_GRAMS, 2)} ${t.grams}` : `${fmtNum(l.quantity, l.quantity >= 100 ? 2 : 6)} ${l.symbol}`;
  const paid = l.buyPrice !== null && l.buyCurrency ? fmtMoney(l.quantity * l.buyPrice, l.buyCurrency) : null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div>
        <span className="ltr inline-block font-medium">{amount}</span>
        <span className="text-ink-2"> · {paid ? t.paid(iso(paid)) : t.noPrice}</span>
        {l.boughtAt && <span className="text-ink-2"> · {t.bought(new Date(l.boughtAt).toLocaleDateString(dateLocale(locale), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }))}</span>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onEdit} className="min-h-9 rounded-lg border border-line px-3 text-sm hover:bg-surface-2">{t.change}</button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!confirm(t.confirmRemove(coinLabel(l.symbol, locale)))) return;
            setBusy(true);
            await api(`/api/holdings/${l.id}`, { method: "DELETE" }).catch((e) => alert(errorText((e as Error).message, locale)));
            setBusy(false);
            onRemoved();
          }}
          className="min-h-9 rounded-lg px-3 text-sm text-bad-ink hover:bg-bad/10 disabled:opacity-50"
        >
          {t.remove}
        </button>
      </div>
    </li>
  );
}

function HoldingForm({ t, locale, view, editing, onDone, onCancel }: { t: T; locale: Locale; view: HoldingsView; editing: Lot | null; onDone: () => Promise<void>; onCancel: () => void }) {
  const gold0 = editing ? GOLD_TOKENS.has(editing.symbol) : false;
  const [coin, setCoin] = useState(editing?.symbol ?? view.watchlist[0]?.symbol ?? "BTC");
  const isGold = GOLD_TOKENS.has(coin.toUpperCase()) || /^(gold|طلا)$/i.test(coin.trim());
  const [amount, setAmount] = useState(editing ? String(gold0 ? +(editing.quantity * TROY_OUNCE_GRAMS).toFixed(4) : editing.quantity) : "");
  const [remember, setRemember] = useState(!!editing?.buyPrice);
  const [kind, setKind] = useState<"perCoin" | "total">("perCoin");
  const [price, setPrice] = useState(editing?.buyPrice ? String(gold0 ? +(editing.buyPrice / TROY_OUNCE_GRAMS).toFixed(2) : editing.buyPrice) : "");
  const [priceCur, setPriceCur] = useState<Currency>(editing?.buyCurrency ?? (view.currency === "USD" ? "USD" : view.currency));
  const [date, setDate] = useState(editing?.boughtAt?.slice(0, 10) ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const curNames: Record<Currency, string> = locale === "fa" ? { EUR: "یورو", USD: "دلار", IRT: "تومان" } : { EUR: "€ Euro", USD: "$ Dollar", IRT: "Toman" };
  const chip = (on: boolean) => cn("min-h-9 rounded-full px-3 text-sm ring-1", on ? "bg-accent text-accent-ink ring-accent" : "ring-line hover:bg-surface-2");
  const input = "ltr min-h-10 w-full rounded-lg border border-line bg-surface px-3";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const a = parseNum(amount);
    if (!(a > 0)) return setErr(t.invalid);
    const pv = parseNum(price);
    const body = {
      amount: a,
      unit: isGold ? ("gram" as const) : ("coin" as const),
      price: remember && pv > 0 ? { kind, value: pv, currency: priceCur } : null,
      boughtAt: remember && date ? date : null,
    };
    setBusy(true);
    setErr(null);
    try {
      if (editing) await api(`/api/holdings/${editing.id}`, { method: "PATCH", body });
      else await api("/api/holdings", { body: { ...body, coin: coin.trim() } });
      await onDone();
      setAmount("");
      setPrice("");
      setDate("");
    } catch (e2) {
      setErr(errorText((e2 as Error).message, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-lg font-semibold">{editing ? `${t.edit}: ${coinLabel(editing.symbol, locale)}` : t.add}</h2>
      {!editing && (
        <div>
          <div className="mb-1.5 text-sm font-medium">{t.coin}</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {view.watchlist.map((w) => (
              <button key={w.symbol} type="button" className={chip(coin === w.symbol)} onClick={() => setCoin(w.symbol)}>{coinLabel(w.symbol, locale)}</button>
            ))}
          </div>
          <input value={coin} onChange={(e) => setCoin(e.target.value)} placeholder={t.coinPh} aria-label={t.coin} maxLength={40} dir="auto" className="min-h-10 w-full rounded-lg border border-line bg-surface px-3 sm:w-72" />
        </div>
      )}
      <label className="block text-sm font-medium">
        {t.amount}
        <span className="mt-1.5 flex items-center gap-2">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={isGold ? "10" : "0.05"} aria-label={t.amount} className={cn(input, "sm:w-48")} />
          <span className="text-ink-2">{isGold ? t.grams : t.coins(coin.toUpperCase())}</span>
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {t.remember}
      </label>
      {remember && (
        <div className="space-y-3 rounded-xl bg-surface-2 p-3">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={chip(kind === "perCoin")} onClick={() => setKind("perCoin")}>{isGold ? t.perGram : t.perCoin}</button>
            <button type="button" className={chip(kind === "total")} onClick={() => setKind("total")}>{t.totalPaid}</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-label={kind === "total" ? t.totalPaid : t.perCoin} className={cn(input, "w-44")} />
            <select value={priceCur} onChange={(e) => setPriceCur(e.target.value as Currency)} className="min-h-10 rounded-lg border border-line bg-surface px-2" aria-label="currency">
              {(["EUR", "USD", "IRT"] as const).map((c) => <option key={c} value={c}>{curNames[c]}</option>)}
            </select>
          </div>
          <label className="block text-sm">
            {t.date}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(input, "mt-1 sm:w-48")} />
          </label>
        </div>
      )}
      {err && <Alert tone="error">{err}</Alert>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-ink disabled:opacity-60">{busy ? t.saving : t.save}</button>
        {editing && <button type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-line px-4 text-sm">{t.cancel}</button>}
      </div>
    </form>
  );
}
