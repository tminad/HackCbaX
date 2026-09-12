import { effectiveApr, HORIZON_DAYS, netCarry30d, shouldRebalance } from '../domain/index.js';
import type { Asset, CarryResult, RebalanceDecision, StrategySnapshot, SwitchCostInputs } from '../domain/index.js';
import { selectBestStrategy } from '../services/opportunityScanner.js';
import type { InitialAllocationResult, ScanRequest } from '../services/opportunityScanner.js';
import { costs } from '../fixtures/scenarios.js';
import { mockMarket } from './mockMarket.js';
import type { Market } from './mockMarket.js';

export type Stage = 'IDLE' | 'SCANNING' | 'SELECTED' | 'DEPLOYING' | 'ACTIVE'
  | 'MARKET_CHANGE' | 'ANALYZING_REBALANCE' | 'HOLDING' | 'REBALANCING' | 'BLOCKED';
export const countries: Record<Asset, string> = { USDC: 'US Dollar', ARGt: 'Argentina', BRAt: 'Brazil' };
export interface Activity { id: number; at: number; message: string }
export interface ExecutionStep { label: string; status: 'pending' | 'active' | 'complete' }
export interface Evidence {
  decision: RebalanceDecision;
  current: CarryResult;
  target: CarryResult;
  costs: SwitchCostInputs;
}
export interface DemoState {
  stage: Stage;
  amount: number;
  scan: InitialAllocationResult | null;
  revealed: number;
  position: StrategySnapshot | null;
  positionCarry: CarryResult | null;
  market: Market;
  evidence: Evidence | null;
  steps: readonly ExecutionStep[];
  activity: readonly Activity[];
  lastRebalanceAt: number | null;
  message: string;
  error: string | null;
}
export type DemoAction = { type: 'START'; amount: number; at: number; request?: ScanRequest }
  | { type: 'TICK'; at: number }
  | { type: 'MARKET'; market: 'hold' | 'rebalance'; at: number }
  | { type: 'RESET' };

export const initialState = (): DemoState => ({ stage: 'IDLE', amount: 0, scan: null,
  revealed: 0, position: null, positionCarry: null, market: 'initial', evidence: null,
  steps: [], activity: [], lastRebalanceAt: null, message: '', error: null });

export const isBusy = (stage: Stage): boolean => !['IDLE', 'ACTIVE', 'HOLDING', 'BLOCKED'].includes(stage);
export const nominalApr = (snapshot: StrategySnapshot): number => effectiveApr({ ...snapshot, incentiveDaysLeft: HORIZON_DAYS });

function log(state: DemoState, at: number, message: string): DemoState {
  const id = (state.activity.at(-1)?.id ?? 0) + 1;
  return { ...state, activity: [...state.activity, { id, at, message }].slice(-60) };
}

export function initialExplanation(scan: InitialAllocationResult): string {
  const best = scan.selected;
  if (!best) return scan.explanation;
  const higherApr = scan.ranked.find(c => nominalApr(c.snapshot) > nominalApr(best.snapshot));
  return higherApr
    ? `${countries[best.snapshot.asset]} has a lower nominal APR than ${countries[higherApr.snapshot.asset]}, but a higher expected return after FX risk.`
    : `${countries[best.snapshot.asset]} has the highest expected 30-day carry among the eligible opportunities.`;
}

function holdExplanation(d: RebalanceDecision): string {
  if (d.reason === 'SAME_ASSET') return 'Your current strategy is still the best eligible opportunity.';
  if (d.reason === 'COOLDOWN_ACTIVE') return 'The 12-hour cooldown is active. Autopilot is keeping the current position.';
  if (d.reason === 'TARGET_INELIGIBLE') return 'The move is blocked by execution eligibility checks.';
  return d.netBenefit < 0 ? 'Moving would destroy value after execution costs.'
    : 'The improvement does not cover the required safety margin. Staying put is the better decision.';
}

/** This plan describes simulated execution only. It is not a transaction receipt. */
function executionPlan(target: StrategySnapshot, current: StrategySnapshot | null): readonly ExecutionStep[] {
  const labels = current
    ? [`Withdrawing ${current.asset} from ${current.protocol}`, `${current.asset} available`,
      `Swapping ${current.asset} → ${target.asset}`, `${target.asset} received`,
      `Depositing ${target.asset} into ${target.protocol}`, 'New position active']
    : target.asset === 'USDC'
      ? ['USDC available', `Depositing USDC into ${target.protocol}`, 'Position active']
      : ['USDC available', `Swapping USDC → ${target.asset}`, `${target.asset} received`,
        `Depositing ${target.asset} into ${target.protocol}`, 'Position active'];
  return labels.map((label, i) => ({ label, status: i === 0 ? 'active' : 'pending' }));
}

function tick(state: DemoState, at: number): DemoState {
  if (state.stage === 'SCANNING') {
    const count = (state.scan?.ranked.length ?? 0) + (state.scan?.excluded.length ?? 0);
    if (state.revealed < count) {
      const candidates = [...(state.scan?.ranked ?? []), ...(state.scan?.excluded ?? [])]
        .sort((a, b) => ['USDC', 'ARGt', 'BRAt'].indexOf(a.snapshot.asset) - ['USDC', 'ARGt', 'BRAt'].indexOf(b.snapshot.asset));
      const candidate = candidates[state.revealed];
      return log({ ...state, revealed: state.revealed + 1 }, at,
        `${countries[candidate!.snapshot.asset]} scanned · ${candidate!.eligible ? 'carry calculated, liquidity checked' : 'excluded by eligibility checks'}`);
    }
    if (!state.scan?.selected) return log({ ...state, stage: 'BLOCKED', message: state.scan?.explanation ?? 'No opportunities available.' }, at, 'No eligible strategy · funds remain unallocated');
    return log({ ...state, stage: 'SELECTED', message: initialExplanation(state.scan) }, at, `${countries[state.scan.selected.snapshot.asset]} selected by Net Carry`);
  }
  if (state.stage === 'SELECTED' && state.scan?.selected) {
    const steps = executionPlan(state.scan.selected.snapshot, null);
    return log({ ...state, stage: 'DEPLOYING', steps }, at, 'Deploying simulated capital');
  }
  if ((state.stage === 'DEPLOYING' || state.stage === 'REBALANCING') && state.scan?.selected) {
    const active = state.steps.findIndex(step => step.status === 'active');
    const steps = state.steps.map((step, i): ExecutionStep => ({ ...step,
      status: i <= active ? 'complete' : i === active + 1 ? 'active' : 'pending' }));
    let next = log({ ...state, steps }, at, `${state.steps[active]?.label} · simulated`);
    if (active === state.steps.length - 1) {
      const position = state.scan.selected.snapshot;
      next = { ...next, stage: 'ACTIVE', position, positionCarry: netCarry30d(position),
        lastRebalanceAt: state.stage === 'REBALANCING' ? at : state.lastRebalanceAt };
    }
    return next;
  }
  if (state.stage === 'MARKET_CHANGE') {
    const scan = selectBestStrategy(mockMarket(state.market, state.amount));
    const current = [...scan.ranked, ...scan.excluded].find(c => c.snapshot.asset === state.position?.asset)?.snapshot;
    return log({ ...state, scan, revealed: scan.ranked.length + scan.excluded.length,
      stage: 'ANALYZING_REBALANCE', position: current ?? state.position,
      positionCarry: current ? netCarry30d(current) : state.positionCarry }, at, 'Yield, FX, volatility and liquidity rechecked');
  }
  if (state.stage === 'ANALYZING_REBALANCE' && state.position) {
    const target = state.scan?.selected;
    if (!target) return log({ ...state, stage: 'HOLDING', message: 'No eligible destination. Your current position stays unchanged.' }, at, 'HOLD · no eligible destination');
    const decision = shouldRebalance({ current: state.position, target: target.snapshot,
      costs: { ...costs, slippagePct: target.route.estimatedSlippage },
      execution: { positionSizeUsd: state.amount, withdrawable: true, withdrawableUsd: state.amount,
        swapAvailable: target.route.routeAvailable, routeSafe: target.route.routeSafe,
        routeLiquidityUsd: target.route.routeLiquidityUsd },
      nowMs: at, lastNonEmergencyRebalanceAtMs: state.lastRebalanceAt });
    const evidence = { decision, current: netCarry30d(state.position), target: target.calculation,
      costs: { ...costs, slippagePct: target.route.estimatedSlippage } };
    return log({ ...state, evidence,
      stage: decision.shouldRebalance ? 'REBALANCING' : 'HOLDING',
      steps: decision.shouldRebalance ? executionPlan(target.snapshot, state.position) : [],
      message: decision.shouldRebalance ? 'The expected improvement covers moving costs and the safety margin. Autopilot is moving your simulated capital.' : holdExplanation(decision),
    }, at, `${decision.action} ${decision.shouldRebalance ? decision.targetAsset : decision.currentAsset} · switching costs checked`);
  }
  return state;
}

/** All clock ticks are supplied as events: deterministic and independently testable. */
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === 'RESET') return initialState();
  try {
    if (action.type === 'START' && state.stage === 'IDLE') {
      const scan = selectBestStrategy({ ...(action.request ?? mockMarket('initial', action.amount)), depositAmountUsd: action.amount });
      return log({ ...initialState(), stage: 'SCANNING', amount: action.amount, scan }, action.at, 'Autopilot started · scanning three mock markets');
    }
    if (action.type === 'MARKET' && state.position && !isBusy(state.stage)) {
      return log({ ...state, stage: 'MARKET_CHANGE', market: action.market, evidence: null,
        steps: [], message: 'Market change detected. Evaluating the new opportunity.' }, action.at, 'MARKET CHANGE DETECTED · injected demo snapshot');
    }
    if (action.type === 'TICK') return tick(state, action.at);
    return state;
  } catch (error) {
    return { ...state, stage: state.position ? 'HOLDING' : 'IDLE',
      error: error instanceof Error ? error.message : 'Unable to evaluate this deposit.' };
  }
}
