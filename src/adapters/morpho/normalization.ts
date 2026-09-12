import type { Observation } from '../../historical/historicalTypes.js';
import { numeric, record, rows } from '../http.js';

/** Equivalent simple APR at an explicitly selected compounding convention.
 * Hourly realized APY: periodsPerYear=8760. Never apply this to reward APR.
 */
export function apyToApr(apy: number, periodsPerYear: number): number {
  if (!Number.isFinite(apy) || apy <= -1 || !Number.isFinite(periodsPerYear) || periodsPerYear <= 0) throw new RangeError('Invalid APY convention');
  return periodsPerYear * Math.expm1(Math.log1p(apy) / periodsPerYear);
}
export function percentageAprToDecimal(apr: number): number {
  if (!Number.isFinite(apr)) throw new RangeError('APR must be finite');
  return apr / 100;
}

export function normalizeMorphoSeries(raw: unknown, source: string, transform: (value: number) => number = x => x): Observation[] {
  return rows(raw).flatMap(item => {
    const row = record(item);
    if (row.y === null || row.y === undefined) return [];
    const timestamp = numeric(row.x) * 1000;
    const value = transform(numeric(row.y));
    if (!Number.isFinite(value)) throw new RangeError('Normalization overflow');
    return [{ timestamp, availableAt: timestamp, value, source }];
  }).sort((a, b) => a.timestamp - b.timestamp);
}
