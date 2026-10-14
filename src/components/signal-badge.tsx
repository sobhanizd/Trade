"use client";
import { ArrowDownRight, ArrowUpRight, CircleSlash, Hourglass, MinusCircle, ShieldAlert } from "lucide-react";
import { useLocale } from "@/lib/i18n/client";
import { Badge } from "./ui";

const MAP: Record<string, { en: string; fa: string; tone: "good" | "bad" | "warn" | "neutral" | "accent"; Icon: typeof ArrowUpRight }> = {
  STRONG_BUY_SETUP: { en: "Strong buy setup", fa: "فرصت خرید قوی", tone: "good", Icon: ArrowUpRight },
  POTENTIAL_BUY: { en: "Potential buy", fa: "خرید احتمالی", tone: "accent", Icon: ArrowUpRight },
  HOLD_WAIT: { en: "Hold / wait", fa: "نگه دارید / صبر", tone: "neutral", Icon: Hourglass },
  POTENTIAL_SELL: { en: "Potential sell", fa: "در حال ضعیف شدن", tone: "warn", Icon: ArrowDownRight },
  EXIT_SETUP: { en: "Exit setup", fa: "سیگنال فروش", tone: "bad", Icon: ArrowDownRight },
  NO_CLEAR_OPPORTUNITY: { en: "No clear opportunity", fa: "فرصت روشنی نیست", tone: "neutral", Icon: MinusCircle },
  NO_SIGNAL: { en: "No signal (data)", fa: "بدون سیگنال (مشکل داده)", tone: "warn", Icon: ShieldAlert },
};

/** Icon + label + color — state is never conveyed by color alone. */
export function SignalBadge({ state }: { state: string }) {
  const l = useLocale();
  const m = MAP[state] ?? { en: state, fa: state, tone: "neutral" as const, Icon: CircleSlash };
  return (
    <Badge tone={m.tone}>
      <m.Icon className="h-3.5 w-3.5" aria-hidden />
      {m[l]}
    </Badge>
  );
}

const STATUS: Record<string, { en: string; fa: string }> = {
  ACTIVE: { en: "active", fa: "فعال" },
  SUPERSEDED: { en: "superseded", fa: "جایگزین‌شده" },
  INVALIDATED: { en: "invalidated", fa: "باطل‌شده" },
  EXPIRED: { en: "expired", fa: "منقضی" },
};

export function StatusBadge({ status }: { status: string }) {
  const l = useLocale();
  const tone = status === "ACTIVE" ? "accent" : status === "INVALIDATED" ? "bad" : "neutral";
  return <Badge tone={tone}>{STATUS[status]?.[l] ?? status.toLowerCase()}</Badge>;
}

export function RiskBadge({ level }: { level: "Low" | "Moderate" | "High" | "Unknown" }) {
  const l = useLocale();
  const tone = level === "Low" ? "good" : level === "Moderate" ? "warn" : level === "High" ? "bad" : "neutral";
  const fa = { Low: "ریسک کم", Moderate: "ریسک متوسط", High: "ریسک زیاد", Unknown: "ریسک نامشخص" };
  return <Badge tone={tone}>{l === "fa" ? fa[level] : level === "Unknown" ? "Risk n/a" : `${level} risk`}</Badge>;
}
