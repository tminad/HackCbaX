import { fetchJson, numeric, record, rows } from '../http.js';
import type { CampaignHistory, Observation } from '../../historical/historicalTypes.js';
import { percentageAprToDecimal } from '../morpho/normalization.js';

export async function campaignHistory(opportunityId: string): Promise<CampaignHistory[]> {
  const campaigns: unknown[] = [];
  for (let page = 0; page < 10; page++) {
    const batch = rows(await fetchJson(`https://api.merkl.xyz/v4/campaigns?opportunityId=${opportunityId}&items=100&page=${page}`));
    campaigns.push(...batch);
    if (batch.length < 100) break;
    if (page === 9) throw new Error('Merkl pagination incomplete');
  }
  const result: CampaignHistory[] = [];
  for (const item of campaigns) {
    const c = record(item);
    if (c.opportunityId !== opportunityId) throw new Error('Merkl filter mismatch');
    const url = `https://api.merkl.xyz/v4/campaigns/${c.id}/metrics`;
    const metrics = record(await fetchJson(url));
    const normalize = (items: unknown, key: string, transform: (v: number) => number): Observation[] => rows(items).flatMap(item => {
      const row = record(item);
      if (row[key] === null || row[key] === undefined) return [];
      const timestamp = numeric(row.timestamp) * 1000;
      // Daily metrics can summarize the whole bucket. Do not make them available at its opening.
      return [{ timestamp, availableAt: timestamp + 86_400_000, value: transform(numeric(row[key])), source: url }];
    }).sort((a,b) => a.timestamp-b.timestamp);
    result.push({ id: String(c.id), start: numeric(c.startTimestamp) * 1000, end: numeric(c.endTimestamp) * 1000,
      createdAt: Date.parse(String(c.createdAt)), hasOverrides: c.hasOverrides !== false,
      apr: normalize(metrics.aprRecords, 'apr', percentageAprToDecimal), tvl: normalize(metrics.tvlRecords, 'total', x => x) });
  }
  return result;
}
