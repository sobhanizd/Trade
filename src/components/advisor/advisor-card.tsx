"use client";
/** "Trader's advice" on a coin page: one clear action, when, why, what next, and how sure. */
import { useEffect, useState } from "react";
import { Alert, Skeleton } from "@/components/ui";
import type { CoinAdvice } from "@/lib/analysis/advice-service";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { fmtNum, fmtPrice, type Currency } from "@/lib/format";
import { dateLocale, type Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";
import { ACTION, changeMindLines, confidenceText, outlookLines, partText, PATTERN, TONE_CLS, whenText, type Fmt } from "./texts";

const L = {
  en: {
    title: (c: string) => `🧑‍💼 Trader's advice for ${c}`,
    loading: "Reading the chart, patterns, history and news…",
    error: "The advice could not be loaded",
    none: "Not enough price history yet to give advice.",
    when: "When",
    own: (q: string, v: string, g: string) => `You own ${q} (worth ${v} if sold now, after the selling cost; ${g} vs what you paid).`,
    ownNoCost: (q: string, v: string) => `You own ${q} (worth ${v} if sold now, after the selling cost). Add your buy price in "My assets" to see your profit.`,
    newMoney: "For new money:",
    planNote: "Your monthly plan still buys its normal amount — this advice is about extra money.",
    why: "Why",
    patterns: "Chart patterns found (last 5 days)",
    patternTrack: (up: number, n: number, base: string) => `After it, 30 days later it was higher in ${up} of ${n} cases (normally ${base}).`,
    patternRare: "Too rare on this coin to judge.",
    patternNoEdge: "→ no clear edge on this coin.",
    patternUp: "→ leaned up on this coin.",
    patternDown: "→ leaned down on this coin.",
    next: "What happened next in the past",
    change: "What would change the advice",
    alertBuy: (p: string) => `🔔 Tell me when it drops to ${p}`,
    alertStop: (p: string) => `🔔 Tell me if it falls to ${p}`,
    alertUp: (p: string) => `🔔 Tell me if it rises above ${p}`,
    alertSet: "Alert set — you'll get a notification.",
    alertNote: (c: string) => `Trader's advice for ${c}`,
    honest: "Nobody — no trader, bank or app — can know whether the price goes up tomorrow. This advice uses what really happened before on this coin to help you avoid the costly mistakes: buying into a crash, panic-selling, never taking profit, and having no safety level. You decide and place every order yourself.",
  },
  fa: {
    title: (c: string) => `🧑‍💼 نظر معامله‌گر دربارهٔ ${c}`,
    loading: "در حال بررسی نمودار، الگوها، تاریخچه و خبرها…",
    error: "نظر معامله‌گر بارگذاری نشد",
    none: "هنوز تاریخچهٔ قیمت کافی برای نظر دادن نیست.",
    when: "کِی",
    own: (q: string, v: string, g: string) => `شما ${q} دارید (اگر الان بفروشید، بعد از هزینهٔ فروش ${v}؛ ${g} نسبت به قیمت خرید).`,
    ownNoCost: (q: string, v: string) => `شما ${q} دارید (اگر الان بفروشید، بعد از هزینهٔ فروش ${v}). برای دیدن سود، قیمت خرید را در «دارایی‌های من» وارد کنید.`,
    newMoney: "برای پول جدید:",
    planNote: "برنامهٔ ماهانهٔ شما همچنان مبلغ معمولش را می‌خرد — این نظر دربارهٔ پول اضافه است.",
    why: "چرا",
    patterns: "الگوهای نمودار (5 روز اخیر)",
    patternTrack: (up: number, n: number, base: string) => `بعد از آن، 30 روز بعد در ${up} مورد از ${n} مورد بالاتر بود (معمولاً ${base}).`,
    patternRare: "روی این ارز خیلی کم پیش آمده و نمی‌شود قضاوت کرد.",
    patternNoEdge: "← روی این ارز مزیت واضحی نداشته.",
    patternUp: "← روی این ارز بیشتر به بالا رفتن ختم شده.",
    patternDown: "← روی این ارز بیشتر به پایین آمدن ختم شده.",
    next: "در گذشته بعدش چه شد",
    change: "چه چیزی نظر را عوض می‌کند",
    alertBuy: (p: string) => `🔔 وقتی به ${p} رسید خبرم کن`,
    alertStop: (p: string) => `🔔 اگر تا ${p} افتاد خبرم کن`,
    alertUp: (p: string) => `🔔 اگر بالای ${p} رفت خبرم کن`,
    alertSet: "هشدار ثبت شد — اعلان دریافت می‌کنید.",
    alertNote: (c: string) => `نظر معامله‌گر برای ${c}`,
    honest: "هیچ‌کس — نه معامله‌گر، نه بانک، نه برنامه — نمی‌تواند بداند قیمت فردا بالا می‌رود یا نه. این نظر از آنچه واقعاً قبلاً روی همین ارز اتفاق افتاده استفاده می‌کند تا از اشتباه‌های گران دور بمانید: خرید وسط ریزش، فروش از روی ترس، هیچ‌وقت سود برنداشتن، و نداشتن حد ایمنی. تصمیم و ثبت سفارش همیشه با خودتان است.",
  },
} satisfies Dict<unknown>;

type Resp = { advice: CoinAdvice | null; currency: Currency; rate: number };

export function AdvisorCard({ symbol, coin }: { symbol: string; coin: string }) {
  const t = useL(L);
  const l = useLocale();
  const [res, setRes] = useState<{ data: Resp | null; error: string | null } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    let alive = true;
    api<Resp>(`/api/assets/${encodeURIComponent(symbol)}/advice`)
      .then((d) => alive && setRes({ data: d, error: null }))
      .catch((e) => alive && setRes({ data: null, error: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [symbol]);

  if (!res) return <section className="mb-4 rounded-2xl border border-line bg-surface p-5"><p className="text-sm text-ink-2">{t.loading}</p><Skeleton className="mt-3 h-40 w-full" /></section>;
  if (res.error) return <Alert tone="error" className="mb-4" title={t.error}>{errorText(res.error, l)}</Alert>;
  const a = res.data?.advice;
  if (!a || !res.data) return <Alert tone="info" className="mb-4">{t.none}</Alert>;
  const { currency, rate } = res.data;
  const f: Fmt = {
    l,
    coin,
    money: (usd) => (usd == null ? "—" : fmtPrice(usd * rate, currency)),
    date: (ms) => new Date(ms).toLocaleDateString(dateLocale(l), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
  };
  const act = ACTION[a.action];
  const fresh = ACTION[a.forNewMoney];
  const owns = !!a.holding;

  const alert = async (direction: "ABOVE" | "BELOW", usd: number) => {
    setMsg(null);
    try {
      await api("/api/alerts/price", { body: { symbol, direction, price: Number(usd.toPrecision(8)), note: t.alertNote(coin) } });
      setMsg({ ok: true, text: t.alertSet });
    } catch (e) {
      setMsg({ ok: false, text: errorText((e as Error).message, l) });
    }
  };
  const btn = "min-h-9 rounded-lg px-3 text-sm ring-1 ring-line bg-surface hover:bg-surface-2";
  const sign = { plus: "✅", minus: "⚠️", zero: "➖" };

  return (
    <section className="mb-4 rounded-2xl border border-line bg-surface p-5" aria-label={t.title(coin)}>
      <h2 className="text-lg font-semibold">{t.title(coin)}</h2>

      <div className={cn("mt-3 rounded-xl p-4 ring-1", TONE_CLS[act.tone])}>
        <div className="text-2xl font-extrabold">{act.icon} {act[l]}</div>
        <p className="mt-1 text-base text-ink"><b>{t.when}:</b> {whenText(a, a.action, f)}</p>
        {owns && a.holding && (
          <p className="mt-2 text-sm text-ink">
            {a.holding.gainPct !== null ? t.own(fmtNum(a.holding.quantity, 6), f.money(a.holding.valueUsd), `${a.holding.gainPct >= 0 ? "+" : ""}${a.holding.gainPct.toFixed(1)}%`) : t.ownNoCost(fmtNum(a.holding.quantity, 6), f.money(a.holding.valueUsd))}{" "}
            <b>{t.newMoney}</b> {fresh.icon} {fresh[l]} — {whenText(a, a.forNewMoney, f)}
          </p>
        )}
        {["avoid", "noEdge", "waitDip", "pause"].includes(a.forNewMoney) && <p className="mt-2 text-xs text-ink-2">{t.planNote}</p>}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {a.buyLevel && ["waitDip", "buyParts", "noEdge"].includes(a.forNewMoney) && <button type="button" className={btn} onClick={() => void alert("BELOW", a.buyLevel!)}>{t.alertBuy(f.money(a.buyLevel))}</button>}
        {a.stopLevel && <button type="button" className={btn} onClick={() => void alert("BELOW", a.stopLevel!)}>{t.alertStop(f.money(a.stopLevel))}</button>}
        {a.upTrigger && a.upTrigger > a.close && <button type="button" className={btn} onClick={() => void alert("ABOVE", a.upTrigger!)}>{t.alertUp(f.money(a.upTrigger))}</button>}
      </div>
      {msg && <p role="status" className={cn("mt-2 text-sm", msg.ok ? "text-good-ink" : "text-bad-ink")}>{msg.text}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-1 font-semibold">{t.why}</h3>
          <ul className="space-y-1.5 text-sm">
            {a.parts.map((p, i) => {
              const x = partText(p, f);
              return <li key={i}>{sign[x.sign]} {x.text}</li>;
            })}
          </ul>
          <p className="mt-2 text-sm font-medium">{confidenceText(a, l)}</p>
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="mb-1 font-semibold">{t.next}</h3>
            <ul className="space-y-1.5 text-sm">{outlookLines(a, f).map((x, i) => <li key={i}>• {x}</li>)}</ul>
          </div>
          <div>
            <h3 className="mb-1 font-semibold">{t.change}</h3>
            <ul className="space-y-1.5 text-sm">{changeMindLines(a, f).map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        </div>
      </div>

      {a.patterns.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 font-semibold">{t.patterns}</h3>
          <ul className="space-y-2 text-sm">
            {a.patterns.map((p) => (
              <li key={p.id} className="rounded-lg bg-surface-2 px-3 py-2">
                <b>{PATTERN[p.id][l]}</b> — {PATTERN[p.id].what[l]}{" "}
                {p.after30 && p.lean !== "rare" ? <>{t.patternTrack(p.after30.up, p.after30.n, `${Math.round(p.after30.baseUp * 100)}%`)} {p.lean === "up" ? t.patternUp : p.lean === "down" ? t.patternDown : t.patternNoEdge}</> : t.patternRare}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-ink-2">{t.honest}</p>
    </section>
  );
}
