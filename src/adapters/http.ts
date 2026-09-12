/** Public read-only requests, bounded timeout, no credentials or wallet signing. */
export async function fetchJson(url: string, body?: unknown): Promise<unknown> {
  const response = await fetch(url, { headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(40_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected an object');
  return value as Record<string, unknown>;
}
export function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError('Expected an array');
  return value;
}
export function numeric(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') throw new TypeError('Expected numeric data');
  const number = Number(value);
  if (!Number.isFinite(number)) throw new RangeError('Non-finite source value');
  return number;
}
