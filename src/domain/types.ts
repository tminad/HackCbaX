/** Rates are decimal fractions. Amounts/liquidity are USD equivalents. */
export type Asset = "USDC" | "ARGt" | "BRAt";

export interface YieldInputs {
  readonly baseApr: number;
  readonly incentiveApr: number;
  readonly incentiveDaysLeft: number;
}

export interface CarryInputs extends YieldInputs {
  readonly expectedFxReturn30d: number;
  readonly fxVolatility30d: number;
}

export interface StrategySnapshot extends CarryInputs {
  readonly asset: Asset;
  readonly protocol: string;
  readonly depositAvailable: boolean;
  readonly depositCapacityUsd: number;
  readonly criticalRisk: boolean;
}

/** Route from a new USDC deposit, including direct USDC vault deployment.
 * Future adapters must quote liquidity/slippage for the requested deposit size.
 */
export interface DeploymentRoute {
  readonly routeAvailable: boolean;
  readonly routeSafe: boolean;
  readonly routeLiquidityUsd: number;
  readonly estimatedSlippage: number;
}

/** Evidence specific to the current position and the proposed route. */
export interface ExecutionConditions {
  readonly positionSizeUsd: number;
  readonly withdrawable: boolean;
  readonly withdrawableUsd: number;
  readonly swapAvailable: boolean;
  readonly routeLiquidityUsd: number;
  readonly routeSafe: boolean;
}

export type EligibilityReason =
  | "PROTOCOL_NOT_WHITELISTED" | "DEPOSIT_UNAVAILABLE"
  | "WITHDRAWAL_UNAVAILABLE" | "SWAP_UNAVAILABLE" | "UNSAFE_ROUTE"
  | "EXCESSIVE_SLIPPAGE" | "CRITICAL_RISK" | "INSUFFICIENT_LIQUIDITY";

export interface EligibilityResult {
  readonly eligible: boolean;
  readonly ineligibilityReasons: readonly EligibilityReason[];
}

export interface CarryResult {
  readonly effectiveApr: number;
  readonly yield30d: number;
  readonly riskBuffer: number;
  readonly netCarry30d: number;
}

export interface SwitchCostInputs {
  readonly gasCostPct: number;
  readonly swapFeesPct: number;
  readonly slippagePct: number;
  readonly otherExecutionFeesPct: number;
}

export interface SwitchCost extends SwitchCostInputs {
  readonly totalPct: number;
}

export interface RebalanceInputs {
  readonly current: StrategySnapshot;
  readonly target: StrategySnapshot;
  readonly execution: ExecutionConditions;
  readonly costs: SwitchCostInputs;
  /** UTC epoch milliseconds, supplied by the caller. No ambient clock. */
  readonly nowMs: number;
  readonly lastNonEmergencyRebalanceAtMs: number | null;
  readonly riskFactor?: number;
  /** Explicit external critical-risk flag, in addition to current.criticalRisk. */
  readonly emergency?: boolean;
}

export type DecisionReason = "SAME_ASSET" | "TARGET_INELIGIBLE"
  | "EMERGENCY_REQUIRES_USDC" | "EMERGENCY_EXIT" | "COOLDOWN_ACTIVE"
  | "INSUFFICIENT_BENEFIT" | "SUFFICIENT_BENEFIT";

export interface RebalanceDecision {
  readonly shouldRebalance: boolean;
  readonly action: "HOLD" | "REBALANCE" | "EMERGENCY_EXIT";
  readonly currentAsset: Asset;
  readonly targetAsset: Asset;
  readonly carryImprovement: number;
  readonly switchCost: number;
  readonly netBenefit: number;
  readonly safetyMargin: number;
  readonly breakEvenDays: number | null;
  readonly eligibility: EligibilityResult;
  readonly reason: DecisionReason;
}
