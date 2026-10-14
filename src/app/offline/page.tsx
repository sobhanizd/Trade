import type { Metadata } from "next";
import type { Dict } from "@/lib/i18n";
import { getL } from "@/lib/i18n/server";

const L = {
  en: {
    metaTitle: "Offline",
    title: "You are offline",
    body: "CryptoPilot AI needs a connection to show current market data. Data shown when you reconnect will carry its timestamps.",
  },
  fa: {
    metaTitle: "آفلاین",
    title: "اینترنت شما قطع است",
    body: "CryptoPilot AI برای نشان دادن قیمت‌های روز به اینترنت نیاز دارد. وقتی دوباره وصل شوید، کنار هر داده زمان دریافتش هم نوشته می‌شود.",
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getL(L)).metaTitle };
}

export default async function Offline() {
  const t = await getL(L);
  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="mt-2 text-sm text-ink-2">{t.body}</p>
      </div>
    </main>
  );
}
