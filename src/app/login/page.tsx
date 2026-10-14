import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import type { Dict } from "@/lib/i18n";
import { getL } from "@/lib/i18n/server";
import { LoginForm, LoginLangSwitch } from "./form";

const L = {
  en: {
    meta: "Sign in",
    subtitle: "Private market analysis dashboard",
    note: "Read-only analysis. This app never connects to wallets or exchange accounts, never asks for seed phrases or private keys, and never places trades.",
    serverOn: "Server is running",
    serverHelp: "To start everything when the server is off, open the launcher: double-click “Start CryptoPilot” (or index.html) in the project folder.",
    turnOff: "Turn off server",
    demoTitle: "Live demo",
    demo: (u: string, p: string) => `Sign in with username ${u} and password ${p} (already filled in). This is your own private copy: real market data, nothing you do here touches anyone else.`,
  },
  fa: {
    meta: "ورود",
    subtitle: "داشبورد خصوصی تحلیل بازار",
    note: "فقط تحلیل. این برنامه هیچ‌وقت به کیف پول یا حساب صرافی وصل نمی‌شود، هیچ‌وقت عبارت بازیابی یا کلید خصوصی نمی‌خواهد و هیچ‌وقت معامله انجام نمی‌دهد.",
    serverOn: "سرور روشن است",
    serverHelp: "برای روشن کردن همه‌چیز وقتی سرور خاموش است، لانچر را باز کنید: روی «Start CryptoPilot» (یا index.html) در پوشهٔ پروژه دو بار کلیک کنید.",
    turnOff: "خاموش کردن سرور",
    demoTitle: "نسخهٔ نمایشی زنده",
    demo: (u: string, p: string) => `با نام کاربری ${u} و رمز ${p} وارد شوید (از قبل پر شده است). این نسخهٔ خصوصی خودتان است: داده‌های واقعی بازار، و هر کاری این‌جا بکنید روی کس دیگری اثر ندارد.`,
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getL(L)).meta };
}
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");
  const t = await getL(L);
  const [user, ...rest] = (env().DEMO_LOGIN ?? "").split(":");
  const demo = user && rest.length ? { username: user, password: rest.join(":") } : null;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image src="/icons/icon-192.png" alt="" width={40} height={40} className="rounded-lg" />
            <div>
              <h1 className="text-xl font-semibold">CryptoPilot AI</h1>
              <p className="text-sm text-ink-2">{t.subtitle}</p>
            </div>
          </div>
          <LoginLangSwitch />
        </div>
        {demo && (
          <div className="mb-4 rounded-xl border border-accent/40 bg-accent/8 p-3 text-sm">
            <div className="font-medium">{t.demoTitle}</div>
            <p className="mt-1 text-ink-2">{t.demo(`\u2066${demo.username}\u2069`, `\u2066${demo.password}\u2069`)}</p>
          </div>
        )}
        <LoginForm demo={demo} />
        {!demo && (
          <div className="mt-5 rounded-xl border border-line bg-surface p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-good" aria-hidden /> {t.serverOn}</span>
              <a href="cryptopilot://stop" className="text-xs text-ink-2 underline hover:text-ink">{t.turnOff}</a>
            </div>
            <p className="mt-2 text-xs text-ink-2">{t.serverHelp}</p>
          </div>
        )}
        <p className="mt-4 text-xs text-ink-2">{t.note}</p>
      </div>
    </main>
  );
}
