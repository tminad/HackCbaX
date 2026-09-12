import type { ExecutionConditions, RebalanceInputs, StrategySnapshot, SwitchCostInputs } from "../domain/index.js";

// Synthetic external yield-strategy data; these are not token-native yields.
export const opportunities = {
  USDC: { asset: "USDC", protocol: "Morpho", baseApr: 0.05, incentiveApr: 0, incentiveDaysLeft: 0, expectedFxReturn30d: 0, fxVolatility30d: 0, depositAvailable: true, depositCapacityUsd: 100_000, criticalRisk: false },
  ARGt: { asset: "ARGt", protocol: "Morpho", baseApr: 0.13, incentiveApr: 0.04, incentiveDaysLeft: 30, expectedFxReturn30d: -0.0045, fxVolatility30d: 0.01, depositAvailable: true, depositCapacityUsd: 100_000, criticalRisk: false },
  BRAt: { asset: "BRAt", protocol: "Morpho", baseApr: 0.12, incentiveApr: 0, incentiveDaysLeft: 0, expectedFxReturn30d: -0.002, fxVolatility30d: 0.008, depositAvailable: true, depositCapacityUsd: 100_000, criticalRisk: false },
} as const satisfies Record<string, StrategySnapshot>;

export const execution: ExecutionConditions = {
  positionSizeUsd: 1_000, withdrawable: true, withdrawableUsd: 1_000,
  swapAvailable: true, routeLiquidityUsd: 100_000, routeSafe: true,
};
export const costs: SwitchCostInputs = {
  gasCostPct: 0.0001, swapFeesPct: 0.0004, slippagePct: 0.0009, otherExecutionFeesPct: 0.0001,
};
export const holdScenario: RebalanceInputs = {
  current: opportunities.BRAt, target: opportunities.ARGt, execution, costs,
  nowMs: 1_800_000_000_000, lastNonEmergencyRebalanceAtMs: null,
};
export const rebalanceScenario: RebalanceInputs = {
  ...holdScenario,
  target: { ...opportunities.ARGt, expectedFxReturn30d: -0.0005 },
};
