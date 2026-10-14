import type { Metadata } from "next";
import { PageHeader, Alert } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { timeframeWord } from "@/lib/plain";
import { getSettings, getStrategyConfigs } from "@/lib/settings/service";
import { StrategyEditor } from "./editor";

const L = {
  en: {
    metaTitle: "Strategies",
    title: "Strategy management",
    desc: "Transparent, rule-based strategies. Each can be configured, tested and disabled independently. No strategy works in all market conditions.",
    scannedTitle: "Scanned timeframes",
    scanned: (tfs: string) =>
      `The scheduler scans: ${tfs} (change in Settings). A strategy only runs on timeframes that are both scanned and enabled below. Changing parameters after seeing results risks overfitting — validate with out-of-sample backtests.`,
  },
  fa: {
    metaTitle: "روش‌ها",
    title: "مدیریت روش‌ها",
    desc: "روش‌های شفاف و قانون‌محور. هر کدام را می‌شود جداگانه تنظیم، آزمایش یا خاموش کرد. هیچ روشی در همهٔ شرایط بازار جواب نمی‌دهد.",
    scannedTitle: "بازه‌های زمانیِ بررسی‌شده",
    scanned: (tfs: string) =>
      `برنامه این بازه‌های زمانی را بررسی می‌کند: ${tfs} (در تنظیمات قابل تغییر است). هر روش فقط روی بازه‌هایی اجرا می‌شود که هم بررسی می‌شوند و هم پایین‌تر برایش روشن شده‌اند. اگر بعد از دیدن نتیجه‌ها تنظیمات را عوض کنید، خطر «تنظیم بیش از حد روی گذشته» (بیش‌برازش) هست — با آزمایش روی گذشته روی بخشِ دیده‌نشدهٔ داده‌ها (خارج از نمونه) آن را بسنجید.`,
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.metaTitle };
}

export default async function StrategiesPage() {
  const user = await requireUser();
  const [configs, settings, t, locale] = await Promise.all([getStrategyConfigs(user.id), getSettings(user.id), getL(L), getLocale()]);
  const tfs = settings.timeframes.map((tf) => (locale === "fa" ? timeframeWord(tf, "fa") : tf)).join(locale === "fa" ? "، " : ", ");
  return (
    <>
      <PageHeader title={t.title} description={t.desc} />
      <Alert tone="info" className="mb-4" title={t.scannedTitle}>
        {t.scanned(tfs)}
      </Alert>
      <div className="space-y-4">
        {configs.map((c) => (
          <StrategyEditor
            key={c.def.id}
            strategy={{ id: c.def.id, name: c.def.name, version: c.def.version, summary: c.def.summary, description: c.def.description, rules: c.def.rules, intendedTimeframes: c.def.intendedTimeframes, params: c.def.params }}
            config={{ enabled: c.enabled, params: c.params, timeframes: c.timeframes }}
          />
        ))}
      </div>
    </>
  );
}
