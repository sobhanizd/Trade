import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getFx } from "@/lib/fx";
import { getSettings } from "@/lib/settings/service";
import { TomanProvider } from "@/components/toman/context";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unread, settings] = await Promise.all([db().notification.count({ where: { userId: user.id, readAt: null } }), getSettings(user.id)]);
  const fx = await getFx(settings);
  return (
    <TomanProvider initial={settings.toman} usdEur={fx.eurPerUsd}>
      <AppShell unread={unread} email={user.email} simple={settings.ui.simple} theme={settings.theme} fx={{ wanted: fx.wanted, shown: fx.currency, autoUsdPerEur: fx.autoEurPerUsd ? 1 / fx.autoEurPerUsd : null, autoDate: fx.autoDate, manualUsdPerEur: settings.fxManual.usdPerEur, manualAt: settings.fxManual.updatedAt }}>
        {children}
      </AppShell>
    </TomanProvider>
  );
}
