import type { Metadata } from "next";
import { Alert, Badge, Card, CardHeader, PageHeader, TableWrap, td, th } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { fmtDate, timeAgo } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { errorText } from "@/lib/i18n/texts";
import { TIMEFRAME_MS, type Timeframe } from "@/lib/market/types";
import { timeframeWord } from "@/lib/plain";
import { getSystemStatus } from "@/lib/status";

const FA_JOB_STATUS: Record<string, string> = { SUCCESS: "موفق", FAILED: "ناموفق", RUNNING: "در حال اجرا" };
const FA_INTEGRATION: Record<string, string> = {
  telegram: "تلگرام",
  email: "ایمیل",
  webpush: "اعلان مرورگر",
  ai: "هوش مصنوعی",
  coingeckoKey: "کلید CoinGecko",
  news: "اخبار",
  sentiment: "حال‌وهوای بازار",
};
const FA_SNAPSHOT: Record<string, string> = { GLOBAL: "آمار کل بازار", SENTIMENT: "حال‌وهوای بازار (ترس و طمع)", FX: "نرخ تبدیل ارز", OVERVIEW: "خلاصهٔ بازار" };

const L = {
  en: {
    metaTitle: "System status",
    title: "System status & data-source health",
    description: "Use this page to spot provider errors, stale data and worker problems.",
    dbDown: "Database unavailable",
    jobs: "Background jobs",
    jobsDesc: "Run by the worker process (npm run worker), independent of your browser.",
    job: "Job",
    lastRun: "Last run",
    lastSuccess: "Last success",
    failures24h: "Failures 24h",
    jobStatus: (s: string) => s.toLowerCase(),
    never: "never",
    providers: "Data providers",
    providersDesc: (ok: boolean, ms: number | undefined) => `Database: ${ok ? `ok (${ms} ms)` : "down"}`,
    provider: "Provider",
    status: "Status",
    lastError: "Last error",
    healthy: "healthy",
    failures: (n: number) => `${n} failure(s)`,
    freshness: "Candle freshness",
    freshnessDesc: "Latest stored candle close per asset/timeframe. Stale = older than two intervals.",
    asset: "Asset",
    tf: "TF",
    tfName: (tf: string) => tf,
    lastClose: "Last close",
    source: "Source",
    state: "State",
    stale: "stale",
    fresh: "fresh",
    integrations: "Integrations",
    integrationsDesc: "Booleans only — secrets are never displayed.",
    integration: (k: string) => k,
    configured: "configured",
    off: "off",
    deliveryFailures: "Notification delivery failures (24h):",
    snapshot: (kind: string, ago: string, source: string) => `${kind}: fetched ${ago} · ${source}`,
  },
  fa: {
    metaTitle: "وضعیت سیستم",
    title: "وضعیت سیستم و سلامت منبع داده‌ها",
    description: "از این صفحه برای دیدن خطای منبع داده، دادهٔ قدیمی و مشکل کارهای پس‌زمینه استفاده کنید.",
    dbDown: "پایگاه داده در دسترس نیست",
    jobs: "کارهای پس‌زمینه",
    jobsDesc: "این کارها را برنامهٔ پس‌زمینه (npm run worker) انجام می‌دهد، جدا از مرورگر شما.",
    job: "کار",
    lastRun: "آخرین اجرا",
    lastSuccess: "آخرین اجرای موفق",
    failures24h: "خطا در ۲۴ ساعت",
    jobStatus: (s: string) => FA_JOB_STATUS[s] ?? s.toLowerCase(),
    never: "هرگز",
    providers: "منبع داده‌ها",
    providersDesc: (ok: boolean, ms: number | undefined) => `پایگاه داده: ${ok ? `سالم (${ms} ms)` : "از کار افتاده"}`,
    provider: "منبع",
    status: "وضعیت",
    lastError: "آخرین خطا",
    healthy: "سالم",
    failures: (n: number) => `${n} خطای پشت‌سرهم`,
    freshness: "به‌روز بودن قیمت‌ها",
    freshnessDesc: "آخرین کندل (شمع قیمت) ذخیره‌شده برای هر ارز و نمودار. «قدیمی» یعنی از دو بازهٔ زمانی هم کهنه‌تر است.",
    asset: "ارز",
    tf: "نمودار",
    tfName: (tf: string) => timeframeWord(tf, "fa"),
    lastClose: "آخرین بسته‌شدن",
    source: "منبع",
    state: "وضعیت",
    stale: "قدیمی",
    fresh: "به‌روز",
    integrations: "اتصال‌ها",
    integrationsDesc: "فقط روشن یا خاموش بودن نشان داده می‌شود — اطلاعات محرمانه هرگز نمایش داده نمی‌شود.",
    integration: (k: string) => FA_INTEGRATION[k] ?? k,
    configured: "تنظیم شده",
    off: "خاموش",
    deliveryFailures: "اعلان‌هایی که ارسالشان ناموفق بود (۲۴ ساعت گذشته):",
    snapshot: (kind: string, ago: string, source: string) => `${FA_SNAPSHOT[kind] ?? kind}: دریافت ${ago} · ${source}`,
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getL(L)).metaTitle };
}

export default async function StatusPage() {
  await requireUser();
  const [t, locale] = await Promise.all([getL(L), getLocale()]);
  const st = await getSystemStatus();
  // eslint-disable-next-line react-hooks/purity -- server component: rendered once per request
  const now = Date.now();
  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      {!st.database.ok && <Alert tone="error" className="mb-4" title={t.dbDown}>{st.database.error ? errorText(st.database.error, locale) : null}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.jobs} description={t.jobsDesc} />
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className={th}>{t.job}</th><th className={th}>{t.lastRun}</th><th className={th}>{t.lastSuccess}</th><th className={th}>{t.failures24h}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {st.jobs.map((j) => (
                  <tr key={j.job}>
                    <td className={`${td} font-medium`}>{j.job}</td>
                    <td className={td}>{j.last ? <><Badge tone={j.last.status === "SUCCESS" ? "good" : j.last.status === "FAILED" ? "bad" : "neutral"}>{t.jobStatus(j.last.status)}</Badge> <span className="text-xs text-ink-2">{timeAgo(j.last.startedAt, now, locale)}</span>{j.last.error && <div className="max-w-xs truncate text-xs text-bad-ink" title={j.last.error}>{j.last.error}</div>}</> : <Badge tone="warn">{t.never}</Badge>}</td>
                    <td className={`${td} text-ink-2`}>{timeAgo(j.lastSuccess?.startedAt, now, locale)}</td>
                    <td className={`${td} tabular`}>{j.failures24h}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card>
          <CardHeader title={t.providers} description={t.providersDesc(st.database.ok, st.database.latencyMs)} />
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className={th}>{t.provider}</th><th className={th}>{t.status}</th><th className={th}>{t.lastSuccess}</th><th className={th}>{t.lastError}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {st.providers.map((p) => (
                  <tr key={p.provider}>
                    <td className={`${td} font-medium`}>{p.provider}</td>
                    <td className={td}>{p.consecutiveFailures === 0 ? <Badge tone="good">{t.healthy}</Badge> : <Badge tone="bad">{t.failures(p.consecutiveFailures)}</Badge>}</td>
                    <td className={`${td} text-ink-2`}>{timeAgo(p.lastSuccessAt, now, locale)}{p.lastLatencyMs ? <span className="ltr"> · {p.lastLatencyMs} ms</span> : ""}</td>
                    <td className={`${td} max-w-xs truncate text-xs text-ink-2`} title={p.lastError ?? ""}>{p.lastErrorAt ? `${timeAgo(p.lastErrorAt, now, locale)}: ${p.lastError}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card>
          <CardHeader title={t.freshness} description={t.freshnessDesc} />
          <TableWrap>
            <table className="w-full">
              <thead><tr><th className={th}>{t.asset}</th><th className={th}>{t.tf}</th><th className={th}>{t.lastClose}</th><th className={th}>{t.source}</th><th className={th}>{t.state}</th></tr></thead>
              <tbody className="divide-y divide-line">
                {st.freshness.map((f) => {
                  const stale = now - new Date(f.last_close).getTime() > 2 * (TIMEFRAME_MS[f.timeframe as Timeframe] ?? 3_600_000);
                  return (
                    <tr key={`${f.symbol}-${f.timeframe}`}>
                      <td className={td}>{f.symbol}</td><td className={td}>{t.tfName(f.timeframe)}</td>
                      <td className={`${td} text-xs`}>{fmtDate(f.last_close, true, locale)}</td><td className={td}>{f.source}</td>
                      <td className={td}>{stale ? <Badge tone="warn">{t.stale}</Badge> : <Badge tone="good">{t.fresh}</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Card>
        <Card>
          <CardHeader title={t.integrations} description={t.integrationsDesc} />
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(st.integrations).map(([k, v]) => <li key={k} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">{t.integration(k)}<Badge tone={v ? "good" : "neutral"}>{v ? t.configured : t.off}</Badge></li>)}
          </ul>
          <p className="mt-3 text-sm text-ink-2">{t.deliveryFailures} <b className="text-ink">{st.deliveryFailures24h ?? 0}</b></p>
          <ul className="mt-3 space-y-1 text-xs text-ink-2">
            {(st.snapshots ?? []).map((s) => <li key={s.kind}>{t.snapshot(s.kind, timeAgo(s.fetchedAt, now, locale), s.source)}</li>)}
          </ul>
        </Card>
      </div>
    </>
  );
}
