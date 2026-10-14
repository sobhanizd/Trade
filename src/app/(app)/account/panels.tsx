"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/client-api";
import { timeAgo } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";

interface Sess { id: string; createdAt: string; lastSeenAt: string; userAgent: string | null; current: boolean }

const L = {
  en: {
    mismatch: "New passwords do not match.",
    pwChanged: "Password changed. Other sessions were signed out.",
    confirmAccount: "Permanently delete your account and ALL data? This cannot be undone.",
    confirmData: "Delete all signals, backtests, paper trades, notifications and AI history?",
    dataDeleted: "Your analysis data was deleted.",
    changePw: "Change password",
    currentPw: "Current password",
    newPw: "New password",
    newPwHint: "At least 12 characters, letters plus numbers or symbols.",
    confirmPw: "Confirm new password",
    sessions: "Active sessions",
    signOutOthers: "Sign out other sessions",
    unknownDevice: "Unknown device",
    sessionTimes: (created: string, seen: string) => `created ${created} · last seen ${seen}`,
    thisDevice: "this device",
    revoke: "Revoke",
    export: "Export your data",
    exportDesc: "Downloads a JSON file with your settings, watchlist, signals, backtests, paper trades, notifications and AI history.",
    download: "Download export (JSON)",
    deleteData: "Delete data",
    deleteDesc: "Requires your password and typing DELETE.",
    whatToDelete: "What to delete",
    onlyData: "Analysis data only (keep login & settings)",
    wholeAccount: "Entire account and all data",
    password: "Password",
    typeDelete: "Type DELETE to confirm",
    delete: "Delete",
  },
  fa: {
    mismatch: "رمزهای عبور جدید با هم یکی نیستند.",
    pwChanged: "رمز عبور عوض شد. از دستگاه‌های دیگر خارج شدید.",
    confirmAccount: "حساب کاربری و همهٔ داده‌هایتان برای همیشه پاک شود؟ این کار برگشت‌پذیر نیست.",
    confirmData: "همهٔ سیگنال‌ها، آزمایش‌های روی گذشته (بک‌تست)، معامله‌های تمرینی، اعلان‌ها و سابقهٔ هوش مصنوعی پاک شود؟",
    dataDeleted: "داده‌های تحلیل شما پاک شد.",
    changePw: "تغییر رمز عبور",
    currentPw: "رمز عبور فعلی",
    newPw: "رمز عبور جدید",
    newPwHint: "دست‌کم ۱۲ کاراکتر، ترکیبی از حروف با عدد یا نماد.",
    confirmPw: "تکرار رمز عبور جدید",
    sessions: "دستگاه‌های واردشده",
    signOutOthers: "خروج از دستگاه‌های دیگر",
    unknownDevice: "دستگاه ناشناخته",
    sessionTimes: (created: string, seen: string) => `ورود: ${created} · آخرین استفاده: ${seen}`,
    thisDevice: "همین دستگاه",
    revoke: "خارج کردن",
    export: "دریافت نسخه‌ای از داده‌هایتان",
    exportDesc: "یک فایل JSON دانلود می‌شود که تنظیمات، ارزهای من، سیگنال‌ها، آزمایش‌های روی گذشته، معامله‌های تمرینی، اعلان‌ها و سابقهٔ هوش مصنوعی را دارد.",
    download: "دانلود فایل (JSON)",
    deleteData: "پاک کردن داده‌ها",
    deleteDesc: "برای این کار رمز عبور را وارد کنید و کلمهٔ DELETE را بنویسید.",
    whatToDelete: "چه چیزی پاک شود",
    onlyData: "فقط داده‌های تحلیل (حساب و تنظیمات می‌ماند)",
    wholeAccount: "کل حساب و همهٔ داده‌ها",
    password: "رمز عبور",
    typeDelete: "برای تأیید، DELETE را بنویسید",
    delete: "پاک کردن",
  },
} satisfies Dict<unknown>;

export function AccountPanels() {
  const t = useL(L);
  const locale = useLocale();
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true;
    api<{ sessions: Sess[] }>("/api/account/sessions")
      .then((r) => alive && setSessions(r.sessions))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [version]);
  const errMsg = (e: unknown) => errorText((e as Error).message, locale);

  async function changePw(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (fd.get("next") !== fd.get("confirm")) return setMsg({ tone: "error", text: t.mismatch });
    try {
      await api("/api/account/password", { body: { current: fd.get("current"), next: fd.get("next") } });
      setMsg({ tone: "success", text: t.pwChanged });
      form.reset();
      load();
    } catch (err) {
      setMsg({ tone: "error", text: errMsg(err) });
    }
  }
  async function revoke(body: { id?: string; others?: boolean }) {
    await api("/api/account/sessions", { method: "DELETE", body }).catch((e) => setMsg({ tone: "error", text: errMsg(e) }));
    load();
  }
  async function del(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const scope = fd.get("scope") as string;
    if (!confirm(scope === "account" ? t.confirmAccount : t.confirmData)) return;
    try {
      await api("/api/account/delete", { body: { password: fd.get("password"), confirm: fd.get("confirm"), scope } });
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload deliberately clears client state after sign-out
      if (scope === "account") window.location.href = "/login";
      else setMsg({ tone: "success", text: t.dataDeleted });
    } catch (err) {
      setMsg({ tone: "error", text: errMsg(err) });
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {msg && <Alert tone={msg.tone} className="lg:col-span-2">{msg.text}</Alert>}
      <Card>
        <CardHeader title={t.changePw} />
        <form onSubmit={changePw} method="post" className="space-y-3">
          <Field label={t.currentPw} htmlFor="a-cur"><Input id="a-cur" name="current" type="password" autoComplete="current-password" required /></Field>
          <Field label={t.newPw} htmlFor="a-new" hint={t.newPwHint}><Input id="a-new" name="next" type="password" autoComplete="new-password" minLength={12} required /></Field>
          <Field label={t.confirmPw} htmlFor="a-conf"><Input id="a-conf" name="confirm" type="password" autoComplete="new-password" required /></Field>
          <Button type="submit">{t.changePw}</Button>
        </form>
      </Card>
      <Card>
        <CardHeader title={t.sessions} action={<Button variant="secondary" onClick={() => revoke({ others: true })}>{t.signOutOthers}</Button>} />
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0"><span className="block truncate" dir={s.userAgent ? "ltr" : undefined}>{s.userAgent ?? t.unknownDevice}</span><span className="text-xs text-ink-2">{t.sessionTimes(timeAgo(s.createdAt, undefined, locale), timeAgo(s.lastSeenAt, undefined, locale))}</span></span>
              {s.current ? <Badge tone="accent">{t.thisDevice}</Badge> : <Button variant="ghost" onClick={() => revoke({ id: s.id })}>{t.revoke}</Button>}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title={t.export} description={t.exportDesc} />
        <a href="/api/account/export" className="inline-flex min-h-10 items-center rounded-lg border border-line px-3.5 py-2 text-sm font-medium hover:bg-surface-2">{t.download}</a>
      </Card>
      <Card>
        <CardHeader title={t.deleteData} description={t.deleteDesc} />
        <form onSubmit={del} method="post" className="space-y-3">
          <Field label={t.whatToDelete} htmlFor="d-scope"><Select id="d-scope" name="scope" defaultValue="data"><option value="data">{t.onlyData}</option><option value="account">{t.wholeAccount}</option></Select></Field>
          <Field label={t.password} htmlFor="d-pw"><Input id="d-pw" name="password" type="password" autoComplete="current-password" required /></Field>
          <Field label={t.typeDelete} htmlFor="d-conf"><Input id="d-conf" name="confirm" dir="ltr" required pattern="DELETE" /></Field>
          <Button type="submit" variant="danger">{t.delete}</Button>
        </form>
      </Card>
    </div>
  );
}
