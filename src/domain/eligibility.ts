import { MAX_SLIPPAGE, PROTOCOL_WHITELIST } from "./constants.js";
import type { DeploymentRoute, EligibilityReason, EligibilityResult, ExecutionConditions, StrategySnapshot } from "./types.js";
import { nonNegative, positive } from "./validation.js";

export function checkEligibility(
  target: StrategySnapshot,
  execution: ExecutionConditions,
  estimatedSlippage: number,
): EligibilityResult {
  positive("positionSizeUsd", execution.positionSizeUsd);
  nonNegative("withdrawableUsd", execution.withdrawableUsd);
  const result = checkDeploymentEligibility(target, execution.positionSizeUsd, {
    routeAvailable: execution.swapAvailable,
    routeSafe: execution.routeSafe,
    routeLiquidityUsd: execution.routeLiquidityUsd,
    estimatedSlippage,
  });
  const reasons = [...result.ineligibilityReasons];
  if (execution.withdrawable !== true || execution.withdrawableUsd < execution.positionSizeUsd) {
    reasons.push("WITHDRAWAL_UNAVAILABLE");
  }
  return { eligible: reasons.length === 0, ineligibilityReasons: reasons };
}

/** Shared entry gates; initial allocation has no existing vault to withdraw. */
export function checkDeploymentEligibility(
  target: StrategySnapshot,
  depositAmountUsd: number,
  route: DeploymentRoute,
): EligibilityResult {
  positive("depositAmountUsd", depositAmountUsd);
  nonNegative("routeLiquidityUsd", route.routeLiquidityUsd);
  nonNegative("depositCapacityUsd", target.depositCapacityUsd);
  nonNegative("estimatedSlippage", route.estimatedSlippage);
  const reasons: EligibilityReason[] = [];
  if (!PROTOCOL_WHITELIST.includes(target.protocol)) reasons.push("PROTOCOL_NOT_WHITELISTED");
  if (target.depositAvailable !== true) reasons.push("DEPOSIT_UNAVAILABLE");
  if (route.routeAvailable !== true) reasons.push("SWAP_UNAVAILABLE");
  if (route.routeSafe !== true) reasons.push("UNSAFE_ROUTE");
  if (route.estimatedSlippage > MAX_SLIPPAGE) reasons.push("EXCESSIVE_SLIPPAGE");
  if (target.criticalRisk !== false) reasons.push("CRITICAL_RISK");
  if (route.routeLiquidityUsd < depositAmountUsd || target.depositCapacityUsd < depositAmountUsd) {
    reasons.push("INSUFFICIENT_LIQUIDITY");
  }
  return { eligible: reasons.length === 0, ineligibilityReasons: reasons };
}
