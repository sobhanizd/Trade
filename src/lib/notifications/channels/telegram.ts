import { fetchJson } from "@/lib/http";

/** Plain-text Telegram message (no parse_mode → no markup injection). */
export async function sendTelegram(chatId: string, text: string, fetchImpl?: typeof fetch) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram is not configured (TELEGRAM_BOT_TOKEN missing)");
  if (!chatId) throw new Error("No Telegram chat ID configured in Settings → Notifications");
  const f = fetchImpl ?? fetch;
  const res = await f(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!res.ok || !body.ok) throw new Error(`Telegram API error ${res.status}: ${body.description ?? "unknown"}`);
}

/** Helper for setup: list recent chats that messaged the bot (to discover your chat ID). */
export async function telegramRecentChats(): Promise<{ id: string; title: string }[]> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram is not configured");
  const r = await fetchJson<{ ok: boolean; result: { message?: { chat: { id: number; first_name?: string; title?: string; username?: string } } }[] }>(
    `https://api.telegram.org/bot${token}/getUpdates?limit=20`,
    { label: "telegram.getUpdates", retries: 0 },
  );
  const seen = new Map<string, string>();
  for (const u of r.result ?? []) {
    const c = u.message?.chat;
    if (c) seen.set(String(c.id), c.title ?? c.first_name ?? c.username ?? String(c.id));
  }
  return [...seen].map(([id, title]) => ({ id, title }));
}
