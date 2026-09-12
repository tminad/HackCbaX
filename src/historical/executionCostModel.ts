import type { SwitchCostInputs } from '../domain/index.js';
import { estimateSwitchCost } from '../domain/index.js';

export interface HistoricalExecutionCostModel {
  name: 'BASE' | 'STRESS';
  swapFeePct: number; estimatedSlippagePct: number; gasPct: number; otherFeesPct: number;
  calibrationTimestamp: number; positionSizeUsd: number;
  evidence: string[]; assumptions: string[];
}
export function executionCosts(model: HistoricalExecutionCostModel): SwitchCostInputs {
  if (!Number.isFinite(model.positionSizeUsd) || model.positionSizeUsd <= 0 || !Number.isFinite(model.calibrationTimestamp)) throw new RangeError('Invalid calibration');
  const costs = { gasCostPct: model.gasPct, swapFeesPct: model.swapFeePct,
    slippagePct: model.estimatedSlippagePct, otherExecutionFeesPct: model.otherFeesPct };
  estimateSwitchCost(costs); // Existing domain validation and sum.
  return costs;
}
/** Configurable multipliers, never a hidden override of historical market fields. */
export function stressModel(base: HistoricalExecutionCostModel, slippageMultiplier: number, gasMultiplier: number): HistoricalExecutionCostModel {
  if (![slippageMultiplier,gasMultiplier].every(x=>Number.isFinite(x)&&x>=1)) throw new RangeError('Stress must be at least as conservative');
  const stress: HistoricalExecutionCostModel = { ...base, name: 'STRESS',
    estimatedSlippagePct: base.estimatedSlippagePct*slippageMultiplier, gasPct: base.gasPct*gasMultiplier,
    assumptions: [...base.assumptions, `STRESS multiplies modeled slippage by ${slippageMultiplier} and gas by ${gasMultiplier}.`] };
  executionCosts(stress);
  return stress;
}
