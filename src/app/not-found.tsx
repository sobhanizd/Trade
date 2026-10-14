import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import { getL } from "@/lib/i18n/server";

const L = {
  en: {
    title: "Not found",
    body: "This page or record does not exist.",
    back: "Back to dashboard",
  },
  fa: {
    title: "پیدا نشد",
    body: "این صفحه یا مورد وجود ندارد.",
    back: "بازگشت به خانه",
  },
} satisfies Dict<unknown>;

export default async function NotFound() {
  const t = await getL(L);
  return (
    <main className="flex min-h-[60dvh] items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="mt-2 text-sm text-ink-2">{t.body}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-accent underline">{t.back}</Link>
      </div>
    </main>
  );
}
