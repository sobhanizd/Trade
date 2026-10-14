import { db } from "@/lib/db";
import { recordProviderResult } from "@/lib/market/status";
import { fetchHeadlines } from "@/lib/news/rss";
import { urgentForWatchlist } from "@/lib/analysis/outlook";
import { notify } from "@/lib/notifications/dispatch";
import { formatUrgentAlert } from "@/lib/notifications/format";
import { getSettings } from "@/lib/settings/service";

export async function runNews() {
  if ((process.env.NEWS_ENABLED ?? "true") === "false") return { skipped: "NEWS_ENABLED=false" };
  const feeds = (process.env.NEWS_RSS_FEEDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!feeds.length) return { skipped: "no feeds configured" };
  const assets = await db().asset.findMany({ select: { symbol: true, name: true } });
  const { headlines, errors } = await fetchHeadlines(feeds, assets);
  await recordProviderResult("news-rss", errors.length < feeds.length, undefined, errors.join("; ") || undefined);
  let stored = 0;
  for (const h of headlines) {
    await db().newsItem.upsert({
      where: { url: h.url },
      create: { ...h },
      update: { assets: h.assets, tags: h.tags, kind: h.kind, significance: h.significance },
    });
    stored++;
  }
  const alerts = await sendUrgentAlerts().catch(() => 0);
  return { feeds: feeds.length, stored, errors, alerts };
}

/** Alert each user once about serious news for a watched coin, or a very large 24h move (once per coin per day). */
export async function sendUrgentAlerts(now = new Date()) {
  const users = await db().user.findMany({ select: { id: true } });
  const day = now.toISOString().slice(0, 10);
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  let sent = 0;
  for (const u of users) {
    const settings = await getSettings(u.id);
    if (!settings.alerts.enabled || !settings.alerts.volatility.enabled) continue;
    for (const { symbol, items } of await urgentForWatchlist(u.id)) {
      for (const it of items) {
        const n = await notify(u.id, settings, {
          kind: "VOLATILITY_ALERT",
          ...formatUrgentAlert(it.kind === "news" ? { symbol, title: it.news!.title, source: it.news!.source } : { symbol, change24h: it.changePct }, settings.language),
          url: `${base}/assets/${symbol}`,
          dedupeKey: it.kind === "news" ? `news:${it.news!.id}:${symbol}` : `move24:${symbol}:${day}`,
        }, { now });
        if (n) sent++;
      }
    }
  }
  return sent;
}
