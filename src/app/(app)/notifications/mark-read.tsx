"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { api } from "@/lib/client-api";
import type { Dict } from "@/lib/i18n";
import { useL } from "@/lib/i18n/client";

const L = {
  en: { markAll: "Mark all as read" },
  fa: { markAll: "علامت‌گذاری همه به‌عنوان خوانده‌شده" },
} satisfies Dict<unknown>;

export function MarkAllRead() {
  const router = useRouter();
  const t = useL(L);
  return <Button variant="secondary" onClick={async () => { await api("/api/notifications/read", { body: {} }); router.refresh(); }}>{t.markAll}</Button>;
}
