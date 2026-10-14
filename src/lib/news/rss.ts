/**
 * Headline-only news ingestion from public RSS feeds. We store and show the
 * title, source, time and link — never the article body (copyright). All
 * fetched text is UNTRUSTED: it is HTML-stripped, length-limited, and passed to
 * the AI only inside a clearly delimited untrusted-data block.
 */
import { XMLParser } from "fast-xml-parser";
import { fetchText } from "@/lib/http";

export interface Headline {
  source: string;
  title: string;
  url: string;
  publishedAt: Date;
  assets: string[];
  tags: string[];
  kind: "NEWS" | "OPINION";
  significance: "NORMAL" | "POTENTIAL";
}

const SIGNIFICANT: [RegExp, string][] = [
  [/\b(etf|etfs)\b/i, "ETF"],
  [/\b(sec|cftc|regulat\w*|lawsuit|court|ban|sanction\w*|mica)\b/i, "Regulation/legal"],
  [/\b(hack\w*|exploit\w*|breach|stolen|drain\w*)\b/i, "Security incident"],
  [/\b(fed|fomc|interest rate|rate cut|rate hike|cpi|inflation)\b/i, "Macro"],
  [/\b(halving|upgrade|hard fork|mainnet)\b/i, "Network event"],
  [/\b(liquidat\w*|bankrupt\w*|insolven\w*|delist\w*)\b/i, "Market stress"],
  [/\b(listing|lists|acquir\w*|partnership)\b/i, "Corporate"],
];
const OPINION = /\b(opinion|op-ed|analysis|price prediction|prediction|could|might|why i|here's why|explained|\?)\b/i;

export function stripHtml(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}

export function classify(title: string, watch: { symbol: string; name: string }[]) {
  const assets = watch
    .filter((a) => new RegExp(`\\b(${escapeRe(a.symbol)}|${escapeRe(a.name)})\\b`, "i").test(title))
    .map((a) => a.symbol);
  const tags = SIGNIFICANT.filter(([re]) => re.test(title)).map(([, t]) => t);
  return {
    assets,
    tags,
    kind: (OPINION.test(title) ? "OPINION" : "NEWS") as Headline["kind"],
    significance: (tags.length ? "POTENTIAL" : "NORMAL") as Headline["significance"],
  };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseFeed(xml: string, feedUrl: string, watch: { symbol: string; name: string }[]): Headline[] {
  const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, htmlEntities: false });
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel ?? doc?.feed;
  const source = stripHtml(String(channel?.title?.["#text"] ?? channel?.title ?? new URL(feedUrl).host)).slice(0, 80);
  const raw = channel?.item ?? channel?.entry ?? [];
  const items = Array.isArray(raw) ? raw : [raw];
  const out: Headline[] = [];
  for (const it of items.slice(0, 50)) {
    const title = stripHtml(String(it?.title?.["#text"] ?? it?.title ?? "")).slice(0, 300);
    let link = typeof it?.link === "string" ? it.link : (it?.link?.["@_href"] ?? (Array.isArray(it?.link) ? it.link[0]?.["@_href"] : "")) ?? "";
    link = String(link).trim();
    const date = new Date(it?.pubDate ?? it?.published ?? it?.updated ?? Date.now());
    if (!title || !/^https?:\/\//i.test(link) || Number.isNaN(date.getTime())) continue;
    out.push({ source, title, url: link.slice(0, 1000), publishedAt: date, ...classify(title, watch) });
  }
  return out;
}

export async function fetchHeadlines(feeds: string[], watch: { symbol: string; name: string }[]) {
  const results: Headline[] = [];
  const errors: string[] = [];
  for (const f of feeds) {
    try {
      const xml = await fetchText(f, { label: `rss:${new URL(f).host}`, timeoutMs: 10_000, retries: 1 });
      results.push(...parseFeed(xml, f, watch));
    } catch (e) {
      errors.push(`${new URL(f).host}: ${(e as Error).message}`);
    }
  }
  return { headlines: results, errors };
}
