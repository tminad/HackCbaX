import { fetchJson, record, rows } from '../http.js';
export const CURVE_REGISTRY = 'https://api.curve.finance/v1/getPools/all/arbitrum';
export const ARBITRUM_RPC = 'https://arb1.arbitrum.io/rpc';

export async function curvePools(): Promise<Record<string, unknown>[]> {
  const result = record(await fetchJson(CURVE_REGISTRY));
  if (result.success !== true) throw new Error('Curve registry unavailable');
  return rows(record(result.data).poolData).map(record);
}
export async function rpc(method: string, params: unknown[]): Promise<string> {
  if (!['eth_call', 'eth_gasPrice', 'eth_blockNumber'].includes(method)) throw new Error('Read-only RPC methods only');
  const response = record(await fetchJson(ARBITRUM_RPC, { jsonrpc: '2.0', id: 1, method, params }));
  if (response.error || typeof response.result !== 'string') throw new Error(`RPC: ${JSON.stringify(response.error)}`);
  return response.result;
}
export async function poolFee(pool: string, block: string): Promise<number> {
  return Number(BigInt(await rpc('eth_call', [{ to: pool, data: '0xddca3f43' }, block]))) / 1e10;
}
export async function getDy(pool: string, i: number, j: number, amount: bigint, block: string): Promise<bigint> {
  const data = '0x556d6e9f' + [BigInt(i), BigInt(j), amount].map(x => x.toString(16).padStart(64, '0')).join('');
  return BigInt(await rpc('eth_call', [{ to: pool, data }, block]));
}
