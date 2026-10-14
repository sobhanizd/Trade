"use client";
/**
 * Neon coin widget for the dashboard: live price, 24h change, coin tabs,
 * range tabs and an area chart of REAL stored candles (the last point follows
 * the live Binance price). Hover/touch shows price and time.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionPill } from "@/components/verdict-card";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { coinStyle } from "@/lib/coin-style";
import { fmtBig, fmtPrice, GOLD_TOKENS, TROY_OUNCE_GRAMS, type Currency } from "@/lib/format";
import { dateLocale, type Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { liveFeed, type LiveStatus, type Tick } from "@/lib/live/prices";
import { coinFullName } from "@/lib/plain";
import { Toman } from "@/components/toman/context";
import type { Action } from "@/lib/signals/verdict";

export interface HeroCoin {
  symbol: string;
  name: string;
  pair: string | null;
  action: Action;
  headline: string;
  /** Snapshot values, already in the display currency. */
  price: number | null;
  change24h: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  marketCap: number | null;
}

const RANGES = ["1d", "1w", "1m", "3m", "1y"] as const;
type Range = (typeof RANGES)[number];
type Spark = { currency: Currency; timeframe: string; points: { t: number; p: number; h: number; l: number }[] };

const L = {
  en: {
    live: "Live", offline: "Offline", connecting: "Connecting",
    range: { "1d": "1D", "1w": "1W", "1m": "1M", "3m": "3M", "1y": "1Y" } as Record<Range, string>,
    rangeAria: "Time range",
    coinsAria: "Choose a coin",
    inRange: { "1d": "in 24 hours", "1w": "in 1 week", "1m": "in 1 month", "3m": "in 3 months", "1y": "in 1 year" } as Record<Range, string>,
    high: "24h High", low: "24h Low", vol: "Volume 24h", cap: "Mkt Cap",
    perGram: (p: string) => `1 gram ≈ ${p}`,
    now: "Now",
    details: "Chart & analysis",
    loading: "Loading chart…",
    noData: "No price history stored for this range yet.",
    chartAria: (sym: string, r: string, a: string, b: string) => `${sym} price ${r}: from ${a} to ${b}`,
  },
  fa: {
    live: "زنده", offline: "قطع", connecting: "در حال اتصال",
    range: { "1d": "1 روز", "1w": "1 هفته", "1m": "1 ماه", "3m": "3 ماه", "1y": "1 سال" } as Record<Range, string>,
    rangeAria: "بازهٔ زمانی",
    coinsAria: "انتخاب ارز",
    inRange: { "1d": "در 24 ساعت", "1w": "در 1 هفته", "1m": "در 1 ماه", "3m": "در 3 ماه", "1y": "در 1 سال" } as Record<Range, string>,
    high: "بالاترین 24 ساعت", low: "پایین‌ترین 24 ساعت", vol: "حجم 24 ساعت", cap: "ارزش بازار",
    perGram: (p: string) => `هر گرم ≈ ${p}`,
    now: "الان",
    details: "نمودار و تحلیل",
    loading: "در حال بارگذاری نمودار…",
    noData: "برای این بازه هنوز تاریخچهٔ قیمت ذخیره نشده.",
    chartAria: (sym: string, r: string, a: string, b: string) => `قیمت ${sym} ${r}: از ${a} تا ${b}`,
  },
} satisfies Dict<unknown>;

const H = 200;
const PAD = 14;

export function CoinHero({ coins, currency, eurRate }: { coins: HeroCoin[]; currency: Currency; eurRate: number | null }) {
  const t = useL(L);
  const locale = useLocale();
  const [sym, setSym] = useState(coins[0]?.symbol ?? "");
  const [range, setRange] = useState<Range>("1w");
  const coin = coins.find((c) => c.symbol === sym) ?? coins[0];
  const [tick, setTick] = useState<{ pair: string; tick: Tick } | null>(null);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [spark, setSpark] = useState<{ key: string; data: Spark | null }>({ key: "", data: null });
  const key = `${coin?.symbol}:${range}`;

  // Live price for the selected coin.
  useEffect(() => {
    if (!coin?.pair) return;
    const pair = coin.pair;
    const offT = liveFeed().subscribe(pair, (x) => setTick({ pair, tick: x }));
    const offS = liveFeed().onStatus(setStatus);
    return () => {
      offT();
      offS();
    };
  }, [coin?.pair]);

  // Real price history for the chosen range.
  useEffect(() => {
    if (!coin) return;
    let alive = true;
    api<Spark>(`/api/assets/${encodeURIComponent(coin.symbol)}/spark?range=${range}`)
      .then((d) => alive && setSpark({ key, data: d }))
      .catch(() => alive && setSpark({ key, data: null }));
    return () => {
      alive = false;
    };
  }, [coin, range, key]);

  if (!coin) return null;
  const st = coinStyle(coin.symbol);
  const live = tick && tick.pair === coin.pair ? tick.tick : null;
  const conv = (usd: number) => (currency !== "USD" && eurRate ? usd * eurRate : usd);
  const price = live ? conv(live.price) : coin.price;
  const change = live ? live.change24hPct : coin.change24h;
  const up = (change ?? 0) >= 0;
  const loading = spark.key !== key;
  const pts = !loading && spark.data ? spark.data.points : [];
  // The last point follows the live price so the chart moves with it.
  const series = pts.length && price !== null ? [...pts.slice(0, -1).map((x) => ({ t: x.t, p: x.p })), { t: pts[pts.length - 1].t, p: price }] : pts.map((x) => ({ t: x.t, p: x.p }));
  const rangeChange = series.length > 1 ? (series[series.length - 1].p / series[0].p - 1) * 100 : null;

  return (
    <section className="neo mb-6 p-5 sm:p-7" aria-label={coinFullName(coin.symbol, coin.name, locale)}>
      {/* Header */}
      {/* On phones the price drops under the coin name so neither gets cut off. */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="coin-ico h-12 w-12 text-lg" style={{ background: st.bg }} aria-hidden>{st.glyph}</span>
          <div className="min-w-0">
            <div className="f-d text-2xl leading-none font-extrabold">{coin.symbol}</div>
            <div className="f-m mid mt-1 flex items-center gap-1.5 truncate text-sm">
              <span className="truncate">{coinFullName(coin.symbol, coin.name, locale)}</span>
              <span className={cn("live-dot", status !== "live" && "off")} aria-hidden />
              <span>{status === "live" ? t.live : status === "offline" ? t.offline : t.connecting}</span>
            </div>
          </div>
        </div>
        {/* Column aligned to the reading side on phones (right in Persian), to the far side on wider screens. */}
        <div className="flex flex-col items-start gap-0 sm:items-end">
          <div className={cn("f-d ltr w-fit leading-none font-bold transition-colors", currency === "IRT" ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl", up ? "up" : "down")}>{fmtPrice(price, currency)}</div>
          <div><Toman value={price} currency={currency} className="mid mt-1.5 inline-block text-sm" /></div>
          {change !== null && (
            <div className={cn("f-m ltr mt-2 inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-semibold", up ? "delta-up" : "delta-down")}>
              {up ? "▲ +" : "▼ −"}{Math.abs(change).toFixed(2)}%
            </div>
          )}
          {GOLD_TOKENS.has(coin.symbol) && price !== null && <div className="f-m lo mt-1 text-sm">{t.perGram(fmtPrice(price / TROY_OUNCE_GRAMS, currency))}</div>}
        </div>
      </div>

      {/* Coin tabs */}
      {coins.length > 1 && (
        <div role="tablist" aria-label={t.coinsAria} className="mb-4 flex flex-wrap gap-1.5">
          {coins.map((c) => {
            const s = coinStyle(c.symbol);
            return (
              <button key={c.symbol} role="tab" aria-selected={c.symbol === coin.symbol} onClick={() => setSym(c.symbol)} className="pill f-d inline-flex items-center gap-1.5 py-1.5 ps-2 pe-3.5 text-[13px] font-semibold tracking-wide">
                <span className="coin-ico h-5 w-5 text-[9px]" style={{ background: s.bg }} aria-hidden>{s.glyph}</span>
                {c.symbol}
              </button>
            );
          })}
        </div>
      )}

      {/* Range tabs + change in range */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label={t.rangeAria} className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r} role="tab" aria-selected={r === range} onClick={() => setRange(r)} className="tf f-m px-3 py-1 text-[13px] font-semibold">
              {t.range[r]}
            </button>
          ))}
        </div>
        {rangeChange !== null && (
          <span className={cn("f-m text-sm font-medium", rangeChange >= 0 ? "up" : "down")}>
            <span className="ltr">{rangeChange >= 0 ? "▲ +" : "▼ −"}{Math.abs(rangeChange).toFixed(2)}%</span> {t.inRange[range]}
          </span>
        )}
      </div>

      <AreaChart series={series} currency={currency} up={rangeChange === null ? up : rangeChange >= 0} loading={loading} tf={spark.data?.timeframe ?? "1h"} t={t} locale={locale} symbol={coin.symbol} rangeLabel={t.inRange[range]} />

      {/* Stats */}
      <div className="line-b0 mt-5 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
        <Stat label={t.high} value={fmtPrice(coin.high24h, currency)} cls="up" />
        <Stat label={t.low} value={fmtPrice(coin.low24h, currency)} cls="down" />
        <Stat label={t.vol} value={fmtBig(coin.volume24h, currency)} />
        <Stat label={t.cap} value={fmtBig(coin.marketCap, currency)} />
      </div>

      {/* What the rules say */}
      <div className="line-b0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <ActionPill action={coin.action} />
          <span className="mid truncate text-sm">{coin.headline}</span>
        </div>
        <Link href={`/assets/${coin.symbol}`} className="pill on f-m px-4 py-1.5 text-sm font-semibold">
          {t.details} <span className="flip-rtl inline-block">→</span>
        </Link>
      </div>
    </section>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex flex-col items-start">
      <div className="f-m lo mb-1 text-xs tracking-wide uppercase">{label}</div>
      <div className={cn("f-m ltr w-fit text-base font-semibold sm:text-lg", cls ?? "")}>{value}</div>
    </div>
  );
}

type T = (typeof L)["en"];

function AreaChart({ series, currency, up, loading, tf, t, locale, symbol, rangeLabel }: { series: { t: number; p: number }[]; currency: Currency; up: boolean; loading: boolean; tf: string; t: T; locale: "en" | "fa"; symbol: string; rangeLabel: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(680);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const coords = useMemo(() => {
    if (series.length < 2) return [];
    const ps = series.map((s) => s.p);
    const mn = Math.min(...ps);
    const mx = Math.max(...ps);
    const span = mx - mn || 1;
    return series.map((s, i) => [(i / (series.length - 1)) * w, PAD + (1 - (s.p - mn) / span) * (H - PAD * 2)] as const);
  }, [series, w]);

  const color = up ? "#caff00" : "#ff2d78";
  const gid = up ? "neo-g-up" : "neo-g-down";
  const d = coords.map((c, i) => `${i ? "L" : "M"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleString(dateLocale(locale), tf === "1h" || tf === "4h" ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" });

  const move = (clientX: number) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r || coords.length < 2) return;
    const x = Math.min(Math.max(clientX - r.left, 0), r.width);
    setHover(Math.round((x / r.width) * (coords.length - 1)));
  };
  const h = hover !== null && coords[hover] ? { x: coords[hover][0], y: coords[hover][1], p: series[hover].p, t: series[hover].t, isLast: hover === coords.length - 1 } : null;

  return (
    <div
      ref={wrap}
      dir="ltr"
      className="relative h-[200px] cursor-crosshair touch-pan-y overflow-hidden rounded-lg"
      onPointerMove={(e) => move(e.clientX)}
      onPointerDown={(e) => move(e.clientX)}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label={series.length > 1 ? t.chartAria(symbol, rangeLabel, fmtPrice(series[0].p, currency), fmtPrice(series[series.length - 1].p, currency)) : t.loading}
    >
      {loading && series.length < 2 && <div className="f-m lo absolute inset-0 grid place-items-center text-xs">{t.loading}</div>}
      {!loading && series.length < 2 && <div className="f-m lo absolute inset-0 grid place-items-center text-xs">{t.noData}</div>}
      {coords.length > 1 && (
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className={cn("block transition-opacity", loading && "opacity-40")} aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="75%" stopColor={color} stopOpacity="0.04" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
            <filter id="neo-glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {[0.25, 0.5, 0.75].map((y) => <line key={y} x1="0" y1={y * H} x2={w} y2={y * H} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />)}
          <path d={`${d} L${last[0]},${H} L0,${H} Z`} fill={`url(#${gid})`} />
          <path d={d} fill="none" stroke={color} strokeWidth="2" opacity="0.9" filter="url(#neo-glow)" />
          <circle cx={last[0]} cy={last[1]} r="4" fill={color} />
          <circle cx={last[0]} cy={last[1]} r="9" fill="none" stroke={color} strokeWidth="1" opacity="0.3">
            <animate attributeName="r" values="6;12;6" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
      )}
      {h && (
        <>
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/15" style={{ left: h.x }} />
          <div className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#08080e]" style={{ left: h.x, top: h.y, background: color, boxShadow: `0 0 10px ${color}99` }} />
          <div className="tip pointer-events-none absolute z-10 rounded-[10px] px-3 py-2 whitespace-nowrap" style={{ left: Math.min(h.x + 14, w - 150), top: Math.max(h.y - 44, 0) }}>
            <div className="f-d text-sm font-semibold">{fmtPrice(h.p, currency)}</div>
            <div className="f-m lo mt-0.5 text-xs" dir="auto">{h.isLast ? t.now : fmtTime(h.t)}</div>
          </div>
        </>
      )}
    </div>
  );
}
