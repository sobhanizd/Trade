import { ApiError, route } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const GET = route({}, async ({ user, params }) => {
  const run = await db().backtestRun.findFirst({ where: { id: params.id, userId: user.id }, include: { trades: { orderBy: { entryTime: "asc" } }, asset: true } });
  if (!run) throw new ApiError(404, "Backtest not found.");
  return { run };
});
