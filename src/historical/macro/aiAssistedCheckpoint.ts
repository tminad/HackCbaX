import { netCarry30d, shouldRebalance } from '../../domain/index.js';
import type { Asset, RebalanceDecision, StrategySnapshot } from '../../domain/index.js';
import { selectBestStrategy } from '../../services/opportunityScanner.js';
import type { HistoricalExecutionCostModel } from '../executionCostModel.js';
import { executionCosts } from '../executionCostModel.js';
import type { HistoricalMarketSnapshot } from '../historicalTypes.js';
import type { ExpectedFxExplanation } from '../../macro/types.js';

export interface AiFxByAsset {
  ARGt: ExpectedFxExplanation;
  BRAt: ExpectedFxExplanation;
}

export interface AiCheckpointOptions {
  positionSizeUsd: number;
  routeLiquidityUsd: number;
  currentAsset: Asset | null;
  lastRebalanceAtMs: number | null;
}

export interface AssetCarryComparison {
  asset: Asset;
  expectedFxReturn30d: number;
  effectiveApr: number;
  yield30d: number;
  riskBuffer: number;
  netCarry30d: number;
}

export interface AiCheckpointResult {
  timestamp: number;
  preAi: AssetCarryComparison[];
  aiAssisted: AssetCarryComparison[];
  preAiWinner: Asset | null;
  aiWinner: Asset | null;
  action: 'INITIAL_ALLOCATION' | 'STAY_USDC' | 'HOLD' | 'REBALANCE' | 'SKIP';
  currentAsset: Asset | null;
  targetAsset: Asset | null;
  decision: RebalanceDecision | null;
  reason: string;
}

function requireSnapshot(asset: 'ARGt'|'BRAt', row: HistoricalMarketSnapshot, positionSizeUsd:number): StrategySnapshot {
  const source = asset === 'ARGt' ? row.argt : row.brat;
  if (source.baseApr === undefined || source.incentiveApr === undefined || source.incentiveDaysLeft === undefined || source.fxVolatility30d === undefined) {
    throw new Error(`${asset} financial inputs incomplete at ${new Date(row.timestamp).toISOString()}`);
  }
  return {
    asset,
    protocol: 'Morpho',
    baseApr: source.baseApr,
    incentiveApr: source.incentiveApr,
    incentiveDaysLeft: source.incentiveDaysLeft,
    expectedFxReturn30d: 0,
    fxVolatility30d: source.fxVolatility30d,
    depositAvailable: true,
    // Exploratory replay assumption, matching the historical session: modeled capacity equals requested position.
    depositCapacityUsd: positionSizeUsd,
    criticalRisk: false,
  };
}

function defensiveUsdc(positionSizeUsd:number): StrategySnapshot {
  return {
    asset:'USDC', protocol:'Wallet', baseApr:0, incentiveApr:0, incentiveDaysLeft:0,
    expectedFxReturn30d:0, fxVolatility30d:0, depositAvailable:true,
    depositCapacityUsd:positionSizeUsd, criticalRisk:false,
  };
}

function localWinnerOrCash(scan: ReturnType<typeof selectBestStrategy>): Asset {
  const selected=scan.selected;
  return !selected || selected.calculation.netCarry30d <= 0 ? 'USDC' : selected.snapshot.asset;
}

function comparison(snapshot: StrategySnapshot): AssetCarryComparison {
  const c = netCarry30d(snapshot);
  return { asset: snapshot.asset, expectedFxReturn30d: snapshot.expectedFxReturn30d,
    effectiveApr: c.effectiveApr, yield30d: c.yield30d, riskBuffer: c.riskBuffer, netCarry30d: c.netCarry30d };
}

/**
 * Financial checkpoint used by the macro replay. The AI only supplies expected FX.
 * All carry, eligibility and rebalance math stays in the approved domain core.
 */
export function evaluateAiCheckpoint(row: HistoricalMarketSnapshot, fx: AiFxByAsset,
  model: HistoricalExecutionCostModel, options: AiCheckpointOptions): AiCheckpointResult {
  if (!Number.isFinite(options.positionSizeUsd) || options.positionSizeUsd <= 0) throw new RangeError('Invalid position size');
  if (!Number.isFinite(options.routeLiquidityUsd) || options.routeLiquidityUsd <= 0) throw new RangeError('Invalid route liquidity');
  if (model.positionSizeUsd !== options.positionSizeUsd) throw new RangeError('Execution model size mismatch');

  const neutral = [requireSnapshot('ARGt', row, options.positionSizeUsd), requireSnapshot('BRAt', row, options.positionSizeUsd)];
  const assisted = neutral.map(s => {
    const e = fx[s.asset as 'ARGt'|'BRAt'];
    if (e.finalExpectedFxReturn30d === null) return null;
    return { ...s, expectedFxReturn30d: e.finalExpectedFxReturn30d };
  }).filter((s): s is StrategySnapshot => s !== null);

  const route = { routeAvailable:true, routeSafe:true, routeLiquidityUsd:options.routeLiquidityUsd, estimatedSlippage:model.estimatedSlippagePct };
  const scan = (snapshots: StrategySnapshot[]) => selectBestStrategy({
    depositAmountUsd: options.positionSizeUsd,
    candidates: snapshots.map(s => ({ id:s.asset, snapshot:s, route })),
  });
  const pre = scan(neutral), ai = scan(assisted);
  const cash=defensiveUsdc(options.positionSizeUsd), cashComparison=comparison(cash);
  const preWinner=localWinnerOrCash(pre), aiWinner=localWinnerOrCash(ai);
  const result: AiCheckpointResult = {
    timestamp:row.timestamp,
    preAi:[...neutral.map(comparison), cashComparison],
    aiAssisted:[...assisted.map(comparison), cashComparison],
    preAiWinner:preWinner,
    aiWinner,
    action:'SKIP', currentAsset:options.currentAsset, targetAsset:aiWinner,
    decision:null, reason:'NO_AI_ASSISTED_ELIGIBLE_STRATEGY',
  };

  // USDC is a defensive cash benchmark. Staying in cash requires no deployment route or swap.
  if (options.currentAsset === null && aiWinner === 'USDC') {
    result.action='STAY_USDC';result.currentAsset='USDC';result.targetAsset='USDC';result.reason='DEFENSIVE_USDC_BEST';return result;
  }
  if (options.currentAsset === null) {
    const target=ai.selected;
    if(!target)return result;
    result.action='INITIAL_ALLOCATION';result.currentAsset=target.snapshot.asset;result.targetAsset=target.snapshot.asset;result.reason='BEST_AI_ASSISTED_ELIGIBLE_CARRY';return result;
  }
  if (options.currentAsset === 'USDC' && aiWinner === 'USDC') {
    result.action='HOLD';result.currentAsset='USDC';result.targetAsset='USDC';result.reason='DEFENSIVE_USDC_BEST';return result;
  }
  if (options.currentAsset !== 'USDC' && aiWinner === 'USDC') {
    // The historical session did not verify a dated local-token -> USDC execution route.
    result.action='SKIP';result.targetAsset='USDC';result.reason='USDC_EXECUTION_ROUTE_UNVERIFIED';return result;
  }

  const target = ai.selected;
  if (!target) return result;
  const current = options.currentAsset === 'USDC' ? cash : assisted.find(s=>s.asset===options.currentAsset);
  if (!current) { result.reason='CURRENT_AI_ASSISTED_FX_UNAVAILABLE'; return result; }
  const source = options.currentAsset === 'ARGt' ? row.argt : options.currentAsset === 'BRAt' ? row.brat : null;
  const withdrawableUsd = source ? (source.availableLiquidityUsd ?? source.idleLiquidityUsd) : options.positionSizeUsd;
  if (withdrawableUsd === undefined) { result.reason='WITHDRAWAL_DATA_MISSING'; return result; }
  const decision=shouldRebalance({current,target:target.snapshot,costs:executionCosts(model),
    execution:{positionSizeUsd:options.positionSizeUsd,withdrawable:withdrawableUsd>=options.positionSizeUsd,
      withdrawableUsd,swapAvailable:true,routeSafe:true,routeLiquidityUsd:options.routeLiquidityUsd},
    nowMs:row.timestamp,lastNonEmergencyRebalanceAtMs:options.lastRebalanceAtMs});
  result.decision=decision;result.action=decision.shouldRebalance?'REBALANCE':'HOLD';result.reason=decision.reason;
  if(decision.shouldRebalance)result.currentAsset=decision.targetAsset;
  return result;
}
