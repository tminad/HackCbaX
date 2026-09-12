import { DEFAULT_RISK_FACTOR, HORIZON_DAYS, checkDeploymentEligibility, netCarry30d } from "../domain/index.js";
import type { Asset, CarryResult, DeploymentRoute, EligibilityReason, StrategySnapshot } from "../domain/index.js";
import { nonNegative, positive } from "../domain/validation.js";

/** Adapter boundary: normalized APR (not APY), decimal FX/rates, USD capacities.
 * IDs must be unique and stable across source ordering and refreshes.
 */
export interface OpportunityCandidate {
  readonly id: string;
  readonly snapshot: StrategySnapshot;
  readonly route: DeploymentRoute;
}

export interface ScanRequest {
  readonly candidates: readonly OpportunityCandidate[];
  readonly depositAmountUsd: number;
  readonly riskFactor?: number;
}

export interface RankedOpportunity extends OpportunityCandidate {
  readonly eligible: true;
  readonly rank: number;
  readonly calculation: CarryResult;
}

export interface ExcludedOpportunity extends OpportunityCandidate {
  readonly eligible: false;
  readonly calculation: null;
  readonly reasons: readonly { readonly code: EligibilityReason; readonly message: string }[];
}

export interface OpportunityScan {
  readonly depositAmountUsd: number;
  readonly horizonDays: number;
  readonly riskFactor: number;
  readonly ranked: readonly RankedOpportunity[];
  readonly excluded: readonly ExcludedOpportunity[];
}

export interface InitialAllocationResult extends OpportunityScan {
  readonly selected: RankedOpportunity | null;
  readonly reason: "BEST_ELIGIBLE_CARRY" | "NO_ELIGIBLE_STRATEGIES";
  readonly explanation: string;
}

const messages: Record<EligibilityReason, string> = {
  PROTOCOL_NOT_WHITELISTED: "The target protocol is not on the accepted protocol list.",
  DEPOSIT_UNAVAILABLE: "The target strategy cannot accept deposits.",
  WITHDRAWAL_UNAVAILABLE: "The existing position cannot be withdrawn sufficiently.",
  SWAP_UNAVAILABLE: "No swap or direct deployment route is available for this deposit.",
  UNSAFE_ROUTE: "The deployment route is flagged as unsafe.",
  EXCESSIVE_SLIPPAGE: "Estimated slippage exceeds the 0.50% limit.",
  CRITICAL_RISK: "The target has a critical risk alert or lacks risk clearance.",
  INSUFFICIENT_LIQUIDITY: "Route liquidity or deposit capacity cannot cover the full deposit.",
};

// Exact carry ties: defensive USDC first, then fixed asset order, then stable ID.
const tieOrder: Record<Asset, number> = { USDC: 0, ARGt: 1, BRAt: 2 };
const compareIds = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Pure synchronous scan; adapters collect/validate external data before calling. */
export function scanOpportunities(request: ScanRequest): OpportunityScan {
  const depositAmountUsd = positive("depositAmountUsd", request.depositAmountUsd);
  const riskFactor = nonNegative("riskFactor", request.riskFactor ?? DEFAULT_RISK_FACTOR);
  const ids = new Set<string>();
  const eligible: Omit<RankedOpportunity, "rank">[] = [];
  const excluded: ExcludedOpportunity[] = [];
  for (const candidate of request.candidates) {
    if (!candidate.id.trim() || ids.has(candidate.id)) throw new RangeError("Candidate IDs must be non-empty and unique");
    ids.add(candidate.id);
    const eligibility = checkDeploymentEligibility(candidate.snapshot, depositAmountUsd, candidate.route);
    // Return copies so later input refreshes cannot alter an earlier scan result.
    const snapshot = { ...candidate.snapshot };
    const route = { ...candidate.route };
    if (!eligibility.eligible) {
      excluded.push({ id: candidate.id, snapshot, route, eligible: false, calculation: null,
        reasons: eligibility.ineligibilityReasons.map(code => ({ code, message: messages[code] })),
      });
      continue;
    }
    eligible.push({ id: candidate.id, snapshot, route, eligible: true, calculation: netCarry30d(snapshot, riskFactor) });
  }
  eligible.sort((a, b) => b.calculation.netCarry30d - a.calculation.netCarry30d
    || tieOrder[a.snapshot.asset] - tieOrder[b.snapshot.asset] || compareIds(a.id, b.id));
  excluded.sort((a, b) => compareIds(a.id, b.id));
  return { depositAmountUsd, horizonDays: HORIZON_DAYS, riskFactor,
    ranked: eligible.map((candidate, index) => ({ ...candidate, rank: index + 1 })), excluded,
  };
}

/** Initial allocation only: no previous position, switching costs or cooldown. */
export function selectBestStrategy(request: ScanRequest): InitialAllocationResult {
  const scan = scanOpportunities(request);
  const selected = scan.ranked[0] ?? null;
  return { ...scan, selected,
    reason: selected ? "BEST_ELIGIBLE_CARRY" : "NO_ELIGIBLE_STRATEGIES",
    explanation: selected
      ? `${selected.snapshot.asset} has the highest expected 30-day carry among eligible strategies; exact ties use the documented fixed order.`
      : "No strategy can safely accept this deposit. No initial allocation was selected.",
  };
}
