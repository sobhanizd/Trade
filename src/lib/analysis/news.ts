/**
 * News importance for one coin, from headline keywords only (pure functions).
 * This is a heuristic: it can miss news and can over-rate a headline. It
 * never says "buy" or "sell" because of a headline.
 */

export type NewsLevel = "high" | "medium" | "low";
export type NewsTopic = "security" | "stress" | "legal" | "etf" | "macro" | "network" | "corporate" | "other";

export interface NewsLike { id: string; title: string; url: string; source: string; publishedAt: Date | string; assets: string[]; tags: string[]; kind: string }
export interface RatedNews { id: string; title: string; url: string; source: string; time: number; level: NewsLevel; topic: NewsTopic; aboutCoin: boolean; opinion: boolean }

const TOPIC_OF: Record<string, NewsTopic> = {
  "Security incident": "security",
  "Market stress": "stress",
  "Regulation/legal": "legal",
  ETF: "etf",
  Macro: "macro",
  "Network event": "network",
  Corporate: "corporate",
};
const ORDER: NewsTopic[] = ["security", "stress", "legal", "etf", "macro", "network", "corporate", "other"];
const SEVERE_LEGAL = /\b(ban|bans|banned|sues|sued|lawsuit|charges|charged|crackdown|seiz\w*|indict\w*)\b/i;
const MARKET_WIDE = /\b(crypto|bitcoin|market|markets|fed|fomc|cpi|inflation|rate cut|rate hike|tariff\w*)\b/i;

/** How important a headline is for `symbol` (null when it is not relevant to it). */
export function rateNews(n: NewsLike, symbol: string): RatedNews | null {
  const aboutCoin = n.assets.includes(symbol);
  const topics = n.tags.map((t) => TOPIC_OF[t]).filter(Boolean);
  const topic = ORDER.find((t) => topics.includes(t)) ?? "other";
  const opinion = n.kind === "OPINION";
  // Market-wide news (rates, inflation, ETFs, big regulation) moves every coin.
  const marketWide = !aboutCoin && (topic === "macro" || ((topic === "etf" || topic === "legal" || topic === "stress") && MARKET_WIDE.test(n.title)));
  if (!aboutCoin && !marketWide) return null;
  let level: NewsLevel = "low";
  if (aboutCoin && !opinion && (topic === "security" || topic === "stress" || (topic === "legal" && SEVERE_LEGAL.test(n.title)))) level = "high";
  else if (topic !== "other" && topic !== "corporate") level = "medium";
  if (opinion && level === "medium") level = "low";
  return { id: n.id, title: n.title, url: n.url, source: n.source, time: new Date(n.publishedAt).getTime(), level, topic, aboutCoin, opinion };
}

export interface MoveWithNews { time: number; changePct: number; news: RatedNews[] }

/** Headlines from the day before to the end of each big-move day (they may or may not be the cause). */
export function linkMoves(moves: { time: number; changePct: number }[], news: RatedNews[]): MoveWithNews[] {
  const DAY = 86_400_000;
  return moves
    .map((m) => ({
      ...m,
      news: news
        .filter((n) => n.level !== "low" && n.time >= m.time - DAY && n.time < m.time + DAY)
        .sort((a, b) => (a.level === b.level ? b.time - a.time : a.level === "high" ? -1 : 1))
        .slice(0, 3),
    }))
    .sort((a, b) => b.time - a.time);
}

export interface Urgent { kind: "news" | "move"; news?: RatedNews; changePct?: number; hours?: number }

/**
 * Things worth a look today: serious coin news in the last 24h, or a very
 * large price move in the last 24h (bigger of 8% and 3× the usual daily move).
 */
export function urgentItems(news: RatedNews[], change24hPct: number | null, atrPct: number | null, now = Date.now()): Urgent[] {
  const out: Urgent[] = news.filter((n) => n.level === "high" && now - n.time < 24 * 3_600_000).map((n) => ({ kind: "news" as const, news: n }));
  const limit = Math.max(8, 3 * (atrPct ?? 3));
  if (change24hPct !== null && Math.abs(change24hPct) >= limit) out.unshift({ kind: "move", changePct: change24hPct, hours: 24 });
  return out;
}
