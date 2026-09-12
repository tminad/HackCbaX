import type { AssetHistory, HistoricalAssetSnapshot, HistoricalMarketSnapshot, Observation } from './historicalTypes.js';

const DAY = 86_400_000;
export function commonStart(availability: readonly (number | null)[]): number | null {
  if (!availability.length || availability.some(x => x === null || !Number.isFinite(x))) return null;
  return Math.max(...availability as number[]);
}
export function asOf(series: readonly Observation[], timestamp: number, maxAgeMs: number): Observation | undefined {
  return series.filter(p => p.timestamp <= timestamp && p.availableAt <= timestamp && timestamp - p.timestamp <= maxAgeMs)
    .sort((a,b) => b.timestamp-a.timestamp)[0];
}
/** Sample stdev of log returns per sqrt(calendar day), projected to 30 days.
 * Minimum 20 returns, trailing 60 calendar days; only fully published observations.
 */
export function trailingVolatility30d(series: readonly Observation[], timestamp: number): number | undefined {
  const past = series.filter(p => p.availableAt <= timestamp && p.timestamp <= timestamp && p.timestamp >= timestamp - 60 * DAY).sort((a,b) => a.timestamp-b.timestamp);
  const returns: number[] = [];
  for (let i = 1; i < past.length; i++) {
    const a = past[i-1]!, b = past[i]!;
    if (a.value <= 0 || b.value <= 0 || b.timestamp <= a.timestamp) throw new RangeError('Invalid FX time series');
    const days = (b.timestamp-a.timestamp)/DAY;
    if (days > 7) return undefined;
    returns.push(Math.log(b.value/a.value)/Math.sqrt(days));
  }
  if (returns.length < 20) return undefined;
  const mean = returns.reduce((a,b)=>a+b,0)/returns.length;
  return Math.sqrt(returns.reduce((sum,r)=>sum+(r-mean)**2,0)/(returns.length-1))*Math.sqrt(30);
}

function assetSnapshot(history: AssetHistory, timestamp: number): HistoricalAssetSnapshot {
  const result: HistoricalAssetSnapshot = { sources: [], missing: [] };
  if (timestamp < history.creationTimestamp) { result.missing.push('VAULT_NOT_DEPLOYED'); return result; }
  const set = (key: 'baseApr' | 'totalAssets' | 'idleAssets' | 'tvlUsd', series: Observation[]) => {
    const obs = asOf(series, timestamp, 3_600_000);
    if (obs) { result[key] = obs.value; result.sources.push(obs.source); }
  };
  set('baseApr', history.baseApr); set('totalAssets', history.totalAssets); set('idleAssets', history.idleAssets); set('tvlUsd', history.tvlUsd);
  // Prefer independently recorded USD TVL to a fiat-proxy valuation when available.
  if (result.tvlUsd === undefined) {
    const tvl = asOf(history.campaigns.filter(c => c.createdAt <= timestamp)
      .flatMap(c => c.tvl.filter(p => p.timestamp >= c.start && p.timestamp < c.end)), timestamp, 2 * DAY);
    if (tvl) { result.tvlUsd = tvl.value; result.sources.push(tvl.source); }
  }
  if (result.tvlUsd !== undefined) result.tvlUsdBasis = 'SOURCE_USD';
  const price = asOf(history.fx, timestamp, 5 * DAY);
  if (price) {
    result.usdPrice = price.value; result.fxObservationTimestamp = price.timestamp; result.sources.push(price.source);
    const previous = asOf(history.fx.filter(x => x.timestamp < price.timestamp), timestamp, 10 * DAY);
    if (previous) result.usdReturnObservation = price.value/previous.value-1;
    const vol = trailingVolatility30d(history.fx, timestamp);
    if (vol !== undefined) result.fxVolatility30d = vol;
    if (result.tvlUsd === undefined && result.totalAssets !== undefined) {
      result.tvlUsd = result.totalAssets * price.value; result.tvlUsdBasis = 'OFFICIAL_FX_PROXY';
    }
    if (result.idleAssets !== undefined) result.idleLiquidityUsd = result.idleAssets * price.value;
  }
  const campaigns = history.campaigns.filter(c => c.createdAt <= timestamp && c.start <= timestamp && timestamp < c.end);
  if (campaigns.length === 1) {
    const campaign = campaigns[0]!;
    const reward = asOf(campaign.apr.filter(p => p.timestamp >= campaign.start), timestamp, 2 * DAY);
    if (reward) { result.incentiveApr = reward.value; result.sources.push(reward.source); }
    if (!campaign.hasOverrides) result.incentiveDaysLeft = (campaign.end-timestamp)/DAY;
    else result.missing.push('HISTORICAL_INCENTIVE_END_HAS_OVERRIDES');
  } else if (!campaigns.length) {
    // Only claim zero incentives if the source's native and total yields agree.
    const native = asOf(history.baseApr, timestamp, 3_600_000);
    const net = asOf(history.reportedNetApy, timestamp, 3_600_000);
    // Zero/zero is unambiguous; a nonzero APY/APR comparison is not.
    if (native?.value === 0 && net?.value === 0) { result.incentiveApr = 0; result.incentiveDaysLeft = 0; }
  } else result.missing.push('MULTIPLE_CAMPAIGNS_REQUIRE_SEPARATE_PERSISTENCE');
  for (const key of ['baseApr','incentiveApr','incentiveDaysLeft','fxVolatility30d','availableLiquidityUsd','depositAvailable','criticalRisk'] as const) {
    if (result[key] === undefined) result.missing.push(key);
  }
  result.sources = [...new Set(result.sources)];
  return result;
}
export function buildHistoricalSnapshots(assets: { ARGt: AssetHistory; BRAt: AssetHistory }, start: number, end: number): HistoricalMarketSnapshot[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new RangeError('Invalid historical window');
  const timestamps = [...new Set([...assets.ARGt.baseApr, ...assets.BRAt.baseApr].map(p => p.timestamp))]
    .filter(t => t >= start && t <= end && t % 3_600_000 === 0).sort((a,b)=>a-b);
  return timestamps.map(timestamp => ({ timestamp, argt: assetSnapshot(assets.ARGt,timestamp), brat: assetSnapshot(assets.BRAt,timestamp) }));
}
