"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { ActionPill } from "@/components/verdict-card";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { fmtMoney, fmtNum, fmtPrice } from "@/lib/format";
import { liveFeed } from "@/lib/live/prices";
import { requiredGrowth, STYLES, type CustomMix, type PlanStyle, type StyleKey } from "@/lib/plan/allocate";
import type { HistoryResult, MixSearch, MixStats } from "@/lib/plan/history";
import { stagedLevels } from "@/lib/plan/history";
import { allocateSmart, buyTiming, scaleGoal, type CoinFeatures, type SmartFactor, type SmartNote, type SmartPlan } from "@/lib/plan/smart";
import type { Action } from "@/lib/signals/verdict";
import { dateLocale } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";
import { coinLabel } from "@/lib/plain";
import { PL } from "./plan-i18n";
import { Toman } from "@/components/toman/context";

type PlanSettingsData = { monthlyAmount: number; buyDay: 0 | 1 | 15; style: StyleKey; custom: CustomMix | null; extraAmount: number; spreadMonths: number; goalAmount: number; goalYears: number; minOrderEur: number };

export interface PlanView {
  settings: PlanSettingsData;
  eurRate: number | null;
  feeRatePct: number;
  buyCostPct: number;
  sellCostPct: number;
  period: string;
  nextBuy: string;
  now: string;
  coins: { symbol: string; name: string; pair: string | null; priceEur: number | null; verdict: Action }[];
  features: (CoinFeatures & { name: string; pair: string | null })[];
  doneThisPeriod: { id: string; symbol: string; amountEur: number; priceEur: number; quantity: number; boughtAt: string }[];
  holdings: { symbol: string; pair: string | null; quantity: number; invested: number; priceEur: number | null }[];
  investedTotal: number;
  monthsDone: number;
}

const eur = (v: number | null | undefined) => fmtMoney(v ?? null, "EUR");
const dayName = (iso: string, l: "en" | "fa") => new Date(iso).toLocaleDateString(dateLocale(l), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
// Built from parts: ICU's Persian month-year pattern puts the year first ("1405 مهر"); people write "مهر 1405".
const monthYear = (t: number | string, l: "en" | "fa", short = false) => {
  const parts = new Intl.DateTimeFormat(dateLocale(l), { month: short ? "short" : "long", year: "numeric", timeZone: "UTC" }).formatToParts(new Date(t));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")} ${get("year")}`;
};
const chip = (active: boolean) => cn("min-h-10 rounded-lg px-3 text-sm ring-1", active ? "bg-accent text-accent-ink ring-accent" : "bg-surface text-ink ring-line hover:bg-surface-2");
const totalFor = (s: PlanSettingsData) => Math.round((s.monthlyAmount + (s.extraAmount > 0 ? s.extraAmount / s.spreadMonths : 0)) * 100) / 100;
const investedFor = (s: PlanSettingsData) => s.monthlyAmount * 12 * s.goalYears + s.extraAmount;

/** Live EUR prices for a set of Binance pairs. */
function useLiveEur(pairs: (string | null)[], rate: number | null) {
  const [p, setP] = useState<Record<string, number>>({});
  const key = [...new Set(pairs.filter(Boolean) as string[])].sort().join(",");
  useEffect(() => {
    const offs = key ? key.split(",").map((pair) => liveFeed().subscribe(pair, (t) => setP((c) => (c[pair] === t.price ? c : { ...c, [pair]: t.price })))) : [];
    return () => offs.forEach((f) => f());
  }, [key]);
  return (pair: string | null, fallback: number | null) => (pair && p[pair] && rate ? p[pair] * rate : fallback);
}

function Section({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <div className="mt-1 text-sm text-ink-2">{subtitle}</div>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function PlanPage({ view }: { view: PlanView }) {
  const router = useRouter();
  const t = useL(PL);
  const [s, setS] = useState<PlanSettingsData>(view.settings);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const first = useRef(true);

  // Save automatically shortly after any change.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => {
      setSave("saving");
      api("/api/settings", { method: "PUT", body: { plan: s } })
        .then(() => setSave("saved"))
        .catch(() => setSave("error"));
    }, 600);
    return () => clearTimeout(id);
  }, [s]);

  const total = totalFor(s);
  const plan = useMemo(() => allocateSmart(total, s.style, view.features, s.minOrderEur, s.custom), [total, s.style, s.minOrderEur, view.features, s.custom]);
  const weights = usePlanWeights(plan);
  const price = useLiveEur([...view.coins.map((c) => c.pair), ...view.holdings.map((h) => h.pair)], view.eurRate);
  const pairOf = (sym: string) => view.coins.find((c) => c.symbol === sym)?.pair ?? view.holdings.find((h) => h.symbol === sym)?.pair ?? null;
  const fallbackPrice = (sym: string) => view.coins.find((c) => c.symbol === sym)?.priceEur ?? null;
  const livePrice = (sym: string) => price(pairOf(sym), fallbackPrice(sym));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="mt-1 text-ink-2">{t.intro}</p>
      </div>
      <PlanSettings s={s} setS={setS} save={save} />
      <SmartPick view={view} s={s} setS={setS} weights={weights} />
      <ShoppingList view={view} s={s} plan={plan} price={livePrice} onDone={() => router.refresh()} />
      <Progress view={view} price={livePrice} goal={s.goalAmount} />
      <GoalCheck view={view} s={s} weights={weights} />
      <BigBuy view={view} livePrice={livePrice} />
      <p className="text-xs text-ink-2">{t.disclaimer}</p>
    </div>
  );
}

/* ───────────────────────── 1. Settings (live) ───────────────────────── */
function PlanSettings({ s, setS, save }: { s: PlanSettingsData; setS: (f: (p: PlanSettingsData) => PlanSettingsData) => void; save: "idle" | "saving" | "saved" | "error" }) {
  const t = useL(PL);
  const [custom, setCustom] = useState(![100, 200].includes(s.monthlyAmount));
  const [goalManual, setGoalManual] = useState(false);
  const multiple = investedFor(s) > 0 ? s.goalAmount / investedFor(s) : 0;

  /** Change plan inputs; unless the user typed their own goal, the goal keeps the same multiple. */
  function change(patch: Partial<PlanSettingsData>) {
    setS((prev) => {
      const next = { ...prev, ...patch };
      if (!goalManual && !("goalAmount" in patch)) next.goalAmount = scaleGoal(prev.goalAmount, investedFor(prev), investedFor(next));
      return next;
    });
  }

  return (
    <Section title={t.s1} subtitle={<span className="inline-flex flex-wrap items-center gap-2">{t.s1sub.replace(/[,،].*$/, ".")} {save !== "idle" && <span className={cn("rounded-md px-2 py-0.5 text-xs", save === "saved" ? "bg-good/15 text-good-ink" : save === "error" ? "bg-bad/15 text-bad-ink" : "bg-surface-2 text-ink-2")}>{save === "saving" ? t.autoSaving : save === "saved" ? t.autoSaved : t.autoError}</span>}</span>}>
      <div className="space-y-5">
        <div>
          <div className="mb-1.5 text-sm font-medium">{t.howMuch}</div>
          <div className="flex flex-wrap items-center gap-2">
            {[100, 200].map((a) => (
              <button key={a} type="button" className={chip(!custom && s.monthlyAmount === a)} onClick={() => { setCustom(false); change({ monthlyAmount: a }); }}>€{a}</button>
            ))}
            <button type="button" className={chip(custom)} onClick={() => setCustom(true)}>{t.other}</button>
            {custom && <input type="number" min={10} step={10} value={s.monthlyAmount} onChange={(e) => change({ monthlyAmount: Math.max(10, Number(e.target.value) || 10) })} className="ltr min-h-10 w-28 rounded-lg border border-line bg-surface px-3" aria-label={t.monthlyAria} />}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium">{t.whichDay}</div>
          <div className="flex flex-wrap gap-2">
            {([1, 15, 0] as const).map((d) => <button key={d} type="button" className={chip(s.buyDay === d)} onClick={() => change({ buyDay: d })}>{t.dayOpt(d)}</button>)}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium">{t.style}</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(STYLES) as PlanStyle[]).map((k) => (
              <button key={k} type="button" onClick={() => change({ style: k })} className={cn("rounded-xl p-3 text-start ring-1", s.style === k ? "bg-accent/15 ring-accent" : "bg-surface ring-line hover:bg-surface-2")}>
                <div className="font-semibold">{t.styles[k].label}</div>
                <div className="mt-1 text-xs text-ink-2">{t.styles[k].text}</div>
                <div className="mt-2 text-xs text-ink-2">{t.mix(STYLES[k].btc * 100, STYLES[k].eth * 100, STYLES[k].gold * 100, STYLES[k].others * 100)}</div>
              </button>
            ))}
            {s.custom && (
              <button type="button" onClick={() => change({ style: "custom" })} className={cn("rounded-xl p-3 text-start ring-1 sm:col-span-3", s.style === "custom" ? "bg-accent/15 ring-accent" : "bg-surface ring-line hover:bg-surface-2")}>
                <div className="font-semibold">{t.sp.customLabel}</div>
                <div className="mt-1 text-xs text-ink-2">{t.sp.customText}</div>
                <div className="mt-2 text-xs text-ink-2">{t.mix(Math.round(s.custom.BTC * 100), Math.round(s.custom.ETH * 100), Math.round(s.custom.PAXG * 100), 0)}</div>
              </button>
            )}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-sm font-medium">{t.extra}</div>
            <input type="number" min={0} step={100} value={s.extraAmount} onChange={(e) => change({ extraAmount: Math.max(0, Number(e.target.value) || 0) })} className="ltr min-h-10 w-full rounded-lg border border-line bg-surface px-3" aria-label={t.extraAria} />
            <p className="mt-1 text-xs text-ink-2">{t.extraHint}</p>
          </div>
          <div>
            <div className="mb-1.5 text-sm font-medium">{t.spread}</div>
            <div className="flex flex-wrap gap-2">
              {[1, 3, 6, 12].map((m) => <button key={m} type="button" className={chip(s.spreadMonths === m)} onClick={() => change({ spreadMonths: m })}>{m === 1 ? t.allNow : t.months(m)}</button>)}
            </div>
            <p className="mt-1 text-xs text-ink-2">{t.spreadHint}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">{t.goal}
            <input type="number" min={0} step={500} value={s.goalAmount} onChange={(e) => { setGoalManual(true); change({ goalAmount: Math.max(0, Number(e.target.value) || 0) }); }} className="ltr mt-1.5 min-h-10 w-full rounded-lg border border-line bg-surface px-3 font-normal" />
          </label>
          <label className="block text-sm font-medium">{t.years}
            <input type="number" min={1} max={30} value={s.goalYears} onChange={(e) => change({ goalYears: Math.min(30, Math.max(1, Math.round(Number(e.target.value) || 1))) })} className="ltr mt-1.5 min-h-10 w-full rounded-lg border border-line bg-surface px-3 font-normal" />
          </label>
        </div>
        <p className="text-xs text-ink-2">{goalManual ? t.goalManual : t.goalMultiple(multiple.toFixed(1))}</p>
      </div>
    </Section>
  );
}

function factorText(f: SmartFactor, t: (typeof PL)["en"]) {
  switch (f.k) {
    case "buySignal": return t.factor.buySignal;
    case "ideas": return t.factor.ideas(f.n);
    case "cheaper": return t.factor.cheaper(f.pct.toFixed(1));
    case "pricier": return t.factor.pricier(f.pct.toFixed(1));
    case "downtrend": return t.factor.downtrend;
    case "volatile": return t.factor.volatile(f.pct.toFixed(1));
    case "sellSignal": return t.factor.sellSignal;
  }
}
function noteText(n: SmartNote, t: (typeof PL)["en"]) {
  switch (n.k) {
    case "skippedSell": return t.smartNote.skippedSell(n.coins.join(", "));
    case "skippedWeak": return t.smartNote.skippedWeak(n.coins.join(", "));
    case "belowMin": return t.smartNote.belowMin(n.coin, n.min);
    case "goldMissing": return t.smartNote.goldMissing;
    case "noOthers": return t.smartNote.noOthers;
  }
}

/* ───────────────────────── 2. Shopping list (live, smart) ───────────────────────── */
function ShoppingList({ view, s, plan, price, onDone }: { view: PlanView; s: PlanSettingsData; plan: SmartPlan; price: (sym: string) => number | null; onDone: () => void }) {
  const t = useL(PL);
  const locale = useLocale();
  const coinName = (sym: string) => coinLabel(sym, locale);
  const sig = plan.lines.map((l) => `${l.symbol}:${l.amountEur}`).join("|");
  const [edits, setEdits] = useState<{ sig: string; amounts: Record<string, number> }>({ sig, amounts: {} });
  const overrides = edits.sig === sig ? edits.amounts : {};
  const amountOf = (sym: string, def: number) => overrides[sym] ?? def;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const done = view.doneThisPeriod;
  const total = plan.lines.reduce((a, l) => a + amountOf(l.symbol, l.amountEur), 0);
  const nowDate = useMemo(() => new Date(view.now), [view.now]);
  const timing = useMemo(() => buyTiming(plan.lines, view.features, nowDate), [plan.lines, view.features, nowDate]);
  const periodLabel = monthYear(`${view.period}-15T00:00:00Z`, locale);
  const extraPerMonth = s.extraAmount > 0 ? s.extraAmount / s.spreadMonths : 0;

  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/plan/purchases", { body: { period: view.period, lines: plan.lines.map((l) => ({ symbol: l.symbol, amountEur: amountOf(l.symbol, l.amountEur) })) } });
      onDone();
    } catch (e) {
      setErr(errorText((e as Error).message, locale));
    } finally {
      setBusy(false);
    }
  }
  async function undo(id: string) {
    await api(`/api/plan/purchases/${id}`, { method: "DELETE" }).catch((e) => setErr(errorText((e as Error).message, locale)));
    onDone();
  }

  const timingText =
    timing.advice === "buyNow" ? t.timing.buyNow(Math.abs(timing.avgVs30d ?? 0).toFixed(1))
    : timing.advice === "goodDay" ? t.timing.goodDay
    : timing.advice === "pricey" ? t.timing.pricey((timing.avgVs30d ?? 0).toFixed(1))
    : timing.advice === "lastDays" ? t.timing.lastDays(timing.daysLeft)
    : t.timing.normal;
  const timingTone = timing.advice === "pricey" ? "bg-surface-2 ring-line" : timing.advice === "lastDays" ? "bg-bad/10 ring-bad/40" : timing.advice === "normal" ? "bg-surface-2 ring-line" : "bg-good/12 ring-good/40";

  return (
    <Section
      title={t.s2(periodLabel)}
      subtitle={<>{t.youHave}<b className="ltr text-ink">{eur(totalFor(s))}</b><Toman value={totalFor(s)} currency="EUR" prefix=" (≈ " suffix=")" className="text-xs text-ink-2" />{t.thisMonth}{extraPerMonth > 0 ? t.extraPart(s.monthlyAmount, eur(extraPerMonth)) : null}{t.nextBuy}<b className="text-ink">{s.buyDay === 0 && !done.length ? t.anyDayNext(timing.daysLeft) : dayName(view.nextBuy, locale)}</b>.</>}
    >
      {done.length > 0 ? (
        <div>
          <Alert tone="success" title={t.doneTitle}>{t.doneText(dayName(view.nextBuy, locale))}</Alert>
          <ul className="mt-3 divide-y divide-line">
            {done.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><b>{coinName(d.symbol)}</b> — <span className="ltr">{eur(d.amountEur)}</span> {t.at} <span className="ltr">{eur(d.priceEur)} ≈ {fmtNum(d.quantity, 6)}</span></span>
                <button className="text-xs text-ink-2 underline" onClick={() => undo(d.id)}>{t.undo}</button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className={cn("mb-4 rounded-xl p-4 text-sm ring-1", timingTone)}>
            <div className="font-semibold">{t.timingTitle}</div>
            <p className="mt-1">{timingText}</p>
            {s.buyDay === 0 && <p className="mt-1 text-xs text-ink-2">{t.timingNote}</p>}
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {plan.lines.map((l) => {
              const p = price(l.symbol);
              const a = amountOf(l.symbol, l.amountEur);
              const v = view.coins.find((c) => c.symbol === l.symbol)?.verdict;
              const why = l.factors.length ? l.factors.map((f) => factorText(f, t)).join(" · ") : t.noFactors;
              return (
                <li key={l.symbol} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold">{coinName(l.symbol)}</span>
                      {v && <ActionPill action={v} className="scale-90" />}
                      <span className={cn("rounded-md px-1.5 py-0.5 text-xs", l.vsUsualPts > 0 ? "bg-good/15 text-good-ink" : l.vsUsualPts < 0 ? "bg-warn/15 text-warn-ink" : "bg-surface-2 text-ink-2")}>{t.vsUsual(l.vsUsualPts)}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-2">{why}</div>
                  </div>
                  <div className="text-end">
                    <label className="ltr inline-flex items-center gap-1 text-lg font-semibold">
                      €
                      <input type="number" min={0} step={1} value={a} onChange={(e) => setEdits({ sig, amounts: { ...overrides, [l.symbol]: Number(e.target.value) } })} className="w-24 rounded-lg border border-line bg-surface px-2 py-1 text-right" aria-label={t.amountFor(l.symbol)} />
                    </label>
                    <div className="text-xs text-ink-2 tabular">{p ? `≈ ${fmtNum((a * (1 - view.buyCostPct / 100)) / p, 6)} ${l.symbol} @ ${fmtPrice(p, "EUR")}` : t.priceLoading}</div>
                  </div>
                </li>
              );
            })}
          </ul>
          {plan.notes.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-ink-2">{plan.notes.map((n, i) => <li key={i}>• {noteText(n, t)}</li>)}</ul>}
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-accent">{t.smartTitle}</summary>
            <p className="mt-1 text-ink-2">{t.smartText}</p>
          </details>
          <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm">
            <b>{t.howTitle}</b> {t.howText} {t.total} <b className="ltr">{eur(total)}</b><Toman value={total} currency="EUR" prefix=" (≈ " suffix=")" className="text-xs text-ink-2" />.
            {view.buyCostPct > 0 && (
              <p className="mt-2">{t.costs.afterBuy(view.buyCostPct.toLocaleString("en-US", { maximumFractionDigits: 2 }), eur(total * (view.buyCostPct / 100)), eur(total * (1 - view.buyCostPct / 100)))} <Link href="/settings#costs" className="text-accent underline">{t.costs.change}</Link></p>
            )}
          </div>
          {err && <Alert tone="error" className="mt-3">{err}</Alert>}
          <Button className="mt-3 w-full sm:w-auto" disabled={busy || total <= 0} onClick={confirm}>{busy ? t.saving : t.bought}</Button>
          <p className="mt-2 text-xs text-ink-2">{t.whyBase}</p>
        </>
      )}
    </Section>
  );
}

function Progress({ view, price, goal }: { view: PlanView; price: (s: string) => number | null; goal: number }) {
  const t = useL(PL);
  const locale = useLocale();
  const coinName = (sym: string) => coinLabel(sym, locale);
  const now = view.holdings.reduce((a, h) => a + h.quantity * (price(h.symbol) ?? h.priceEur ?? 0), 0);
  const result = now - view.investedTotal;
  const goalPct = goal > 0 ? Math.min(100, (now / goal) * 100) : 0;
  return (
    <Section title={t.s3} subtitle={view.monthsDone ? t.monthsDone(view.monthsDone) : t.nothingYet}>
      <div className="grid grid-cols-3 gap-3">
        <div><div className="text-sm text-ink-2">{t.putIn}</div><div className="ltr text-xl font-semibold">{eur(view.investedTotal)}</div></div>
        <div><div className="text-sm text-ink-2">{t.worthNow}</div><div className="ltr text-xl font-semibold">{eur(now)}</div></div>
        <div><div className="text-sm text-ink-2">{t.result}</div><div className={cn("ltr inline-block rounded-lg px-2 text-xl font-semibold", result > 0 ? "bg-good/15 text-good-ink" : result < 0 ? "bg-bad/15 text-bad-ink" : "")}>{result >= 0 ? "+" : ""}{eur(result)}</div></div>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-ink-2"><span>{t.goalLabel(eur(goal))}</span><span className="ltr">{goalPct.toFixed(1)}%</span></div>
        <div className="h-3 w-full rounded-full bg-surface-2" role="img" aria-label={t.ofGoal(goalPct.toFixed(0))}><div className="h-3 rounded-full bg-accent" style={{ width: `${goalPct}%` }} /></div>
      </div>
      {view.holdings.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {view.holdings.map((h) => {
            const val = h.quantity * (price(h.symbol) ?? h.priceEur ?? 0);
            return <li key={h.symbol} className="flex justify-between"><span>{coinName(h.symbol)} <span className="ltr text-ink-2">{fmtNum(h.quantity, 6)}</span></span><span className={val >= h.invested ? "text-good-ink" : "text-bad-ink"}><span className="ltr">{eur(val)}</span> <span className="text-ink-2">{t.putInSmall(eur(h.invested))}</span></span></li>;
          })}
        </ul>
      )}
    </Section>
  );
}

/* ───────────────────────── 4. Goal check (history) ───────────────────────── */
/** This month's split as fractions per coin (sum 1, rounding goes to BTC) — what the history tests use. */
function usePlanWeights(plan: SmartPlan) {
  return useMemo(() => {
    const t = plan.lines.reduce((a, l) => a + l.amountEur, 0) || 1;
    const w = Object.fromEntries(plan.lines.map((l) => [l.symbol, Math.round((l.amountEur / t) * 1000) / 1000]));
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    w.BTC = Math.round(((w.BTC ?? 0) + (1 - sum)) * 1000) / 1000;
    return w;
  }, [plan.lines]);
}

/* ───────────────────────── Smart pick ───────────────────────── */
type SmartResult = { withGold: boolean; search: MixSearch; needsCurrent: { monthlyTypical: number | null; monthlyLikely: number | null; yearsTypical: number | null }; dip: { firstWins: number; total: number; avgDiffPct: number } | null };
const mixKey = (w: Record<string, number> | CustomMix) => ["BTC", "ETH", "PAXG"].map((k) => Math.round(((w as Record<string, number>)[k] ?? 0) * 100)).join("/");

function SmartPick({ view, s, setS, weights }: { view: PlanView; s: PlanSettingsData; setS: (f: (p: PlanSettingsData) => PlanSettingsData) => void; weights: Record<string, number> }) {
  const t = useL(PL);
  const locale = useLocale();
  const [res, setRes] = useState<{ key: string; data: SmartResult | null; err: string | null } | null>(null);
  const key = JSON.stringify({ weights, m: s.monthlyAmount, y: s.goalYears, g: s.goalAmount });
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      api<SmartResult>("/api/plan/smart", { body: { weights, monthly: s.monthlyAmount, years: Math.min(10, s.goalYears), goal: s.goalAmount, feeRate: { buy: view.buyCostPct / 100, sell: view.sellCostPct / 100 } } })
        .then((d) => alive && setRes({ key, data: d, err: null }))
        .catch((e) => alive && setRes({ key, data: null, err: errorText((e as Error).message, locale) }));
    }, 700);
    return () => {
      alive = false;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locale only affects the error text
  }, [key, weights, s.monthlyAmount, s.goalYears, s.goalAmount, view.buyCostPct, view.sellCostPct]);

  const d = res?.key === key ? res.data : null;
  const sr = d?.search;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const inUse = (w: Record<string, number>) => s.style === "custom" && !!s.custom && mixKey(w) === mixKey(s.custom);
  const apply = (w: Record<string, number>) => setS((p) => ({ ...p, style: "custom", custom: { BTC: w.BTC ?? 0, ETH: w.ETH ?? 0, PAXG: w.PAXG ?? 0 } }));
  // Merge picks that are the same mix.
  const picks: { kinds: string[]; m: MixStats }[] = [];
  if (sr) for (const [k, m] of [["goal", sr.goal], ["profit", sr.profit], ["safe", sr.safe]] as const) {
    if (!m) continue;
    const same = picks.find((p) => mixKey(p.m.weights) === mixKey(m.weights));
    if (same) same.kinds.push(k);
    else picks.push({ kinds: [k], m });
  }
  const currentIsBest = !!(sr?.current && sr.goal && sr.current.reachedShare >= sr.goal.reachedShare - 0.001 && sr.current.p25 >= sr.goal.p25 - 1);
  const mixText = (w: Record<string, number>) => t.mix(Math.round((w.BTC ?? 0) * 100), Math.round((w.ETH ?? 0) * 100), Math.round((w.PAXG ?? 0) * 100), Math.round((1 - (w.BTC ?? 0) - (w.ETH ?? 0) - (w.PAXG ?? 0)) * 100));
  const round5 = (v: number) => Math.max(10, Math.ceil(v / 5) * 5);
  const chipBtn = "min-h-9 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-ink";

  const card = (title: string, m: MixStats, action: React.ReactNode, highlight = false) => (
    <div className={cn("rounded-xl p-3 text-sm ring-1", highlight ? "bg-accent/10 ring-accent/50" : "bg-surface ring-line")}>
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 text-xs text-ink-2">{mixText(m.weights)}</div>
      <ul className="mt-2 space-y-0.5 text-xs">
        <li><b>{t.sp.reached(Math.round(m.reachedShare * m.windows), m.windows)}</b> ({pct(m.reachedShare)})</li>
        <li>{t.sp.typical}: <b className="ltr">{eur(m.median)}</b></li>
        <li>{t.sp.bad}: <span className="ltr">{eur(m.p25)}</span></li>
        <li className={m.lostShare > 0 ? "text-bad-ink" : "text-good-ink"}>{m.lostShare > 0 ? t.sp.lost(String(Math.round(m.lostShare * 100))) : t.sp.neverLost}</li>
      </ul>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );

  return (
    <Section title={t.sp.title} subtitle={t.sp.sub(eur(s.monthlyAmount), s.goalYears, eur(s.goalAmount))}>
      {!d && !(res?.key === key && res.err) && <p className="text-sm text-ink-2">{t.sp.testing}</p>}
      {res?.key === key && res.err && <Alert tone="error">{res.err}</Alert>}
      {d && sr && (!sr.current || !sr.goal) && <p className="text-sm text-ink-2">{t.sp.none}</p>}
      {d && sr && sr.current && sr.goal && (
        <div className="space-y-4">
          {currentIsBest ? (
            <p className="rounded-xl bg-good/12 p-3 text-sm font-medium ring-1 ring-good/40">{t.sp.already}</p>
          ) : (
            <p className="rounded-xl bg-accent/10 p-3 text-sm ring-1 ring-accent/40">{t.sp.better(pct(sr.goal.reachedShare), pct(sr.current.reachedShare))}</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {card(t.sp.current, sr.current, null)}
            {picks.map((p) => card(p.kinds.map((k) => t.sp.kinds[k]).join(" · "), p.m, inUse(p.m.weights) ? <span className="text-sm font-semibold text-good-ink">{t.sp.using}</span> : <button type="button" className={chipBtn} onClick={() => apply(p.m.weights)}>{t.sp.use}</button>, p.kinds.includes("goal")))}
          </div>
          <p className="text-xs text-ink-2">{t.sp.riskNote}</p>

          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            <div className="font-semibold">{t.sp.needTitle}</div>
            {d.needsCurrent.monthlyTypical !== null && d.needsCurrent.monthlyLikely !== null && (
              <p className="mt-1">{t.sp.needMonthly(eur(s.goalAmount), s.goalYears, eur(round5(d.needsCurrent.monthlyTypical)), eur(round5(d.needsCurrent.monthlyLikely)))}</p>
            )}
            <p className="mt-1">{d.needsCurrent.yearsTypical !== null ? t.sp.needYears(eur(s.monthlyAmount), d.needsCurrent.yearsTypical) : t.sp.needNoYears(eur(s.monthlyAmount))}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {d.needsCurrent.monthlyTypical !== null && round5(d.needsCurrent.monthlyTypical) !== s.monthlyAmount && (
                <button type="button" className={chipBtn} onClick={() => setS((p) => ({ ...p, monthlyAmount: round5(d.needsCurrent.monthlyTypical!) }))}>{t.sp.setMonthly(eur(round5(d.needsCurrent.monthlyTypical)))}</button>
              )}
              {d.needsCurrent.yearsTypical !== null && d.needsCurrent.yearsTypical !== s.goalYears && (
                <button type="button" className="min-h-9 rounded-lg px-3 text-sm ring-1 ring-line hover:bg-surface" onClick={() => setS((p) => ({ ...p, goalYears: d.needsCurrent.yearsTypical!, goalAmount: scaleGoal(p.goalAmount, investedFor(p), investedFor({ ...p, goalYears: d.needsCurrent.yearsTypical! })) }))}>{t.sp.setYears(d.needsCurrent.yearsTypical)}</button>
              )}
            </div>
          </div>

          {d.dip && (
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <div className="font-semibold">{t.sp.timingTitle}</div>
              <p className="mt-1">{t.sp.timingText(d.dip.firstWins, d.dip.total, Math.abs(d.dip.avgDiffPct).toFixed(1))}</p>
              {s.buyDay !== 1 && d.dip.firstWins > d.dip.total / 2 && (
                <button type="button" className={cn(chipBtn, "mt-2")} onClick={() => setS((p) => ({ ...p, buyDay: 1 }))}>{t.sp.setFirst}</button>
              )}
            </div>
          )}
          <p className="text-xs text-ink-2">{t.sp.basis(sr.windows, monthYear(sr.since, locale, true))}</p>
        </div>
      )}
    </Section>
  );
}

function GoalCheck({ view, s, weights }: { view: PlanView; s: PlanSettingsData; weights: Record<string, number> }) {
  const t = useL(PL);
  const locale = useLocale();
  const [res, setRes] = useState<{ key: string; data: HistoryResult | null; err: string | null } | null>(null);
  const key = JSON.stringify({ weights, m: s.monthlyAmount, y: s.goalYears, g: s.goalAmount });
  useEffect(() => {
    let alive = true;
    // Wait until the user stops changing settings, then test the plan on real history.
    const id = setTimeout(() => {
      api<HistoryResult>("/api/plan/history", { body: { weights, monthly: s.monthlyAmount, years: s.goalYears, goal: s.goalAmount, feeRate: { buy: view.buyCostPct / 100, sell: view.sellCostPct / 100 } } })
        .then((d) => alive && setRes({ key, data: d, err: null }))
        .catch((e) => alive && setRes({ key, data: null, err: errorText((e as Error).message, locale) }));
    }, 500);
    return () => {
      alive = false;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- locale only affects the error text
  }, [key, weights, s.monthlyAmount, s.goalYears, s.goalAmount, view.buyCostPct, view.sellCostPct]);

  const invested = s.monthlyAmount * s.goalYears * 12;
  const yearlyPct = requiredGrowth(s.monthlyAmount, s.goalYears * 12, s.goalAmount, s.extraAmount).yearly * 100;
  const d = res?.key === key ? res.data : null;
  const share = d && d.windows.length ? d.reachedGoal / d.windows.length : null;
  const fmtMonth = (ts: number) => monthYear(ts, locale, true);
  const byYear = d ? d.windows.filter((w) => new Date(w.start).getUTCMonth() === 0) : [];

  return (
    <Section title={t.s4(eur(invested), eur(s.goalAmount), s.goalYears)} subtitle={t.s4sub(s.monthlyAmount, s.goalYears, eur(invested), s.extraAmount ? eur(s.extraAmount) : null, eur(s.goalAmount), yearlyPct.toFixed(0))}>
      {!d && !res?.err && <p className="text-sm text-ink-2">{t.testing}</p>}
      {res?.key === key && res.err && <Alert tone="error">{res.err}</Alert>}
      {d && (
        <div className="space-y-4 text-sm">
          <p className="rounded-xl bg-surface-2 p-4">
            <b>{share === null ? t.notEnough : share >= 0.5 ? t.most : share >= 0.2 ? t.sometimes : t.rarely(eur(s.goalAmount))}</b>
          </p>
          {d.latest && (
            <p>
              {t.lastYears(s.goalYears, fmtMonth(d.latest.start), fmtMonth(d.latest.end), eur(d.latest.invested))}<b className={cn("ltr", d.latest.final >= d.latest.invested ? "text-good-ink" : "text-bad-ink")}>{eur(d.latest.final)}</b>.
            </p>
          )}
          {d.windows.length > 0 && (
            <ul className="space-y-1">
              <li>{t.tested(d.windows.length, fmtMonth(d.firstDate!))}</li>
              <li>{t.reached(eur(s.goalAmount))}<b>{t.times(d.reachedGoal, ((d.reachedGoal / d.windows.length) * 100).toFixed(0))}</b></li>
              <li>{t.typical}<b className="ltr">{eur(d.median)}</b></li>
              <li>{t.best}<b className="ltr text-good-ink">{eur(d.best?.final)}</b> {t.started(fmtMonth(d.best!.start))}{t.worst}<b className="ltr text-bad-ink">{eur(d.worst?.final)}</b> {t.started(fmtMonth(d.worst!.start))}</li>
              <li>{t.lost}<b>{t.times(d.lostMoney, ((d.lostMoney / d.windows.length) * 100).toFixed(0))}</b></li>
            </ul>
          )}
          {byYear.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-start text-xs text-ink-2"><th className="py-1 text-start">{t.ifStarted}</th><th className="text-start">{t.putInCol}</th><th className="text-start">{t.after(s.goalYears)}</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {byYear.map((w) => (
                    <tr key={w.start}><td className="py-1.5">{t.january(new Date(w.start).getUTCFullYear())}</td><td className="ltr text-start">{eur(w.invested)}</td><td className={cn("ltr text-start font-semibold", w.final >= w.invested ? "text-good-ink" : "text-bad-ink")}>{eur(w.final)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-ink-2">{t.historyNote}</p>
        </div>
      )}
    </Section>
  );
}

/* ───────────────────────── 5. Big buy plan ───────────────────────── */
function BigBuy({ view, livePrice }: { view: PlanView; livePrice: (s: string) => number | null }) {
  const t = useL(PL);
  const locale = useLocale();
  const coinName = (sym: string) => coinLabel(sym, locale);
  const [symbol, setSymbol] = useState("BTC");
  const [amount, setAmount] = useState(10_000);
  const [buyAt, setBuyAt] = useState(50_000);
  const [sellAt, setSellAt] = useState(110_000);
  const [parts, setParts] = useState(4);
  const [drop, setDrop] = useState<{ pct: number; share: number | null } | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const now = livePrice(symbol);
  const buyCost = view.buyCostPct / 100;
  const sellCost = view.sellCostPct / 100;
  const dropPct = now ? Math.max(0, ((now - buyAt) / now) * 100) : null;
  const dropKey = dropPct !== null ? Math.round(dropPct) : null;
  useEffect(() => {
    if (dropKey === null || dropKey <= 0) return;
    let alive = true;
    api<{ share: number | null }>(`/api/plan/drops?symbol=${symbol}&pct=${dropKey}`)
      .then((r) => alive && setDrop({ pct: dropKey, share: r.share }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [symbol, dropKey]);

  const allAtOnce = amount * (1 - buyCost) * (sellAt / buyAt) * (1 - sellCost);
  const staged = now && now > buyAt ? stagedLevels(amount, now * 0.95, buyAt, parts) : null;
  const stagedValue = staged ? amount * (1 - buyCost) * (sellAt / staged.averagePrice) * (1 - sellCost) : null;

  async function setAlerts() {
    setMsg(null);
    if (!view.eurRate) return setMsg({ tone: "error", text: t.noRate });
    try {
      const levels = staged ? staged.levels.map((l) => l.price) : [buyAt];
      for (const p of levels) await api("/api/alerts/price", { body: { symbol, direction: "BELOW", price: Math.round((p / view.eurRate) * 100) / 100, note: t.alertBuyNote(Math.round(amount / levels.length), symbol, Math.round(p).toLocaleString("en-US")) } });
      await api("/api/alerts/price", { body: { symbol, direction: "ABOVE", price: Math.round((sellAt / view.eurRate) * 100) / 100, note: t.alertSellNote(sellAt.toLocaleString("en-US")) } });
      setMsg({ tone: "success", text: t.alertsSet(levels.length + 1, coinName(symbol)) });
    } catch (e) {
      setMsg({ tone: "error", text: errorText((e as Error).message, locale) });
    }
  }

  return (
    <Section title={t.s5} subtitle={t.s5sub}>
      <div className="grid gap-3 sm:grid-cols-5">
        <label className="text-sm">{t.coin}
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-2">{view.coins.map((c) => <option key={c.symbol} value={c.symbol}>{coinName(c.symbol)}</option>)}</select>
        </label>
        <label className="text-sm">{t.amount}<input type="number" min={100} step={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="ltr mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-2" /></label>
        <label className="text-sm">{t.buyAt}<input type="number" min={0} step="any" value={buyAt} onChange={(e) => setBuyAt(Number(e.target.value))} className="ltr mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-2" /></label>
        <label className="text-sm">{t.sellAt}<input type="number" min={0} step="any" value={sellAt} onChange={(e) => setSellAt(Number(e.target.value))} className="ltr mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-2" /></label>
        <label className="text-sm">{t.steps}<select value={parts} onChange={(e) => setParts(Number(e.target.value))} className="mt-1 min-h-10 w-full rounded-lg border border-line bg-surface px-2">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 1 ? t.allAtOnce : t.nSteps(n)}</option>)}</select></label>
      </div>
      <div className="mt-4 space-y-3 text-sm">
        <p>{t.priceNow}<b className="ltr">{now ? fmtPrice(now, "EUR") : t.loading}</b>{dropPct !== null && dropPct > 0 && t.needFall(dropPct.toFixed(0), fmtPrice(buyAt, "EUR"))}{dropPct === 0 && t.alreadyBelow}</p>
        {drop && drop.share !== null && dropPct !== null && dropPct > 0 && (
          <p className="text-ink-2">{t.dropHist(coinName(symbol), drop.pct, Math.round(drop.share * 100))}</p>
        )}
        <div className="rounded-xl bg-surface-2 p-4">
          {t.planned(fmtPrice(buyAt, "EUR"), fmtPrice(sellAt, "EUR"))}<span className="ltr whitespace-nowrap">{eur(amount)} → <b className="text-good-ink">{eur(allAtOnce)}</b></span>{t.plannedTail((sellAt / buyAt).toFixed(2))}
        </div>
        {staged && parts > 1 && (
          <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
            <b>{t.safer(parts, coinName(symbol), fmtPrice(buyAt, "EUR"))}</b>
            <ul className="mt-2 space-y-0.5">{staged.levels.map((l, i) => <li key={i}>{t.step(i + 1, eur(l.amount))}<b className="ltr">{fmtPrice(l.price, "EUR")}</b></li>)}</ul>
            <p className="mt-2">{t.avg(fmtPrice(staged.averagePrice, "EUR"), fmtPrice(sellAt, "EUR"))}<b className="ltr text-good-ink">{eur(stagedValue)}</b>{t.ifAll}</p>
          </div>
        )}
        <p className="text-ink-2">{t.risk}</p>
        {msg && <Alert tone={msg.tone}>{msg.text} {msg.tone === "success" && <Link className="underline" href="/notifications">{t.open}</Link>}</Alert>}
        <Button variant="secondary" onClick={setAlerts} disabled={!now}>{t.alertMe}</Button>
      </div>
    </Section>
  );
}
