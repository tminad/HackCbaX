import { shouldRebalance } from '../domain/index.js';
import type { Asset, RebalanceDecision, StrategySnapshot } from '../domain/index.js';
import { selectBestStrategy } from '../services/opportunityScanner.js';
import type { OpportunityCandidate } from '../services/opportunityScanner.js';
import type { HistoricalDataset, HistoricalAssetSnapshot } from './historicalTypes.js';
import { executionCosts } from './executionCostModel.js';
import type { HistoricalExecutionCostModel } from './executionCostModel.js';

export interface ReplayOptions {
  mode: 'STRICT' | 'EXPLORATORY';
  riskMode: 'TRAILING_FX' | 'YIELD_ONLY';
  /** Explicit exploratory availability budget, not historical Curve liquidity. */
  modeledRouteLiquidityUsd?: number;
}
export interface ReplayRecord {
  timestamp: number;
  action: 'INITIAL_ALLOCATION' | 'HOLD' | 'REBALANCE' | 'SKIP';
  selected: Asset | null;
  current: Asset | null;
  ranking: { asset: Asset; netCarry30d: number }[];
  /** Financial opportunity diagnostic only; deliberately ignores modeled slippage. */
  diagnosticRanking: { asset: Asset; netCarry30d: number }[];
  exclusions: { asset: Asset; reasons: string[] }[];
  decision?: RebalanceDecision;
  reason: string;
  metadata: { marketData: 'REAL'; executionCosts: 'MODELED'; eligibility: 'REAL_EVIDENCE_REQUIRED' | 'MODELED_AVAILABILITY';
    fxBaseline: 'NEUTRAL FX BASELINE — PRE-AI'; riskMode: ReplayOptions['riskMode']; assumptions: string[] };
}

/** Reuses domain/scanner decisions. No P&L reconstruction or chain execution. */
export function historicalReplay(dataset: HistoricalDataset, model: HistoricalExecutionCostModel, options: ReplayOptions): ReplayRecord[] {
  const costs = executionCosts(model);
  const sorted = [...dataset.snapshots].sort((a,b)=>a.timestamp-b.timestamp);
  if (sorted.some((s,i)=>!Number.isFinite(s.timestamp)||(i>0&&s.timestamp===sorted[i-1]!.timestamp))) throw new RangeError('Historical timestamps must be finite and unique');
  if (options.mode === 'EXPLORATORY' && (!Number.isFinite(options.modeledRouteLiquidityUsd) || options.modeledRouteLiquidityUsd! <= 0)) throw new RangeError('Exploratory route liquidity must be explicit');
  let current: Asset | null = null;
  let lastRebalance: number | null = null;
  const records: ReplayRecord[] = [];
  for (const sample of sorted) {
    const candidates: OpportunityCandidate[] = [];
    const exclusions: ReplayRecord['exclusions'] = [];
    const snapshots = new Map<Asset, StrategySnapshot>();
    const assetData = new Map<Asset, HistoricalAssetSnapshot>();
    const assumptions = options.mode === 'EXPLORATORY'
      ? ['Deployment allowed and no critical alert assumed; historical gate/alert logs unavailable.',
        'Deposit capacity is a modeled quota equal to the requested position; it is not TVL.',
        'Historical idle inventory valued with official FX is a withdrawal proxy, not maxWithdraw; token FX basis remains uncertain.',
        'Curve route liquidity is a present-day calibrated budget, not historical liquidity.',
        'USD funding access and USD₮0 intermediary access are assumed; no historical USDC yield vault is substituted.'] : [];
    if (options.riskMode === 'YIELD_ONLY') assumptions.push('YIELD_ONLY exploratory diagnostic: volatility deliberately set to zero.');
    for (const [asset, data] of [['ARGt', sample.argt], ['BRAt', sample.brat]] as const) {
      const missing = ['baseApr','incentiveApr','incentiveDaysLeft'].filter(key=>data[key as keyof HistoricalAssetSnapshot]===undefined);
      if (options.riskMode === 'TRAILING_FX' && data.fxVolatility30d===undefined) missing.push('fxVolatility30d');
      if (options.mode === 'STRICT') {
        for (const key of ['depositAvailable','depositCapacityUsd','criticalRisk','availableLiquidityUsd'] as const) if(data[key]===undefined) missing.push(key);
        for (const key of ['routeAvailable','routeSafe','routeLiquidityUsd'] as const) if(sample.curve?.[key]===undefined) missing.push(`curve.${key}`);
      }
      if (dataset.infrastructureStart===null || sample.timestamp<dataset.infrastructureStart) missing.push('SWAP_INFRASTRUCTURE_NOT_AVAILABLE');
      if (missing.length) { exclusions.push({asset,reasons:missing}); continue; }
      const snapshot: StrategySnapshot = { asset, protocol:'Morpho', baseApr:data.baseApr!, incentiveApr:data.incentiveApr!,
        incentiveDaysLeft:data.incentiveDaysLeft!, expectedFxReturn30d:0,
        fxVolatility30d:options.riskMode==='YIELD_ONLY'?0:data.fxVolatility30d!,
        depositAvailable:data.depositAvailable??true,
        depositCapacityUsd:data.depositCapacityUsd??model.positionSizeUsd,
        criticalRisk:data.criticalRisk??false };
      snapshots.set(asset,snapshot);assetData.set(asset,data);
      candidates.push({id:asset,snapshot,route:{
        routeAvailable:sample.curve?.routeAvailable??true,
        routeSafe:sample.curve?.routeSafe??true,
        routeLiquidityUsd:sample.curve?.routeLiquidityUsd??options.modeledRouteLiquidityUsd!,
        estimatedSlippage:model.estimatedSlippagePct,
      }});
    }
    const scan = selectBestStrategy({candidates,depositAmountUsd:model.positionSizeUsd});
    const diagnostic = selectBestStrategy({candidates:candidates.map(c=>({...c,route:{...c.route,estimatedSlippage:0}})),depositAmountUsd:model.positionSizeUsd});
    exclusions.push(...scan.excluded.map(c=>({asset:c.snapshot.asset,reasons:c.reasons.map(r=>r.code)})));
    const result: ReplayRecord = { timestamp:sample.timestamp,action:'SKIP',selected:scan.selected?.snapshot.asset??null,current,
      ranking:scan.ranked.map(c=>({asset:c.snapshot.asset,netCarry30d:c.calculation.netCarry30d})),
      diagnosticRanking:diagnostic.ranked.map(c=>({asset:c.snapshot.asset,netCarry30d:c.calculation.netCarry30d})),
      exclusions,reason:'NO_ELIGIBLE_STRATEGIES',metadata:{marketData:'REAL',executionCosts:'MODELED',
        eligibility:options.mode==='STRICT'?'REAL_EVIDENCE_REQUIRED':'MODELED_AVAILABILITY',fxBaseline:dataset.decisionFxBaseline,riskMode:options.riskMode,assumptions} };
    if (scan.selected && current===null) {
      current=scan.selected.snapshot.asset; result.current=current;result.action='INITIAL_ALLOCATION';result.reason='BEST_ELIGIBLE_CARRY';
    } else if (scan.selected && current!==null) {
      const previous=snapshots.get(current), liquidity=assetData.get(current);
      if (!previous) result.reason='CURRENT_POSITION_DATA_MISSING';
      else {
        const available = liquidity?.availableLiquidityUsd??(options.mode==='EXPLORATORY'?liquidity?.idleLiquidityUsd:undefined);
        // Missing withdrawal evidence is not a zero observation, and cannot approve a move.
        if (available===undefined) result.reason='WITHDRAWAL_DATA_MISSING';
        else {
          const d=shouldRebalance({current:previous,target:scan.selected.snapshot,costs,
            execution:{positionSizeUsd:model.positionSizeUsd,withdrawable:available>=model.positionSizeUsd,withdrawableUsd:available,
              swapAvailable:scan.selected.route.routeAvailable,routeSafe:scan.selected.route.routeSafe,
              routeLiquidityUsd:scan.selected.route.routeLiquidityUsd},nowMs:sample.timestamp,lastNonEmergencyRebalanceAtMs:lastRebalance});
          result.decision=d;result.reason=d.reason;result.action=d.shouldRebalance?'REBALANCE':'HOLD';
          if(d.shouldRebalance){current=d.targetAsset;lastRebalance=sample.timestamp;result.current=current;}
        }
      }
    }
    records.push(result);
  }
  return records;
}

export function replayStatistics(records: readonly ReplayRecord[]) {
  let rankingChanges=0,diagnosticRankingChanges=0,last:Asset|null=null,lastDiagnostic:Asset|null=null;
  const selectedCounts:Partial<Record<Asset,number>>={};
  for(const row of records){
    if(row.selected){if(last&&last!==row.selected)rankingChanges++;last=row.selected;selectedCounts[row.selected]=(selectedCounts[row.selected]??0)+1;}
    const best=row.diagnosticRanking[0]?.asset;
    if(best){if(lastDiagnostic&&lastDiagnostic!==best)diagnosticRankingChanges++;lastDiagnostic=best;}
  }
  return {samples:records.length,rankingChanges,diagnosticRankingChanges,selectedCounts,
    holds:records.filter(r=>r.action==='HOLD').length,
    rebalances:records.filter(r=>r.action==='REBALANCE').length,
    candidateRebalances:records.filter(r=>r.decision&&r.decision.currentAsset!==r.decision.targetAsset&&r.decision.netBenefit>=r.decision.safetyMargin).length,
    cooldownBlocked:records.filter(r=>r.decision?.reason==='COOLDOWN_ACTIVE').length,
    ineligibleObservations:records.reduce((n,r)=>n+r.exclusions.length,0),
    skipped:records.filter(r=>r.action==='SKIP').length,
    allocations:records.filter(r=>r.action==='INITIAL_ALLOCATION').length };
}
