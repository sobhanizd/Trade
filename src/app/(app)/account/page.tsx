import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import type { Dict } from "@/lib/i18n";
import { getL } from "@/lib/i18n/server";
import { AccountPanels } from "./panels";

const L = {
  en: {
    metaTitle: "Account",
    title: "Account & data",
    signedInAs: (email: string) => <>Signed in as <span className="ltr">{email}</span>.</>,
  },
  fa: {
    metaTitle: "حساب کاربری",
    title: "حساب کاربری و داده‌ها",
    signedInAs: (email: string) => <>با حساب <span className="ltr">{email}</span> وارد شده‌اید.</>,
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getL(L)).metaTitle };
}

export default async function AccountPage() {
  const user = await requireUser();
  const t = await getL(L);
  return (
    <>
      <PageHeader title={t.title} description={t.signedInAs(user.email)} />
      <AccountPanels />
    </>
  );
}
