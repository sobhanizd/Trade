import type { Metadata } from "next";
import Link from "next/link";
import { RiskBadge, SignalBadge } from "@/components/signal-badge";
import { OverviewTiles } from "@/components/market/overview-tiles";
import { SimpleHome } from "@/components/simple-home";
import { Alert, ButtonLink, Card, CardHeader, Change, Disclaimer, EmptyState, PageHeader, Stat, TableWrap, td, th } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { urgentForWatchlist } from "@/lib/analysis/outlook";
import { adviceForWatchlist } from "@/lib/analysis/advice-service";
import { db } from "@/lib/db";
import { fmtBig, fmtDate, fmtMoney, fmtPrice, perGram, timeAgo } from "@/lib/format";
import { paperSummary } from "@/lib/paper/service";
import { getStrategy } from "@/lib/strategies/registry";
import { getMarketView, lastScan, priceChecks, providerHealth } from "@/lib/views";
import { PriceCheckSummary } from "@/components/source-check";
import { sourceLabel } from "@/lib/market/crosscheck";
import { CANDLE_PROVIDER_IDS, candleProviders } from "@/lib/market/providers";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { strategyName, timeframeWord } from "@/lib/plain";

const L = {
  en: {
    title: "Dashboard",
    workerDown: "Background scans are not running — start the worker (npm run worker).",
    providersDown: (p: string) => `${p} temporarily unavailable; showing the latest stored data.`,
    checkTitle: "Prices can't be double-checked right now",
    checkDown: (p: string) => `${p} (the second exchange used to double-check prices) is not responding. Your prices are still up to date from the main sources, but they can't be double-checked until it's back.`,
    descA: "Real market data with timestamps. Last successful scan: ",
    descB: ".",
    ask: "Ask the explainer",
    staleTitle: "Scans are not running recently",
    staleA: (ago: string) => `The last successful market scan was ${ago}. Make sure the worker process is running (`,
    staleB: "). Signals may be stale.",
    providerTitle: "Data provider issues",
    failing: "failing",
    see: " — see ",
    status: "System status",
    unavailable: "Unavailable",
    providerTime: (time: string, ago: string, eur: boolean) => `Provider time ${time} · fetched ${ago}${eur ? " · converted from USD at ECB rate" : ""}`,
    noSnapshot: "No snapshot yet — the worker fetches every 10 minutes.",
    analysis: "Analysis →",
    marketCap: "Market cap",
    volume: "24h volume",
    watchlist: "Watchlist",
    watchlistDesc: "Latest notable signal per asset",
    manage: "Manage",
    emptyWatchlist: "Your watchlist is empty",
    addAssets: "Add assets",
    thAsset: "Asset",
    thPrice: "Price",
    thSignal: "Latest signal",
    thRisk: "Risk",
    setups: "Active setups",
    setupsDesc: "Buy/exit states from the rule engine",
    allSignals: "All signals",
    noSetups: "No active buy or exit setups",
    noSetupsBody: "The engine is waiting. “No signal” is a valid and common outcome.",
    setupLine: (date: string, met: number, total: number, rr: string | null) => `Data ${date} · ${met}/${total} rules${rr !== null ? ` · R/R ${rr}` : ""}`,
    paper: "Paper trading",
    paperDesc: "Hypothetical — no real funds",
    open: "Open",
    openStat: "Open",
    closed: "Closed",
    winners: (p: string) => `${p}% winners`,
    netPnl: "Net P/L",
  },
  fa: {
    title: "داشبورد",
    workerDown: "بررسی‌های خودکار در پس‌زمینه اجرا نمی‌شوند — برنامهٔ پس‌زمینه (worker) را اجرا کنید (npm run worker).",
    providersDown: (p: string) => `${p} موقتاً در دسترس نیست؛ آخرین داده‌های ذخیره‌شده نمایش داده می‌شوند.`,
    checkTitle: "فعلاً نمی‌شود قیمت‌ها را دوباره بررسی کرد",
    checkDown: (p: string) => `${p} (صرافی دومی که قیمت‌ها با آن دوباره بررسی می‌شوند) جواب نمی‌دهد. قیمت‌های شما هنوز از منبع‌های اصلی به‌روز می‌شوند، ولی تا وقتی برنگردد نمی‌شود آن‌ها را دوباره بررسی کرد.`,
    descA: "دادهٔ واقعی بازار همراه با زمان. آخرین بررسی موفق: ",
    descB: ".",
    ask: "از توضیح‌دهنده بپرسید",
    staleTitle: "بررسی‌ها مدتی است اجرا نشده‌اند",
    staleA: (ago: string) => `آخرین بررسی موفق بازار ${ago} بود. مطمئن شوید برنامهٔ پس‌زمینه (worker) در حال اجراست (`,
    staleB: "). ممکن است سیگنال‌ها قدیمی باشند.",
    providerTitle: "مشکل در منبع داده",
    failing: "خطا",
    see: " — ببینید: ",
    status: "وضعیت سیستم",
    unavailable: "در دسترس نیست",
    providerTime: (time: string, ago: string, eur: boolean) => `زمان منبع داده ${time} · دریافت ${ago}${eur ? " · تبدیل از دلار با نرخ بانک مرکزی اروپا" : ""}`,
    noSnapshot: "هنوز داده‌ای نیست — برنامهٔ پس‌زمینه هر ۱۰ دقیقه داده می‌گیرد.",
    analysis: "تحلیل ←",
    marketCap: "ارزش بازار",
    volume: "حجم معاملات ۲۴ ساعته",
    watchlist: "ارزهای من",
    watchlistDesc: "آخرین سیگنال مهم هر ارز",
    manage: "مدیریت",
    emptyWatchlist: "هنوز ارزی اضافه نکرده‌اید",
    addAssets: "افزودن ارز",
    thAsset: "ارز",
    thPrice: "قیمت",
    thSignal: "آخرین سیگنال",
    thRisk: "ریسک",
    setups: "فرصت‌های فعال",
    setupsDesc: "وضعیت‌های خرید و خروج طبق قوانین برنامه",
    allSignals: "همهٔ سیگنال‌ها",
    noSetups: "فعلاً فرصت خرید یا خروجی نیست",
    noSetupsBody: "برنامه منتظر است. «بدون سیگنال» نتیجه‌ای عادی و رایج است.",
    setupLine: (date: string, met: number, total: number, rr: string | null) => `داده: ${date} · ${met} از ${total} شرط${rr !== null ? ` · نسبت سود به ضرر ${rr}` : ""}`,
    paper: "معاملهٔ تمرینی",
    paperDesc: "فرضی — بدون پول واقعی",
    open: "باز کردن",
    openStat: "باز",
    closed: "بسته‌شده",
    winners: (p: string) => `${p}% با سود`,
    netPnl: "سود/ضرر خالص",
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.title };
}

export default async function Dashboard() {
  const user = await requireUser();
  const [view, scan, providers, signals, paper] = await Promise.all([
    getMarketView(user.id),
    lastScan(),
    providerHealth(),
    db().signal.findMany({
      where: { userId: user.id, status: "ACTIVE", state: { in: ["STRONG_BUY_SETUP", "POTENTIAL_BUY", "EXIT_SETUP", "POTENTIAL_SELL"] } },
      include: { asset: { select: { symbol: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db().paperTrade.findMany({ where: { userId: user.id } }),
  ]);
  const cur = view.currency;
  // A failing cross-check exchange does not make the main data stale — it only means prices can't be double-checked.
  const mainCandles = candleProviders(view.settings.dataProviders.candleOrder)[0]?.id;
  const isCheckSource = (id: string) => CANDLE_PROVIDER_IDS.includes(id) && id !== mainCandles;
  const failing = providers.filter((p) => !p.ok && !isCheckSource(p.provider));
  const failingCheck = providers.filter((p) => !p.ok && isCheckSource(p.provider));
  const checks = await priceChecks(view.rows.map((r) => r.symbol));
  // eslint-disable-next-line react-hooks/purity -- server component: rendered once per request
  const now = Date.now();
  const scanStale = !scan.lastSuccess || now - scan.lastSuccess.getTime() > 20 * 60_000;
  const ps = paperSummary(paper);
  const t = await getL(L);
  const locale = await getLocale();
  const fa = locale === "fa";
  const tfw = (tf: string) => (fa ? timeframeWord(tf, locale) : tf);
  if (view.settings.ui.simple) {
    return (
      <SimpleHome
        view={view}
        lastScan={scan.lastSuccess}
        providerProblem={scanStale ? t.workerDown : failing.length ? t.providersDown(failing.map((p) => p.provider).join(fa ? "، " : ", ")) : null}
        checkProblem={!scanStale && failingCheck.length ? { title: t.checkTitle, body: t.checkDown(failingCheck.map((p) => sourceLabel(p.provider)).join(fa ? "، " : ", ")) } : null}
        dataCheck={<PriceCheckSummary checks={checks} symbols={view.rows.map((r) => r.symbol)} />}
        paper={{ open: ps.open, netPnl: ps.netPnl }}
        urgent={await urgentForWatchlist(user.id).catch(() => [])}
        advice={await adviceForWatchlist(user.id).catch(() => null)}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={t.title}
        description={<>{t.descA}<strong className="text-ink">{timeAgo(scan.lastSuccess, now, locale)}</strong>{t.descB}</>}
        action={<ButtonLink href="/explainer">{t.ask}</ButtonLink>}
      />
      {scanStale && (
        <Alert tone="warn" className="mb-4" title={t.staleTitle}>
          {t.staleA(timeAgo(scan.lastSuccess, now, locale))}<code>npm run worker</code>{t.staleB}
        </Alert>
      )}
      {failing.length > 0 && (
        <Alert tone="warn" className="mb-4" title={t.providerTitle}>
          {failing.map((p) => `${p.provider}: ${p.lastError ?? t.failing}`).join(" · ")}{t.see}<Link className="underline" href="/status">{t.status}</Link>.
        </Alert>
      )}
      {failingCheck.length > 0 && (
        <Alert tone="info" className="mb-4" title={t.checkTitle}>
          {t.checkDown(failingCheck.map((p) => sourceLabel(p.provider)).join(fa ? "، " : ", "))}{t.see}<Link className="underline" href="/status">{t.status}</Link>.
        </Alert>
      )}
      <PriceCheckSummary checks={checks} symbols={view.rows.map((r) => r.symbol)} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {["BTC", "ETH"].map((sym) => {
          const h = view.headline.find((x) => x.symbol === sym);
          const m = h?.market;
          return (
            <Card key={sym}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-ink-2">{sym === "BTC" ? (fa ? "بیت‌کوین" : "Bitcoin") : (fa ? "اتریوم" : "Ethereum")} · {cur}</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight">{m ? <span className="ltr">{fmtPrice(m.price, cur)}</span> : t.unavailable}</div>
                  <div className="mt-1 text-xs text-ink-2">{m ? t.providerTime(fmtDate(m.lastUpdated, true, locale), timeAgo(h?.fetchedAt, now, locale), cur === "EUR") : t.noSnapshot}</div>
                </div>
                <Link href={`/assets/${sym}`} className="shrink-0 text-sm text-accent hover:underline">{t.analysis}</Link>
              </div>
              {m && (
                <div className="mt-4 grid grid-cols-4 gap-2 text-sm">
                  {([["1h", m.change1h], ["24h", m.change24h], ["7d", m.change7d], ["30d", m.change30d]] as const).map(([l, v]) => (
                    <div key={l}>
                      <div className="text-xs text-ink-2">{l}</div>
                      <Change value={v} />
                    </div>
                  ))}
                </div>
              )}
              {m && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
                  <Stat label={t.marketCap} value={<span className="text-base">{fmtBig(m.marketCap, cur)}</span>} />
                  <Stat label={t.volume} value={<span className="text-base">{fmtBig(m.volume24h, cur)}</span>} />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <OverviewTiles view={view} />

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={t.watchlist} description={t.watchlistDesc} action={<Link href="/watchlist" className="text-sm text-accent hover:underline">{t.manage}</Link>} />
          {view.rows.length === 0 ? (
            <EmptyState title={t.emptyWatchlist} action={<ButtonLink href="/watchlist" variant="primary">{t.addAssets}</ButtonLink>} />
          ) : (
            <TableWrap>
              <table className="w-full">
                <thead><tr><th className={th}>{t.thAsset}</th><th className={th}>{t.thPrice}</th><th className={th}>24h</th><th className={th}>{t.thSignal}</th><th className={th}>{t.thRisk}</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {view.rows.map((r) => (
                    <tr key={r.symbol}>
                      <td className={td}><Link href={`/assets/${r.symbol}`} className="font-medium hover:underline">{r.symbol}</Link></td>
                      <td className={`${td} tabular`}>{fmtPrice(r.market?.price, cur)}{perGram(r.symbol, r.market?.price, cur) && <div className="text-xs text-ink-2">{perGram(r.symbol, r.market?.price, cur)}</div>}</td>
                      <td className={td}><Change value={r.market?.change24h} /></td>
                      <td className={td}>{r.latestSignal ? <Link href={`/signals/${r.latestSignal.id}`} className="inline-flex items-center gap-2"><SignalBadge state={r.latestSignal.state} /><span className="text-xs text-ink-2">{tfw(r.latestSignal.timeframe)}</span></Link> : <span className="text-ink-2">—</span>}</td>
                      <td className={td}><RiskBadge level={r.risk.level} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title={t.setups} description={t.setupsDesc} action={<Link href="/signals" className="text-sm text-accent hover:underline">{t.allSignals}</Link>} />
            {signals.length === 0 ? (
              <EmptyState title={t.noSetups}>{t.noSetupsBody}</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {signals.map((s) => (
                  <li key={s.id} className="py-2.5">
                    <Link href={`/signals/${s.id}`} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{s.asset.symbol} <span className="font-normal text-ink-2">· {fa ? strategyName(s.strategyId, locale) : getStrategy(s.strategyId)?.name} · {tfw(s.timeframe)}</span></span>
                      <SignalBadge state={s.state} />
                    </Link>
                    <div className="mt-0.5 text-xs text-ink-2">{t.setupLine(fmtDate(s.marketDataAt, true, locale), s.rulesMet, s.rulesTotal, s.riskReward !== null ? s.riskReward.toFixed(2) : null)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title={t.paper} description={t.paperDesc} action={<Link href="/paper" className="text-sm text-accent hover:underline">{t.open}</Link>} />
            <div className="grid grid-cols-3 gap-3">
              <Stat label={t.openStat} value={ps.open} />
              <Stat label={t.closed} value={ps.closed} sub={ps.winRatePct !== null ? t.winners(ps.winRatePct.toFixed(0)) : undefined} />
              <Stat label={t.netPnl} value={<span className={ps.netPnl >= 0 ? "text-good-ink" : "text-bad-ink"}>{fmtMoney(ps.netPnl)}</span>} />
            </div>
          </Card>
        </div>
      </div>
      <div className="mt-6"><Disclaimer /></div>
    </>
  );
}
