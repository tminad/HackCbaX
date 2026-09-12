import { fetchJson, record, rows } from '../http.js';

export const MORPHO_ENDPOINT = 'https://api.morpho.org/graphql';
export async function morphoQuery(query: string): Promise<Record<string, unknown>> {
  const result = record(await fetchJson(MORPHO_ENDPOINT, { query }));
  if (result.errors) throw new Error(`Morpho: ${JSON.stringify(result.errors)}`);
  return record(result.data);
}
export async function discoverVaults(tokens: readonly string[]): Promise<{ v1: unknown[]; v2: unknown[] }> {
  const filters = `chainId_in:[42161],assetAddress_in:${JSON.stringify(tokens)}`;
  const data = await morphoQuery(`{vaults(first:100,where:{${filters}}){items{address name symbol asset{address symbol}}}
    vaultV2s(first:100,where:{${filters}}){items{address name symbol asset{address symbol decimals} creationTimestamp creationBlockNumber totalAssets totalAssetsUsd liquidity liquidityUsd apy netApy netApyExcludingRewards performanceFee managementFee listed}}}`);
  return { v1: rows(record(data.vaults).items), v2: rows(record(data.vaultV2s).items) };
}
export async function fetchVaultHistory(address: string, start: number, end: number): Promise<Record<string, unknown>> {
  const options = `options:{startTimestamp:${Math.floor(start / 1000)},endTimestamp:${Math.floor(end / 1000)},interval:HOUR}`;
  const data = await morphoQuery(`{vaultV2ByAddress(address:"${address}",chainId:42161){historicalState{
    avgApy(${options},lookbackHours:1){x y} avgNetApy(${options},lookbackHours:1){x y}
    totalAssets(${options}){x y} totalAssetsUsd(${options}){x y} idleAssets(${options}){x y}
  }}}`);
  return record(record(data.vaultV2ByAddress).historicalState);
}
