import type { Metadata } from "next";
import { getFx } from "@/lib/fx";
import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat, TableWrap, td, th } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import { paperSummary } from "@/lib/paper/service";
import { getSettings } from "@/lib/settings/service";
import { getStrategy } from "@/lib/strategies/registry";
import { CloseTrade, NewPaperTrade } from "./actions";
import { PracticeHistory, PracticeNew, PracticeOpenList, type PracticeTrade } from "@/components/simple/practice";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { exitReasonPlain, strategyName, timeframeWord } from "@/lib/plain";

const L = {
  en: {
    metaTitle: "Paper trading",
    // Simple view
    sTitle: "Practice trades",
    sIntro1: "Practise with ",
    sPretend: "pretend money",
    sIntro2: " before using real money. Nothing is really bought or sold — the app just follows the live price for you.",
    sRunning: "Practice trades running",
    sResult: "Finished result",
    sStart: "Start a practice trade",
    sYours: "Your practice trades",
    sEmpty: "You have no practice trades running. Start one above — try €100 on a coin you like.",
    sFinished: "Finished",
    sWorks: "Does the app's advice work?",
    sWorksSub: "(automatic test of every buy idea)",
    sWorksBody: "Every time the app finds a buy idea, it secretly “buys” it with pretend money and follows it — so you can see honestly how often its ideas win or lose.",
    sSoFar: "So far:",
    sFinishedN: (n: number) => `${n} finished`,
    sWonLost: (w: number, l: number) => `(${w} won, ${l} lost)`,
    sStillRunning: (n: number) => `${n} still running`,
    sRunningTitle: "Running",
    sNothing: "Nothing running.",
    // Advanced view
    title: "Paper trading",
    descIntro: "Hypothetical positions only — no orders are ever sent anywhere.",
    descAuto: (strongOnly: boolean) => `Every ${strongOnly ? "strong" : "potential or strong"} buy signal is recorded automatically so that losing signals are visible too.`,
    descOff: "Automatic signal tracking is off (Settings).",
    open: "Open",
    closed: "Closed",
    winRate: "Win rate",
    wonLost: (w: number, l: number) => `${w} won · ${l} lost`,
    netPnl: "Net P/L (closed)",
    fees: "Fees paid (simulated)",
    recordTitle: "Record a manual hypothetical trade",
    recordDesc: "Entry = current public market price + your slippage setting. Stops/targets are checked by the worker against stored candles.",
    openPositions: (n: number) => `Open positions (${n})`,
    noOpen: "No open paper positions",
    thAsset: "Asset",
    thSource: "Source",
    thOpened: "Opened",
    thEntry: "Entry",
    thQty: "Qty",
    thStop: "Stop",
    thTarget: "Target",
    thActions: "Actions",
    auto: "auto",
    signal: "signal",
    manual: "manual",
    closedTitle: (n: number) => `Closed (${n})`,
    closedDesc: "Winners and losers are both kept.",
    noClosed: "No closed paper trades yet",
    thEntryExit: "Entry → exit",
    thExit: "Exit",
    thReason: "Reason",
    thNet: "Net P/L",
    thFees: "Fees",
    arrow: "→",
    limitations: "Limitations: auto-tracked entries assume a fill at the signal candle's close plus slippage; exits are detected on stored candles (intrabar order unknown — stops are assumed to hit first). Real fills can differ.",
  },
  fa: {
    metaTitle: "معاملهٔ تمرینی",
    sTitle: "معاملهٔ تمرینی",
    sIntro1: "قبل از استفاده از پول واقعی، با ",
    sPretend: "پول مجازی",
    sIntro2: " تمرین کنید. هیچ‌چیز واقعاً خرید یا فروش نمی‌شود — برنامه فقط قیمت زنده را برایتان دنبال می‌کند.",
    sRunning: "معامله‌های تمرینیِ باز",
    sResult: "نتیجهٔ معامله‌های تمام‌شده",
    sStart: "شروع یک معاملهٔ تمرینی",
    sYours: "معامله‌های تمرینی شما",
    sEmpty: "هیچ معاملهٔ تمرینی بازی ندارید. از بالا یکی شروع کنید — مثلاً ۱۰۰ یورو روی ارزی که دوست دارید.",
    sFinished: "تمام‌شده",
    sWorks: "آیا پیشنهادهای برنامه جواب می‌دهد؟",
    sWorksSub: "(آزمایش خودکار هر فرصت خرید)",
    sWorksBody: "هر بار که برنامه یک فرصت خرید پیدا می‌کند، بی‌سروصدا آن را با پول مجازی «می‌خرد» و دنبالش می‌کند — تا بتوانید صادقانه ببینید پیشنهادهایش چند بار سود و چند بار ضرر داده‌اند.",
    sSoFar: "تا الان:",
    sFinishedN: (n: number) => `${n} تمام‌شده`,
    sWonLost: (w: number, l: number) => `(${w} با سود، ${l} با ضرر)`,
    sStillRunning: (n: number) => `${n} هنوز باز`,
    sRunningTitle: "باز",
    sNothing: "معاملهٔ بازی نیست.",
    title: "معاملهٔ تمرینی",
    descIntro: "فقط معامله‌های فرضی — هیچ سفارشی به هیچ‌جا فرستاده نمی‌شود.",
    descAuto: (strongOnly: boolean) => `هر سیگنال ${strongOnly ? "خرید قوی" : "خرید احتمالی یا قوی"} به‌طور خودکار ثبت می‌شود تا سیگنال‌های ضرره هم دیده شوند.`,
    descOff: "ثبت خودکار سیگنال‌ها خاموش است (تنظیمات).",
    open: "باز",
    closed: "بسته‌شده",
    winRate: "درصد برد",
    wonLost: (w: number, l: number) => `${w} با سود · ${l} با ضرر`,
    netPnl: "سود/ضرر خالص (بسته‌شده‌ها)",
    fees: "کارمزد پرداختی (شبیه‌سازی)",
    recordTitle: "ثبت دستی یک معاملهٔ فرضی",
    recordDesc: "قیمت خرید = قیمت فعلی بازار + لغزش قیمت (اختلاف قیمت اجرا) طبق تنظیمات شما. رسیدن به حد ضرر یا هدف سود را برنامه با کندل‌های ذخیره‌شده بررسی می‌کند.",
    openPositions: (n: number) => `معامله‌های باز (${n})`,
    noOpen: "معاملهٔ تمرینیِ بازی نیست",
    thAsset: "ارز",
    thSource: "منبع",
    thOpened: "زمان شروع",
    thEntry: "قیمت خرید",
    thQty: "مقدار",
    thStop: "حد ضرر",
    thTarget: "هدف سود",
    thActions: "کارها",
    auto: "خودکار",
    signal: "سیگنال",
    manual: "دستی",
    closedTitle: (n: number) => `بسته‌شده (${n})`,
    closedDesc: "معامله‌های سودده و ضررده هر دو نگه داشته می‌شوند.",
    noClosed: "هنوز معاملهٔ تمرینیِ بسته‌شده‌ای نیست",
    thEntryExit: "شروع ← پایان",
    thExit: "قیمت فروش",
    thReason: "دلیل",
    thNet: "سود/ضرر خالص",
    thFees: "کارمزد",
    arrow: "←",
    limitations: "محدودیت‌ها: برای معامله‌های خودکار فرض می‌شود خرید با قیمت پایانی کندل سیگنال به‌اضافهٔ لغزش قیمت انجام شده؛ خروج‌ها روی کندل‌های ذخیره‌شده تشخیص داده می‌شوند (ترتیب حرکت قیمت داخل یک کندل معلوم نیست — فرض می‌شود اول حد ضرر خورده). نتیجهٔ واقعی ممکن است فرق کند.",
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.metaTitle };
}

export default async function PaperPage() {
  const user = await requireUser();
  const [trades, settings, watch] = await Promise.all([
    db().paperTrade.findMany({ where: { userId: user.id }, include: { asset: { select: { symbol: true, binanceSymbol: true } }, signal: { select: { id: true, state: true } } }, orderBy: { entryAt: "desc" }, take: 500 }),
    getSettings(user.id),
    db().watchlistItem.findMany({ where: { userId: user.id }, include: { asset: { select: { symbol: true } } } }),
  ]);
  const sum = paperSummary(trades);
  const t = await getL(L);
  const locale = await getLocale();
  const fa = locale === "fa";
  if (settings.ui.simple) {
    const fx = await getFx(settings);
    const eurRate = fx.rate; // USD → display currency
    const cur = fx.currency;
    const toPlain = (x: (typeof trades)[number]): PracticeTrade => ({
      id: x.id, symbol: x.asset.symbol, pair: x.asset.binanceSymbol, source: x.source, strategyId: x.strategyId, timeframe: x.timeframe, status: x.status,
      entryPrice: x.entryPrice, entryAt: x.entryAt.toISOString(), quantity: x.quantity, stopPrice: x.stopPrice, targetPrice: x.targetPrice,
      feeRate: x.feeRate, slippageRate: x.slippageRate, sellCost: x.sellCost, exitPrice: x.exitPrice, exitAt: x.exitAt?.toISOString() ?? null, exitReason: x.exitReason, netPnl: x.netPnl,
    });
    const mine = trades.filter((x) => x.source === "MANUAL").map(toPlain);
    const auto = trades.filter((x) => x.source === "AUTO_SIGNAL").map(toPlain);
    const autoClosed = auto.filter((x) => x.status === "CLOSED");
    const autoWon = autoClosed.filter((x) => (x.netPnl ?? 0) > 0).length;
    const net = trades.filter((x) => x.status === "CLOSED").reduce((a, x) => a + (x.netPnl ?? 0), 0);
    const conv = (usd: number) => usd * eurRate;
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{t.sTitle}</h1>
          <p className="mt-1 text-ink-2">{t.sIntro1}<b className="text-ink">{t.sPretend}</b>{t.sIntro2}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-surface p-4"><div className="text-sm text-ink-2">{t.sRunning}</div><div className="text-2xl font-semibold">{mine.filter((x) => x.status === "OPEN").length}</div></div>
          <div className="rounded-xl border border-line bg-surface p-4"><div className="text-sm text-ink-2">{t.sResult}</div><div className={`text-2xl font-semibold ${net >= 0 ? "text-good-ink" : "text-bad-ink"}`}><span className="ltr">{net >= 0 ? "+" : ""}{fmtMoney(conv(net), cur)}</span></div></div>
        </div>
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-lg font-semibold">{t.sStart}</h2>
          <PracticeNew symbols={watch.map((w) => w.asset.symbol)} currency={cur === "IRT" ? "EUR" : cur} />
        </section>
        <PracticeOpenList trades={mine.filter((x) => x.status === "OPEN")} currency={cur} eurRate={eurRate} title={t.sYours} empty={t.sEmpty} />
        <section>
          <h2 className="mb-2 text-lg font-semibold">{t.sFinished}</h2>
          <PracticeHistory trades={mine.filter((x) => x.status === "CLOSED")} currency={cur} eurRate={eurRate} />
        </section>
        <details className="rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-semibold">{t.sWorks} <span className="font-normal text-ink-2">{t.sWorksSub}</span></summary>
          <p className="mt-2 text-sm text-ink-2">
            {t.sWorksBody}{" "}
            {t.sSoFar} <b className="text-ink">{t.sFinishedN(autoClosed.length)}</b> {t.sWonLost(autoWon, autoClosed.length - autoWon)}{fa ? "، " : ", "}<b className="text-ink">{t.sStillRunning(auto.length - autoClosed.length)}</b>.
          </p>
          <div className="mt-4 space-y-6">
            <PracticeOpenList trades={auto.filter((x) => x.status === "OPEN")} currency={cur} eurRate={eurRate} title={t.sRunningTitle} empty={t.sNothing} />
            <section><h3 className="mb-2 font-semibold">{t.sFinished}</h3><PracticeHistory trades={autoClosed} currency={cur} eurRate={eurRate} /></section>
          </div>
        </details>
      </div>
    );
  }
  const open = trades.filter((x) => x.status === "OPEN");
  const closed = trades.filter((x) => x.status === "CLOSED");
  const tfw = (tf: string | null) => (tf ? (fa ? timeframeWord(tf, locale) : tf) : "");
  const stratName = (id: string | null) => (fa ? (id ? strategyName(id, locale) : t.signal) : (getStrategy(id ?? "")?.name ?? t.signal));
  return (
    <>
      <PageHeader
        title={t.title}
        description={<>{t.descIntro} {settings.paper.autoTrackSignals ? t.descAuto(settings.paper.autoTrackMinState === "STRONG_BUY_SETUP") : t.descOff}</>}
      />
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat label={t.open} value={sum.open} />
          <Stat label={t.closed} value={sum.closed} />
          <Stat label={t.winRate} value={fmtPct(sum.winRatePct, 1, false)} sub={t.wonLost(sum.wins, sum.losses)} />
          <Stat label={t.netPnl} value={<span className={sum.netPnl >= 0 ? "text-good-ink" : "text-bad-ink"}>{fmtMoney(sum.netPnl)}</span>} />
          <Stat label={t.fees} value={fmtMoney(sum.fees)} />
        </div>
      </Card>
      <Card className="mb-4">
        <CardHeader title={t.recordTitle} description={t.recordDesc} />
        <NewPaperTrade symbols={watch.map((w) => w.asset.symbol)} defaultRisk={(settings.risk.accountBalance * settings.risk.riskPerTradePct) / 100} />
      </Card>
      <Card className="mb-4">
        <CardHeader title={t.openPositions(open.length)} />
        {open.length === 0 ? <EmptyState title={t.noOpen} /> : (
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className={th}>{t.thAsset}</th><th className={th}>{t.thSource}</th><th className={th}>{t.thOpened}</th><th className={th}>{t.thEntry}</th><th className={th}>{t.thQty}</th><th className={th}>{t.thStop}</th><th className={th}>{t.thTarget}</th><th className={th}><span className="sr-only">{t.thActions}</span></th></tr></thead>
              <tbody className="divide-y divide-line">
                {open.map((tr) => (
                  <tr key={tr.id}>
                    <td className={td}><Link href={`/assets/${tr.asset.symbol}`} className="font-medium hover:underline">{tr.asset.symbol}</Link></td>
                    <td className={td}>{tr.source === "AUTO_SIGNAL" ? <Link href={`/signals/${tr.signalId}`}><Badge tone="accent">{t.auto} · {stratName(tr.strategyId)} {tfw(tr.timeframe)}</Badge></Link> : <Badge>{t.manual}</Badge>}</td>
                    <td className={`${td} text-xs`}>{fmtDate(tr.entryAt, true, locale)}</td>
                    <td className={`${td} tabular`}>{fmtPrice(tr.entryPrice)}</td>
                    <td className={`${td} tabular`}>{fmtNum(tr.quantity, 6)}</td>
                    <td className={`${td} tabular`}>{fmtPrice(tr.stopPrice)}</td>
                    <td className={`${td} tabular`}>{fmtPrice(tr.targetPrice)}</td>
                    <td className={td}><CloseTrade id={tr.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
      <Card>
        <CardHeader title={t.closedTitle(closed.length)} description={t.closedDesc} />
        {closed.length === 0 ? <EmptyState title={t.noClosed} /> : (
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className={th}>{t.thAsset}</th><th className={th}>{t.thSource}</th><th className={th}>{t.thEntryExit}</th><th className={th}>{t.thEntry}</th><th className={th}>{t.thExit}</th><th className={th}>{t.thReason}</th><th className={th}>{t.thNet}</th><th className={th}>{t.thFees}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {closed.map((tr) => (
                  <tr key={tr.id}>
                    <td className={td}>{tr.asset.symbol}</td>
                    <td className={td}>{tr.source === "AUTO_SIGNAL" ? `${t.auto} ${tr.timeframe ? tfw(tr.timeframe) : ""}` : t.manual}</td>
                    <td className={`${td} text-xs`}>{fmtDate(tr.entryAt, true, locale)} {t.arrow} {fmtDate(tr.exitAt, true, locale)}</td>
                    <td className={`${td} tabular`}>{fmtPrice(tr.entryPrice)}</td>
                    <td className={`${td} tabular`}>{fmtPrice(tr.exitPrice)}</td>
                    <td className={td}><Badge tone={tr.exitReason === "TARGET" ? "good" : tr.exitReason === "STOP" ? "bad" : "neutral"}>{fa ? exitReasonPlain(tr.exitReason, locale) : (tr.exitReason ?? "").toLowerCase()}</Badge></td>
                    <td className={`${td} tabular ${(tr.netPnl ?? 0) >= 0 ? "text-good-ink" : "text-bad-ink"}`}>{fmtMoney(tr.netPnl)}</td>
                    <td className={`${td} tabular text-ink-2`}>{fmtMoney(tr.fees)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="mt-3 text-xs text-ink-2">{t.limitations}</p>
      </Card>
    </>
  );
}
