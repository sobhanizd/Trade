import { ApiError, route } from "@/lib/api/handler";
import { telegramRecentChats } from "@/lib/notifications/channels/telegram";

/** Setup helper: after you message your bot, this lists the chat IDs it has seen. */
export const GET = route({ rateLimit: 6 }, async () => {
  try {
    return { chats: await telegramRecentChats() };
  } catch (e) {
    throw new ApiError(400, (e as Error).message);
  }
});
