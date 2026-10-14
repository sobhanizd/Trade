import * as ind from "@/lib/indicators";
import type { Candle } from "@/lib/market/types";

/**
 * Memoised indicator series for one candle array. Strategies call these at
 * evaluation index i; because every indicator is causal, reading index i of a
 * series computed over the full array equals computing it on candles[0..i].
 */
export class IndicatorCache {
  private memo = new Map<string, unknown>();
  readonly closes: number[];
  readonly highs: number[];
  readonly lows: number[];
  readonly opens: number[];
  readonly volumes: number[];

  constructor(readonly candles: Candle[]) {
    this.closes = candles.map((c) => c.close);
    this.highs = candles.map((c) => c.high);
    this.lows = candles.map((c) => c.low);
    this.opens = candles.map((c) => c.open);
    this.volumes = candles.map((c) => c.volume);
  }

  private get<T>(key: string, fn: () => T): T {
    if (!this.memo.has(key)) this.memo.set(key, fn());
    return this.memo.get(key) as T;
  }

  sma = (p: number) => this.get(`sma:${p}`, () => ind.sma(this.closes, p));
  ema = (p: number) => this.get(`ema:${p}`, () => ind.ema(this.closes, p));
  rsi = (p: number) => this.get(`rsi:${p}`, () => ind.rsi(this.closes, p));
  macd = (f: number, s: number, sig: number) => this.get(`macd:${f}:${s}:${sig}`, () => ind.macd(this.closes, f, s, sig));
  bollinger = (p: number, m: number) => this.get(`bb:${p}:${m}`, () => ind.bollinger(this.closes, p, m));
  atr = (p: number) => this.get(`atr:${p}`, () => ind.atr(this.candles, p));
  adx = (p: number) => this.get(`adx:${p}`, () => ind.adx(this.candles, p));
  volumeRatio = (p: number) => this.get(`vr:${p}`, () => ind.volumeRatio(this.volumes, p));
  roc = (p: number) => this.get(`roc:${p}`, () => ind.roc(this.closes, p));
  slope = (series: "ema" | "sma", p: number, lb: number) =>
    this.get(`slope:${series}:${p}:${lb}`, () => ind.slopePct(series === "ema" ? this.ema(p) : this.sma(p), lb));
}
