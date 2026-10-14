import type { Candle, Timeframe } from "@/lib/market/types";
import type { IndicatorCache } from "./cache";

export const SIGNAL_STATES = [
  "STRONG_BUY_SETUP",
  "POTENTIAL_BUY",
  "HOLD_WAIT",
  "POTENTIAL_SELL",
  "EXIT_SETUP",
  "NO_CLEAR_OPPORTUNITY",
  "NO_SIGNAL",
] as const;
export type SignalState = (typeof SIGNAL_STATES)[number];

export const STATE_LABEL: Record<SignalState, string> = {
  STRONG_BUY_SETUP: "Strong buy setup",
  POTENTIAL_BUY: "Potential buy",
  HOLD_WAIT: "Hold / wait",
  POTENTIAL_SELL: "Potential sell",
  EXIT_SETUP: "Exit setup",
  NO_CLEAR_OPPORTUNITY: "No clear opportunity",
  NO_SIGNAL: "No signal (data issue)",
};

export const BUY_STATES: SignalState[] = ["STRONG_BUY_SETUP", "POTENTIAL_BUY"];
export const SELL_STATES: SignalState[] = ["POTENTIAL_SELL", "EXIT_SETUP"];

export type Direction = "long" | "exit" | "neutral";
export function directionOf(state: SignalState): Direction {
  if (BUY_STATES.includes(state)) return "long";
  if (SELL_STATES.includes(state)) return "exit";
  return "neutral";
}

/** Rank used for "minimum signal strength" alert filters. Higher = stronger long setup. */
export const STATE_RANK: Record<SignalState, number> = {
  STRONG_BUY_SETUP: 2,
  POTENTIAL_BUY: 1,
  HOLD_WAIT: 0,
  NO_CLEAR_OPPORTUNITY: 0,
  NO_SIGNAL: 0,
  POTENTIAL_SELL: -1,
  EXIT_SETUP: -2,
};

export interface ParamSpec {
  key: string;
  label: string;
  type: "int" | "float";
  min: number;
  max: number;
  step: number;
  default: number;
  help: string;
}

export type Params = Record<string, number>;

export type ConditionGroup = "setup" | "confirm" | "exit";
export interface Condition {
  id: string;
  label: string;
  group: ConditionGroup;
  /** null = could not be evaluated (missing data). Treated as NOT met. */
  passed: boolean | null;
  detail: string;
}

export interface StrategyContext {
  candles: Candle[];
  i: number;
  ind: IndicatorCache;
  params: Params;
  timeframe: Timeframe;
}

export interface StrategyEvaluation {
  state: Exclude<SignalState, "NO_SIGNAL">;
  summary: string;
  conditions: Condition[];
  indicators: Record<string, number | null>;
  entry?: { low: number; high: number } | null;
  /** For long states: price below which the setup is invalid. For exit states: price above which the exit condition is cancelled. */
  invalidation?: number | null;
  invalidationNote?: string;
  targets?: number[];
  risks: string[];
  conflicts: string[];
}

export interface StrategyRules {
  setup: string[];
  confirmation: string[];
  exit: string[];
  invalidation: string;
  targets: string;
  expiry: string;
}

export interface StrategyDefinition {
  id: string;
  name: string;
  version: number;
  summary: string;
  description: string;
  rules: StrategyRules;
  intendedTimeframes: Timeframe[];
  defaultTimeframes: Timeframe[];
  params: ParamSpec[];
  /** Closed candles required before evaluation is meaningful. */
  warmup(params: Params): number;
  /** Bars after which an unchanged signal must be re-confirmed. */
  expiryBars(params: Params): number;
  evaluate(ctx: StrategyContext): StrategyEvaluation;
}
