import type { Metadata } from "next";
import { getFx } from "@/lib/fx";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { CandleChart } from "@/components/charts/candle-chart";
import { OpenPaperFromSignal } from "@/components/paper-from-signal";
import { SignalPlain } from "@/components/simple/signal-plain";
import { SignalBadge, StatusBadge } from "@/components/signal-badge";
import { Alert, ButtonLink, Card, CardHeader, Disclaimer, PageHeader, Stat, TableWrap, td, th } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fmtDate, fmtNum, fmtPct, fmtPrice, timeAgo } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import type { Timeframe } from "@/lib/market/types";
import { conditionPlain, timeframeWord } from "@/lib/plain";
import { getSettings } from "@/lib/settings/service";
import { evidenceText, indicatorLabel, signalStatusText, statusReasonText, strategyText, summaryText } from "@/lib/strategies/i18n";
import { getStrategy } from "@/lib/strategies/registry";
import { directionOf, type Condition, type SignalState } from "@/lib/strategies/types";

const L = {
  en: {
    metaTitle: "Signal details",
    created: (date: string, ago: string) => `Signal created ${date} (${ago})`,
    explain: "Explain this signal",
    riskCalc: "Risk calculator",
    notActiveTitle: (status: string) => `This signal is ${status.toLowerCase()}`,
    notActiveBody: "It is kept for the record. See the status history below.",
    noSignalTitle: "No signal — data problem",
    whyTitle: "Why this signal",
    groupSetup: "Setup rules",
    groupConfirm: "Confirmations",
    groupExit: "Exit rules",
    met: "met",
    notMet: "not met",
    unavailable: "unavailable",
    notEvaluable: " (not evaluable: missing data, treated as not met)",
    rulesCount: (met: number, total: number) => `${met} of ${total} relevant rules met. This count is descriptive — it is not a probability or confidence score.`,
    levels: "Levels",
    levelsDesc: (pair: string) => `Pair ${pair}; analysis price = close of the last closed candle.`,
    priceAtAnalysis: "Price at analysis",
    dataAt: (d: string) => `data ${d}`,
    rrAfterCosts: "R/R after costs",
    toFirstTarget: "to first target",
    entryZone: "Entry zone",
    cancelledAbove: "Cancelled above",
    invalidation: "Invalidation",
    fromPrice: "from price",
    target: (n: number) => `Target ${n}`,
    expiryLine: (expiry: string | null, targets: string) =>
      `Expiry / re-evaluation: re-checked at every candle close; ${expiry ? `expires ${expiry} unless re-confirmed` : "no expiry"}. Targets: ${targets}`,
    risksTitle: "Risks & conflicting evidence",
    noRisks: "No specific risks flagged by the rules. Markets can still move against any setup.",
    conflict: "Conflict:",
    data: "Data:",
    risksNote: "A technically strong setup can still lose money: news, liquidity gaps and sudden volatility are not captured by indicators. Stops can fill at worse prices than planned.",
    indicatorsTitle: "Indicator values at analysis time",
    indUnavailable: "unavailable",
    evidenceTitle: "Historical evidence (backtest)",
    trades: "Trades",
    winRate: "Win rate",
    netReturn: "Net return",
    buyHold: "Buy & hold",
    maxDrawdown: "Max drawdown",
    profitFactor: "Profit factor",
    fromBacktest: "From backtest ",
    run: "run",
    overPeriod: (from: string, to: string) => ` over ${from} – ${to}. Past simulated results do not guarantee future performance.`,
    noBacktest: "No backtest has been run for this strategy, asset and timeframe. ",
    runOne: "Run one",
    runOneAfter: " to see how these rules behaved historically.",
    chart: "Chart",
    historyTitle: "Status history",
    thTime: "Time",
    thChange: "Change",
    thReason: "Reason",
    thPrice: "Price",
    arrow: "→",
    strategyFooter: (name: string, v: number) => `Strategy “${name}” v${v}. `,
    viewRules: "View its rules and parameters.",
  },
  fa: {
    metaTitle: "جزئیات سیگنال",
    created: (date: string, ago: string) => `سیگنال در ${date} ساخته شد (${ago})`,
    explain: "توضیح این سیگنال",
    riskCalc: "ماشین‌حساب ریسک",
    notActiveTitle: (status: string) => `این سیگنال ${status} است`,
    notActiveBody: "برای ثبت در سابقه نگه داشته شده است. تاریخچهٔ وضعیت را در پایین ببینید.",
    noSignalTitle: "بدون سیگنال — مشکل داده",
    whyTitle: "چرا این سیگنال؟",
    groupSetup: "شرط‌های اصلی",
    groupConfirm: "تأییدها",
    groupExit: "شرط‌های خروج",
    met: "برقرار",
    notMet: "برقرار نیست",
    unavailable: "نامعلوم",
    notEvaluable: " (قابل بررسی نیست: داده کم است، برقرار نیست حساب می‌شود)",
    rulesCount: (met: number, total: number) => `${met} از ${total} شرطِ مرتبط برقرار است. این عدد فقط توصیف وضعیت است — احتمال موفقیت یا میزان اطمینان نیست.`,
    levels: "سطح‌های قیمت",
    levelsDesc: (pair: string) => `جفت‌ارز ${pair}؛ قیمت تحلیل = قیمت بسته شدنِ آخرین کندلِ کامل‌شده.`,
    priceAtAnalysis: "قیمت هنگام تحلیل",
    dataAt: (d: string) => `داده: ${d}`,
    rrAfterCosts: "نسبت سود به ضرر (با هزینه‌ها)",
    toFirstTarget: "تا اولین هدف سود",
    entryZone: "محدودهٔ خرید",
    cancelledAbove: "لغو می‌شود بالای",
    invalidation: "حد ضرر",
    fromPrice: "از قیمت فعلی",
    target: (n: number) => `هدف سود ${n}`,
    expiryLine: (expiry: string | null, targets: string) =>
      `اعتبار / بررسی دوباره: در پایان هر کندل دوباره بررسی می‌شود؛ ${expiry ? `اگر دوباره تأیید نشود، در ${expiry} منقضی می‌شود` : "تاریخ انقضا ندارد"}. هدف‌های سود: ${targets}`,
    risksTitle: "ریسک‌ها و نشانه‌های مخالف",
    noRisks: "قوانین این روش ریسک خاصی را علامت نزده‌اند. با این حال بازار همیشه می‌تواند برخلاف هر فرصتی حرکت کند.",
    conflict: "نشانهٔ مخالف:",
    data: "داده:",
    risksNote: "یک فرصتِ فنیِ قوی هم می‌تواند ضرر بدهد: اخبار، کمبود خریدار و فروشنده و نوسان‌های ناگهانی در شاخص‌ها دیده نمی‌شوند. حد ضرر ممکن است با قیمتی بدتر از برنامه اجرا شود.",
    indicatorsTitle: "مقدار شاخص‌ها هنگام تحلیل",
    indUnavailable: "نامعلوم",
    evidenceTitle: "شواهد گذشته (آزمایش روی گذشته / بک‌تست)",
    trades: "معامله‌ها",
    winRate: "درصد معاملات سودده",
    netReturn: "بازده خالص",
    buyHold: "خرید و نگه‌داری",
    maxDrawdown: "بیشترین افت",
    profitFactor: "ضریب سود (سودها ÷ ضررها)",
    fromBacktest: "برگرفته از ",
    run: "این آزمایش روی گذشته",
    overPeriod: (from: string, to: string) => ` در بازهٔ ${from} تا ${to}. نتیجه‌های شبیه‌سازی‌شدهٔ گذشته، سود آینده را تضمین نمی‌کنند.`,
    noBacktest: "برای این روش، ارز و بازهٔ زمانی هنوز آزمایش روی گذشته انجام نشده. ",
    runOne: "یکی اجرا کنید",
    runOneAfter: " تا ببینید این قوانین در گذشته چطور عمل کرده‌اند.",
    chart: "نمودار",
    historyTitle: "تاریخچهٔ وضعیت",
    thTime: "زمان",
    thChange: "تغییر",
    thReason: "دلیل",
    thPrice: "قیمت",
    arrow: "←",
    strategyFooter: (name: string, v: number) => `روش «${name}» نسخهٔ ${v}. `,
    viewRules: "قوانین و تنظیماتش را ببینید.",
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.metaTitle };
}

export default async function SignalDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const s = await db().signal.findFirst({ where: { id, userId: user.id }, include: { asset: true, statusChanges: { orderBy: { createdAt: "asc" } }, paperTrades: true } });
  if (!s) notFound();
  const settings = await getSettings(user.id);
  const fx = await getFx(settings);
  if (settings.ui.simple && (await searchParams).full !== "1") return <SignalPlain signal={s} currency={fx.currency} eurRate={fx.rate} />;
  const [t, locale] = await Promise.all([getL(L), getLocale()]);
  const fa = locale === "fa";
  const rate = fx.eurPerUsd;
  const eur = (v: number | null) => (rate && v !== null ? ` ≈ €${fmtNum(v * rate, v * rate >= 1 ? 2 : 6)}` : "");
  const def = getStrategy(s.strategyId);
  const dt = def ? strategyText(def, locale) : null;
  const state = s.state as SignalState;
  const dir = directionOf(state);
  const conditions = s.conditions as unknown as Condition[];
  const indicators = s.indicators as Record<string, number | null>;
  const risks = (s.risks as string[]).map((x) => evidenceText(x, locale));
  const conflicts = (s.conflicts as string[]).map((x) => evidenceText(x, locale));
  const dataIssues = (s.dataIssues as string[]).map((x) => evidenceText(x, locale));
  const evidence = s.evidence as null | { backtestRunId: string; trades: number | null; winRatePct: number | null; netReturnPct: number | null; maxDrawdownPct: number | null; profitFactor: number | null; benchmarkReturnPct: number | null; period: { from: string; to: string } };
  const riskPct = s.invalidation !== null && dir === "long" ? ((s.price - s.invalidation) / s.price) * 100 : null;
  const groups: { key: Condition["group"]; title: string }[] = [
    { key: "setup", title: t.groupSetup },
    { key: "confirm", title: t.groupConfirm },
    { key: "exit", title: t.groupExit },
  ];
  const calcHref = s.invalidation !== null && dir === "long" ? `/risk?entry=${s.price}&stop=${s.invalidation}${s.targets[0] ? `&target=${s.targets[0]}` : ""}` : "/risk";
  const tfName = fa ? timeframeWord(s.timeframe, "fa") : s.timeframe;
  const invRule = conditions.length ? (dt?.rules.invalidation ?? "") : "";
  const invSub = [
    ...(invRule ? [invRule] : []),
    ...(riskPct !== null ? [<><span className="ltr">{fmtPct(-riskPct)}</span> {t.fromPrice}</>] : []),
  ];

  return (
    <>
      <PageHeader
        title={`${s.asset.symbol} · ${dt?.name ?? s.strategyId} · ${tfName}`}
        description={<span className="inline-flex flex-wrap items-center gap-2"><SignalBadge state={s.state} /><StatusBadge status={s.status} /> <span>{t.created(fmtDate(s.signalAt, true, locale), timeAgo(s.signalAt, undefined, locale))}</span></span>}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/explainer?signal=${s.id}`} variant="primary">{t.explain}</ButtonLink>
            <ButtonLink href={calcHref}>{t.riskCalc}</ButtonLink>
          </div>
        }
      />
      {s.status !== "ACTIVE" && <Alert tone="warn" className="mb-4" title={t.notActiveTitle(signalStatusText(s.status, locale))}>{t.notActiveBody}</Alert>}
      {state === "NO_SIGNAL" && <Alert tone="warn" className="mb-4" title={t.noSignalTitle}>{dataIssues.join(" ")}</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t.whyTitle} description={summaryText(s.summary, locale)} />
          <div className="space-y-4">
            {groups.map((g) => {
              const cs = conditions.filter((c) => c.group === g.key);
              if (!cs.length) return null;
              return (
                <div key={g.key}>
                  <h3 className="mb-1.5 text-sm font-semibold">{g.title}</h3>
                  <ul className="space-y-1.5">
                    {cs.map((c) => (
                      <li key={c.id} className="flex gap-2 text-sm">
                        {c.passed === true ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good-ink" aria-label={t.met} /> : c.passed === false ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad-ink" aria-label={t.notMet} /> : <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-warn-ink" aria-label={t.unavailable} />}
                        {fa ? (
                          <span>
                            <span className="text-ink" title={c.label}>{conditionPlain(c.id, c.label, "fa")}</span> <span className="text-ink-2">— <span className="ltr">{c.detail}</span>{c.passed === null ? t.notEvaluable : ""}</span>
                          </span>
                        ) : (
                          <span><span className="text-ink">{c.label}</span> <span className="text-ink-2">— {c.detail}{c.passed === null ? t.notEvaluable : ""}</span></span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <p className="text-xs text-ink-2">{t.rulesCount(s.rulesMet, s.rulesTotal)}</p>
          </div>
        </Card>
        <Card>
          <CardHeader title={t.levels} description={t.levelsDesc(s.pair)} />
          <div className="grid grid-cols-2 gap-4">
            <Stat label={t.priceAtAnalysis} value={<span className="tabular">{fmtPrice(s.price)}</span>} sub={<><span className="ltr">{eur(s.price)}</span> · {t.dataAt(fmtDate(s.marketDataAt, true, locale))}</>} />
            <Stat label={t.rrAfterCosts} value={<span className="tabular">{s.riskReward !== null ? s.riskReward.toFixed(2) : "—"}</span>} sub={t.toFirstTarget} />
            {s.entryLow !== null && <Stat label={t.entryZone} value={<span className="ltr text-base">{fmtPrice(s.entryLow)} – {fmtPrice(s.entryHigh)}</span>} />}
            <Stat
              label={dir === "exit" ? t.cancelledAbove : t.invalidation}
              value={<span className="tabular">{fmtPrice(s.invalidation)}</span>}
              sub={invSub.length ? invSub.map((x, i) => <span key={i}>{i > 0 && " · "}{x}</span>) : undefined}
            />
            {s.targets.map((tg, i) => <Stat key={i} label={t.target(i + 1)} value={<span className="tabular">{fmtPrice(tg)}</span>} sub={<span className="ltr">{`${fmtPct(((tg - s.price) / s.price) * 100)}${eur(tg)}`}</span>} />)}
          </div>
          <p className="mt-3 text-xs text-ink-2">{t.expiryLine(s.expiresAt ? fmtDate(s.expiresAt, true, locale) : null, dt?.rules.targets ?? "")}</p>
          {dir === "long" && s.status === "ACTIVE" && <div className="mt-4 border-t border-line pt-4"><OpenPaperFromSignal signalId={s.id} symbol={s.asset.symbol} stop={s.invalidation} target={s.targets[0] ?? null} already={s.paperTrades.length > 0} /></div>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.risksTitle} />
          {risks.length + conflicts.length + dataIssues.length === 0 ? <p className="text-sm text-ink-2">{t.noRisks}</p> : (
            <ul className="list-disc space-y-1 ps-5 text-sm">
              {conflicts.map((c, i) => <li key={`c${i}`}><b>{t.conflict}</b> {c}</li>)}
              {risks.map((r, i) => <li key={`r${i}`}>{r}</li>)}
              {dataIssues.map((d, i) => <li key={`d${i}`}><b>{t.data}</b> {d}</li>)}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-2">{t.risksNote}</p>
        </Card>
        <Card>
          <CardHeader title={t.indicatorsTitle} />
          <TableWrap>
            <table className="w-full"><tbody className="divide-y divide-line">
              {Object.entries(indicators).map(([k, v]) => (
                <tr key={k}><td className={`${td} text-ink-2`}>{indicatorLabel(k, locale)}</td><td className={`${td} tabular text-end`}>{v === null ? t.indUnavailable : Math.abs(v) >= 1 ? fmtNum(v, 4) : fmtNum(v, 6)}</td></tr>
              ))}
            </tbody></table>
          </TableWrap>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={t.evidenceTitle} />
        {evidence ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
            <Stat label={t.trades} value={evidence.trades ?? "—"} />
            <Stat label={t.winRate} value={<span className="tabular">{fmtPct(evidence.winRatePct, 1, false)}</span>} />
            <Stat label={t.netReturn} value={<span className="tabular">{fmtPct(evidence.netReturnPct)}</span>} />
            <Stat label={t.buyHold} value={<span className="tabular">{fmtPct(evidence.benchmarkReturnPct)}</span>} />
            <Stat label={t.maxDrawdown} value={<span className="tabular">{fmtPct(evidence.maxDrawdownPct, 1, false)}</span>} />
            <Stat label={t.profitFactor} value={evidence.profitFactor !== null ? evidence.profitFactor.toFixed(2) : "—"} />
            <p className="col-span-full text-xs text-ink-2">{t.fromBacktest}<Link className="underline" href={`/backtest/${evidence.backtestRunId}`}>{t.run}</Link>{t.overPeriod(fmtDate(evidence.period.from, false, locale), fmtDate(evidence.period.to, false, locale))}</p>
          </div>
        ) : (
          <p className="text-sm text-ink-2">{t.noBacktest}<Link className="text-accent underline" href={`/backtest?symbol=${s.asset.symbol}&strategy=${s.strategyId}&tf=${s.timeframe}`}>{t.runOne}</Link>{t.runOneAfter}</p>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title={t.chart} />
        <CandleChart symbol={s.asset.symbol} initialTf={s.timeframe as Timeframe} focusSignalId={s.id} />
      </Card>

      <Card className="mt-4">
        <CardHeader title={t.historyTitle} />
        <TableWrap>
          <table className="w-full">
            <thead><tr><th className={th}>{t.thTime}</th><th className={th}>{t.thChange}</th><th className={th}>{t.thReason}</th><th className={th}>{t.thPrice}</th></tr></thead>
            <tbody className="divide-y divide-line">
              {s.statusChanges.map((c) => (
                <tr key={c.id}><td className={td}>{fmtDate(c.createdAt, true, locale)}</td><td className={td}>{c.fromStatus ? signalStatusText(c.fromStatus, locale) : "—"} {t.arrow} {signalStatusText(c.toStatus, locale)}</td><td className={`${td} whitespace-normal`}>{statusReasonText(c.reason, locale)}</td><td className={`${td} tabular`}>{fmtPrice(c.price)}</td></tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {def && <p className="mt-3 text-xs text-ink-2">{t.strategyFooter(dt?.name ?? def.name, s.strategyVersion)}<Link className="underline" href="/strategies">{t.viewRules}</Link></p>}
      </Card>
      <div className="mt-6"><Disclaimer /></div>
    </>
  );
}
