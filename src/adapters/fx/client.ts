import { fetchJson, numeric, record, rows } from '../http.js';
import type { Observation } from '../../historical/historicalTypes.js';

export function fxObservation(date: string, localPerUsd: number, source: string): Observation {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || !Number.isFinite(localPerUsd) || localPerUsd <= 0) throw new RangeError('Invalid FX observation');
  return { timestamp, availableAt: timestamp + 86_400_000, value: 1 / localPerUsd, source };
}
export async function fetchFx(start: string, end: string): Promise<{ ARGt: Observation[]; BRAt: Observation[] }> {
  const arsUrl = 'https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial';
  const brlUrl = `https://api.frankfurter.dev/v1/${start}..${end}?base=USD&symbols=BRL`;
  const [ars, brl] = await Promise.all([fetchJson(arsUrl), fetchJson(brlUrl)]);
  return {
    ARGt: rows(ars).map(record).filter(r => String(r.fecha) >= start && String(r.fecha) <= end)
      .map(r => fxObservation(String(r.fecha), (numeric(r.compra) + numeric(r.venta)) / 2, arsUrl)),
    BRAt: Object.entries(record(record(brl).rates)).map(([date, value]) => fxObservation(date, numeric(record(value).BRL), brlUrl)),
  };
}
