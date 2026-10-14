import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EquityChart } from "@/components/charts/equity-chart";
import { Alert, Badge, Card, CardHeader, Disclaimer, PageHeader, Stat, TableWrap, td, th } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import type { Metrics } from "@/lib/backtest/engine";
import { backtestErrorText, backtestWarningText, benchmarkName, exitReasonShort } from "@/lib/backtest/i18n";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { timeframeWord } from "@/lib/plain";
import { strategyTitle } from "@/lib/strategies/i18n";
import { getStrategy } from "@/lib/strategies/registry";

const L = {
  en: {
    metaTitle: "Backtest result",
    trades: "Trades",
    wonLost: (w: number, l: number) => `${w} won · ${l} lost`,
    winRate: "Win rate",
    netReturn: "Net return",
    gross: "Gross",
    maxDrawdown: "Max drawdown",
    profitFactor: "Profit factor",
    avgR: "Avg R / trade",
    expectancy: "Expectancy",
    avgWin: "Avg win",
    avgLoss: "Avg loss",
    costs: "Costs",
    fees: "fees",
    slippage: "slippage",
    timeInMarket: "Time in market",
    avgBars: "Avg bars held",
    maxLosingStreak: "Max losing streak",
    desc: (from: string, to: string, n: number, src: string, run: string) => `${from} – ${to} · ${n} candles from ${src} · run ${run}`,
    failedTitle: "This backtest failed",
    readFirst: "Read before interpreting",
    wholePeriod: "Whole period",
    finalEquity: (fin: string, start: string) => `Final equity ${fin} from ${start}`,
    benchmark: "Benchmark —",
    maxDrawdownLower: "max drawdown",
    equityTitle: "Equity curve vs buy & hold",
    equityDesc: "Mark-to-market at each candle close (simulated).",
    inSample: "In-sample",
    inSampleDesc: "Earlier part of the period",
    outOfSample: "Out-of-sample",
    oosFrom: (d: string) => `From ${d} — treat as the more honest estimate`,
    disabled: "Disabled",
    oosZero: "Out-of-sample split was set to 0%.",
    allTrades: (n: number) => `All simulated trades (${n})`,
    allTradesDesc: "Fills include slippage; P/L is after fees.",
    thEntry: "Entry",
    thExit: "Exit",
    thEntryPx: "Entry px",
    thExitPx: "Exit px",
    thStop: "Stop",
    thTarget: "Target",
    thReason: "Reason",
    thNetPl: "Net P/L",
    thReturn: "Return",
    thR: "R",
    thBars: "Bars",
    thSet: "Set",
    oos: "OOS",
    is: "IS",
    assumptions: "Assumptions used",
  },
  fa: {
    metaTitle: "نتیجهٔ آزمایش روی گذشته",
    trades: "معامله‌ها",
    wonLost: (w: number, l: number) => `${w} سود · ${l} ضرر`,
    winRate: "درصد معاملات سودده",
    netReturn: "بازده خالص",
    gross: "بدون هزینه‌ها",
    maxDrawdown: "بیشترین افت (از اوج تا کف)",
    profitFactor: "ضریب سود (سودها ÷ ضررها)",
    avgR: "میانگین R هر معامله",
    expectancy: "میانگین سود/ضرر هر معامله",
    avgWin: "میانگین سود",
    avgLoss: "میانگین ضرر",
    costs: "هزینه‌ها",
    fees: "کارمزد",
    slippage: "لغزش قیمت",
    timeInMarket: "زمان حضور در بازار",
    avgBars: "میانگین کندل‌های نگه‌داری",
    maxLosingStreak: "بیشترین ضررِ پشت‌سرهم",
    desc: (from: string, to: string, n: number, src: string, run: string) => `${from} تا ${to} · ${n} کندل از ${src} · اجرا: ${run}`,
    failedTitle: "این آزمایش ناموفق بود",
    readFirst: "قبل از برداشت از نتیجه‌ها بخوانید",
    wholePeriod: "کل دوره",
    finalEquity: (fin: string, start: string) => `ارزش نهایی حساب ${fin} (شروع با ${start})`,
    benchmark: "مقایسه —",
    maxDrawdownLower: "بیشترین افت",
    equityTitle: "منحنی ارزش حساب در برابر خرید و نگه‌داری",
    equityDesc: "ارزش حساب در پایان هر کندل (شبیه‌سازی‌شده).",
    inSample: "بخش اول (داخل نمونه)",
    inSampleDesc: "بخش ابتدایی دوره",
    outOfSample: "بخش آخر (خارج از نمونه)",
    oosFrom: (d: string) => `از ${d} — تخمینِ صادقانه‌تر همین است`,
    disabled: "خاموش",
    oosZero: "سهم بخش آخر (خارج از نمونه) روی 0% تنظیم شده بود.",
    allTrades: (n: number) => `همهٔ معامله‌های شبیه‌سازی‌شده (${n})`,
    allTradesDesc: "قیمت‌های خرید و فروش شامل لغزش قیمت است؛ سود و ضرر بعد از کسر کارمزد است.",
    thEntry: "ورود",
    thExit: "خروج",
    thEntryPx: "قیمت ورود",
    thExitPx: "قیمت خروج",
    thStop: "حد ضرر",
    thTarget: "هدف سود",
    thReason: "دلیل خروج",
    thNetPl: "سود/ضرر خالص",
    thReturn: "بازده",
    thR: "R",
    thBars: "کندل‌ها",
    thSet: "بخش",
    oos: "آخر",
    is: "اول",
    assumptions: "فرض‌های استفاده‌شده",
  },
} satisfies Dict<unknown>;
type T = (typeof L)["en"];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.metaTitle };
}

function MetricsGrid({ m, t }: { m: Metrics; t: T }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <Stat label={t.trades} value={m.trades} sub={t.wonLost(m.wins, m.losses)} />
      <Stat label={t.winRate} value={<span className="tabular">{fmtPct(m.winRatePct, 1, false)}</span>} />
      <Stat label={t.netReturn} value={<span className={`tabular ${m.netReturnPct >= 0 ? "text-good-ink" : "text-bad-ink"}`}>{fmtPct(m.netReturnPct)}</span>} sub={<>{t.gross} <span className="ltr">{fmtPct(m.grossReturnPct)}</span></>} />
      <Stat label={t.maxDrawdown} value={<span className="tabular">{fmtPct(m.maxDrawdownPct, 1, false)}</span>} />
      <Stat label={t.profitFactor} value={m.profitFactor !== null ? fmtNum(m.profitFactor) : "—"} />
      <Stat label={t.avgR} value={<span className="tabular">{m.avgR !== null ? fmtNum(m.avgR) : "—"}</span>} sub={<>{t.expectancy} <span className="ltr">{fmtMoney(m.expectancy)}</span></>} />
      <Stat label={t.avgWin} value={<span className="tabular">{fmtMoney(m.avgWin)}</span>} sub={<span className="ltr">{fmtPct(m.avgWinPct)}</span>} />
      <Stat label={t.avgLoss} value={<span className="tabular">{fmtMoney(m.avgLoss)}</span>} sub={<span className="ltr">{fmtPct(m.avgLossPct)}</span>} />
      <Stat label={t.costs} value={<span className="tabular">{fmtMoney(m.totalFees + m.totalSlippage)}</span>} sub={<>{t.fees} <span className="ltr">{fmtMoney(m.totalFees)}</span> · {t.slippage} <span className="ltr">{fmtMoney(m.totalSlippage)}</span></>} />
      <Stat label={t.timeInMarket} value={<span className="tabular">{fmtPct(m.exposurePct, 1, false)}</span>} />
      <Stat label={t.avgBars} value={fmtNum(m.avgBarsHeld, 1)} />
      <Stat label={t.maxLosingStreak} value={m.maxConsecutiveLosses} />
    </div>
  );
}

export default async function BacktestDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const run = await db().backtestRun.findFirst({ where: { id, userId: user.id }, include: { trades: { orderBy: { entryTime: "asc" } }, asset: true } });
  if (!run) notFound();
  const [t, locale] = await Promise.all([getL(L), getLocale()]);
  const def = getStrategy(run.strategyId);
  const m = run.metrics as unknown as (Metrics & { inSample: Metrics; outOfSample: Metrics | null; finalEquity: number; splitTime: number | null; skippedEntries: number }) | null;
  const bench = run.benchmark as { name: string; netReturnPct: number; maxDrawdownPct: number } | null;
  const warnings = ((run.warnings as string[] | null) ?? []).map((w) => backtestWarningText(w, locale));
  const s = run.settings as Record<string, number | string | boolean>;
  const tfName = locale === "fa" ? timeframeWord(run.timeframe, "fa") : run.timeframe;
  return (
    <>
      <PageHeader
        title={`${run.asset.symbol} · ${strategyTitle(run.strategyId, def?.name ?? run.strategyId, locale)} · ${tfName}`}
        description={t.desc(fmtDate(run.startDate, false, locale), fmtDate(run.endDate, false, locale), run.candleCount, run.dataSource ?? "?", fmtDate(run.createdAt, true, locale))}
      />
      {run.status === "FAILED" && <Alert tone="error" title={t.failedTitle}>{backtestErrorText(run.error, locale)}</Alert>}
      {m && (
        <>
          <Alert tone="warn" className="mb-4" title={t.readFirst}>
            <ul className="list-disc ps-4">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </Alert>
          <Card className="mb-4">
            <CardHeader title={t.wholePeriod} description={t.finalEquity(fmtMoney(m.finalEquity), fmtMoney(Number(s.initialCapital ?? 10000)))} />
            <MetricsGrid m={m} t={t} />
            {bench && <p className="mt-4 text-sm text-ink-2">{t.benchmark} {benchmarkName(bench.name, locale)}: <b className="ltr text-ink">{fmtPct(bench.netReturnPct)}</b>, {t.maxDrawdownLower} <span className="ltr">{fmtPct(bench.maxDrawdownPct, 1, false)}</span>.</p>}
          </Card>
          <Card className="mb-4">
            <CardHeader title={t.equityTitle} description={t.equityDesc} />
            <EquityChart points={(run.equityCurve as { t: number; equity: number; benchmark: number }[]) ?? []} splitTime={m.splitTime} />
          </Card>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card><CardHeader title={t.inSample} description={t.inSampleDesc} /><MetricsGrid m={m.inSample} t={t} /></Card>
            <Card>
              <CardHeader title={t.outOfSample} description={m.splitTime ? t.oosFrom(fmtDate(m.splitTime, false, locale)) : t.disabled} />
              {m.outOfSample ? <MetricsGrid m={m.outOfSample} t={t} /> : <p className="text-sm text-ink-2">{t.oosZero}</p>}
            </Card>
          </div>
        </>
      )}
      <Card className="mb-4">
        <CardHeader title={t.allTrades(run.trades.length)} description={t.allTradesDesc} />
        <TableWrap>
          <table className="w-full">
            <thead><tr><th className={th}>{t.thEntry}</th><th className={th}>{t.thExit}</th><th className={th}>{t.thEntryPx}</th><th className={th}>{t.thExitPx}</th><th className={th}>{t.thStop}</th><th className={th}>{t.thTarget}</th><th className={th}>{t.thReason}</th><th className={th}>{t.thNetPl}</th><th className={th}>{t.thReturn}</th><th className={th}>{t.thR}</th><th className={th}>{t.thBars}</th><th className={th}>{t.thSet}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {run.trades.map((tr) => (
                <tr key={tr.id}>
                  <td className={`${td} text-xs`}>{fmtDate(tr.entryTime, true, locale)}</td>
                  <td className={`${td} text-xs`}>{fmtDate(tr.exitTime, true, locale)}</td>
                  <td className={`${td} tabular`}>{fmtPrice(tr.entryPrice)}</td>
                  <td className={`${td} tabular`}>{fmtPrice(tr.exitPrice)}</td>
                  <td className={`${td} tabular text-ink-2`}>{fmtPrice(tr.stopPrice)}</td>
                  <td className={`${td} tabular text-ink-2`}>{fmtPrice(tr.targetPrice)}</td>
                  <td className={td}><Badge tone={tr.exitReason === "TARGET" ? "good" : tr.exitReason === "STOP" ? "bad" : "neutral"}>{exitReasonShort(tr.exitReason, locale)}</Badge></td>
                  <td className={`${td} tabular ${tr.netPnl >= 0 ? "text-good-ink" : "text-bad-ink"}`}>{fmtMoney(tr.netPnl)}</td>
                  <td className={`${td} tabular`}>{fmtPct(tr.returnPct)}</td>
                  <td className={`${td} tabular`}>{fmtNum(tr.rMultiple)}</td>
                  <td className={`${td} tabular`}>{tr.barsHeld}</td>
                  <td className={`${td} text-xs text-ink-2`}>{tr.segment === "OUT_OF_SAMPLE" ? t.oos : t.is}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
      <Card className="mb-4">
        <CardHeader title={t.assumptions} />
        <pre dir="ltr" className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-start text-xs">{JSON.stringify({ settings: run.settings, params: run.params }, null, 2)}</pre>
      </Card>
      <Disclaimer />
    </>
  );
}
