import type { Metadata } from "next";
import { getFx } from "@/lib/fx";
import Link from "next/link";
import { SignalBadge, StatusBadge } from "@/components/signal-badge";
import { Button, Card, EmptyState, PageHeader, Select, TableWrap, td, th } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fmtDate, fmtPrice, timeAgo } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { statePlain, timeframeWord } from "@/lib/plain";
import { STRATEGIES, getStrategy } from "@/lib/strategies/registry";
import { strategyTitle } from "@/lib/strategies/i18n";
import { getSettings } from "@/lib/settings/service";
import { SignalsPlain } from "@/components/simple/signals-plain";
import { computeVerdict } from "@/lib/signals/verdict";
import { SIGNAL_STATES, STATE_LABEL } from "@/lib/strategies/types";

const L = {
  en: {
    metaTitle: "Signals",
    simpleTitle: "Signals",
    simpleDesc: "What the app thinks about each of your coins, in plain words.",
    title: "Trading signals",
    desc: "Every state change is recorded — including setups that later failed. Labels describe analytical conditions, not predictions.",
    focusBefore: "Showing only active ",
    focusBold: "buy setups and exit warnings",
    focusMiddle: " from individual strategies. For one clear BUY / WAIT / SELL answer per coin, see ",
    home: "Home",
    focusAfter: ".",
    showAll: "Show everything",
    filters: "Filters ▾",
    status: "Status",
    statusActive: "Active",
    statusAll: "All statuses",
    statusSuperseded: "Superseded",
    statusInvalidated: "Invalidated",
    statusExpired: "Expired",
    state: "Signal state",
    allStates: "All states",
    asset: "Asset",
    allAssets: "All assets",
    timeframe: "Timeframe",
    allTimeframes: "All timeframes",
    strategy: "Strategy",
    allStrategies: "All strategies",
    apply: "Apply filters",
    emptyTitle: "No signals match these filters",
    emptyBody: "Signals appear after the first scheduled scan. Try “All statuses”.",
    thAsset: "Asset",
    thSignal: "Signal",
    thStrategy: "Strategy",
    thTf: "TF",
    thPrice: "Price",
    thInvalidation: "Invalidation",
    thRR: "R/R",
    thRules: "Rules",
    thAge: "Age",
    thStatus: "Status",
    footnote: "Prices are in the analysis pair's quote currency (USDT/USD). R/R = estimated reward-to-risk to the first target after fees and slippage.",
  },
  fa: {
    metaTitle: "سیگنال‌ها",
    simpleTitle: "سیگنال‌ها",
    simpleDesc: "نظر برنامه دربارهٔ هر کدام از ارزهای شما، به زبان ساده.",
    title: "سیگنال‌های معاملاتی",
    desc: "هر تغییر وضعیت ثبت می‌شود — حتی فرصت‌هایی که بعداً شکست خوردند. برچسب‌ها وضعیت تحلیلی را توصیف می‌کنند، نه پیش‌بینی آینده را.",
    focusBefore: "فقط ",
    focusBold: "فرصت‌های خرید و هشدارهای فروشِ فعال",
    focusMiddle: " از روش‌های جداگانه نمایش داده می‌شود. برای یک جواب روشن (خرید / صبر / فروش) برای هر ارز، به ",
    home: "خانه",
    focusAfter: " بروید.",
    showAll: "نمایش همه",
    filters: "فیلترها ▾",
    status: "وضعیت",
    statusActive: "فعال",
    statusAll: "همهٔ وضعیت‌ها",
    statusSuperseded: "جایگزین‌شده",
    statusInvalidated: "باطل‌شده",
    statusExpired: "منقضی‌شده",
    state: "نوع سیگنال",
    allStates: "همهٔ انواع",
    asset: "ارز",
    allAssets: "همهٔ ارزها",
    timeframe: "بازهٔ زمانی",
    allTimeframes: "همهٔ بازه‌های زمانی",
    strategy: "روش",
    allStrategies: "همهٔ روش‌ها",
    apply: "اعمال فیلترها",
    emptyTitle: "هیچ سیگنالی با این فیلترها پیدا نشد",
    emptyBody: "سیگنال‌ها بعد از اولین بررسیِ زمان‌بندی‌شده ظاهر می‌شوند. «همهٔ وضعیت‌ها» را امتحان کنید.",
    thAsset: "ارز",
    thSignal: "سیگنال",
    thStrategy: "روش",
    thTf: "بازهٔ زمانی",
    thPrice: "قیمت",
    thInvalidation: "حد ضرر",
    thRR: "سود به ضرر",
    thRules: "شرط‌ها",
    thAge: "زمان",
    thStatus: "وضعیت",
    footnote: "قیمت‌ها به ارزِ مقابلِ جفت‌ارز تحلیل (USDT/USD) هستند. «سود به ضرر» = نسبت سود به ضررِ تخمینی تا اولین هدف سود، با احتساب کارمزد و لغزش قیمت (اختلاف قیمت اجرا).",
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.metaTitle };
}

export default async function SignalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [t, locale] = await Promise.all([getL(L), getLocale()]);
  const status = sp.status ?? "ACTIVE";
  const simple = (await getSettings(user.id)).ui.simple;
  const noFilters = !sp.status && !sp.state && !sp.asset && !sp.tf && !sp.strategy;
  // Simple view: only the setups worth attention (buy or exit), unless the user filters.
  const focus = simple && noFilters && sp.all !== "1";
  const where = {
    ...(focus ? { state: { in: ["STRONG_BUY_SETUP", "POTENTIAL_BUY", "POTENTIAL_SELL", "EXIT_SETUP"] as never[] } } : {}),
    userId: user.id,
    ...(status !== "ALL" ? { status: status as never } : {}),
    ...(sp.state && (SIGNAL_STATES as readonly string[]).includes(sp.state) ? { state: sp.state as never } : {}),
    ...(sp.asset ? { asset: { symbol: sp.asset.toUpperCase() } } : {}),
    ...(sp.tf ? { timeframe: sp.tf } : {}),
    ...(sp.strategy ? { strategyId: sp.strategy } : {}),
  };
  const [signals, assets] = await Promise.all([
    db().signal.findMany({ where, include: { asset: { select: { symbol: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db().watchlistItem.findMany({ where: { userId: user.id }, include: { asset: { select: { symbol: true } } } }),
  ]);
  if (focus) {
    const settings = await getSettings(user.id);
    const fx = await getFx(settings);
    const watch = await db().watchlistItem.findMany({ where: { userId: user.id }, include: { asset: true }, orderBy: [{ position: "asc" }, { addedAt: "asc" }] });
    const active = await db().signal.findMany({ where: { userId: user.id, status: "ACTIVE", assetId: { in: watch.map((w) => w.assetId) } } });
    const coins = watch.map((w) => {
      const sigs = active.filter((x) => x.assetId === w.assetId);
      return {
        symbol: w.asset.symbol,
        name: w.asset.name,
        verdict: computeVerdict(sigs),
        signals: sigs.map((x) => ({ id: x.id, state: x.state, strategyId: x.strategyId, timeframe: x.timeframe, entryHigh: x.entryHigh, invalidation: x.invalidation, targets: x.targets })),
      };
    });
    return (
      <>
        <PageHeader title={t.simpleTitle} description={t.simpleDesc} />
        <SignalsPlain coins={coins} currency={fx.currency} eurRate={fx.rate} />
      </>
    );
  }
  const stateName = (s: (typeof SIGNAL_STATES)[number]) => (locale === "fa" ? statePlain(s, "fa").label : STATE_LABEL[s]);
  const tfName = (tf: string) => (locale === "fa" ? timeframeWord(tf, "fa") : tf);
  const stratName = (id: string) => strategyTitle(id, getStrategy(id)?.name ?? id, locale);
  return (
    <>
      <PageHeader title={t.title} description={t.desc} />
      {focus && (
        <p className="mb-4 text-sm text-ink-2">
          {t.focusBefore}<b className="text-ink">{t.focusBold}</b>{t.focusMiddle}<Link className="text-accent underline" href="/dashboard">{t.home}</Link>{t.focusAfter} <Link className="text-accent underline" href="/signals?all=1">{t.showAll}</Link>
        </p>
      )}
      <details className="mb-4" open={!simple}>
      <summary className={simple ? "mb-2 cursor-pointer text-sm text-accent hover:underline" : "hidden"}>{t.filters}</summary>
      <Card>
        <form className="grid grid-cols-2 gap-2 md:grid-cols-6" method="get">
          <Select name="status" defaultValue={status} aria-label={t.status}>
            <option value="ACTIVE">{t.statusActive}</option><option value="ALL">{t.statusAll}</option><option value="SUPERSEDED">{t.statusSuperseded}</option><option value="INVALIDATED">{t.statusInvalidated}</option><option value="EXPIRED">{t.statusExpired}</option>
          </Select>
          <Select name="state" defaultValue={sp.state ?? ""} aria-label={t.state}>
            <option value="">{t.allStates}</option>
            {SIGNAL_STATES.map((s) => <option key={s} value={s}>{stateName(s)}</option>)}
          </Select>
          <Select name="asset" defaultValue={sp.asset ?? ""} aria-label={t.asset}>
            <option value="">{t.allAssets}</option>
            {assets.map((a) => <option key={a.asset.symbol} value={a.asset.symbol}>{a.asset.symbol}</option>)}
          </Select>
          <Select name="tf" defaultValue={sp.tf ?? ""} aria-label={t.timeframe}>
            <option value="">{t.allTimeframes}</option>
            {["1h", "4h", "1d", "1w"].map((tf) => <option key={tf} value={tf}>{tfName(tf)}</option>)}
          </Select>
          <Select name="strategy" defaultValue={sp.strategy ?? ""} aria-label={t.strategy}>
            <option value="">{t.allStrategies}</option>
            {STRATEGIES.map((s) => <option key={s.id} value={s.id}>{strategyTitle(s.id, s.name, locale)}</option>)}
          </Select>
          <Button type="submit">{t.apply}</Button>
        </form>
      </Card>
      </details>
      <Card>
        {signals.length === 0 ? (
          <EmptyState title={t.emptyTitle}>{t.emptyBody}</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr><th className={th}>{t.thAsset}</th><th className={th}>{t.thSignal}</th><th className={th}>{t.thStrategy}</th><th className={th}>{t.thTf}</th><th className={th}>{t.thPrice}</th><th className={th}>{t.thInvalidation}</th><th className={th}>{t.thRR}</th><th className={th}>{t.thRules}</th><th className={th}>{t.thAge}</th><th className={th}>{t.thStatus}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {signals.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-2/50">
                    <td className={td}><Link href={`/signals/${s.id}`} className="font-medium hover:underline">{s.asset.symbol}</Link></td>
                    <td className={td}><Link href={`/signals/${s.id}`}><SignalBadge state={s.state} /></Link></td>
                    <td className={td}>{stratName(s.strategyId)}</td>
                    <td className={td}>{tfName(s.timeframe)}</td>
                    <td className={`${td} tabular`}>{fmtPrice(s.price)}</td>
                    <td className={`${td} tabular`}>{fmtPrice(s.invalidation)}</td>
                    <td className={`${td} tabular`}>{s.riskReward !== null ? s.riskReward.toFixed(2) : "—"}</td>
                    <td className={`${td} tabular`}>{s.rulesTotal ? `${s.rulesMet}/${s.rulesTotal}` : "—"}</td>
                    <td className={`${td} text-ink-2`} title={fmtDate(s.signalAt, true, locale)}>{timeAgo(s.signalAt, undefined, locale)}</td>
                    <td className={td}><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="mt-3 text-xs text-ink-2">{t.footnote}</p>
      </Card>
    </>
  );
}
