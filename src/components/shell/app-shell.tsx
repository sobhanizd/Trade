"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, LogOut, Menu, Moon, RefreshCw, Sun, WifiOff, X } from "lucide-react";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { CurrencyMenu, type ShellFx } from "./currency-menu";
import { MOBILE_TABS, NAV, SIMPLE_MOBILE_TABS, SIMPLE_NAV } from "./nav";
import type { Dict } from "@/lib/i18n";
import { switchLocale, useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";

const L = {
  en: {
    app: "CryptoPilot AI", main: "Main", quick: "Quick", menu: "Menu", more: "More", moreTools: "More tools",
    openMenu: "Open menu", closeMenu: "Close menu", offline: "Offline", refresh: "Refresh", refreshing: "Refreshing…",
    refreshAria: "Refresh market data now", refreshed: "Market data refreshed.", alreadyRunning: "A scan is already running.",
    refreshFailed: (e: string) => `Refresh failed: ${e}`, unknown: "unknown error",
    notifications: (n: number) => `Notifications (${n} unread)`, toLight: "Switch to light mode", toDark: "Switch to dark mode",
    signOut: (e: string) => `Sign out ${e}`, signedInAs: (e: string) => `Signed in as ${e}`, lang: "فا", langAria: "فارسی — switch to Persian",
  },
  fa: {
    app: "کریپتوپایلوت", main: "منوی اصلی", quick: "دسترسی سریع", menu: "منو", more: "بیشتر", moreTools: "ابزارهای بیشتر",
    openMenu: "باز کردن منو", closeMenu: "بستن منو", offline: "آفلاین", refresh: "به‌روزرسانی", refreshing: "در حال به‌روزرسانی…",
    refreshAria: "به‌روزرسانی داده‌های بازار", refreshed: "داده‌های بازار به‌روز شد.", alreadyRunning: "یک بررسی در حال انجام است.",
    refreshFailed: (e: string) => `به‌روزرسانی ناموفق بود: ${e}`, unknown: "خطای نامشخص",
    notifications: (n: number) => `اعلان‌ها (${n} خوانده‌نشده)`, toLight: "حالت روشن", toDark: "حالت تاریک",
    signOut: (e: string) => `خروج از حساب ${e}`, signedInAs: (e: string) => `وارد شده با ${e}`, lang: "EN", langAria: "English — تغییر به انگلیسی",
  },
} satisfies Dict<unknown>;

function NavItem({ href, label, Icon, onNavigate }: { href: string; label: string; Icon: (typeof SIMPLE_NAV)[number]["icon"]; onNavigate?: () => void }) {
  const path = usePathname();
  const active = path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn("flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[15px]", active ? "bg-accent/15 font-medium text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

function SimpleNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const t = useL(L);
  const fa = useLocale() === "fa";
  const main = new Set<string>(SIMPLE_NAV.map((i) => i.href));
  const more = NAV.flatMap((g) => [...g.items] as { href: string; label: string; labelFa: string; icon: (typeof SIMPLE_NAV)[number]["icon"] }[]).filter((i) => !main.has(i.href));
  return (
    <nav aria-label={t.main} className="space-y-1">
      {SIMPLE_NAV.map((it) => <NavItem key={it.href} href={it.href} label={fa ? it.labelFa : it.label} Icon={it.icon} onNavigate={onNavigate} />)}
      <details className="group pt-4">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold tracking-wider text-ink-2 uppercase hover:text-ink">{t.moreTools} ▾</summary>
        <div className="space-y-0.5">
          {more.map((it) => <NavItem key={it.href} href={it.href} label={fa ? it.labelFa : it.label} Icon={it.icon} onNavigate={onNavigate} />)}
        </div>
      </details>
    </nav>
  );
}

/** Keeps the browser theme in sync with the theme saved in the user's settings. */
function ThemeSync({ theme }: { theme: string }) {
  const { theme: current, setTheme } = useTheme();
  useEffect(() => {
    if (current !== theme) setTheme(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the saved theme changes
  }, [theme]);
  return null;
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const t = useL(L);
  const fa = useLocale() === "fa";
  return (
    <nav aria-label={t.main} className="space-y-5">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-ink-2 uppercase">{fa ? g.groupFa : g.group}</div>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = path === it.href || path.startsWith(`${it.href}/`);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm", active ? "bg-accent/10 font-medium text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
                  >
                    <it.icon className="h-4 w-4 shrink-0" aria-hidden />
                    {fa ? it.labelFa : it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function LangToggle() {
  const t = useL(L);
  const locale = useLocale();
  return (
    <button type="button" onClick={() => void switchLocale(locale === "fa" ? "en" : "fa")} className="rounded-lg px-2 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={t.langAria} title={t.langAria}>
      {t.lang}
    </button>
  );
}

function ThemeToggle() {
  const t = useL(L);
  const { resolvedTheme, setTheme: setLocalTheme } = useTheme();
  // Persist the choice to the account so every device follows it.
  const setTheme = (t: string) => {
    setLocalTheme(t);
    void api("/api/settings", { method: "PUT", body: { theme: t } }).catch(() => undefined);
  };
  const mounted = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button type="button" onClick={() => setTheme(dark ? "light" : "dark")} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={dark ? t.toLight : t.toDark}>
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);
  return online;
}

export function AppShell({ children, unread, email, simple, theme, fx }: { children: React.ReactNode; unread: number; email: string; simple: boolean; theme: string; fx: ShellFx }) {
  const Links = simple ? SimpleNavLinks : NavLinks;
  const t = useL(L);
  const fa = useLocale() === "fa";
  const tabs = simple ? SIMPLE_MOBILE_TABS : MOBILE_TABS;
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const path = usePathname();
  const online = useOnline();

  async function refresh() {
    setRefreshing(true);
    setMsg(null);
    try {
      const r = await api<{ scan: { status: string; error?: string } }>("/api/scan", { method: "POST" });
      setMsg(r.scan.status === "SUCCESS" ? t.refreshed : r.scan.status === "SKIPPED" ? t.alreadyRunning : t.refreshFailed(r.scan.error ?? t.unknown));
      router.refresh();
    } catch (e) {
      setMsg(errorText((e as Error).message, fa ? "fa" : "en"));
    } finally {
      setRefreshing(false);
      setTimeout(() => setMsg(null), 6000);
    }
  }
  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload deliberately clears client state after sign-out
    window.location.href = "/login";
  }

  return (
    <div className="flex min-h-dvh">
      <ThemeSync theme={theme} />
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 overflow-y-auto border-e border-line bg-surface px-3 py-5 lg:block">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-3 font-semibold text-ink">
          <Image src="/icons/icon-192.png" alt="" width={28} height={28} className="rounded-md" />
          {t.app}
        </Link>
        <Links />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t.menu}>
          <button className="absolute inset-0 bg-black/40" aria-label={t.closeMenu} onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 w-72 max-w-[85vw] overflow-y-auto bg-surface px-3 py-5 shadow-xl">
            <div className="mb-5 flex items-center justify-between px-3">
              <span className="font-semibold">{t.app}</span>
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-surface-2" aria-label={t.closeMenu}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <Links onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-line bg-page/90 px-2 py-2 backdrop-blur sm:px-4" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
          <button className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 lg:hidden" onClick={() => setOpen(true)} aria-label={t.openMenu}>
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate font-semibold lg:hidden">{t.app}</span>
          <div className="ms-auto flex items-center gap-1">
            {!online && (
              <span className="me-1 inline-flex items-center gap-1 rounded-md bg-warn/20 px-2 py-1 text-xs text-warn-ink">
                <WifiOff className="h-3.5 w-3.5" /> {t.offline}
              </span>
            )}
            <button onClick={refresh} disabled={refreshing || !online} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-50" aria-label={t.refreshAria}>
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              <span className="hidden sm:inline">{refreshing ? t.refreshing : t.refresh}</span>
            </button>
            <Link href="/notifications" className="relative rounded-lg p-2 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={t.notifications(unread)}>
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute top-1 end-1 min-w-4 rounded-full bg-bad px-1 text-center text-[10px] leading-4 font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <CurrencyMenu fx={fx} />
            <LangToggle />
            <ThemeToggle />
            <button onClick={logout} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={t.signOut(email)} title={t.signedInAs(email)}>
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        {msg && (
          <div role="status" className="border-b border-line bg-surface px-4 py-2 text-sm text-ink-2">
            {msg}
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 sm:px-6 lg:pb-10">{children}</main>
      </div>

      <nav aria-label={t.quick} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabs.map((tab) => {
          const active = path === tab.href || path.startsWith(`${tab.href}/`);
          return (
            <Link key={tab.href} href={tab.href} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "text-accent" : "text-ink-2")} aria-current={active ? "page" : undefined}>
              <tab.icon className="h-5 w-5" aria-hidden />
              {fa ? tab.labelFa : tab.label}
            </Link>
          );
        })}
        <button onClick={() => setOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-ink-2">
          <Menu className="h-5 w-5" aria-hidden />
          {t.more}
        </button>
      </nav>
    </div>
  );
}
