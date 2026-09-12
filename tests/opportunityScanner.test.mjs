import test from 'node:test';
import assert from 'node:assert/strict';
import { scanOpportunities, selectBestStrategy } from '../dist/services/opportunityScanner.js';
import { initialAllocationFixture } from '../dist/fixtures/initialAllocation.js';
import { opportunities, holdScenario } from '../dist/fixtures/scenarios.js';
import { shouldRebalance } from '../dist/domain/index.js';

const fixture = () => structuredClone(initialAllocationFixture);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const candidate = (input, asset) => input.candidates.find(c => c.snapshot.asset === asset);

test('highest Net Carry wins and all eligible candidates rank best to worst', () => {
  const result = selectBestStrategy(fixture());
  assert.deepEqual(result.ranked.map(c => c.snapshot.asset), ['BRAt', 'USDC', 'ARGt']);
  assert.deepEqual(result.ranked.map(c => c.rank), [1, 2, 3]);
  assert.equal(result.selected.id, 'mock-BRAt');
  assert.equal(result.reason, 'BEST_ELIGIBLE_CARRY');
  assert.equal(result.excluded.length, 0);
});
test('ARGt highest nominal APR loses to BRAt after FX and risk buffer', () => {
  const result = selectBestStrategy(fixture());
  const arg = result.ranked.find(c => c.snapshot.asset === 'ARGt');
  const bra = result.selected;
  near(arg.snapshot.baseApr + arg.snapshot.incentiveApr, 0.17);
  near(bra.snapshot.baseApr + bra.snapshot.incentiveApr, 0.12);
  near(arg.calculation.netCarry30d, 0.002972602739726027);
  near(bra.calculation.netCarry30d, 0.005863013698630137);
  assert.match(result.explanation, /BRAt/);
});
test('complete UI breakdown includes original inputs, route evidence and unrounded calculations', () => {
  const result = selectBestStrategy(fixture());
  const bra = result.selected;
  near(bra.calculation.effectiveApr, 0.12);
  near(bra.calculation.yield30d, 0.12 * 30 / 365);
  near(bra.calculation.riskBuffer, 0.002);
  assert.equal(bra.snapshot.expectedFxReturn30d, -0.002);
  assert.equal(bra.snapshot.fxVolatility30d, 0.008);
  assert.equal(bra.snapshot.depositCapacityUsd, 100_000);
  assert.equal(bra.route.estimatedSlippage, 0.0009);
  assert.equal(result.depositAmountUsd, 1_000);
  assert.equal(result.riskFactor, 0.25);
  assert.equal(result.horizonDays, 30);
});
test('ineligible highest-carry candidate is ignored', () => {
  const input = fixture();
  candidate(input, 'ARGt').snapshot.expectedFxReturn30d = 0.1;
  candidate(input, 'ARGt').snapshot.criticalRisk = true;
  const result = selectBestStrategy(input);
  assert.equal(result.selected.snapshot.asset, 'BRAt');
  assert.equal(result.excluded[0].calculation, null);
  assert.equal(result.excluded[0].reasons[0].code, 'CRITICAL_RISK');
  assert.ok(result.excluded[0].reasons[0].message.length > 0);
});
test('only USDC eligible: direct deployment requires no swap or withdrawal fields', () => {
  const input = fixture();
  for (const c of input.candidates) if (c.snapshot.asset !== 'USDC') c.route.routeAvailable = false;
  const result = selectBestStrategy(input);
  assert.equal(result.selected.snapshot.asset, 'USDC');
  assert.equal(result.excluded.length, 2);
  assert.equal(result.ranked.length, 1);
});
test('no eligible candidates returns explicit non-allocation and all reasons', () => {
  const input = fixture();
  for (const c of input.candidates) c.snapshot.depositAvailable = false;
  const result = selectBestStrategy(input);
  assert.equal(result.selected, null);
  assert.equal(result.reason, 'NO_ELIGIBLE_STRATEGIES');
  assert.deepEqual(result.ranked, []);
  assert.equal(result.excluded.length, 3);
});
test('empty candidate list returns no selection', () => {
  assert.equal(selectBestStrategy({ candidates: [], depositAmountUsd: 1_000 }).selected, null);
});
test('ties use USDC, ARGt, BRAt, then stable ID regardless of input order', () => {
  const input = fixture();
  for (const c of input.candidates) c.snapshot = { ...opportunities.USDC, asset: c.snapshot.asset };
  input.candidates.push({ ...structuredClone(candidate(input, 'USDC')), id: 'aaa-usdc' });
  const expected = ['aaa-usdc', 'mock-USDC', 'mock-ARGt', 'mock-BRAt'];
  for (let i = 0; i < input.candidates.length; i++) {
    input.candidates.push(input.candidates.shift());
    assert.deepEqual(selectBestStrategy(input).ranked.map(c => c.id), expected);
  }
  input.candidates.reverse();
  assert.deepEqual(selectBestStrategy(input).ranked.map(c => c.id), expected);
});
test('ranking uses full precision, not rounded display or tie tolerance', () => {
  const input = fixture();
  for (const c of input.candidates) c.snapshot = { ...opportunities.USDC, asset: c.snapshot.asset };
  candidate(input, 'BRAt').snapshot.expectedFxReturn30d = 1e-12;
  assert.equal(selectBestStrategy(input).selected.snapshot.asset, 'BRAt');
});
test('initial allocation selects ARGt in the existing HOLD market without rebalance threshold or costs', () => {
  const input = fixture();
  candidate(input, 'ARGt').snapshot = { ...opportunities.ARGt };
  candidate(input, 'ARGt').route.estimatedSlippage = 0.005;
  assert.equal(selectBestStrategy(input).selected.snapshot.asset, 'ARGt');
  assert.equal(shouldRebalance(holdScenario).action, 'HOLD');
});
test('no minimum carry hurdle is imposed on initial selection', () => {
  const input = fixture();
  for (const c of input.candidates) c.snapshot = { ...c.snapshot, baseApr: 0, incentiveApr: 0, expectedFxReturn30d: -0.01, fxVolatility30d: 0 };
  const result = selectBestStrategy(input);
  assert.equal(result.selected.snapshot.asset, 'USDC');
  near(result.selected.calculation.netCarry30d, -0.01);
});
for (const [label, snapshotPatch, routePatch, code] of [
  ['protocol whitelist', { protocol: 'Unknown' }, {}, 'PROTOCOL_NOT_WHITELISTED'],
  ['deposit availability', { depositAvailable: false }, {}, 'DEPOSIT_UNAVAILABLE'],
  ['route availability', {}, { routeAvailable: false }, 'SWAP_UNAVAILABLE'],
  ['route safety', {}, { routeSafe: false }, 'UNSAFE_ROUTE'],
  ['route liquidity', {}, { routeLiquidityUsd: 999 }, 'INSUFFICIENT_LIQUIDITY'],
  ['vault capacity', { depositCapacityUsd: 999 }, {}, 'INSUFFICIENT_LIQUIDITY'],
  ['slippage', {}, { estimatedSlippage: 0.005000001 }, 'EXCESSIVE_SLIPPAGE'],
  ['critical risk', { criticalRisk: true }, {}, 'CRITICAL_RISK'],
]) {
  test(`initial eligibility gate: ${label}`, () => {
    const input = fixture();
    const bra = candidate(input, 'BRAt');
    Object.assign(bra.snapshot, snapshotPatch);
    Object.assign(bra.route, routePatch);
    const result = selectBestStrategy(input);
    assert.equal(result.selected.snapshot.asset, 'USDC');
    assert.ok(result.excluded[0].reasons.some(reason => reason.code === code && reason.message));
  });
}
test('all exclusion reasons retained and ineligible financial data is not calculated', () => {
  const input = fixture();
  const bra = candidate(input, 'BRAt');
  bra.snapshot.depositAvailable = false;
  bra.snapshot.criticalRisk = true;
  bra.snapshot.baseApr = NaN;
  bra.route.routeAvailable = false;
  const result = selectBestStrategy(input);
  assert.equal(result.excluded[0].reasons.length, 3);
  assert.equal(result.excluded[0].calculation, null);
});
test('exact liquidity and slippage boundaries accepted; requested amount controls gates', () => {
  const input = fixture();
  for (const c of input.candidates) {
    c.snapshot.depositCapacityUsd = 1_000;
    c.route.routeLiquidityUsd = 1_000;
    c.route.estimatedSlippage = 0.005;
  }
  assert.equal(scanOpportunities(input).ranked.length, 3);
  input.depositAmountUsd = 1_001;
  assert.equal(selectBestStrategy(input).selected, null);
});
test('custom risk factor is applied consistently', () => {
  const result = scanOpportunities({ ...fixture(), riskFactor: 0.5 });
  assert.equal(result.riskFactor, 0.5);
  const bra = result.ranked.find(c => c.snapshot.asset === 'BRAt');
  near(bra.calculation.riskBuffer, 0.004);
  assert.equal(result.ranked[0].snapshot.asset, 'USDC');
});
test('invalid request magnitudes and eligible financial inputs throw', () => {
  for (const depositAmountUsd of [0, -1, NaN, Infinity]) assert.throws(() => scanOpportunities({ ...fixture(), depositAmountUsd }), RangeError);
  for (const riskFactor of [-1, NaN, Infinity]) assert.throws(() => scanOpportunities({ ...fixture(), riskFactor }), RangeError);
  const input = fixture();
  candidate(input, 'BRAt').snapshot.baseApr = NaN;
  assert.throws(() => scanOpportunities(input), RangeError);
});
test('missing execution evidence cannot become eligible', () => {
  const input = fixture();
  delete candidate(input, 'BRAt').route.routeAvailable;
  assert.equal(selectBestStrategy(input).selected.snapshot.asset, 'USDC');
  delete candidate(input, 'USDC').route.estimatedSlippage;
  assert.throws(() => scanOpportunities(input), RangeError);
});
test('empty and duplicate IDs rejected instead of ambiguous tie-breaking', () => {
  const input = fixture();
  input.candidates[0].id = ' ';
  assert.throws(() => scanOpportunities(input), RangeError);
  input.candidates[0].id = input.candidates[1].id;
  assert.throws(() => scanOpportunities(input), RangeError);
});
test('scan is deterministic, does not mutate inputs, and snapshots are detached', () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = selectBestStrategy(input);
  assert.deepEqual(result, selectBestStrategy(input));
  assert.deepEqual(input, before);
  candidate(input, 'BRAt').snapshot.baseApr = 0.99;
  candidate(input, 'BRAt').route.routeSafe = false;
  assert.equal(result.selected.snapshot.baseApr, 0.12);
  assert.equal(result.selected.route.routeSafe, true);
});
