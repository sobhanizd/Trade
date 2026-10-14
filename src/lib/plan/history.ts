/**
 * Honest history test of a monthly plan: invest every month for N years,
 * starting at every possible month in the available data, and report the range
 * of outcomes. Uses daily closes (USD pairs); fees are included.
 */
export interface DailySeries {
  symbol: string;
  /** Ascending daily candles: open time (ms) and close (USD). */
  times: number[];
  closes: number[];
}

/** Trading costs: one rate for both sides, or the real buy / sell costs (fractions of the money). */
export type Fees = number | { buy: number; sell: number };
const sides = (f: Fees) => (typeof f === "number" ? { buy: f, sell: f } : f);

export interface WindowResult {
  start: number;
  end: number;
  invested: number;
  final: number;
}

export interface HistoryResult {
  months: number;
  windows: WindowResult[];
  latest: WindowResult | null;
  median: number | null;
  worst: WindowResult | null;
  best: WindowResult | null;
  reachedGoal: number;
  lostMoney: number;
  firstDate: number | null;
}

/** Index of the first candle at or after `t`, or -1. */
function idxAtOrAfter(times: number[], t: number) {
  let lo = 0;
  let hi = times.length - 1;
  if (!times.length || times[hi] < t) return -1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (times[m] < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

function priceAt(s: DailySeries, t: number): number | null {
  const i = idxAtOrAfter(s.times, t);
  if (i < 0 || s.times[i] - t > 4 * 86_400_000) return null; // no data near this date
  return s.closes[i];
}

const addMonths = (t: number, n: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate());
};

/**
 * Simulate one window. `weights` are fractions per symbol (sum 1); a coin with
 * no price yet at a buy date gives its share to BTC that month.
 */
export function simulateWindow(series: DailySeries[], weights: Record<string, number>, monthly: number, start: number, months: number, feeRate: Fees): WindowResult | null {
  const bySym = new Map(series.map((s) => [s.symbol, s]));
  const btc = bySym.get("BTC");
  if (!btc) return null;
  const { buy, sell } = sides(feeRate);
  const qty = new Map<string, number>();
  let invested = 0;
  for (let m = 0; m < months; m++) {
    const t = addMonths(start, m);
    let btcExtra = 0;
    for (const [sym, w] of Object.entries(weights)) {
      const s = bySym.get(sym);
      const p = s ? priceAt(s, t) : null;
      if (sym === "BTC") continue;
      if (p === null) btcExtra += w;
      else qty.set(sym, (qty.get(sym) ?? 0) + (monthly * w * (1 - buy)) / p);
    }
    const pb = priceAt(btc, t);
    if (pb === null) return null;
    qty.set("BTC", (qty.get("BTC") ?? 0) + (monthly * ((weights.BTC ?? 0) + btcExtra) * (1 - buy)) / pb);
    invested += monthly;
  }
  const end = addMonths(start, months);
  let final = 0;
  for (const [sym, q] of qty) {
    const p = priceAt(bySym.get(sym)!, end);
    if (p === null) return null;
    final += q * p * (1 - sell);
  }
  return { start, end, invested, final };
}

export function historyTest(series: DailySeries[], weights: Record<string, number>, monthly: number, years: number, goal: number, feeRate: Fees): HistoryResult {
  const months = years * 12;
  const btc = series.find((s) => s.symbol === "BTC");
  const empty: HistoryResult = { months, windows: [], latest: null, median: null, worst: null, best: null, reachedGoal: 0, lostMoney: 0, firstDate: null };
  if (!btc || btc.times.length < 400) return empty;
  const first = new Date(btc.times[0]);
  let start = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1);
  const lastT = btc.times[btc.times.length - 1];
  const windows: WindowResult[] = [];
  while (addMonths(start, months) <= lastT) {
    const w = simulateWindow(series, weights, monthly, start, months, feeRate);
    if (w) windows.push(w);
    start = addMonths(start, 1);
  }
  // Most recent possible window, ending at the latest data.
  const latestStart = (() => {
    const d = new Date(lastT);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, d.getUTCDate());
  })();
  const latest = simulateWindow(series, weights, monthly, latestStart, months, feeRate);
  if (!windows.length) return { ...empty, latest };
  const sorted = [...windows].sort((a, b) => a.final - b.final);
  return {
    months,
    windows,
    latest,
    median: sorted[Math.floor(sorted.length / 2)].final,
    worst: sorted[0],
    best: sorted[sorted.length - 1],
    reachedGoal: windows.filter((w) => w.final >= goal).length,
    lostMoney: windows.filter((w) => w.final < w.invested).length,
    firstDate: windows[0].start,
  };
}

/** How often (share of past days) the price fell at least `dropPct` below that day's close within the next `days`. */
export function dropFrequency(times: number[], lows: number[], closes: number[], dropPct: number, days = 365) {
  let hits = 0;
  let total = 0;
  for (let i = 0; i + days < closes.length; i++) {
    const level = closes[i] * (1 - dropPct / 100);
    let hit = false;
    for (let j = i + 1; j <= i + days; j++) {
      if (lows[j] <= level) {
        hit = true;
        break;
      }
    }
    total++;
    if (hit) hits++;
  }
  return { hits, total, share: total ? hits / total : null };
}

/** Split a lump-sum buy into equal parts at evenly spaced price levels between `from` and `to` (to < from). */
export function stagedLevels(amount: number, from: number, to: number, parts = 4) {
  const n = Math.max(1, Math.round(parts));
  const levels = Array.from({ length: n }, (_, k) => (n === 1 ? to : from - ((from - to) * k) / (n - 1)));
  const each = amount / n;
  const units = levels.reduce((a, p) => a + each / p, 0);
  return { levels: levels.map((price) => ({ price, amount: each })), averagePrice: amount / units };
}

// ───────────────────────── Smart pick: which mix worked best? ─────────────────────────

export interface MixStats {
  weights: Record<string, number>;
  windows: number;
  median: number;
  /** A typical bad case: 1 in 4 past periods ended below this. */
  p25: number;
  worst: number;
  best: number;
  reachedShare: number;
  lostShare: number;
  latest: number | null;
}

export interface MixSearch {
  /** First start month used — every mix is tested on exactly the same periods. */
  since: number;
  windows: number;
  months: number;
  current: MixStats | null;
  /** Highest share of periods that reached the goal (ties: better bad case). */
  goal: MixStats | null;
  /** Highest typical (median) result. */
  profit: MixStats | null;
  /** Fewest periods that lost money (ties: better worst case). */
  safe: MixStats | null;
  /** Every tested mix, best for the goal first. */
  all: MixStats[];
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor((s.length - 1) * q)))];
};

/** Month starts (UTC, 1st) from the first month where every symbol has data, so all mixes see the same periods. */
function commonStarts(series: DailySeries[], symbols: string[], months: number) {
  const firsts = symbols.map((sym) => series.find((s) => s.symbol === sym)?.times[0]).filter((x): x is number => x !== undefined);
  const btc = series.find((s) => s.symbol === "BTC");
  if (!btc || firsts.length < symbols.length) return [];
  const f = new Date(Math.max(...firsts));
  const lastT = btc.times[btc.times.length - 1];
  const out: number[] = [];
  for (let s = Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 1); addMonths(s, months) <= lastT; s = addMonths(s, 1)) out.push(s);
  return out;
}

function stats(series: DailySeries[], weights: Record<string, number>, monthly: number, starts: number[], months: number, goal: number, feeRate: Fees, latestStart: number): MixStats | null {
  const res = starts.map((s) => simulateWindow(series, weights, monthly, s, months, feeRate)).filter((w): w is WindowResult => w !== null);
  if (!res.length) return null;
  const f = res.map((w) => w.final);
  return {
    weights,
    windows: res.length,
    median: quantile(f, 0.5),
    p25: quantile(f, 0.25),
    worst: Math.min(...f),
    best: Math.max(...f),
    reachedShare: res.filter((w) => w.final >= goal).length / res.length,
    lostShare: res.filter((w) => w.final < w.invested).length / res.length,
    latest: simulateWindow(series, weights, monthly, latestStart, months, feeRate)?.final ?? null,
  };
}

/** BTC/ETH/Gold mixes in 10 % steps (BTC ≥ 20 %, ETH ≤ 50 %, gold ≤ 60 % and only when available). */
export function candidateMixes(withGold: boolean) {
  const out: Record<string, number>[] = [];
  for (let b = 2; b <= 10; b++)
    for (let e = 0; e <= 5 && b + e <= 10; e++) {
      const g = 10 - b - e;
      if (g > 0 && (!withGold || g > 6)) continue;
      out.push(Object.fromEntries(Object.entries({ BTC: b / 10, ETH: e / 10, PAXG: g / 10 }).filter(([, v]) => v > 0)));
    }
  return out;
}

export function searchMixes(series: DailySeries[], current: Record<string, number>, monthly: number, years: number, goal: number, feeRate: Fees, withGold: boolean): MixSearch {
  const months = years * 12;
  const mixes = candidateMixes(withGold);
  const symbols = [...new Set([...Object.keys(current), "BTC", "ETH", ...(withGold ? ["PAXG"] : [])])].filter((s) => series.some((x) => x.symbol === s));
  const starts = commonStarts(series, symbols, months);
  const btc = series.find((s) => s.symbol === "BTC");
  const empty: MixSearch = { since: 0, windows: 0, months, current: null, goal: null, profit: null, safe: null, all: [] };
  if (!btc || starts.length < 6) return empty;
  const lastT = btc.times[btc.times.length - 1];
  const d = new Date(lastT);
  const latestStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, d.getUTCDate());
  const all = mixes.map((w) => stats(series, w, monthly, starts, months, goal, feeRate, latestStart)).filter((x): x is MixStats => x !== null);
  const byGoal = [...all].sort((a, b) => b.reachedShare - a.reachedShare || b.p25 - a.p25);
  const profit = [...all].sort((a, b) => b.median - a.median)[0] ?? null;
  const safe = [...all].sort((a, b) => a.lostShare - b.lostShare || b.worst - a.worst)[0] ?? null;
  return { since: starts[0], windows: starts.length, months, current: stats(series, current, monthly, starts, months, goal, feeRate, latestStart), goal: byGoal[0] ?? null, profit, safe, all: byGoal };
}

/**
 * What it takes to reach the goal with this mix: results scale with the monthly
 * amount, so needed = goal ÷ (result per €1 a month). Also how many years the
 * current amount typically needed (shortest horizon whose typical result ≥ goal).
 */
export function goalNeeds(series: DailySeries[], weights: Record<string, number>, monthly: number, years: number, goal: number, feeRate: Fees) {
  const months = years * 12;
  const starts = commonStarts(series, Object.keys(weights), months);
  const per1 = starts.map((s) => simulateWindow(series, weights, 1, s, months, feeRate)?.final).filter((x): x is number => x !== undefined && x > 0);
  const typical = per1.length >= 6 ? goal / quantile(per1, 0.5) : null;
  const likely = per1.length >= 6 ? goal / quantile(per1, 0.25) : null;
  let yearsTypical: number | null = null;
  for (let y = 1; y <= 8; y++) {
    const st = commonStarts(series, Object.keys(weights), y * 12);
    if (st.length < 6) break;
    const f = st.map((s) => simulateWindow(series, weights, monthly, s, y * 12, feeRate)?.final).filter((x): x is number => x !== undefined);
    if (f.length >= 6 && quantile(f, 0.5) >= goal) {
      yearsTypical = y;
      break;
    }
  }
  return { monthlyTypical: typical, monthlyLikely: likely, yearsTypical, windows: per1.length };
}

/**
 * "Wait for a dip" vs "buy on the 1st": the dip version buys on the first day of
 * each month when BTC is ≥ `dip` below its 30-day average, otherwise on the last day.
 * Returns in how many past periods buying on the 1st ended higher.
 */
export function dipWaitTest(series: DailySeries[], weights: Record<string, number>, years: number, feeRate: Fees, dip = 0.05) {
  const months = years * 12;
  const starts = commonStarts(series, Object.keys(weights), months);
  const btc = series.find((s) => s.symbol === "BTC");
  if (!btc || starts.length < 6) return null;
  const avg30 = (t: number) => {
    const i = idxAtOrAfter(btc.times, t);
    if (i < 30) return null;
    let a = 0;
    for (let k = i - 29; k <= i; k++) a += btc.closes[k];
    return { avg: a / 30, close: btc.closes[i] };
  };
  const bySym = new Map(series.map((s) => [s.symbol, s]));
  let firstWins = 0;
  let total = 0;
  let firstSum = 0;
  let dipSum = 0;
  for (const start of starts) {
    const a = simulateWindow(series, weights, 1, start, months, feeRate);
    // Dip variant: same money, different day each month.
    const qty = new Map<string, number>();
    let ok = true;
    for (let m = 0; m < months && ok; m++) {
      const from = addMonths(start, m);
      const to = addMonths(start, m + 1) - 86_400_000;
      let day = to;
      for (let t = from; t <= to; t += 86_400_000) {
        const x = avg30(t);
        if (x && x.close <= x.avg * (1 - dip)) {
          day = t;
          break;
        }
      }
      for (const [sym, w] of Object.entries(weights)) {
        const s = bySym.get(sym);
        const p = s ? priceAt(s, day) : null;
        if (p === null) {
          ok = false;
          break;
        }
        qty.set(sym, (qty.get(sym) ?? 0) + (w * (1 - sides(feeRate).buy)) / p);
      }
    }
    if (!a || !ok) continue;
    const end = addMonths(start, months);
    let b = 0;
    for (const [sym, q] of qty) b += q * (priceAt(bySym.get(sym)!, end) ?? 0) * (1 - sides(feeRate).sell);
    total++;
    if (a.final >= b) firstWins++;
    firstSum += a.final;
    dipSum += b;
  }
  return total ? { firstWins, total, avgDiffPct: ((firstSum - dipSum) / dipSum) * 100 } : null;
}
