import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";

/** Export all of the user's application data as JSON (no password hash, no session tokens). */
export const GET = route({ rateLimit: 5 }, async ({ user }) => {
  const u = await db().user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      email: true, createdAt: true, lastLoginAt: true,
      settings: { select: { data: true, updatedAt: true } },
      watchlist: { select: { addedAt: true, asset: { select: { symbol: true, name: true } } } },
      strategyConfigs: { select: { strategyId: true, enabled: true, params: true, timeframes: true, updatedAt: true } },
      signals: { include: { statusChanges: true } },
      notifications: { include: { deliveries: { select: { channel: true, status: true, attempts: true, sentAt: true, lastError: true } } } },
      priceAlerts: true,
      backtestRuns: { include: { trades: true } },
      paperTrades: true,
      aiMessages: true,
      auditEvents: { select: { type: true, detail: true, createdAt: true } },
    },
  });
  await audit("account.export", user.id);
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), app: "CryptoPilot AI", data: u }, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="cryptopilot-export-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" },
  });
});
