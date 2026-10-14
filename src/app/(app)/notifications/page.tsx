import type { Metadata } from "next";
import { PriceAlerts } from "@/components/price-alerts";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fmtDate, timeAgo } from "@/lib/format";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";
import { MarkAllRead } from "./mark-read";

const FA_KIND: Record<string, string> = {
  SIGNAL: "سیگنال",
  SIGNAL_CHANGE: "تغییر سیگنال",
  SIGNAL_INVALIDATED: "رسیدن به حد ضرر",
  PRICE_ALERT: "هشدار قیمت",
  VOLATILITY_ALERT: "هشدار نوسان",
  SYSTEM: "سیستم",
  TEST: "آزمایشی",
};
const FA_CHANNEL: Record<string, string> = { TELEGRAM: "تلگرام", EMAIL: "ایمیل", WEBPUSH: "اعلان مرورگر" };
const FA_STATUS: Record<string, string> = { SENT: "ارسال شد", FAILED: "ناموفق", DEFERRED: "به تعویق افتاد", SKIPPED: "رد شد", PENDING: "در انتظار" };

const L = {
  en: {
    title: "Notifications",
    description: "Every alert is stored here, with the delivery status of each channel.",
    emptyTitle: "No notifications yet",
    emptyBody: "Alerts appear when configured conditions are met. Configure channels in Settings.",
    kind: (k: string) => k.toLowerCase().replace(/_/g, " "),
    delivery: (channel: string, status: string) => `${channel.toLowerCase()}: ${status.toLowerCase()}`,
    inAppOnly: "in-app only",
    open: "Open",
    priceAlerts: "Price alerts",
  },
  fa: {
    title: "اعلان‌ها",
    description: "همهٔ هشدارها این‌جا نگه داشته می‌شوند، همراه با این‌که از هر راه (تلگرام، ایمیل، مرورگر) رسیده‌اند یا نه.",
    emptyTitle: "هنوز اعلانی نیست",
    emptyBody: "وقتی شرایطی که تنظیم کرده‌اید پیش بیاید، هشدار این‌جا نشان داده می‌شود. راه‌های دریافت هشدار را در تنظیمات انتخاب کنید.",
    kind: (k: string) => FA_KIND[k] ?? k.toLowerCase().replace(/_/g, " "),
    delivery: (channel: string, status: string) => `${FA_CHANNEL[channel] ?? channel.toLowerCase()}: ${FA_STATUS[status] ?? status.toLowerCase()}`,
    inAppOnly: "فقط داخل برنامه",
    open: "باز کردن",
    priceAlerts: "هشدارهای قیمت",
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getL(L)).title };
}

const deliveryTone = (s: string) => (s === "SENT" ? "good" : s === "FAILED" ? "bad" : s === "DEFERRED" ? "warn" : "neutral");

export default async function NotificationsPage() {
  const user = await requireUser();
  const [t, locale] = await Promise.all([getL(L), getLocale()]);
  const items = await db().notification.findMany({ where: { userId: user.id }, include: { deliveries: true }, orderBy: { createdAt: "desc" }, take: 150 });
  const unread = items.filter((i) => !i.readAt).length;
  return (
    <>
      <PageHeader title={t.title} description={t.description} action={unread > 0 ? <MarkAllRead /> : undefined} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {items.length === 0 ? <EmptyState title={t.emptyTitle}>{t.emptyBody}</EmptyState> : (
            <ul className="divide-y divide-line">
              {items.map((n) => (
                <li key={n.id} className={`py-3 ${n.readAt ? "" : "border-s-2 border-accent ps-3"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="text-xs text-ink-2" title={fmtDate(n.createdAt, true, locale)}>{timeAgo(n.createdAt, undefined, locale)}</span>
                  </div>
                  <pre className="mt-1 font-sans text-sm whitespace-pre-wrap text-ink-2">{n.body}</pre>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge>{t.kind(n.kind)}</Badge>
                    {n.deliveries.length === 0 ? <span className="text-ink-2">{t.inAppOnly}</span> : n.deliveries.map((d) => (
                      <Badge key={d.id} tone={deliveryTone(d.status)}><span title={d.lastError ?? undefined}>{t.delivery(d.channel, d.status)}{d.lastError && d.status !== "SENT" ? ` (${d.lastError.slice(0, 60)})` : ""}</span></Badge>
                    ))}
                    {n.url && <a href={n.url.replace(/^https?:\/\/[^/]+/, "")} className="ms-auto text-accent hover:underline">{t.open}</a>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t.priceAlerts} />
          <PriceAlerts />
        </Card>
      </div>
    </>
  );
}
