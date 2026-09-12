import { initialAllocationFixture } from '../fixtures/initialAllocation.js';
import { holdScenario, rebalanceScenario } from '../fixtures/scenarios.js';
import type { ScanRequest } from '../services/opportunityScanner.js';

export type Market = 'initial' | 'hold' | 'rebalance';

/** Replace this fixture provider with normalized adapter snapshots later. */
export function mockMarket(market: Market, amount: number): ScanRequest {
  const request = structuredClone(initialAllocationFixture);
  return {
    ...request, depositAmountUsd: amount,
    candidates: request.candidates.map(candidate => ({ ...candidate,
      snapshot: market !== 'initial' && candidate.snapshot.asset === 'ARGt'
        ? { ...(market === 'hold' ? holdScenario.target : rebalanceScenario.target) }
        : candidate.snapshot,
    })),
  };
}
