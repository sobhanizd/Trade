import { breakout } from "./breakout";
import { resolveParams } from "./helpers";
import { momentum } from "./momentum";
import { pullback } from "./pullback";
import { riskAwareSwing } from "./swing";
import { trendFollowing } from "./trendFollowing";
import type { Params, StrategyDefinition } from "./types";

export const STRATEGIES: StrategyDefinition[] = [trendFollowing, momentum, pullback, breakout, riskAwareSwing];

export function getStrategy(id: string): StrategyDefinition | undefined {
  return STRATEGIES.find((s) => s.id === id);
}

export function defaultParams(def: StrategyDefinition): Params {
  return resolveParams(def.params, null);
}

/** Cross-parameter sanity checks; returns human-readable errors. */
export function validateStrategyParams(def: StrategyDefinition, params: Params): string[] {
  const errs: string[] = [];
  const lt = (a: string, b: string) => {
    if (a in params && b in params && !(params[a] < params[b])) errs.push(`"${label(def, a)}" must be smaller than "${label(def, b)}".`);
  };
  lt("fastEma", "slowEma");
  lt("slowEma", "trendSma");
  lt("fastSma", "slowSma");
  lt("rsiLow", "rsiHigh");
  lt("rsiFloor", "rsiPullbackMax");
  lt("rsiMid", "rsiMax");
  if ("target1R" in params && "target2R" in params && params.target2R < params.target1R) errs.push("Target 2 must be at or above Target 1.");
  return errs;
}

function label(def: StrategyDefinition, key: string) {
  return def.params.find((p) => p.key === key)?.label ?? key;
}

export * from "./types";
export { resolveParams } from "./helpers";
