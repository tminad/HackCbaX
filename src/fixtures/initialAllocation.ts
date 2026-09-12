import type { ScanRequest } from "../services/opportunityScanner.js";
import { opportunities } from "./scenarios.js";

/** Separate initial market from the existing HOLD/REBALANCE fixtures. */
export const initialAllocationFixture: ScanRequest = {
  depositAmountUsd: 1_000,
  candidates: Object.values(opportunities).map(snapshot => ({
    id: `mock-${snapshot.asset}`,
    snapshot: snapshot.asset === "ARGt" ? { ...snapshot, expectedFxReturn30d: -0.0085 } : { ...snapshot },
    route: {
      routeAvailable: true,
      routeSafe: true,
      routeLiquidityUsd: 100_000,
      estimatedSlippage: snapshot.asset === "USDC" ? 0 : 0.0009,
    },
  })),
};
