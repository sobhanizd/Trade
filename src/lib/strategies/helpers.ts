import type { Condition, ConditionGroup, ParamSpec, Params } from "./types";

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Compact human price formatting for explanations. */
export function fp(v: number | null | undefined): string {
  if (!isNum(v)) return "n/a";
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : 8;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: abs >= 1000 ? 2 : 0 });
}
export const f1 = (v: number | null | undefined) => (isNum(v) ? v.toFixed(1) : "n/a");
export const f2 = (v: number | null | undefined) => (isNum(v) ? v.toFixed(2) : "n/a");

export function cond(id: string, label: string, group: ConditionGroup, passed: boolean | null, detail: string): Condition {
  return { id, label, group, passed, detail };
}

/** Evaluate `pred` only when all inputs are numbers; otherwise null (unknown). */
export function when(inputs: unknown[], pred: () => boolean): boolean | null {
  return inputs.every(isNum) ? pred() : null;
}

export const ok = (b: boolean | null) => b === true;
export const countTrue = (xs: (boolean | null)[]) => xs.filter((x) => x === true).length;

export function p(spec: Omit<ParamSpec, "type"> & { type?: ParamSpec["type"] }): ParamSpec {
  return { type: Number.isInteger(spec.step) ? "int" : "float", ...spec };
}

/** Fill defaults and clamp to spec ranges. Unknown keys are dropped. */
export function resolveParams(specs: ParamSpec[], input?: Record<string, unknown> | null): Params {
  const out: Params = {};
  for (const s of specs) {
    const raw = input?.[s.key];
    let v = typeof raw === "number" && Number.isFinite(raw) ? raw : typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : s.default;
    v = Math.min(s.max, Math.max(s.min, v));
    if (s.type === "int") v = Math.round(v);
    out[s.key] = v;
  }
  return out;
}

/** R-multiple targets above `entry` given a stop. */
export function rTargets(entry: number, stop: number, multiples: number[]): number[] {
  const r = entry - stop;
  if (!(r > 0)) return [];
  return multiples.filter((m) => m > 0).map((m) => entry + r * m);
}

export function uniqSorted(xs: number[]): number[] {
  return [...new Set(xs.filter(isNum).map((x) => Number(x.toPrecision(10))))].sort((a, b) => a - b);
}

export function validateParamRelations(params: Params, rules: [string, "<", string][]): string[] {
  return rules.filter(([a, , b]) => !(params[a] < params[b])).map(([a, , b]) => `${a} must be smaller than ${b}`);
}

export function lowestOf(candles: { low: number }[], from: number, to: number): number | null {
  if (from < 0 || to < from) return null;
  let m = Infinity;
  for (let j = from; j <= to; j++) m = Math.min(m, candles[j].low);
  return Number.isFinite(m) ? m : null;
}

export function highestOf(candles: { high: number }[], from: number, to: number): number | null {
  if (from < 0 || to < from) return null;
  let m = -Infinity;
  for (let j = from; j <= to; j++) m = Math.max(m, candles[j].high);
  return Number.isFinite(m) ? m : null;
}
