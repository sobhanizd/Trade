"use client";
import {
  CandlestickSeries, ColorType, createChart, createSeriesMarkers, CrosshairMode, HistogramSeries, LineSeries, LineStyle,
  type IChartApi, type ISeriesApi, type SeriesMarker, type Time, type UTCTimestamp,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Skeleton } from "@/components/ui";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { currencyName, fmtMoney, fmtNum, fmtPrice, type Currency } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";
import { strategyName, timeframeWord } from "@/lib/plain";

type Pt = { time: number; value: number };
interface ChartData {
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number; closed: boolean }[];
  indicators: Record<"sma50" | "sma200" | "ema20" | "ema50" | "bbUpper" | "bbMiddle" | "bbLower" | "rsi" | "macd" | "macdSignal" | "macdHist", Pt[]>;
  levels: { supports: { price: number; touches: number }[]; resistances: { price: number; touches: number }[]; method: string };
  signals: { id: string; state: string; strategyId: string; time: number; price: number; status: string; invalidation: number | null; targets: number[]; entryLow: number | null; entryHigh: number | null }[];
  quality: { ok: boolean; issues: { message: string; severity: string }[] };
  fetchError: string | null;
  currency?: Currency;
  feeRate?: number;
  /** The user's real cost when buying / selling (fractions). */
  buyCost?: number;
  sellCost?: number;
  trend?: { support: TLine | null; resistance: TLine | null; pattern: string; brokeSupport: boolean; brokeResistance: boolean };
  news?: { time: number; title: string; level: "high" | "medium"; topic: string; url: string }[];
}
type TLine = { from: Pt; to: Pt; dir: "up" | "down" | "flat"; touches: number };

type ZoneKind = "buy" | "expensive" | "risk" | "stop" | "target" | "support" | "resistance" | "sellnow";
interface Zone { from: number; to: number; kind: ZoneKind; label: string; short?: string }
const ZONE_STYLE: Record<ZoneKind, { bg: string; border: string; text: string }> = {
  buy: { bg: "rgba(12,163,12,0.20)", border: "rgba(12,163,12,0.75)", text: "#0ca30c" },
  expensive: { bg: "rgba(250,178,25,0.08)", border: "rgba(250,178,25,0.35)", text: "#d99a12" },
  risk: { bg: "rgba(208,59,59,0.07)", border: "rgba(208,59,59,0.25)", text: "#d03b3b" },
  stop: { bg: "rgba(208,59,59,0.28)", border: "rgba(208,59,59,0.9)", text: "#e66767" },
  target: { bg: "rgba(12,163,12,0.14)", border: "rgba(12,163,12,0.6)", text: "#0ca30c" },
  support: { bg: "rgba(12,163,12,0.16)", border: "rgba(12,163,12,0.6)", text: "#0ca30c" },
  resistance: { bg: "rgba(250,178,25,0.16)", border: "rgba(250,178,25,0.6)", text: "#d99a12" },
  sellnow: { bg: "rgba(208,59,59,0.22)", border: "rgba(208,59,59,0.8)", text: "#e66767" },
};

const TFS = ["1h", "4h", "1d", "1w"] as const;
const OVERLAYS = [
  { key: "ema20", color: "--series-1" },
  { key: "ema50", color: "--series-2" },
  { key: "sma200", color: "--series-3" },
  { key: "bb", color: "--neutral-line" },
  { key: "sr", color: "--muted" },
  { key: "signals", color: "--accent" },
  { key: "levels", color: "--accent" },
  { key: "trend", color: "--good" },
  { key: "news", color: "--warn" },
] as const;
type OverlayKey = (typeof OVERLAYS)[number]["key"];

const L = {
  en: {
    overlays: { ema20: "EMA 20", ema50: "EMA 50", sma200: "SMA 200", bb: "Bollinger (20, 2)", sr: "Support / resistance", signals: "Signal markers", levels: "Active setup levels", trend: "Trend lines", news: "News markers" } as Record<OverlayKey, string>,
    supLine: (broken: boolean): string => (broken ? "Floor line (broken)" : "Floor line"),
    resLine: (broken: boolean): string => (broken ? "Ceiling line (broken)" : "Ceiling line"),
    newsOn: "News on this candle:",
    tf: (x: string) => x,
    timeframe: "Timeframe",
    simpleChart: "Simple chart",
    showIndicators: "Show indicators",
    indicators: "Indicators ▾",
    close: "Close (USD)",
    signal: "Signal",
    entryLow: "Entry zone low",
    entryHigh: "Entry zone high",
    invalidation: "Invalidation",
    exitCancelled: "Exit cancelled above",
    target: (i: number) => `Target ${i}`,
    mStrong: "Strong",
    mBuy: "Buy?",
    mExit: "Exit",
    mSell: "Sell?",
    loadError: "Chart data could not be loaded",
    liveFailed: "Live refresh failed — showing stored candles",
    quality: "Data quality issues",
    noCandles: "No candle data stored for this timeframe yet.",
    aria: (sym: string, tf: string, adv: boolean) => `${sym} ${tf} candlestick chart${adv ? " with volume, RSI and MACD panes" : " with volume"}`,
    advNote: "Panes: price & volume · RSI(14) with 30/70 guides · MACD(12, 26, 9). Dashed green/orange lines = trend lines; dots = news.",
    simpleNote: "Green arrows = buy setups, red = exit signals. Green/orange dashed lines = floor and ceiling trend lines. Orange/red dots = news (red = serious) — point at a dot to read the headlines.",
    candles: (n: number, closed: boolean, method: string) => ` Candles: ${n}, last candle ${closed ? "closed" : "still forming (analysis uses closed candles only)"}. S/R method: ${method}.`,
    closeIn: (cur: string) => `Close (${currencyName(cur as Currency)})`,
    z: {
      buy: "🟢 Good buy zone — best place to buy",
      expensive: "🟠 Too expensive to buy now — less gain, more risk",
      risk: "⚠️ Below the buy zone — getting risky",
      stop: "🔴 Sell if it falls here (safety exit)",
      target: (i: number) => `🎯 Take profit ${i} — sell here for a gain`,
      support: "🟢 Cheaper area — the price often bounced up from here",
      resistance: "🟠 The price often got stuck here",
      sellnow: "🔴 The rules say: if you own it, sell around here",
    },
    zs: {
      buy: "🟢 Buy zone", expensive: "🟠 Too expensive", risk: "⚠️ Risky", stop: "🔴 Safety exit",
      target: (i: number) => `🎯 Take profit ${i}`, support: "🟢 Cheaper area", resistance: "🟠 Often stuck here", sellnow: "🔴 Sell zone",
    },
    stopLine: "Safety exit",
    tLine: (i: number) => `Take profit ${i}`,
    cancelLine: "Sell signal cancelled above",
    ex: {
      title: "How to read this chart (in simple words)",
      ideaFrom: (name: string) => `These zones come from the "${name}" idea on this chart. The combined answer at the top of the page may still say WAIT.`,
      nowIn: "✅ Right now the price is inside the green buy zone.",
      nowAbove: (lvl: string) => `⏳ Right now the price is above the buy zone. Waiting until it comes back down to about ${lvl} gives a better deal.`,
      nowBelow: "⚠️ Right now the price is below the buy zone, close to the safety exit — risky.",
      nowFailed: "❌ The price fell below the safety exit — this buy idea has failed. Don't buy now.",
      ifGreen: (p: string, a: string) => `If you buy ${a} in the green zone (about ${p}):`,
      ifHigh: (p: string, a: string) => `If you buy ${a} higher, in the orange zone (about ${p}):`,
      reach: (lvl: string, v: string, d: string) => `if it rises to the target ${lvl}, you would have about ${v} (${d})`,
      fall: (lvl: string, v: string, d: string) => `if it falls to the safety exit ${lvl} and you sell, you would have about ${v} (${d})`,
      trade: (risk: string, gain: string) => `→ You risk ${risk} to maybe win ${gain}.`,
      worse: "→ Less to win and more to lose — that's why buying higher is worse.",
      stopRule: (lvl: string) => `🔴 Important: if the price falls to ${lvl}, sell. Holding on and hoping usually turns a small loss into a big one.`,
      sellTitle: "🔴 The rules see this coin weakening.",
      sellOwn: (now: string, cancel: string | null) => `If you own it: selling around ${now} protects your money.${cancel ? ` If the price climbs back above ${cancel}, the sell signal is cancelled.` : ""}`,
      sellDont: "If you don't own it: don't buy now — wait until the signal turns to BUY.",
      noneTitle: "There is no buy idea right now. Two useful price levels:",
      supportTxt: (lvl: string) => `🟢 ${lvl}: the price often bounced up from here before. Buying close to this level usually risks less.`,
      resistTxt: (lvl: string) => `🟠 ${lvl}: the price often got stuck here. Buying close to this level leaves little room to rise and more room to fall.`,
      srExample: (s: string, r: string, v: string, d: string, a: string) => `Example: ${a} bought near ${s} and sold near ${r} would become about ${v} (${d}).`,
      fees: (b: string, sl: string) => `Examples include your costs: ${b}% when buying and ${sl}% when selling (change them in Settings). Nothing is guaranteed — prices can move against any plan.`,
    },
  },
  fa: {
    overlays: {
      ema20: "EMA 20 (میانگین کوتاه‌مدت)",
      ema50: "EMA 50 (میانگین میان‌مدت)",
      sma200: "SMA 200 (میانگین بلندمدت)",
      bb: "باند بولینگر (20, 2) — محدودهٔ معمول نوسان",
      sr: "حمایت / مقاومت (کف و سقف‌های مهم)",
      signals: "نشانه‌های سیگنال",
      levels: "سطح‌های فرصت فعال",
      trend: "خط‌های روند",
      news: "نشانهٔ خبرها",
    } as Record<OverlayKey, string>,
    supLine: (broken: boolean): string => (broken ? "خط کف (شکسته)" : "خط کف"),
    resLine: (broken: boolean): string => (broken ? "خط سقف (شکسته)" : "خط سقف"),
    newsOn: "خبرهای این کندل:",
    tf: (x: string) => timeframeWord(x, "fa"),
    timeframe: "بازهٔ زمانی",
    simpleChart: "نمودار ساده",
    showIndicators: "نمایش شاخص‌ها",
    indicators: "شاخص‌ها ▾",
    close: "قیمت پایانی (USD)",
    signal: "خط سیگنال",
    entryLow: "پایین محدودهٔ خرید",
    entryHigh: "بالای محدودهٔ خرید",
    invalidation: "حد ضرر",
    exitCancelled: "لغو خروج بالای",
    target: (i: number) => `هدف سود ${i}`,
    mStrong: "قوی",
    mBuy: "خرید؟",
    mExit: "خروج",
    mSell: "فروش؟",
    loadError: "دادهٔ نمودار بارگذاری نشد",
    liveFailed: "به‌روزرسانی زنده ناموفق بود — کندل‌های ذخیره‌شده نمایش داده می‌شوند",
    quality: "مشکل در کیفیت داده",
    noCandles: "هنوز برای این بازهٔ زمانی دادهٔ قیمتی (کندل) ذخیره نشده است.",
    aria: (sym: string, tf: string, adv: boolean) => `نمودار شمعی ${sym} (${timeframeWord(tf, "fa")})${adv ? " همراه با حجم، RSI و MACD" : " همراه با حجم"}`,
    advNote: "بخش‌ها: قیمت و حجم · RSI(14) (قدرت خرید و فروش) با خط‌های راهنمای 30 و 70 · MACD(12, 26, 9) (سرعت حرکت قیمت). خط‌چین سبز و نارنجی = خط‌های روند؛ نقطه‌ها = خبر.",
    simpleNote: "فلش سبز = فرصت خرید، فلش قرمز = سیگنال خروج. خط‌چین سبز و نارنجی = خط کف و خط سقف روند. نقطه‌های نارنجی و قرمز = خبر (قرمز = جدی) — نشانگر را روی نقطه ببرید تا تیترها را ببینید.",
    candles: (n: number, closed: boolean, method: string) => ` تعداد کندل‌ها (شمع‌های قیمت): ${n}، آخرین کندل ${closed ? "بسته شده است" : "هنوز در حال شکل‌گیری است (تحلیل فقط از کندل‌های بسته‌شده استفاده می‌کند)"}. روش حمایت/مقاومت: ${method}.`,
    closeIn: (cur: string) => `قیمت پایانی (${currencyName(cur as Currency, "fa")})`,
    z: {
      buy: "🟢 محدودهٔ خوب برای خرید — بهترین جا برای خرید",
      expensive: "🟠 الان برای خرید گران است — سود کمتر، ریسک بیشتر",
      risk: "⚠️ زیر محدودهٔ خرید — خطرناک‌تر می‌شود",
      stop: "🔴 اگر قیمت به اینجا رسید، بفروشید (حد ضرر)",
      target: (i: number) => `🎯 هدف سود ${i} — اینجا بفروشید و سود بگیرید`,
      support: "🟢 محدودهٔ ارزان‌تر — قیمت قبلاً بارها از اینجا برگشته بالا",
      resistance: "🟠 قیمت قبلاً بارها اینجا گیر کرده",
      sellnow: "🔴 قوانین می‌گویند: اگر دارید، حدود همین‌جا بفروشید",
    },
    zs: {
      buy: "🟢 محدودهٔ خرید", expensive: "🟠 گران", risk: "⚠️ پرریسک", stop: "🔴 حد ضرر",
      target: (i: number) => `🎯 هدف سود ${i}`, support: "🟢 محدودهٔ ارزان‌تر", resistance: "🟠 محل گیر کردن قیمت", sellnow: "🔴 محدودهٔ فروش",
    },
    stopLine: "حد ضرر",
    tLine: (i: number) => `هدف سود ${i}`,
    cancelLine: "لغو سیگنال فروش بالای",
    ex: {
      title: "این نمودار را چطور بخوانید (به زبان ساده)",
      ideaFrom: (name: string) => `این محدوده‌ها از روش «${name}» روی همین نمودار می‌آیند. جواب نهایی بالای صفحه ممکن است هنوز «صبر» باشد.`,
      nowIn: "✅ همین الان قیمت داخل محدودهٔ سبزِ خرید است.",
      nowAbove: (lvl: string) => `⏳ همین الان قیمت بالاتر از محدودهٔ خرید است. اگر صبر کنید تا دوباره به حدود ${lvl} برگردد، معاملهٔ بهتری می‌شود.`,
      nowBelow: "⚠️ همین الان قیمت زیر محدودهٔ خرید و نزدیک حد ضرر است — پرریسک.",
      nowFailed: "❌ قیمت زیر حد ضرر رفته — این ایدهٔ خرید شکست خورده. الان نخرید.",
      ifGreen: (p: string, a: string) => `اگر ${a} در محدودهٔ سبز (حدود ${p}) بخرید:`,
      ifHigh: (p: string, a: string) => `اگر ${a} بالاتر، در محدودهٔ نارنجی (حدود ${p}) بخرید:`,
      reach: (lvl: string, v: string, d: string) => `اگر تا هدف ${lvl} بالا برود، حدود ${v} خواهید داشت (${d})`,
      fall: (lvl: string, v: string, d: string) => `اگر تا حد ضرر ${lvl} پایین بیاید و بفروشید، حدود ${v} خواهید داشت (${d})`,
      trade: (risk: string, gain: string) => `← یعنی ${risk} ریسک می‌کنید تا شاید ${gain} سود کنید.`,
      worse: "← سود کمتر و ضرر بیشتر — برای همین خرید در قیمت بالاتر بدتر است.",
      stopRule: (lvl: string) => `🔴 مهم: اگر قیمت به ${lvl} رسید، بفروشید. نگه داشتن به امید برگشت، معمولاً یک ضرر کوچک را به ضرر بزرگ تبدیل می‌کند.`,
      sellTitle: "🔴 قوانین می‌بینند که این ارز دارد ضعیف می‌شود.",
      sellOwn: (now: string, cancel: string | null) => `اگر این ارز را دارید: فروش حدود ${now} از پولتان محافظت می‌کند.${cancel ? ` اگر قیمت دوباره بالای ${cancel} برود، سیگنال فروش لغو می‌شود.` : ""}`,
      sellDont: "اگر ندارید: الان نخرید — صبر کنید تا سیگنال «خرید» شود.",
      noneTitle: "الان ایدهٔ خریدی وجود ندارد. دو سطح قیمتی مفید:",
      supportTxt: (lvl: string) => `🟢 ${lvl}: قیمت قبلاً از اینجا برگشته بالا. خرید نزدیک این سطح معمولاً ریسک کمتری دارد.`,
      resistTxt: (lvl: string) => `🟠 ${lvl}: قیمت قبلاً اینجا گیر کرده. خرید نزدیک این سطح جای کمی برای بالا رفتن و جای بیشتری برای افت دارد.`,
      srExample: (s: string, r: string, v: string, d: string, a: string) => `مثال: ${a} که نزدیک ${s} خریده شود و نزدیک ${r} فروخته شود، حدود ${v} می‌شود (${d}).`,
      fees: (b: string, sl: string) => `مثال‌ها هزینه‌های شما را حساب کرده‌اند: ${b}٪ هنگام خرید و ${sl}٪ هنگام فروش (در تنظیمات قابل تغییر). هیچ چیز تضمینی نیست — قیمت ممکن است برخلاف هر برنامه‌ای حرکت کند.`,
    },
  },
} satisfies Dict<unknown>;

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}
function withAlpha(hex: string, a: number) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}
const t = (s: number) => s as UTCTimestamp;

const BUY_STATES = new Set(["STRONG_BUY_SETUP", "POTENTIAL_BUY"]);
const SELL_STATES = new Set(["EXIT_SETUP", "POTENTIAL_SELL"]);

type ChartPlan =
  | { mode: "buy"; close: number; lo: number; hi: number; stop: number; targets: number[]; strategyId: string }
  | { mode: "sell"; close: number; cancel: number | null; strategyId: string }
  | { mode: "none"; close: number; support: number | null; resistance: number | null };

/** What the chart should explain: the current buy idea, else a sell signal, else support/resistance. */
function computePlan(data: ChartData, focusSignalId?: string): ChartPlan | null {
  if (!data.candles.length) return null;
  const close = data.candles[data.candles.length - 1].close;
  const focus = data.signals.find((x) => x.id === focusSignalId);
  const buy = focus && BUY_STATES.has(focus.state) ? focus : !focus ? data.signals.find((x) => x.status === "ACTIVE" && BUY_STATES.has(x.state)) : undefined;
  if (buy && buy.invalidation !== null && buy.targets.length) {
    const a = buy.entryLow ?? buy.price;
    const b = buy.entryHigh ?? buy.price;
    const hi = Math.max(a, b);
    let lo = Math.min(a, b);
    if ((hi - lo) / hi < 0.004) lo = hi * 0.996;
    return { mode: "buy", close, lo, hi, stop: buy.invalidation, targets: buy.targets, strategyId: buy.strategyId };
  }
  const sell = focus && SELL_STATES.has(focus.state) ? focus : data.signals.find((x) => x.status === "ACTIVE" && SELL_STATES.has(x.state));
  if (sell) return { mode: "sell", close, cancel: sell.invalidation, strategyId: sell.strategyId };
  const support = data.levels.supports.find((l) => l.price < close)?.price ?? null;
  const resistance = data.levels.resistances.find((l) => l.price > close)?.price ?? null;
  return { mode: "none", close, support, resistance };
}

export function CandleChart({ symbol, initialTf = "4h", focusSignalId, simple = false }: { symbol: string; initialTf?: (typeof TFS)[number]; focusSignalId?: string; simple?: boolean }) {
  const tx = useL(L);
  const locale = useLocale();
  const [adv, setAdv] = useState(!simple);
  const [tf, setTf] = useState<(typeof TFS)[number]>(initialTf);
  const key = `${symbol}:${tf}`;
  const [res, setRes] = useState<{ key: string; data: ChartData | null; error: string | null }>({ key: "", data: null, error: null });
  const loading = res.key !== key;
  const data = res.data;
  const error = loading ? null : res.error;
  const [on, setOn] = useState<Record<OverlayKey, boolean>>(simple ? { ema20: false, ema50: true, sma200: false, bb: false, sr: false, signals: true, levels: true, trend: true, news: true } : { ema20: true, ema50: true, sma200: true, bb: false, sr: true, signals: true, levels: true, trend: true, news: true });
  const [legend, setLegend] = useState<Record<string, number | null>>({});
  const el = useRef<HTMLDivElement>(null);
  const plan = useMemo(() => (data ? computePlan(data, focusSignalId) : null), [data, focusSignalId]);
  const [zonePx, setZonePx] = useState<{ top: number; height: number; width: number; kind: ZoneKind; label: string; showLabel: boolean }[]>([]);
  const chartRef = useRef<IChartApi | null>(null);
  const { resolvedTheme } = useTheme();
  const [hoverNews, setHoverNews] = useState<{ title: string; level: "high" | "medium"; url: string }[]>([]);

  useEffect(() => {
    let alive = true;
    api<ChartData>(`/api/assets/${encodeURIComponent(symbol)}/chart?tf=${tf}`)
      .then((d) => alive && setRes({ key: `${symbol}:${tf}`, data: d, error: null }))
      .catch((e) => alive && setRes((r) => ({ key: `${symbol}:${tf}`, data: r.data, error: (e as Error).message })));
    return () => {
      alive = false;
    };
  }, [symbol, tf]);

  useEffect(() => {
    if (!el.current || !data || data.candles.length === 0) return;
    const c = {
      surface: cssVar("--surface"), ink2: cssVar("--ink-2"), grid: cssVar("--grid"), axis: cssVar("--axis"),
      good: cssVar("--good"), bad: cssVar("--bad"), s1: cssVar("--series-1"), s2: cssVar("--series-2"), s3: cssVar("--series-3"),
      neutral: cssVar("--neutral-line"), muted: cssVar("--muted"), accent: cssVar("--accent"), warn: cssVar("--warn"),
    };
    // Toman prices are large whole numbers: shorten the axis (B = billion, M = million).
    const irt = data.currency === "IRT";
    const chart = createChart(el.current, {
      ...(irt ? { localization: { priceFormatter: (v: number) => (Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(3)}B` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : Math.round(v).toLocaleString("en-US")) } } : {}),
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: c.surface }, textColor: c.ink2, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", panes: { separatorColor: c.axis } },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.axis },
      timeScale: { borderColor: c.axis, timeVisible: tf === "1h" || tf === "4h", secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, { upColor: c.good, downColor: c.bad, borderUpColor: c.good, borderDownColor: c.bad, wickUpColor: c.good, wickDownColor: c.bad, priceLineVisible: true });
    candles.setData(data.candles.map((k) => ({ time: t(k.time), open: k.open, high: k.high, low: k.low, close: k.close })));

    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    vol.setData(data.candles.map((k) => ({ time: t(k.time), value: k.volume, color: withAlpha(k.close >= k.open ? c.good : c.bad, 0.35) })));

    const line = (pts: Pt[], color: string, opts: { pane?: number; dashed?: boolean; width?: 1 | 2 } = {}) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: opts.width ?? 2, lineStyle: opts.dashed ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, opts.pane ?? 0);
      s.setData(pts.map((p) => ({ time: t(p.time), value: p.value })));
      return s;
    };
    const named: Record<string, ISeriesApi<"Line">> = {};
    if (on.ema20) named.ema20 = line(data.indicators.ema20, c.s1);
    if (on.ema50) named.ema50 = line(data.indicators.ema50, c.s2);
    if (on.sma200) named.sma200 = line(data.indicators.sma200, c.s3);
    if (on.bb) {
      line(data.indicators.bbUpper, c.neutral, { dashed: true, width: 1 });
      line(data.indicators.bbMiddle, c.neutral, { width: 1 });
      line(data.indicators.bbLower, c.neutral, { dashed: true, width: 1 });
    }
    if (on.sr) {
      for (const l of data.levels.supports) candles.createPriceLine({ price: l.price, color: c.muted, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: `S (${l.touches})` });
      for (const l of data.levels.resistances) candles.createPriceLine({ price: l.price, color: c.muted, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: `R (${l.touches})` });
    }
    // Easy-to-read zones: where buying is good, too expensive, risky, and where to sell.
    const zones: Zone[] = [];
    if (on.levels && plan) {
      if (plan.mode === "buy") {
        if (plan.targets[0] > plan.hi) zones.push({ from: plan.hi, to: plan.targets[0], kind: "expensive", label: tx.z.expensive, short: tx.zs.expensive });
        if (plan.lo > plan.stop) zones.push({ from: plan.stop, to: plan.lo, kind: "risk", label: tx.z.risk, short: tx.zs.risk });
        zones.push({ from: plan.lo, to: plan.hi, kind: "buy", label: tx.z.buy, short: tx.zs.buy });
        zones.push({ from: plan.stop * 0.994, to: plan.stop, kind: "stop", label: tx.z.stop, short: tx.zs.stop });
        plan.targets.forEach((p, i) => zones.push({ from: p * 0.997, to: p * 1.003, kind: "target", label: tx.z.target(i + 1), short: tx.zs.target(i + 1) }));
        candles.createPriceLine({ price: plan.stop, color: c.bad, lineStyle: LineStyle.Solid, lineWidth: 2, title: tx.stopLine });
        plan.targets.forEach((p, i) => candles.createPriceLine({ price: p, color: c.good, lineStyle: LineStyle.Dashed, lineWidth: 2, title: tx.tLine(i + 1) }));
      } else if (plan.mode === "sell") {
        zones.push({ from: plan.close * 0.994, to: plan.close * 1.006, kind: "sellnow", label: tx.z.sellnow, short: tx.zs.sellnow });
        if (plan.cancel !== null) candles.createPriceLine({ price: plan.cancel, color: c.muted, lineStyle: LineStyle.Dashed, lineWidth: 1, title: tx.cancelLine });
      } else {
        if (plan.support !== null) zones.push({ from: plan.support * 0.995, to: plan.support * 1.005, kind: "support", label: tx.z.support, short: tx.zs.support });
        if (plan.resistance !== null) zones.push({ from: plan.resistance * 0.995, to: plan.resistance * 1.005, kind: "resistance", label: tx.z.resistance, short: tx.zs.resistance });
      }
    }
    // Trend lines: floor through rising/falling lows, ceiling through highs.
    if (on.trend && data.trend) {
      const tl = (l: TLine | null, color: string, title: string) => {
        if (!l || l.to.time <= l.from.time) return;
        const s = chart.addSeries(LineSeries, { color, lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title });
        s.setData([{ time: t(l.from.time), value: l.from.value }, { time: t(l.to.time), value: l.to.value }]);
      };
      tl(data.trend.support, c.good, tx.supLine(data.trend.brokeSupport));
      tl(data.trend.resistance, c.warn, tx.resLine(data.trend.brokeResistance));
    }
    // News: one marker per candle, red when serious.
    const times = data.candles.map((k) => k.time);
    const candleOf = (sec: number) => {
      let lo = 0, hi = times.length - 1, ans = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (times[mid] <= sec) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
      return ans >= 0 && sec >= times[0] ? times[ans] : null;
    };
    const newsAt = new Map<number, NonNullable<ChartData["news"]>>();
    if (on.news) for (const n of data.news ?? []) {
      const ct = candleOf(n.time);
      if (ct === null) continue;
      newsAt.set(ct, [...(newsAt.get(ct) ?? []), n]);
    }
    const newsMarkers: SeriesMarker<Time>[] = [...newsAt.entries()].map(([time, list]) => ({
      time: t(time), position: "aboveBar", shape: "circle", color: list.some((n) => n.level === "high") ? c.bad : c.warn, text: list.length > 1 ? `×${list.length}` : "",
    }));
    {
      const first = data.candles[0].time;
      const markers: SeriesMarker<Time>[] = (on.signals ? data.signals : [])
        .filter((s) => s.time >= first)
        .sort((a, b) => a.time - b.time)
        .map((s) => {
          const buy = s.state === "STRONG_BUY_SETUP" || s.state === "POTENTIAL_BUY";
          return { time: t(s.time), position: buy ? "belowBar" : "aboveBar", color: buy ? c.good : c.bad, shape: buy ? "arrowUp" : "arrowDown", text: buy ? (s.state === "STRONG_BUY_SETUP" ? tx.mStrong : tx.mBuy) : s.state === "EXIT_SETUP" ? tx.mExit : tx.mSell } as SeriesMarker<Time>;
        });
      const all = [...markers, ...newsMarkers].sort((a, b) => (a.time as number) - (b.time as number));
      if (all.length) createSeriesMarkers(candles, all);
    }

    // RSI & MACD panes (advanced view only)
    let rsi: ISeriesApi<"Line"> | undefined;
    let macdL: ISeriesApi<"Line"> | undefined;
    let macdS: ISeriesApi<"Line"> | undefined;
    if (adv) {
    rsi = line(data.indicators.rsi, c.s1, { pane: 1 });
    rsi.createPriceLine({ price: 70, color: c.muted, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "70" });
    rsi.createPriceLine({ price: 30, color: c.muted, lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "30" });
    // MACD pane
    const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 2);
    hist.setData(data.indicators.macdHist.map((p) => ({ time: t(p.time), value: p.value, color: withAlpha(p.value >= 0 ? c.good : c.bad, 0.5) })));
    macdL = line(data.indicators.macd, c.s1, { pane: 2 });
    macdS = line(data.indicators.macdSignal, c.s2, { pane: 2 });
    }
    const panes = chart.panes();
    panes[0]?.setStretchFactor(3);
    panes[1]?.setStretchFactor(1);
    panes[2]?.setStretchFactor(1);
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, data.candles.length - 150), to: data.candles.length + 3 });

    const layout = () => {
      if (!el.current) return;
      const h = chart.panes()[0]?.getHeight() ?? el.current.clientHeight;
      const w = el.current.clientWidth - chart.priceScale("right").width();
      const out: typeof zonePx = [];
      for (const z of zones) {
        const yTop = candles.priceToCoordinate(Math.max(z.from, z.to));
        const yBot = candles.priceToCoordinate(Math.min(z.from, z.to));
        if (yTop === null || yBot === null) continue;
        const top = Math.max(0, Math.min(h, yTop));
        const bottom = Math.max(0, Math.min(h, yBot));
        if (bottom <= 0 || top >= h) continue;
        const height = Math.max(3, bottom - top);
        out.push({ top, height, width: w, kind: z.kind, label: w < 560 && z.short ? z.short : z.label, showLabel: z.kind !== "risk" || height > 44 });
      }
      setZonePx(out);
    };
    const raf = () => requestAnimationFrame(layout);
    raf();
    chart.timeScale().subscribeVisibleLogicalRangeChange(raf);
    const ro = new ResizeObserver(raf);
    ro.observe(el.current);

    const last = data.candles[data.candles.length - 1];
    const lastVal = (pts: Pt[]) => pts[pts.length - 1]?.value ?? null;
    const base = {
      close: last.close, ema20: lastVal(data.indicators.ema20), ema50: lastVal(data.indicators.ema50), sma200: lastVal(data.indicators.sma200),
      rsi: lastVal(data.indicators.rsi), macd: lastVal(data.indicators.macd), signal: lastVal(data.indicators.macdSignal),
    };
    setLegend(base);
    chart.subscribeCrosshairMove((p) => {
      const hn = p.time ? newsAt.get(p.time as number) : undefined;
      setHoverNews((cur) => (hn ? (cur === hn ? cur : hn) : cur.length ? [] : cur));
      if (!p.time) return setLegend(base);
      const val = (s: ISeriesApi<"Line"> | undefined): number | null => {
        const d = s ? p.seriesData.get(s) : undefined;
        return d && "value" in d && typeof d.value === "number" ? d.value : null;
      };
      const cd = p.seriesData.get(candles);
      setLegend({ close: cd && "close" in cd && typeof cd.close === "number" ? cd.close : null, ema20: val(named.ema20), ema50: val(named.ema50), sma200: val(named.sma200), rsi: val(rsi), macd: val(macdL), signal: val(macdS) });
    });
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, on, resolvedTheme, tf, focusSignalId, adv, tx, plan]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={tx.timeframe} className="inline-flex rounded-lg border border-line p-0.5">
          {TFS.map((x) => (
            <button key={x} role="tab" aria-selected={tf === x} onClick={() => setTf(x)} className={cn("min-h-9 rounded-md px-3 text-sm", tf === x ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-surface-2")}>
              {tx.tf(x)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAdv(!adv)} className="min-h-9 rounded-lg border border-line px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2">
          {adv ? tx.simpleChart : tx.showIndicators}
        </button>
        {adv && <details className="relative">
          <summary className="min-h-9 cursor-pointer list-none rounded-lg border border-line px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2">{tx.indicators}</summary>
          <div className="absolute z-20 mt-1 w-60 rounded-lg border border-line bg-surface p-2 shadow-lg">
            {OVERLAYS.map((o) => (
              <label key={o.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-2">
                <input type="checkbox" checked={on[o.key]} onChange={(e) => setOn({ ...on, [o.key]: e.target.checked })} />
                <span className="inline-block h-0.5 w-4" style={{ background: `var(${o.color})` }} aria-hidden />
                {tx.overlays[o.key]}
              </label>
            ))}
          </div>
        </details>}
      </div>
      {/* Always-visible legend with values (identity is never color-only). */}
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2 tabular" aria-live="polite" dir="ltr">
        <span>{tx.closeIn(data?.currency ?? "USD")} <b className="text-ink">{data?.currency === "IRT" ? Math.round(legend.close ?? 0).toLocaleString("en-US") : fmtPrice(legend.close)}</b></span>
        {on.ema20 && <span><i className="me-1 inline-block h-0.5 w-3 align-middle" style={{ background: "var(--series-1)" }} />EMA20 <b className="text-ink">{fmtPrice(legend.ema20)}</b></span>}
        {on.ema50 && <span><i className="me-1 inline-block h-0.5 w-3 align-middle" style={{ background: "var(--series-2)" }} />EMA50 <b className="text-ink">{fmtPrice(legend.ema50)}</b></span>}
        {on.sma200 && <span><i className="me-1 inline-block h-0.5 w-3 align-middle" style={{ background: "var(--series-3)" }} />SMA200 <b className="text-ink">{fmtPrice(legend.sma200)}</b></span>}
        {adv && <>
        <span>RSI(14) <b className="text-ink">{fmtNum(legend.rsi, 1)}</b></span>
        <span><i className="me-1 inline-block h-0.5 w-3 align-middle" style={{ background: "var(--series-1)" }} />MACD <b className="text-ink">{fmtNum(legend.macd, 3)}</b></span>
        <span><i className="me-1 inline-block h-0.5 w-3 align-middle" style={{ background: "var(--series-2)" }} />{tx.signal} <b className="text-ink">{fmtNum(legend.signal, 3)}</b></span>
        </>}
      </div>
      {error && <Alert tone="error" title={tx.loadError}>{errorText(error, locale)}</Alert>}
      {data?.fetchError && <Alert tone="warn" className="mb-2" title={tx.liveFailed}>{data.fetchError}</Alert>}
      {data && !data.quality.ok && data.quality.issues.length > 0 && (
        <Alert tone="warn" className="mb-2" title={tx.quality}>{data.quality.issues.map((i) => i.message).join(" ")}</Alert>
      )}
      {loading && !data && <Skeleton className="h-[520px] w-full" />}
      {data && data.candles.length === 0 && !loading && <Alert tone="info">{tx.noCandles}</Alert>}
      <div className="relative" dir="ltr">
        <div ref={el} dir="ltr" className={cn(adv ? "h-[520px] sm:h-[600px]" : "h-[380px] sm:h-[460px]", "w-full overflow-hidden rounded-lg border border-line", (!data || data.candles.length === 0) && "hidden")} role="img" aria-label={tx.aria(symbol, tf, adv)} />
        {hoverNews.length > 0 && (
          <div dir="auto" className="pointer-events-none absolute start-2 top-2 z-20 max-w-[min(26rem,85%)] rounded-lg border border-line bg-surface/95 p-2 text-xs shadow-lg">
            <div className="mb-1 font-semibold text-ink-2">{tx.newsOn}</div>
            <ul className="space-y-1">
              {hoverNews.slice(0, 4).map((n, i) => <li key={i} className={n.level === "high" ? "text-bad-ink" : ""}>• <span dir="ltr">{n.title}</span></li>)}
            </ul>
          </div>
        )}
        {data && data.candles.length > 0 && (
          <div className="pointer-events-none absolute inset-px z-10 overflow-hidden rounded-lg" aria-hidden>
            {zonePx.map((z, i) => {
              const st = ZONE_STYLE[z.kind];
              const thin = z.height < 20;
              return (
                <div key={i} className="absolute left-0" style={{ top: z.top, height: z.height, width: z.width, background: st.bg, borderTop: `1px dashed ${st.border}`, borderBottom: `1px dashed ${st.border}` }}>
                  {z.showLabel && (
                    <span dir="auto" className="absolute left-2 max-w-[90%] truncate rounded px-1.5 py-0.5 text-[11px] font-semibold shadow-sm sm:text-xs" style={{ top: thin ? -20 : 3, color: st.text, background: "var(--surface)" }}>
                      {z.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {data && plan && on.levels && <ChartExplanation plan={plan} currency={data.currency ?? "USD"} costs={{ buy: data.buyCost ?? data.feeRate ?? 0.0015, sell: data.sellCost ?? data.feeRate ?? 0.0015 }} tx={tx} locale={locale} />}
      {data && data.candles.length > 0 && (
        <p className="mt-2 text-xs text-ink-2">
          {adv ? tx.advNote : tx.simpleNote}{tx.candles(data.candles.length, data.candles[data.candles.length - 1].closed, data.levels.method)}
        </p>
      )}
    </div>
  );
}

/** Plain-language explanation under the chart, with €100 examples. */
function ChartExplanation({ plan, currency, costs, tx, locale }: { plan: ChartPlan; currency: Currency; costs: { buy: number; sell: number }; tx: (typeof L)["en"]; locale: "en" | "fa" }) {
  // Unicode isolates (LRI…PDI) keep "+€7.58" readable left-to-right inside Persian sentences.
  const iso = (x: string) => `\u2066${x}\u2069`;
  const price = (v: number) => iso(fmtPrice(v, currency));
  const money = (v: number) => iso(fmtMoney(v, currency));
  const amt = iso(fmtMoney(100, currency).replace(/\.00$/, ""));
  // €100 in → (1 − buying cost) of coin; selling pays out (1 − selling cost).
  const after = (buy: number, sell: number) => 100 * (1 - costs.buy) * (sell / buy) * (1 - costs.sell);
  const delta = (v: number) => iso(`${v >= 100 ? "+" : "−"}${fmtMoney(Math.abs(v - 100), currency)}`);
  const e = tx.ex;
  const pct = (f: number) => `\u2066${(f * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}\u2069`;
  const box = "mt-3 rounded-xl border border-line bg-surface-2 p-4 text-sm leading-7";

  if (plan.mode === "buy") {
    const ref = plan.hi;
    const high = plan.hi + (plan.targets[0] - plan.hi) * 0.5;
    const winA = after(ref, plan.targets[0]);
    const lossA = after(ref, plan.stop);
    const winB = after(high, plan.targets[0]);
    const lossB = after(high, plan.stop);
    const now =
      plan.close < plan.stop ? e.nowFailed : plan.close < plan.lo ? e.nowBelow : plan.close <= plan.hi ? e.nowIn : e.nowAbove(price(plan.hi));
    return (
      <div className={box}>
        <h3 className="mb-1 text-base font-semibold">{e.title}</h3>
        <p className="font-medium">{now}</p>
        <div className="mt-2">
          <p className="font-semibold text-good-ink">{e.ifGreen(price(ref), amt)}</p>
          <ul className="ms-4 list-disc">
            <li>{e.reach(price(plan.targets[0]), money(winA), delta(winA))}</li>
            <li>{e.fall(price(plan.stop), money(lossA), delta(lossA))}</li>
          </ul>
          <p>{e.trade(money(100 - lossA), money(winA - 100))}</p>
        </div>
        {high > plan.hi && (
          <div className="mt-2">
            <p className="font-semibold" style={{ color: "#d99a12" }}>{e.ifHigh(price(high), amt)}</p>
            <ul className="ms-4 list-disc">
              <li>{e.reach(price(plan.targets[0]), money(winB), delta(winB))}</li>
              <li>{e.fall(price(plan.stop), money(lossB), delta(lossB))}</li>
            </ul>
            <p>{e.worse}</p>
          </div>
        )}
        <p className="mt-2 font-medium text-bad-ink">{e.stopRule(price(plan.stop))}</p>
        <p className="mt-2 text-xs text-ink-2">{e.ideaFrom(strategyName(plan.strategyId, locale))} {e.fees(pct(costs.buy), pct(costs.sell))}</p>
      </div>
    );
  }
  if (plan.mode === "sell") {
    return (
      <div className={box}>
        <h3 className="mb-1 text-base font-semibold">{e.title}</h3>
        <p className="font-semibold text-bad-ink">{e.sellTitle}</p>
        <p>{e.sellOwn(price(plan.close), plan.cancel !== null ? price(plan.cancel) : null)}</p>
        <p>{e.sellDont}</p>
        <p className="mt-2 text-xs text-ink-2">{e.fees(pct(costs.buy), pct(costs.sell))}</p>
      </div>
    );
  }
  const ex = plan.support !== null && plan.resistance !== null ? after(plan.support, plan.resistance) : null;
  return (
    <div className={box}>
      <h3 className="mb-1 text-base font-semibold">{e.title}</h3>
      <p>{e.noneTitle}</p>
      {plan.support !== null && <p>{e.supportTxt(price(plan.support))}</p>}
      {plan.resistance !== null && <p>{e.resistTxt(price(plan.resistance))}</p>}
      {ex !== null && <p className="mt-1">{e.srExample(price(plan.support!), price(plan.resistance!), money(ex), delta(ex), amt)}</p>}
      <p className="mt-2 text-xs text-ink-2">{e.fees(pct(costs.buy), pct(costs.sell))}</p>
    </div>
  );
}
