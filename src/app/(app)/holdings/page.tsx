import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getHoldingsView } from "@/lib/holdings/service";
import { getLocale } from "@/lib/i18n/server";
import { HoldingsPage } from "./holdings-page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "fa" ? "دارایی‌های من" : "My assets" };
}

export default async function Holdings() {
  const user = await requireUser();
  return <HoldingsPage initial={await getHoldingsView(user.id)} />;
}
