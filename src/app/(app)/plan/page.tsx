import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { getL } from "@/lib/i18n/server";
import { getPlanView } from "@/lib/plan/service";
import { PL } from "./plan-i18n";
import { PlanPage } from "./plan-page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getL(PL)).title };
}

export default async function Plan() {
  const user = await requireUser();
  const view = await getPlanView(user.id);
  // Re-mount when the saved settings change on the server (e.g. after recording purchases).
  return <PlanPage key={JSON.stringify(view.settings)} view={view} />;
}
