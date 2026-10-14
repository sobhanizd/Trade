"use client";
import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n";

function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);
  return null;
}

export function Providers({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <ServiceWorker />
      <LocaleProvider locale={locale}>{children}</LocaleProvider>
    </ThemeProvider>
  );
}
