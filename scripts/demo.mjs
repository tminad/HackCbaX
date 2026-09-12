import { checkEligibility, netCarry30d, shouldRebalance } from '../dist/domain/index.js';
import { opportunities, execution, costs, holdScenario, rebalanceScenario } from '../dist/fixtures/scenarios.js';
import { selectBestStrategy } from '../dist/services/opportunityScanner.js';
import { initialAllocationFixture } from '../dist/fixtures/initialAllocation.js';

const pct = value => `${(value * 100).toFixed(4)}%`;
const initial = selectBestStrategy(initialAllocationFixture);
console.log('Synthetic initial allocation: $1,000 USDC deposit');
console.table(initial.ranked.map(({ snapshot, calculation, rank }) => ({
  rank, asset: snapshot.asset, nominalApr: pct(snapshot.baseApr + snapshot.incentiveApr),
  effectiveApr: pct(calculation.effectiveApr), yield30d: pct(calculation.yield30d),
  expectedFx: pct(snapshot.expectedFxReturn30d), riskBuffer: pct(calculation.riskBuffer),
  netCarry30d: pct(calculation.netCarry30d),
})));
console.log(initial.explanation);
console.log('Synthetic fixtures: $1,000 position; all returns are estimates.');
console.table(Object.values(opportunities).map(strategy => {
  const carry = netCarry30d(strategy);
  return {
    asset: strategy.asset, baseApr: pct(strategy.baseApr), incentiveApr: pct(strategy.incentiveApr),
    effectiveApr: pct(carry.effectiveApr), expectedFx: pct(strategy.expectedFxReturn30d),
    volatility: pct(strategy.fxVolatility30d), riskBuffer: pct(carry.riskBuffer),
    netCarry30d: pct(carry.netCarry30d), eligible: checkEligibility(strategy, execution, costs.slippagePct).eligible,
  };
}));
for (const scenario of [holdScenario, rebalanceScenario]) {
  const d = shouldRebalance(scenario);
  console.log(`${d.action}: ${d.currentAsset} -> ${d.targetAsset}; improvement ${pct(d.carryImprovement)}; cost ${pct(d.switchCost)}; net benefit ${pct(d.netBenefit)}; required ${pct(d.safetyMargin)}; break-even ${d.breakEvenDays?.toFixed(2) ?? 'n/a'} days; ${d.reason}`);
}
