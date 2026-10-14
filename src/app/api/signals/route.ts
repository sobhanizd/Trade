import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { SIGNAL_STATES } from "@/lib/strategies/types";

export const GET = route({}, async ({ user, req }) => {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const state = sp.get("state");
  const symbol = sp.get("asset");
  const tf = sp.get("tf");
  const signals = await db().signal.findMany({
    where: {
      userId: user.id,
      ...(status && ["ACTIVE", "SUPERSEDED", "INVALIDATED", "EXPIRED"].includes(status) ? { status: status as never } : {}),
      ...(state && (SIGNAL_STATES as readonly string[]).includes(state) ? { state: state as never } : {}),
      ...(symbol ? { asset: { symbol: symbol.toUpperCase() } } : {}),
      ...(tf ? { timeframe: tf } : {}),
    },
    include: { asset: { select: { symbol: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(sp.get("limit") ?? 100) || 100, 500),
  });
  return { signals };
});
