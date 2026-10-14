/**
 * Long-only spot position sizing and risk/reward with fees and slippage.
 * No leverage: position value is capped at the account balance (or a lower
 * configurable % cap). All rates are fractions per side (0.001 = 0.1%).
 */
export interface CostModel {
  feeRate: number;
  slippageRate: number;
  /**
   * The user's real all-in cost per side (fee + spread + slippage), as a fraction of the money:
   * buyCost 0.03 = €1,000 buys €970 of coin; sellCost 0.005 = selling €1,000 of coin pays out €995.
   * When set, these replace feeRate/slippageRate.
   */
  buyCost?: number;
  sellCost?: number;
}

const hasSideCosts = (c: Pick<CostModel, "buyCost" | "sellCost">) => c.buyCost !== undefined || c.sellCost !== undefined;

export const DEFAULT_COSTS: CostModel = { feeRate: 0.001, slippageRate: 0.0005 };

export interface RiskInput {
  accountBalance: number;
  /** Maximum amount willing to lose on this trade (account currency). */
  maxLoss: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice?: number | null;
  feeRate: number;
  slippageRate: number;
  /** Real all-in cost per side (see CostModel); replace fee + slippage when set. */
  buyCost?: number;
  sellCost?: number;
  /** Max position as % of balance (default 100 = no leverage). */
  maxPositionPct?: number;
}

export interface RiskResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  entryFill: number;
  stopFill: number;
  targetFill: number | null;
  /** Loss per unit if stopped, including fees and slippage. */
  lossPerUnit: number;
  /** Gain per unit at target, after fees and slippage. */
  gainPerUnit: number | null;
  quantity: number;
  positionValue: number;
  positionPctOfBalance: number;
  cappedByBalance: boolean;
  potentialLoss: number;
  potentialLossPctOfBalance: number;
  potentialGain: number | null;
  /** Without costs. */
  riskRewardGross: number | null;
  /** After fees and slippage. */
  riskRewardNet: number | null;
  feesAtStop: number;
  feesAtTarget: number | null;
  slippageAtStop: number;
  slippageAtTarget: number | null;
  /** How much costs reduce the gain/increase the loss (account currency). */
  costImpactAtStop: number;
  costImpactAtTarget: number | null;
}

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateRiskInput(i: RiskInput): string[] {
  const errs: string[] = [];
  if (!fin(i.accountBalance) || i.accountBalance <= 0) errs.push("Account balance must be greater than zero.");
  if (!fin(i.maxLoss) || i.maxLoss <= 0) errs.push("Maximum loss must be greater than zero.");
  else if (fin(i.accountBalance) && i.maxLoss > i.accountBalance) errs.push("Maximum loss cannot exceed the account balance.");
  if (!fin(i.entryPrice) || i.entryPrice <= 0) errs.push("Entry price must be greater than zero.");
  if (!fin(i.stopPrice) || i.stopPrice <= 0) errs.push("Invalidation/stop price must be greater than zero.");
  else if (fin(i.entryPrice) && i.stopPrice >= i.entryPrice) errs.push("For a long (buy) position the stop must be below the entry price.");
  if (i.targetPrice !== undefined && i.targetPrice !== null) {
    if (!fin(i.targetPrice) || i.targetPrice <= 0) errs.push("Target price must be greater than zero.");
    else if (fin(i.entryPrice) && i.targetPrice <= i.entryPrice) errs.push("Target must be above the entry price for a long position.");
  }
  if (!fin(i.feeRate) || i.feeRate < 0 || i.feeRate > 0.05) errs.push("Fee rate must be between 0% and 5% per side.");
  if (!fin(i.slippageRate) || i.slippageRate < 0 || i.slippageRate > 0.1) errs.push("Slippage must be between 0% and 10% per side.");
  for (const v of [i.buyCost, i.sellCost]) if (v !== undefined && (!fin(v) || v < 0 || v >= 0.5)) errs.push("Buying and selling costs must be between 0% and 50%.");
  if (i.maxPositionPct !== undefined && (!fin(i.maxPositionPct) || i.maxPositionPct <= 0 || i.maxPositionPct > 100))
    errs.push("Maximum position size must be between 0% and 100% of the balance (no leverage).");
  return errs;
}

/** Per-unit costs for a long round trip between `entry` and `exit` raw prices. */
export function roundTrip(entry: number, exit: number, costs: CostModel) {
  if (hasSideCosts(costs)) {
    // Paying 1 € gets (1 − buyCost) € of coin, so one coin effectively costs entry / (1 − buyCost).
    const entryFill = entry / (1 - (costs.buyCost ?? 0));
    const exitFill = exit * (1 - (costs.sellCost ?? 0));
    return { entryFill, exitFill, fees: entryFill - entry + (exit - exitFill), slippage: 0, net: exitFill - entryFill, gross: exit - entry };
  }
  const entryFill = entry * (1 + costs.slippageRate);
  const exitFill = exit * (1 - costs.slippageRate);
  const fees = entryFill * costs.feeRate + exitFill * costs.feeRate;
  const slippage = entryFill - entry + (exit - exitFill);
  return { entryFill, exitFill, fees, slippage, net: exitFill - entryFill - fees, gross: exit - entry };
}

/** Net reward/risk ratio for a long setup. null when undefined. */
export function netRiskReward(entry: number, stop: number, target: number | null | undefined, costs: CostModel): number | null {
  if (!fin(entry) || !fin(stop) || !fin(target) || stop >= entry || target <= entry) return null;
  const loss = -roundTrip(entry, stop, costs).net;
  const gain = roundTrip(entry, target, costs).net;
  if (loss <= 0) return null;
  return gain / loss;
}

export function calculateRisk(input: RiskInput): RiskResult {
  const errors = validateRiskInput(input);
  const empty: RiskResult = {
    valid: false,
    errors,
    warnings: [],
    entryFill: 0,
    stopFill: 0,
    targetFill: null,
    lossPerUnit: 0,
    gainPerUnit: null,
    quantity: 0,
    positionValue: 0,
    positionPctOfBalance: 0,
    cappedByBalance: false,
    potentialLoss: 0,
    potentialLossPctOfBalance: 0,
    potentialGain: null,
    riskRewardGross: null,
    riskRewardNet: null,
    feesAtStop: 0,
    feesAtTarget: null,
    slippageAtStop: 0,
    slippageAtTarget: null,
    costImpactAtStop: 0,
    costImpactAtTarget: null,
  };
  if (errors.length) return empty;

  const costs: CostModel = { feeRate: input.feeRate, slippageRate: input.slippageRate, buyCost: input.buyCost, sellCost: input.sellCost };
  const stopRt = roundTrip(input.entryPrice, input.stopPrice, costs);
  const lossPerUnit = -stopRt.net;
  const targetRt = fin(input.targetPrice) ? roundTrip(input.entryPrice, input.targetPrice, costs) : null;
  const gainPerUnit = targetRt ? targetRt.net : null;

  let quantity = input.maxLoss / lossPerUnit;
  const capPct = input.maxPositionPct ?? 100;
  const maxValue = (input.accountBalance * capPct) / 100;
  // Value including entry fee must fit in the cap.
  const unitCost = hasSideCosts(costs) ? stopRt.entryFill : stopRt.entryFill * (1 + input.feeRate);
  let cappedByBalance = false;
  if (quantity * unitCost > maxValue) {
    quantity = maxValue / unitCost;
    cappedByBalance = true;
  }
  const positionValue = quantity * stopRt.entryFill;
  const potentialLoss = quantity * lossPerUnit;
  const potentialGain = gainPerUnit !== null ? quantity * gainPerUnit : null;
  const warnings: string[] = [];
  const lossPct = (potentialLoss / input.accountBalance) * 100;
  const stopDistPct = ((input.entryPrice - input.stopPrice) / input.entryPrice) * 100;

  if (cappedByBalance)
    warnings.push(`Position size was capped at ${capPct}% of your balance (no leverage), so the actual risk is smaller than your maximum.`);
  if (lossPct > 2) warnings.push(`This trade risks ${lossPct.toFixed(2)}% of your balance. Many risk guidelines suggest 1–2% or less per trade.`);
  if (stopDistPct < 0.5) warnings.push("The stop is very close to the entry (< 0.5%). Normal price noise may trigger it.");
  if (stopDistPct > 20) warnings.push("The stop is more than 20% away. A position sized to this stop will be small, and the loss per unit large.");
  const rrNet = gainPerUnit !== null && lossPerUnit > 0 ? gainPerUnit / lossPerUnit : null;
  if (rrNet !== null && rrNet < 1) warnings.push("After costs, the potential gain is smaller than the potential loss (reward/risk below 1).");
  else if (rrNet !== null && rrNet < 1.5) warnings.push("Reward/risk after costs is below 1.5, leaving little margin for error.");
  if (gainPerUnit !== null && gainPerUnit <= 0) warnings.push("Costs exceed the distance to the target: this trade cannot be profitable at the target.");
  warnings.push("Stop orders can execute at worse prices than expected during fast or illiquid markets (gaps and slippage).");

  return {
    valid: true,
    errors: [],
    warnings,
    entryFill: stopRt.entryFill,
    stopFill: stopRt.exitFill,
    targetFill: targetRt?.exitFill ?? null,
    lossPerUnit,
    gainPerUnit,
    quantity,
    positionValue,
    positionPctOfBalance: (positionValue / input.accountBalance) * 100,
    cappedByBalance,
    potentialLoss,
    potentialLossPctOfBalance: lossPct,
    potentialGain,
    riskRewardGross: fin(input.targetPrice) ? (input.targetPrice - input.entryPrice) / (input.entryPrice - input.stopPrice) : null,
    riskRewardNet: rrNet,
    feesAtStop: quantity * stopRt.fees,
    feesAtTarget: targetRt ? quantity * targetRt.fees : null,
    slippageAtStop: quantity * stopRt.slippage,
    slippageAtTarget: targetRt ? quantity * targetRt.slippage : null,
    costImpactAtStop: quantity * (stopRt.fees + stopRt.slippage),
    costImpactAtTarget: targetRt ? quantity * (targetRt.fees + targetRt.slippage) : null,
  };
}
