import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import type { Dict } from "@/lib/i18n";
import { getL } from "@/lib/i18n/server";
import { getSettings } from "@/lib/settings/service";
import { RiskCalculator } from "./calculator";

const L = {
  en: {
    title: "Risk calculator",
    description: "Work out how big a hypothetical position could be so that hitting your stop loses no more than you decided in advance. Works entirely offline from your accounts.",
  },
  fa: {
    title: "ماشین‌حساب ریسک",
    description: "حساب کنید یک معاملهٔ فرضی چقدر می‌تواند بزرگ باشد تا اگر قیمت به حد ضرر رسید، بیشتر از مبلغی که از قبل تعیین کرده‌اید ضرر نکنید. این ابزار به هیچ حساب یا صرافی وصل نمی‌شود.",
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.title };
}

export default async function RiskPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const s = await getSettings(user.id);
  const sp = await searchParams;
  const t = await getL(L);
  const n = (v?: string) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);
  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <RiskCalculator
        defaults={{
          balance: s.risk.accountBalance,
          maxLoss: (s.risk.accountBalance * s.risk.riskPerTradePct) / 100,
          feePct: s.risk.feeRatePct,
          slipPct: s.risk.slippagePct,
          maxPositionPct: s.risk.maxPositionPct,
          entry: n(sp.entry),
          stop: n(sp.stop),
          target: n(sp.target),
        }}
      />
    </>
  );
}
