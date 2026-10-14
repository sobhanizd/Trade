import {
  Activity, BellRing, BookOpen, Bot, Calculator, CandlestickChart, FlaskConical, Gauge, Globe2, LayoutDashboard, ListChecks,
  Newspaper, NotebookPen, PiggyBank, Settings, Signal, SlidersHorizontal, UserCog, Wallet,
} from "lucide-react";

export const NAV = [
  { group: "Overview", groupFa: "نمای کلی", items: [
    { href: "/dashboard", label: "Dashboard", labelFa: "داشبورد", icon: LayoutDashboard },
    { href: "/market", label: "Market overview", labelFa: "نمای کلی بازار", icon: Globe2 },
    { href: "/plan", label: "My plan", labelFa: "برنامهٔ من", icon: PiggyBank },
    { href: "/holdings", label: "My assets", labelFa: "دارایی‌های من", icon: Wallet },
    { href: "/watchlist", label: "Watchlist", labelFa: "ارزهای من", icon: ListChecks },
    { href: "/signals", label: "Signals", labelFa: "سیگنال‌ها", icon: Signal },
  ] },
  { group: "Analysis", groupFa: "تحلیل", items: [
    { href: "/strategies", label: "Strategies", labelFa: "روش‌ها", icon: SlidersHorizontal },
    { href: "/backtest", label: "Backtesting", labelFa: "آزمایش روی گذشته", icon: FlaskConical },
    { href: "/paper", label: "Paper trading", labelFa: "معاملهٔ تمرینی", icon: NotebookPen },
    { href: "/risk", label: "Risk calculator", labelFa: "ماشین‌حساب ریسک", icon: Calculator },
    { href: "/explainer", label: "AI explainer", labelFa: "توضیح‌دهندهٔ هوشمند", icon: Bot },
    { href: "/news", label: "News & sentiment", labelFa: "اخبار و حال‌وهوای بازار", icon: Newspaper },
  ] },
  { group: "System", groupFa: "سیستم", items: [
    { href: "/notifications", label: "Notifications", labelFa: "اعلان‌ها", icon: BellRing },
    { href: "/settings", label: "Settings", labelFa: "تنظیمات", icon: Settings },
    { href: "/status", label: "System status", labelFa: "وضعیت سیستم", icon: Activity },
    { href: "/account", label: "Account", labelFa: "حساب کاربری", icon: UserCog },
  ] },
  { group: "Learn", groupFa: "یادگیری", items: [
    { href: "/guide", label: "Beginner guide", labelFa: "راهنمای مبتدی", icon: BookOpen },
    { href: "/glossary", label: "Glossary", labelFa: "واژه‌نامه", icon: Gauge },
  ] },
] as const;

export const MOBILE_TABS = [
  { href: "/dashboard", label: "Home", labelFa: "خانه", icon: LayoutDashboard },
  { href: "/signals", label: "Signals", labelFa: "سیگنال‌ها", icon: Signal },
  { href: "/watchlist", label: "Watchlist", labelFa: "ارزهای من", icon: CandlestickChart },
  { href: "/risk", label: "Risk", labelFa: "ریسک", icon: Calculator },
] as const;

/** Simple view: the essentials only; everything else lives under "More tools". */
export const SIMPLE_NAV = [
  { href: "/dashboard", label: "Home", labelFa: "خانه", icon: LayoutDashboard },
  { href: "/plan", label: "My plan", labelFa: "برنامهٔ من", icon: PiggyBank },
  { href: "/holdings", label: "My assets", labelFa: "دارایی‌های من", icon: Wallet },
  { href: "/watchlist", label: "My coins", labelFa: "ارزهای من", icon: CandlestickChart },
  { href: "/signals", label: "Signals", labelFa: "سیگنال‌ها", icon: Signal },
  { href: "/paper", label: "Practice trades", labelFa: "معاملهٔ تمرینی", icon: NotebookPen },
  { href: "/risk", label: "Risk calculator", labelFa: "ماشین‌حساب ریسک", icon: Calculator },
  { href: "/settings", label: "Settings", labelFa: "تنظیمات", icon: Settings },
] as const;

export const SIMPLE_MOBILE_TABS = [
  { href: "/dashboard", label: "Home", labelFa: "خانه", icon: LayoutDashboard },
  { href: "/plan", label: "Plan", labelFa: "برنامه", icon: PiggyBank },
  { href: "/holdings", label: "Assets", labelFa: "دارایی‌ها", icon: Wallet },
  { href: "/signals", label: "Signals", labelFa: "سیگنال‌ها", icon: Signal },
] as const;
