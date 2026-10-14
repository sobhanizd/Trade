"use client";
import { useState, useSyncExternalStore } from "react";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/client-api";
import type { Dict } from "@/lib/i18n";
import { switchLocale, useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";

const L = {
  en: { username: "Username", password: "Password", signIn: "Sign in", signingIn: "Signing in…", lang: "فارسی", langAria: "Switch to Persian" },
  fa: { username: "نام کاربری", password: "رمز عبور", signIn: "ورود", signingIn: "در حال ورود…", lang: "English", langAria: "تغییر به انگلیسی" },
} satisfies Dict<unknown>;

export function LoginLangSwitch() {
  const t = useL(L);
  const locale = useLocale();
  return (
    <button type="button" onClick={() => void switchLocale(locale === "fa" ? "en" : "fa", false)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={t.langAria}>
      {t.lang}
    </button>
  );
}

export function LoginForm() {
  const t = useL(L);
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Disabled until hydrated so a native (pre-JS) submit can never happen.
  const hydrated = useSyncExternalStore(() => () => undefined, () => true, () => false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { email: fd.get("email"), password: fd.get("password") } });
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    } catch (err) {
      setError(errorText((err as Error).message, locale));
      setBusy(false);
    }
  }
  return (
    <Card>
      <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
        <Field label={t.username} htmlFor="email">
          <Input id="email" name="email" type="text" dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
        </Field>
        <Field label={t.password} htmlFor="password">
          <Input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" className="w-full" disabled={busy || !hydrated}>
          {busy ? t.signingIn : t.signIn}
        </Button>
      </form>
    </Card>
  );
}
