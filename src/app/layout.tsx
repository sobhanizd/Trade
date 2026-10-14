import type { Metadata, Viewport } from "next";
import { Inter, Vazirmatn } from "next/font/google";
import { Providers } from "@/components/shell/providers";
import { dirOf } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

const vazir = Vazirmatn({ subsets: ["arabic", "latin"], display: "swap", variable: "--font-fa" });
// Readable font for the dashboard widget (prices use equal-width digits).
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-num" });

export const metadata: Metadata = {
  title: { default: "CryptoPilot AI", template: "%s · CryptoPilot AI" },
  description: "Read-only crypto market analysis and explainable signals. Decision support only — never places trades.",
  applicationName: "CryptoPilot AI",
  appleWebApp: { capable: true, title: "CryptoPilot", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#08080e" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${vazir.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
