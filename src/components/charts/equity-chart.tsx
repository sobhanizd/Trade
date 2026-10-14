"use client";
import { ColorType, createChart, LineSeries, LineStyle, type UTCTimestamp } from "lightweight-charts";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import type { Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { fmtDate } from "@/lib/format";

const L = {
  en: {
    strategy: "Strategy",
    buyHold: "Buy & hold",
    start: "Start",
    notEnough: "Not enough points to draw an equity curve.",
    legendStrategy: "Strategy equity",
    legendBuyHold: "Buy & hold (same costs)",
    oosBegins: (d: string) => `Out-of-sample begins ${d}`,
    aria: "Equity curve of the strategy compared with buy and hold",
  },
  fa: {
    strategy: "روش",
    buyHold: "خرید و نگه‌داری",
    start: "شروع",
    notEnough: "نقطه‌های کافی برای رسم منحنی ارزش حساب وجود ندارد.",
    legendStrategy: "ارزش حساب با این روش",
    legendBuyHold: "خرید و نگه‌داری (با همان هزینه‌ها)",
    oosBegins: (d: string) => `بخش آخر (خارج از نمونه) از ${d} شروع می‌شود`,
    aria: "منحنی ارزش حساب با این روش در مقایسه با خرید و نگه‌داری",
  },
} satisfies Dict<unknown>;

const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function EquityChart({ points, splitTime }: { points: { t: number; equity: number; benchmark: number }[]; splitTime: number | null }) {
  const t = useL(L);
  const locale = useLocale();
  const el = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!el.current || points.length < 2) return;
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: v("--surface") }, textColor: v("--ink-2") },
      grid: { vertLines: { visible: false }, horzLines: { color: v("--grid") } },
      rightPriceScale: { borderColor: v("--axis") },
      timeScale: { borderColor: v("--axis") },
    });
    const seen = new Set<number>();
    const pts = points.map((p) => ({ ...p, s: Math.floor(p.t / 1000) })).filter((p) => (seen.has(p.s) ? false : (seen.add(p.s), true)));
    const eq = chart.addSeries(LineSeries, { color: v("--series-1"), lineWidth: 2, title: t.strategy, priceLineVisible: false });
    eq.setData(pts.map((p) => ({ time: p.s as UTCTimestamp, value: p.equity })));
    const bh = chart.addSeries(LineSeries, { color: v("--series-2"), lineWidth: 2, title: t.buyHold, priceLineVisible: false });
    bh.setData(pts.map((p) => ({ time: p.s as UTCTimestamp, value: p.benchmark })));
    eq.createPriceLine({ price: pts[0].equity, color: v("--muted"), lineStyle: LineStyle.Dotted, lineWidth: 1, title: t.start, axisLabelVisible: false });
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points, resolvedTheme, t]);
  if (points.length < 2) return <p className="text-sm text-ink-2">{t.notEnough}</p>;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-ink-2">
        <span><i className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: "var(--series-1)" }} />{t.legendStrategy}</span>
        <span><i className="me-1 inline-block h-0.5 w-4 align-middle" style={{ background: "var(--series-2)" }} />{t.legendBuyHold}</span>
        {splitTime && <span>{t.oosBegins(locale === "fa" ? fmtDate(splitTime, false, locale) : new Date(splitTime).toISOString().slice(0, 10))}</span>}
      </div>
      <div ref={el} dir="ltr" className="h-80 w-full overflow-hidden rounded-lg border border-line" role="img" aria-label={t.aria} />
    </div>
  );
}
