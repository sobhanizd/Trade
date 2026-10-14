"use client";
import { Alert, Button } from "@/components/ui";
import type { Dict } from "@/lib/i18n";
import { useL } from "@/lib/i18n/client";

const L = {
  en: {
    dbTitle: "The database is unavailable",
    title: "Something went wrong",
    dbBody: "The app could not reach PostgreSQL. Check that the database is running.",
    body: "An unexpected error occurred while loading this page.",
    ref: "ref",
    retry: "Try again",
  },
  fa: {
    dbTitle: "پایگاه داده در دسترس نیست",
    title: "مشکلی پیش آمد",
    dbBody: "برنامه نتوانست به پایگاه داده (PostgreSQL) وصل شود. بررسی کنید که پایگاه داده روشن باشد.",
    body: "هنگام باز کردن این صفحه خطای غیرمنتظره‌ای رخ داد.",
    ref: "کد پیگیری",
    retry: "دوباره امتحان کنید",
  },
} satisfies Dict<unknown>;

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useL(L);
  const db = /database|prisma|ECONNREFUSED/i.test(error.message);
  return (
    <div className="mx-auto max-w-xl py-10">
      <Alert tone="error" title={db ? t.dbTitle : t.title}>
        {db ? t.dbBody : t.body} {error.digest && <span className="text-xs">({t.ref} <span className="ltr">{error.digest}</span>)</span>}
      </Alert>
      <Button className="mt-4" onClick={reset}>{t.retry}</Button>
    </div>
  );
}
