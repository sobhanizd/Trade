/**
 * Timing from the coin's own price history (pure functions, closed daily candles only).
 *
 *  - entryTiming: "buy now" vs "place a buy order a bit lower and wait up to N days
 *    (if it isn't filled, buy at the price on day N)". Each option's average price is
 *    measured on past days that looked like today (same side of the 200-day average,
 *    same kind of last week). Waiting is only suggested when it really was cheaper.
 *  - exitOdds: how often the price reached a take-profit level, or fell to a safety
 *    exit, within N days, starting from days like today.
 *
 * This is history, not a forecast: it says what usually happened, never what will happen.
 */
import { atr, sma } from "@/lib/indicators";
import type { Candle } from "@/lib/market/types";

export interface WaitOption {
  days: number;
  /** Order distance below today's close, in % (from the coin's usual daily move). */
  dipPct: number;
  /** Order price in the candles' currency. */
  price: number;
  /** How often such an order was filled within `days`. */
  fillRate: number;
  /** Average price paid vs buying now, in % (negative = cheaper). */
  avgVsNowPct: number;
  /** How often the order was NOT filled and the price was ≥ 5 % higher on the last day (missed the move). */
  missedRate: number;
  /** Share of past days where buying immediately was cheaper than this wait option. */
  nowBeatsShare: number;
}

export interface EntryTiming {
  advice: "buyNow" | "waitForDip";
  /** Suggested buy-order distance below today's close, in % (the best wait option's). */
  dipPct: number;
  /** Chance (0–1) that an order at `dipPct` below was filled within 7 / 10 days. */
  fillChance7: number;
  fillChance10: number;
  /** Share (0–1) of similar past days where buying now beat that 10-day wait. */
  buyNowBeatsWaitShare: number;
  best: WaitOption | null;
  options: WaitOption[];
  samples: number;
  /** Which past days were compared. */
  basis: { above200: boolean; week: "down" | "flat" | "up"; narrowed: boolean };
}

interface Prepared {
  cs: Candle[];
  atr: (number | null)[];
  sma200: (number | null)[];
  n: number;
}

function prepare(daily: Candle[], now: number): Prepared | null {
  const cs = daily.filter((c) => c.closeTime < now);
  const n = cs.length - 1;
  if (n < 400) return null;
  return { cs, atr: atr(cs), sma200: sma(cs.map((c) => c.close), 200), n };
}

const weekOf = (cs: Candle[], i: number): "down" | "flat" | "up" => {
  const r = cs[i].close / cs[i - 7].close - 1;
  return r <= -0.05 ? "down" : r >= 0.05 ? "up" : "flat";
};

/** Past days similar to the last one: same side of SMA200 and (when enough samples) same kind of week. */
function similarDays(p: Prepared, horizon: number, min = 150) {
  const { cs, sma200, atr: a, n } = p;
  const above = cs[n].close > (sma200[n] ?? Infinity);
  const week = weekOf(cs, n);
  const base: number[] = [];
  for (let i = 200; i + horizon <= n - 1; i++) {
    if (sma200[i] === null || a[i] === null) continue;
    if (cs[i].close > sma200[i]! === above) base.push(i);
  }
  const narrow = base.filter((i) => weekOf(cs, i) === week);
  const narrowed = narrow.length >= min;
  return { days: narrowed ? narrow : base, above200: above, week, narrowed };
}

export function entryTiming(daily: Candle[], now = Date.now(), opts: { horizons?: number[]; dipsAtr?: number[] } = {}): EntryTiming | null {
  const p = prepare(daily, now);
  if (!p || p.atr[p.n] === null) return null;
  const { cs, atr: a, n } = p;
  const horizons = opts.horizons ?? [2, 5, 7, 10];
  const dips = opts.dipsAtr ?? [0.5, 1, 1.5];
  const atrPctNow = a[n]! / cs[n].close;
  const options: WaitOption[] = [];
  let samples = 0;
  let basis: EntryTiming["basis"] = { above200: true, week: "flat", narrowed: false };
  for (const h of horizons) {
    const sim = similarDays(p, h);
    basis = { above200: sim.above200, week: sim.week, narrowed: sim.narrowed };
    if (sim.days.length < 100) continue;
    samples = Math.max(samples, sim.days.length);
    for (const d of dips) {
      let cost = 0;
      let filled = 0;
      let missed = 0;
      let nowBeats = 0;
      for (const i of sim.days) {
        const dipFrac = (d * a[i]!) / cs[i].close;
        const limit = cs[i].close * (1 - dipFrac);
        let hit = false;
        for (let j = i + 1; j <= i + h; j++) if (cs[j].low <= limit) { hit = true; break; }
        if (hit) {
          filled++;
          cost += limit / cs[i].close;
        } else {
          const r = cs[i + h].close / cs[i].close;
          cost += r;
          if (r >= 1.05) missed++;
          if (r > 1) nowBeats++;
        }
      }
      const m = sim.days.length;
      options.push({
        days: h,
        dipPct: d * atrPctNow * 100,
        price: cs[n].close * (1 - d * atrPctNow),
        fillRate: filled / m,
        avgVsNowPct: (cost / m - 1) * 100,
        missedRate: missed / m,
        nowBeatsShare: nowBeats / m,
      });
    }
  }
  if (!options.length) return null;
  const best = [...options].sort((x, y) => x.avgVsNowPct - y.avgVsNowPct)[0];
  // Only worth waiting when it was clearly cheaper on average, usually got filled, and rarely missed a big move.
  const wait = best.avgVsNowPct <= -0.5 && best.fillRate >= 0.5 && best.missedRate <= 0.2;
  const sameDip = (h: number) => options.find((o) => o.days === h && Math.abs(o.dipPct - best.dipPct) < 1e-9);
  return {
    advice: wait ? "waitForDip" : "buyNow",
    dipPct: best.dipPct,
    fillChance7: sameDip(7)?.fillRate ?? 0,
    fillChance10: sameDip(10)?.fillRate ?? 0,
    buyNowBeatsWaitShare: sameDip(10)?.nowBeatsShare ?? 0,
    best: wait ? best : null,
    options,
    samples,
    basis,
  };
}

export interface LevelOdds {
  days: number;
  /** Share of similar past days where the price reached the target first / the stop first / neither. */
  targetFirst: number;
  stopFirst: number;
  neither: number;
}

/**
 * How often, from days like today, the price reached `target` (above) before `stop` (below) within N days.
 * Distances are measured in units of the coin's usual daily move (ATR), so old and new prices compare fairly.
 */
export function exitOdds(daily: Candle[], levels: { target?: number | null; stop?: number | null }, horizons = [7, 30, 90], now = Date.now()): { odds: LevelOdds[]; samples: number } | null {
  const p = prepare(daily, now);
  if (!p || p.atr[p.n] === null) return null;
  const { cs, atr: a, n } = p;
  const close = cs[n].close;
  const tgt = levels.target ?? null;
  const stp = levels.stop ?? null;
  const up = tgt !== null && tgt > close ? (tgt - close) / a[n]! : null;
  const down = stp !== null && stp < close ? (close - stp) / a[n]! : null;
  if (up === null && down === null) return null;
  const odds: LevelOdds[] = [];
  let samples = 0;
  for (const h of horizons) {
    const sim = similarDays(p, h);
    if (sim.days.length < 100) continue;
    samples = Math.max(samples, sim.days.length);
    let t = 0;
    let s = 0;
    for (const i of sim.days) {
      const hiLvl = up !== null ? cs[i].close + up * a[i]! : Infinity;
      const loLvl = down !== null ? cs[i].close - down * a[i]! : -Infinity;
      for (let j = i + 1; j <= i + h; j++) {
        const hitLo = cs[j].low <= loLvl;
        const hitHi = cs[j].high >= hiLvl;
        // Same day both: count as the stop (the cautious assumption).
        if (hitLo) { s++; break; }
        if (hitHi) { t++; break; }
      }
    }
    const m = sim.days.length;
    odds.push({ days: h, targetFirst: t / m, stopFirst: s / m, neither: (m - t - s) / m });
  }
  return odds.length ? { odds, samples } : null;
}
