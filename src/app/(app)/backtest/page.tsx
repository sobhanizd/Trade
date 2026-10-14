import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, PageHeader, TableWrap, td, th } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fmtDate, fmtPct, timeAgo } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { timeframeWord } from "@/lib/plain";
import { strategyTitle } from "@/lib/strategies/i18n";
import { STRATEGIES, getStrategy } from "@/lib/strategies/registry";
import { BacktestForm } from "./form";

const L = {
  en: {
    metaTitle: "Backtesting",
    title: "Backtesting",
    desc: "Replays a strategy on historical candles with next-candle-open fills, fees and slippage. Every trade is shown, including losers.",
    previous: "Previous runs",
    empty: "No backtests yet",
    thWhen: "When",
    thAsset: "Asset",
    thStrategy: "Strategy",
    thTf: "TF",
    thPeriod: "Period",
    thTrades: "Trades",
    thNet: "Net return",
    thBuyHold: "Buy & hold",
    thMaxDD: "Max DD",
    thStatus: "Status",
    done: "done",
    failed: "failed",
    running: "running",
  },
  fa: {
    metaTitle: "آزمایش روی گذشته (بک‌تست)",
    title: "آزمایش روی گذشته (بک‌تست)",
    desc: "یک روش را روی کندل‌های گذشته دوباره اجرا می‌کند؛ خرید و فروش با قیمت باز شدنِ کندل بعدی، همراه با کارمزد و لغزش قیمت (اختلاف قیمت اجرا). همهٔ معامله‌ها نشان داده می‌شوند، حتی ضررده‌ها.",
    previous: "آزمایش‌های قبلی",
    empty: "هنوز هیچ آزمایشی انجام نشده",
    thWhen: "زمان",
    thAsset: "ارز",
    thStrategy: "روش",
    thTf: "بازهٔ زمانی",
    thPeriod: "دوره",
    thTrades: "معامله‌ها",
    thNet: "بازده خالص",
    thBuyHold: "خرید و نگه‌داری",
    thMaxDD: "بیشترین افت",
    thStatus: "وضعیت",
    done: "انجام شد",
    failed: "ناموفق",
    running: "در حال اجرا",
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.metaTitle };
}

export default async function BacktestPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [assets, runs, t, locale] = await Promise.all([
    db().watchlistItem.findMany({ where: { userId: user.id }, include: { asset: { select: { symbol: true } } } }),
    db().backtestRun.findMany({ where: { userId: user.id }, include: { asset: { select: { symbol: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    getL(L),
    getLocale(),
  ]);
  const tfName = (tf: string) => (locale === "fa" ? timeframeWord(tf, "fa") : tf);
  return (
    <>
      <PageHeader title={t.title} description={t.desc} />
      <Card className="mb-4">
        <BacktestForm
          symbols={assets.map((a) => a.asset.symbol)}
          strategies={STRATEGIES.map((s) => ({ id: s.id, name: strategyTitle(s.id, s.name, locale), params: s.params, intendedTimeframes: s.intendedTimeframes }))}
          initial={{ symbol: sp.symbol, strategy: sp.strategy, tf: sp.tf }}
        />
      </Card>
      <Card>
        <CardHeader title={t.previous} />
        {runs.length === 0 ? <EmptyState title={t.empty} /> : (
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className={th}>{t.thWhen}</th><th className={th}>{t.thAsset}</th><th className={th}>{t.thStrategy}</th><th className={th}>{t.thTf}</th><th className={th}>{t.thPeriod}</th><th className={th}>{t.thTrades}</th><th className={th}>{t.thNet}</th><th className={th}>{t.thBuyHold}</th><th className={th}>{t.thMaxDD}</th><th className={th}>{t.thStatus}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => {
                  const m = r.metrics as { trades?: number; netReturnPct?: number; maxDrawdownPct?: number } | null;
                  const b = r.benchmark as { netReturnPct?: number } | null;
                  return (
                    <tr key={r.id}>
                      <td className={td}><Link className="text-accent hover:underline" href={`/backtest/${r.id}`}>{timeAgo(r.createdAt, undefined, locale)}</Link></td>
                      <td className={td}>{r.asset.symbol}</td>
                      <td className={td}>{strategyTitle(r.strategyId, getStrategy(r.strategyId)?.name ?? r.strategyId, locale)}</td>
                      <td className={td}>{tfName(r.timeframe)}</td>
                      <td className={`${td} text-ink-2`}>{fmtDate(r.startDate, false, locale)} – {fmtDate(r.endDate, false, locale)}</td>
                      <td className={`${td} tabular`}>{m?.trades ?? "—"}</td>
                      <td className={`${td} tabular`}>{fmtPct(m?.netReturnPct)}</td>
                      <td className={`${td} tabular`}>{fmtPct(b?.netReturnPct)}</td>
                      <td className={`${td} tabular`}>{fmtPct(m?.maxDrawdownPct, 1, false)}</td>
                      <td className={td}>{r.status === "SUCCESS" ? <Badge tone="good">{t.done}</Badge> : r.status === "FAILED" ? <Badge tone="bad" className="max-w-xs truncate">{t.failed}</Badge> : <Badge>{t.running}</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
