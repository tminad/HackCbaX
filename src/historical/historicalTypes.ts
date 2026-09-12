import type { Asset } from '../domain/index.js';

/** All timestamps are UTC epoch milliseconds; rates are decimal fractions. */
export interface Observation { timestamp: number; availableAt: number; value: number; source: string }
export interface CampaignHistory {
  id: string; start: number; end: number; createdAt: number; hasOverrides: boolean;
  apr: Observation[]; tvl: Observation[];
}
export interface AssetHistory {
  asset: Asset; token: string; vault: string; creationTimestamp: number;
  baseApr: Observation[]; reportedNetApy: Observation[];
  totalAssets: Observation[]; idleAssets: Observation[]; tvlUsd: Observation[];
  fx: Observation[]; campaigns: CampaignHistory[];
}
export interface HistoricalAssetSnapshot {
  baseApr?: number; incentiveApr?: number; incentiveDaysLeft?: number;
  tvlUsd?: number; tvlUsdBasis?: 'SOURCE_USD' | 'OFFICIAL_FX_PROXY'; totalAssets?: number; idleAssets?: number;
  idleLiquidityUsd?: number; availableLiquidityUsd?: number;
  usdPrice?: number; usdReturnObservation?: number; fxVolatility30d?: number;
  fxObservationTimestamp?: number;
  /** These require actual historical evidence. Discovery does not invent them. */
  depositAvailable?: boolean; depositCapacityUsd?: number; criticalRisk?: boolean;
  sources: string[];
  missing: string[];
}
export interface HistoricalMarketSnapshot {
  timestamp: number;
  argt: HistoricalAssetSnapshot;
  brat: HistoricalAssetSnapshot;
  curve?: { argtUsdt0Price?: number; bratUsdt0Price?: number; argtBratPrice?: number;
    tvlUsd?: number; realFeePct?: number; routeLiquidityUsd?: number; routeAvailable?: boolean; routeSafe?: boolean };
}
export interface HistoricalDataset {
  schemaVersion: 1; retrievedAt: string; infrastructureStart: number | null;
  decisionFxBaseline: 'NEUTRAL FX BASELINE — PRE-AI';
  snapshots: HistoricalMarketSnapshot[];
  /** Detailed source series live in source-history.json to avoid duplicating them. */
  sourceHistoryFile?: string;
  notes: string[];
}
