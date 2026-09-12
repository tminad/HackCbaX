import { COOLDOWN_HOURS, HORIZON_DAYS, SAFETY_MARGIN } from "./constants.js";
import { netCarry30d } from "./carry.js";
import { checkEligibility } from "./eligibility.js";
import type { DecisionReason, RebalanceDecision, RebalanceInputs, SwitchCost, SwitchCostInputs } from "./types.js";
import { finite, nonNegative } from "./validation.js";

export function estimateSwitchCost(input: SwitchCostInputs): SwitchCost {
  const gasCostPct = nonNegative("gasCostPct", input.gasCostPct);
  const swapFeesPct = nonNegative("swapFeesPct", input.swapFeesPct);
  const slippagePct = nonNegative("slippagePct", input.slippagePct);
  const otherExecutionFeesPct = nonNegative("otherExecutionFeesPct", input.otherExecutionFeesPct);
  const totalPct = finite("switchCost", gasCostPct + swapFeesPct + slippagePct + otherExecutionFeesPct);
  return { gasCostPct, swapFeesPct, slippagePct, otherExecutionFeesPct, totalPct };
}

/** null means there is no positive annual carry advantage. */
export function breakEvenDays(switchCost: number, annualCarryDifference: number): number | null {
  nonNegative("switchCost", switchCost);
  finite("annualCarryDifference", annualCarryDifference);
  if (annualCarryDifference <= 0) return null;
  return finite("breakEvenDays", switchCost / annualCarryDifference * 365);
}

export function shouldRebalance(input: RebalanceInputs): RebalanceDecision {
  nonNegative("nowMs", input.nowMs);
  const last = input.lastNonEmergencyRebalanceAtMs;
  if (last !== null) {
    nonNegative("lastNonEmergencyRebalanceAtMs", last);
    if (last > input.nowMs) throw new RangeError("Last rebalance cannot be in the future");
  }
  const current = netCarry30d(input.current, input.riskFactor);
  const target = netCarry30d(input.target, input.riskFactor);
  const costs = estimateSwitchCost(input.costs);
  const eligibility = checkEligibility(input.target, input.execution, costs.slippagePct);
  const carryImprovement = finite("carryImprovement", target.netCarry30d - current.netCarry30d);
  const netBenefit = finite("netBenefit", carryImprovement - costs.totalPct);
  const emergency = input.emergency === true || input.current.criticalRisk === true;
  let reason: DecisionReason;
  if (input.current.asset === input.target.asset) reason = "SAME_ASSET";
  else if (!eligibility.eligible) reason = "TARGET_INELIGIBLE";
  else if (emergency) reason = input.target.asset === "USDC" ? "EMERGENCY_EXIT" : "EMERGENCY_REQUIRES_USDC";
  else if (last !== null && input.nowMs - last < COOLDOWN_HOURS * 60 * 60 * 1000) reason = "COOLDOWN_ACTIVE";
  else {
    // Only absorb floating-point subtraction noise at the inclusive boundary.
    const tolerance = 8 * Number.EPSILON * Math.max(
      Math.abs(target.netCarry30d), Math.abs(current.netCarry30d), costs.totalPct, SAFETY_MARGIN,
    );
    reason = netBenefit >= SAFETY_MARGIN || SAFETY_MARGIN - netBenefit <= tolerance
      ? "SUFFICIENT_BENEFIT" : "INSUFFICIENT_BENEFIT";
  }
  const move = reason === "SUFFICIENT_BENEFIT" || reason === "EMERGENCY_EXIT";
  return {
    shouldRebalance: move,
    action: reason === "EMERGENCY_EXIT" ? "EMERGENCY_EXIT" : move ? "REBALANCE" : "HOLD",
    currentAsset: input.current.asset,
    targetAsset: input.target.asset,
    carryImprovement,
    switchCost: costs.totalPct,
    netBenefit,
    safetyMargin: SAFETY_MARGIN,
    breakEvenDays: breakEvenDays(costs.totalPct, carryImprovement * 365 / HORIZON_DAYS),
    eligibility,
    reason,
  };
}
