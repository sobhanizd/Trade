import type { Candle } from "@/lib/market/types";

export const H = 3_600_000;

/** Build candles from close prices (open = previous close, small wicks). */
export function candlesFromCloses(closes: number[], opts: { interval?: number; start?: number; volume?: number | number[]; wick?: number } = {}): Candle[] {
  const interval = opts.interval ?? H;
  const start = opts.start ?? Date.UTC(2024, 0, 1);
  const wick = opts.wick ?? 0.002;
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];
    const vol = Array.isArray(opts.volume) ? opts.volume[i] : (opts.volume ?? 1000);
    return {
      openTime: start + i * interval,
      closeTime: start + (i + 1) * interval - 1,
      open,
      high: Math.max(open, close) * (1 + wick),
      low: Math.min(open, close) * (1 - wick),
      close,
      volume: vol,
    };
  });
}

/** Deterministic pseudo-random generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomWalk(n: number, seed = 1, drift = 0.0005, vol = 0.015, start = 100): number[] {
  const r = rng(seed);
  const out: number[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    const z = (r() + r() + r() + r() - 2) * 1.7; // approx normal
    p = p * Math.exp(drift + vol * z);
    out.push(p);
  }
  return out;
}

export function trendUp(n: number, start = 100, step = 0.004, noise = 0.003, seed = 7): number[] {
  const r = rng(seed);
  const out: number[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p = p * (1 + step + (r() - 0.5) * 2 * noise);
    out.push(p);
  }
  return out;
}
