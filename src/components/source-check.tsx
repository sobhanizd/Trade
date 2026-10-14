/**
 * "Is the data right?" — multi-source verification shown to the user:
 * live price across Binance / Kraken / CoinGecko, chart candles vs a second
 * exchange, and each signal's second opinion. Server components.
 */
import { SignalBadge } from "@/components/signal-badge";
import { Alert, Badge, Card, CardHeader, TableWrap, td, th } from "@/components/ui";
import { sourceLabel, type Agreement, type CandleComparison, type OpinionGap, type PriceCheck, type SignalSourceCheck } from "@/lib/market/crosscheck";
import { fmtDate, fmtPrice, timeAgo } from "@/lib/format";
import type { Dict, Locale } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { coinLabel, timeframeWord } from "@/lib/plain";
import type { CandleCheckRow, PriceCheckRow } from "@/lib/views";

const pct = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "—" : `${v.toFixed(d)}%`);
/** Keeps numbers left-to-right inside Persian sentences. */
const iso = (x: string) => `⁦${x}⁩`;

const L = {
  en: {
    title: "Data check — are the numbers right?",
    desc: "Every price is compared across independent sources. If they disagree too much, the app gives no signal for that chart until they match again.",
    livePrice: "Live price (USD)",
    source: "Source",
    price: "Price",
    vsMiddle: "Difference",
    updated: "Updated",
    noAnswer: "no answer",
    biggest: (p: string, ago: string) => `Biggest difference between sources: ${p} · checked ${ago}`,
    noPriceCheck: "No price check yet — it runs with every market snapshot (every 10 minutes).",
    chartData: "Chart data (candles used for the analysis)",
    tf: "Timeframe",
    comparedWith: "Checked against",
    candles: "Candles compared",
    typical: "Typical difference",
    latest: "Analysed candle",
    result: "Result",
    noCandleCheck: "Not checked yet — the chart data is double-checked each time a new candle is analysed.",
    verdict: {
      AGREE: (n: number) => `${n} sources agree`,
      SMALL_DIFF: () => "Small difference",
      DISAGREE: () => "Sources disagree",
      SINGLE_SOURCE: () => "Only one source",
    } as Record<Agreement, (n: number) => string>,
    candleVerdict: { AGREE: "Match", SMALL_DIFF: "Small difference", DISAGREE: "Mismatch — no signal", UNAVAILABLE: "Could not check", SINGLE_SOURCE: "Only one source" } as Record<string, string>,
    simpleAgree: (n: number, names: string, p: string) => `Price checked on ${n} sources (${names}) — they agree (at most ${p} apart).`,
    simpleSmall: (names: string, p: string) => `Price sources (${names}) differ by ${p}. Usually harmless, but double-check before you trade.`,
    simpleDisagree: (names: string, p: string, out: string) => `Price sources (${names}) differ by ${p} — ${out} looks off. Don't act on this price until the sources agree again.`,
    simpleSingle: "Only one source answered, so the price could not be double-checked right now.",
    chartsAgree: (src: string) => `Chart data matches ${src} on every checked timeframe.`,
    chartsIssue: (tfs: string, src: string) => `Chart data differs from ${src} on: ${tfs}.`,
    details: "Show the numbers",
    // dashboard summary
    sumAgree: (n: number) => `Prices double-checked on Binance, Kraken and CoinGecko — all ${n} of your coins agree.`,
    sumIssue: (coins: string) => `Price sources disagree for: ${coins}. Open the coin to see the numbers, and don't act on that price until the sources agree again.`,
    sumSmall: (coins: string) => `Small price differences between sources for: ${coins}.`,
    // signal second opinion
    soTitle: "Second opinion from another exchange",
    soDesc: (main: string, other: string) => `The same strategy was also run on ${other}'s candles (main data: ${main}).`,
    soConfirmed: (other: string) => `Confirmed — on ${other}'s data this strategy gives the same answer.`,
    soNotConfirmed: (other: string) => `Not confirmed — on ${other}'s data this strategy gives a different answer. Treat this signal with extra caution.`,
    soUnchecked: (other: string) => `Could not be double-checked on ${other} this time.`,
    soState: (other: string) => `${other} says:`,
    gap: { UNAVAILABLE: "the exchange did not answer", LAGGING: "it does not have this candle yet", NOT_ENOUGH_DATA: "it does not have enough price history for this strategy", MAIN_NO_SIGNAL: "the main data gave no signal" } as Record<OpinionGap, string>,
    soCandles: (n: number, typ: string, last: string) => `${n} candles compared · typical difference ${typ} · analysed candle ${last}`,
  },
  fa: {
    title: "بررسی داده — آیا عددها درست است؟",
    desc: "هر قیمت با چند منبع مستقل مقایسه می‌شود. اگر منبع‌ها خیلی با هم فرق داشته باشند، برنامه برای آن نمودار سیگنالی نمی‌دهد تا دوباره یکی شوند.",
    livePrice: "قیمت لحظه‌ای (دلار)",
    source: "منبع",
    price: "قیمت",
    vsMiddle: "اختلاف",
    updated: "به‌روزرسانی",
    noAnswer: "جواب نداد",
    biggest: (p: string, ago: string) => `بیشترین اختلاف بین منبع‌ها: ${iso(p)} · بررسی ${ago}`,
    noPriceCheck: "هنوز بررسی قیمت انجام نشده — همراه با هر به‌روزرسانی بازار (هر ۱۰ دقیقه) انجام می‌شود.",
    chartData: "داده‌های نمودار (کندل‌هایی که برای تحلیل استفاده می‌شوند)",
    tf: "بازهٔ زمانی",
    comparedWith: "مقایسه با",
    candles: "تعداد کندل مقایسه‌شده",
    typical: "اختلاف معمول",
    latest: "کندل تحلیل‌شده",
    result: "نتیجه",
    noCandleCheck: "هنوز بررسی نشده — داده‌های نمودار هر بار که کندل تازه‌ای تحلیل می‌شود دوباره بررسی می‌شوند.",
    verdict: {
      AGREE: (n: number) => `${n} منبع هم‌نظرند`,
      SMALL_DIFF: () => "اختلاف کم",
      DISAGREE: () => "منبع‌ها هم‌نظر نیستند",
      SINGLE_SOURCE: () => "فقط یک منبع",
    } as Record<Agreement, (n: number) => string>,
    candleVerdict: { AGREE: "یکسان", SMALL_DIFF: "اختلاف کم", DISAGREE: "ناهمخوان — بدون سیگنال", UNAVAILABLE: "بررسی نشد", SINGLE_SOURCE: "فقط یک منبع" } as Record<string, string>,
    simpleAgree: (n: number, names: string, p: string) => `قیمت با ${n} منبع (${names}) بررسی شد — هم‌نظرند (حداکثر ${iso(p)} اختلاف).`,
    simpleSmall: (names: string, p: string) => `منبع‌های قیمت (${names}) ${iso(p)} با هم فرق دارند. معمولاً مشکلی نیست، ولی قبل از معامله دوباره نگاه کنید.`,
    simpleDisagree: (names: string, p: string, out: string) => `منبع‌های قیمت (${names}) ${iso(p)} با هم فرق دارند — قیمت ${out} عجیب به نظر می‌رسد. تا وقتی منبع‌ها دوباره یکی نشده‌اند، بر اساس این قیمت کاری نکنید.`,
    simpleSingle: "فقط یک منبع جواب داد، برای همین الان نشد قیمت را دوباره بررسی کرد.",
    chartsAgree: (src: string) => `داده‌های نمودار در همهٔ بازه‌های بررسی‌شده با ${src} یکی است.`,
    chartsIssue: (tfs: string, src: string) => `داده‌های نمودار در این بازه‌ها با ${src} فرق دارد: ${tfs}.`,
    details: "نمایش عددها",
    sumAgree: (n: number) => `قیمت‌ها با Binance، Kraken و CoinGecko دوباره بررسی شدند — برای هر ${n} ارز شما هم‌نظرند.`,
    sumIssue: (coins: string) => `منبع‌های قیمت برای این ارزها هم‌نظر نیستند: ${coins}. صفحهٔ آن ارز را باز کنید تا عددها را ببینید، و تا وقتی منبع‌ها یکی نشده‌اند بر اساس آن قیمت کاری نکنید.`,
    sumSmall: (coins: string) => `اختلاف کمِ قیمت بین منبع‌ها برای: ${coins}.`,
    soTitle: "نظر دوم از یک صرافی دیگر",
    soDesc: (main: string, other: string) => `همین روش روی کندل‌های ${other} هم اجرا شد (دادهٔ اصلی: ${main}).`,
    soConfirmed: (other: string) => `تأیید شد — روی داده‌های ${other} هم این روش همین جواب را می‌دهد.`,
    soNotConfirmed: (other: string) => `تأیید نشد — روی داده‌های ${other} این روش جواب دیگری می‌دهد. با احتیاط بیشتری به این سیگنال نگاه کنید.`,
    soUnchecked: (other: string) => `این بار نشد با ${other} دوباره بررسی کرد.`,
    soState: (other: string) => `${other} می‌گوید:`,
    gap: { UNAVAILABLE: "صرافی جواب نداد", LAGGING: "هنوز این کندل را ندارد", NOT_ENOUGH_DATA: "تاریخچهٔ قیمت کافی برای این روش ندارد", MAIN_NO_SIGNAL: "دادهٔ اصلی سیگنالی نداد" } as Record<OpinionGap, string>,
    soCandles: (n: number, typ: string, last: string) => `${n} کندل مقایسه شد · اختلاف معمول ${iso(typ)} · کندل تحلیل‌شده ${iso(last)}`,
  },
} satisfies Dict<unknown>;

const TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = { AGREE: "good", SMALL_DIFF: "warn", DISAGREE: "bad", SINGLE_SOURCE: "neutral", UNAVAILABLE: "neutral" };
const answered = (c: PriceCheck) => c.sources.filter((s) => s.price !== null);
const names = (c: PriceCheck, sep: string) => answered(c).map((s) => sourceLabel(s.source)).join(sep);

/** Live price + chart data cross-check for one coin (asset page). */
export async function DataCheckCard({ price, candles, simple }: { price: PriceCheckRow | null; candles: CandleCheckRow[]; simple: boolean }) {
  const [t, locale] = await Promise.all([getL(L), getLocale()]);
  const sep = locale === "fa" ? "، " : ", ";
  // eslint-disable-next-line react-hooks/purity -- server component: rendered once per request
  const now = Date.now();
  const c = price?.check ?? null;
  const tfName = (tf: string) => (locale === "fa" ? timeframeWord(tf, locale) : tf);
  const chartIssues = candles.filter((r) => r.comparisons.some((x) => x.verdict === "DISAGREE" || x.verdict === "SMALL_DIFF"));
  const chartSource = sourceLabel(candles[0]?.comparisons[0]?.source ?? "kraken");

  const summary = c ? <PriceSummary c={c} t={t} sep={sep} /> : <Alert tone="info">{t.noPriceCheck}</Alert>;
  const chartLine = candles.length ? (
    <p className="mt-2 text-sm text-ink-2">{chartIssues.length ? t.chartsIssue(chartIssues.map((r) => tfName(r.timeframe)).join(sep), chartSource) : t.chartsAgree(chartSource)}</p>
  ) : null;

  const tables = (
    <div className="space-y-4">
      {c && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">{t.livePrice}</h3>
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className={th}>{t.source}</th><th className={th}>{t.price}</th><th className={th}>{t.vsMiddle}</th><th className={th}>{t.updated}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {c.sources.map((s) => (
                  <tr key={s.source}>
                    <td className={`${td} font-medium`}>{sourceLabel(s.source)}</td>
                    <td className={`${td} tabular ltr`}>{s.price !== null ? fmtPrice(s.price, "USD") : <span className="text-ink-2">{t.noAnswer}</span>}</td>
                    <td className={`${td} tabular ltr`}>{s.price !== null && c.median ? `${s.price >= c.median ? "+" : "−"}${pct(Math.abs((s.price / c.median - 1) * 100))}` : "—"}</td>
                    <td className={`${td} text-ink-2`}>{s.at ? timeAgo(s.at, now, locale) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="mt-1.5 text-xs text-ink-2">{t.biggest(pct(c.spreadPct), timeAgo(price!.fetchedAt, now, locale))}</p>
        </div>
      )}
      <div>
        <h3 className="mb-1.5 text-sm font-semibold">{t.chartData}</h3>
        {candles.length === 0 ? <p className="text-sm text-ink-2">{t.noCandleCheck}</p> : (
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className={th}>{t.tf}</th><th className={th}>{t.comparedWith}</th><th className={th}>{t.candles}</th><th className={th}>{t.typical}</th><th className={th}>{t.latest}</th><th className={th}>{t.result}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {candles.flatMap((r) =>
                  r.comparisons.map((x) => (
                    <tr key={`${r.timeframe}:${x.source}`}>
                      <td className={td}>{tfName(r.timeframe)} <span className="text-xs text-ink-2">· {fmtDate(r.candleOpenTime, true, locale)}</span></td>
                      <td className={td}>{sourceLabel(x.primary)} ↔ {sourceLabel(x.source)}</td>
                      <td className={`${td} tabular`}>{x.matched}</td>
                      <td className={`${td} tabular ltr`}>{pct(x.medianDiffPct, 3)}</td>
                      <td className={`${td} tabular ltr`}>{pct(x.lastDiffPct, 3)}</td>
                      <td className={td}><Badge tone={TONE[x.verdict]}>{t.candleVerdict[x.verdict]}</Badge></td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </TableWrap>
        )}
      </div>
    </div>
  );

  return (
    <Card className="mb-4">
      <CardHeader title={t.title} description={simple ? undefined : t.desc} action={c ? <Badge tone={TONE[c.verdict]}>{t.verdict[c.verdict](answered(c).length)}</Badge> : undefined} />
      {summary}
      {chartLine}
      {simple ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-accent hover:underline">{t.details}</summary>
          <div className="mt-3">{tables}</div>
        </details>
      ) : (
        <div className="mt-4">{tables}</div>
      )}
    </Card>
  );
}

function PriceSummary({ c, t, sep }: { c: PriceCheck; t: (typeof L)["en"]; sep: string }) {
  const p = pct(c.spreadPct);
  if (c.verdict === "AGREE") return <Alert tone="success">{t.simpleAgree(answered(c).length, names(c, sep), p)}</Alert>;
  if (c.verdict === "SMALL_DIFF") return <Alert tone="warn">{t.simpleSmall(names(c, sep), p)}</Alert>;
  if (c.verdict === "DISAGREE") return <Alert tone="error">{t.simpleDisagree(names(c, sep), p, sourceLabel(c.outlier ?? ""))}</Alert>;
  return <Alert tone="info">{t.simpleSingle}</Alert>;
}

/** One line for the dashboard: do the price sources agree for every watched coin? */
export async function PriceCheckSummary({ checks, symbols }: { checks: Map<string, PriceCheckRow>; symbols: string[] }) {
  const [t, locale] = await Promise.all([getL(L), getLocale()]);
  const s = locale === "fa" ? "، " : ", ";
  const label = (x: string) => (locale === "fa" ? coinLabel(x, locale) : x);
  const rows = symbols.map((x) => ({ symbol: x, c: checks.get(x)?.check ?? null })).filter((r): r is { symbol: string; c: PriceCheck } => r.c !== null);
  if (!rows.length) return null;
  const bad = rows.filter((r) => r.c.verdict === "DISAGREE");
  const small = rows.filter((r) => r.c.verdict === "SMALL_DIFF");
  if (bad.length) return <Alert tone="warn" className="mb-4">{t.sumIssue(bad.map((r) => `${label(r.symbol)} (${iso(pct(r.c.spreadPct))})`).join(s))}</Alert>;
  if (small.length) return <Alert tone="info" className="mb-4">{t.sumSmall(small.map((r) => `${label(r.symbol)} (${iso(pct(r.c.spreadPct))})`).join(s))}</Alert>;
  if (rows.every((r) => r.c.verdict === "AGREE")) return <p className="mb-4 text-sm text-good-ink">✓ {t.sumAgree(rows.length)}</p>;
  return null;
}

/** Signal page: what the same strategy says on the second exchange's data. */
export async function SecondOpinionCard({ check, className }: { check: SignalSourceCheck | null; className?: string }) {
  if (!check?.opinions?.length) return null;
  const t = await getL(L);
  const op = check.opinions[0];
  const other = sourceLabel(op.source);
  const cmp: CandleComparison | undefined = check.candles.find((c) => c.source === op.source);
  const tone = check.agreement === "CONFIRMED" ? "success" : check.agreement === "NOT_CONFIRMED" ? "warn" : "info";
  const text = check.agreement === "CONFIRMED" ? t.soConfirmed(other) : check.agreement === "NOT_CONFIRMED" ? t.soNotConfirmed(other) : `${t.soUnchecked(other)}${op.gap ? ` (${t.gap[op.gap]})` : ""}`;
  return (
    <Card className={className}>
      <CardHeader title={t.soTitle} description={t.soDesc(sourceLabel(check.primary), other)} />
      <Alert tone={tone}>{text}</Alert>
      {op.state && op.state !== "NO_SIGNAL" && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">{t.soState(other)} <SignalBadge state={op.state} /></p>
      )}
      {cmp && cmp.verdict !== "UNAVAILABLE" && <p className="mt-2 text-xs text-ink-2">{t.soCandles(cmp.matched, pct(cmp.medianDiffPct, 3), pct(cmp.lastDiffPct, 3))}</p>}
    </Card>
  );
}

/** Short text for plain-language views (simple mode). */
export function secondOpinionLine(check: SignalSourceCheck | null, locale: Locale): { tone: "success" | "warn" | "info"; text: string } | null {
  if (!check?.opinions?.length) return null;
  const t = L[locale];
  const other = sourceLabel(check.opinions[0].source);
  if (check.agreement === "CONFIRMED") return { tone: "success", text: t.soConfirmed(other) };
  if (check.agreement === "NOT_CONFIRMED") return { tone: "warn", text: t.soNotConfirmed(other) };
  const gap = check.opinions[0].gap;
  return { tone: "info", text: `${t.soUnchecked(other)}${gap ? ` (${t.gap[gap]})` : ""}` };
}
