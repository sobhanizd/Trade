import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const GET = route({}, async ({ req }) => {
  const asset = req.nextUrl.searchParams.get("asset")?.toUpperCase();
  const items = await db().newsItem.findMany({ where: asset ? { assets: { has: asset } } : {}, orderBy: { publishedAt: "desc" }, take: 100 });
  return { items };
});
