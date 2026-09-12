import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveApr, netCarry30d, checkEligibility, estimateSwitchCost, shouldRebalance, breakEvenDays, SAFETY_MARGIN, MAX_SLIPPAGE } from '../dist/domain/index.js';
import { opportunities, execution, costs, holdScenario, rebalanceScenario } from '../dist/fixtures/scenarios.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const base = opportunities.BRAt;

for (const [label, incentiveApr, days, expected] of [
  ['no incentives', 0, 0, 0.12],
  ['full 30 days', 0.06, 30, 0.18],
  ['15 days', 0.06, 15, 0.15],
  ['expired', 0.06, 0, 0.12],
  ['capped at horizon', 0.06, 90, 0.18],
]) {
  test(`APR and carry: ${label}`, () => {
    const input = { ...base, incentiveApr, incentiveDaysLeft: days };
    near(effectiveApr(input), expected);
    const result = netCarry30d(input);
    near(result.effectiveApr, expected);
    near(result.yield30d, expected * 30 / 365);
    near(result.riskBuffer, 0.002);
    near(result.netCarry30d, expected * 30 / 365 - 0.004);
  });
}

for (const fx of [-0.02, 0, 0.02]) {
  test(`FX is signed against USD: ${fx}`, () => {
    near(netCarry30d({ ...base, expectedFxReturn30d: fx }).netCarry30d, 0.12 * 30 / 365 + fx - 0.002);
  });
}
for (const riskFactor of [0, 0.1, 0.25, 0.5]) {
  test(`risk factor ${riskFactor}`, () => {
    const result = netCarry30d(base, riskFactor);
    near(result.riskBuffer, 0.008 * riskFactor);
    near(result.netCarry30d, 0.12 * 30 / 365 - 0.002 - 0.008 * riskFactor);
  });
}
test('USDC has zero FX and risk buffer; negative base yield is supported', () => {
  near(netCarry30d(opportunities.USDC).netCarry30d, 0.05 * 30 / 365);
  near(netCarry30d({ ...opportunities.USDC, baseApr: -0.01 }).netCarry30d, -0.01 * 30 / 365);
});

const gates = [
  ['excessive slippage', {}, {}, MAX_SLIPPAGE + 1e-9, 'EXCESSIVE_SLIPPAGE'],
  ['unavailable route', {}, { swapAvailable: false }, 0, 'SWAP_UNAVAILABLE'],
  ['unsafe route', {}, { routeSafe: false }, 0, 'UNSAFE_ROUTE'],
  ['withdrawal unavailable', {}, { withdrawable: false }, 0, 'WITHDRAWAL_UNAVAILABLE'],
  ['partial withdrawal', {}, { withdrawableUsd: 999 }, 0, 'WITHDRAWAL_UNAVAILABLE'],
  ['critical risk', { criticalRisk: true }, {}, 0, 'CRITICAL_RISK'],
  ['deposit unavailable', { depositAvailable: false }, {}, 0, 'DEPOSIT_UNAVAILABLE'],
  ['unknown protocol', { protocol: 'Unknown' }, {}, 0, 'PROTOCOL_NOT_WHITELISTED'],
  ['vault capacity', { depositCapacityUsd: 999 }, {}, 0, 'INSUFFICIENT_LIQUIDITY'],
  ['route liquidity', {}, { routeLiquidityUsd: 999 }, 0, 'INSUFFICIENT_LIQUIDITY'],
];
for (const [label, targetPatch, executionPatch, slippage, reason] of gates) {
  test(`eligibility and rebalance gate: ${label}`, () => {
    const target = { ...rebalanceScenario.target, ...targetPatch };
    const route = { ...execution, ...executionPatch };
    const result = checkEligibility(target, route, slippage);
    assert.equal(result.eligible, false);
    assert.ok(result.ineligibilityReasons.includes(reason));
    const decision = shouldRebalance({ ...rebalanceScenario, target, execution: route, costs: { ...costs, slippagePct: slippage } });
    assert.equal(decision.shouldRebalance, false);
    assert.equal(decision.reason, 'TARGET_INELIGIBLE');
  });
}
test('inclusive slippage and liquidity limits', () => {
  assert.equal(checkEligibility({ ...base, depositCapacityUsd: 1_000 }, { ...execution, routeLiquidityUsd: 1_000 }, MAX_SLIPPAGE).eligible, true);
});
test('all eligibility failures are retained', () => {
  const result = checkEligibility({ ...base, criticalRisk: true, depositAvailable: false }, { ...execution, swapAvailable: false }, 0.01);
  assert.equal(result.ineligibilityReasons.length, 4);
});

test('switch cost includes every component, without changing carry', () => {
  near(estimateSwitchCost(costs).totalPct, 0.0015);
  const a = shouldRebalance(rebalanceScenario);
  const b = shouldRebalance({ ...rebalanceScenario, costs: { ...costs, gasCostPct: 0.01 } });
  near(a.carryImprovement, b.carryImprovement);
  assert.equal(b.action, 'HOLD');
});
test('target worse than current: HOLD', () => {
  const d = shouldRebalance({ ...holdScenario, target: opportunities.USDC });
  assert.ok(d.carryImprovement < 0);
  assert.equal(d.action, 'HOLD');
  assert.equal(d.breakEvenDays, null);
});
test('spec fixture: costs erase a positive advantage', () => {
  const d = shouldRebalance(holdScenario);
  near(netCarry30d(holdScenario.current).netCarry30d, 0.005863013698630137);
  near(netCarry30d(holdScenario.target).netCarry30d, 0.006972602739726027);
  near(d.netBenefit, -0.00039041095890411);
  assert.ok(d.carryImprovement > 0);
  assert.equal(d.reason, 'INSUFFICIENT_BENEFIT');
  assert.equal(d.action, 'HOLD');
});
test('positive benefit below safety margin: HOLD', () => {
  const d = shouldRebalance({ ...holdScenario, costs: { gasCostPct: 0, swapFeesPct: 0, slippagePct: 0, otherExecutionFeesPct: 0 } });
  assert.ok(d.netBenefit > 0 && d.netBenefit < SAFETY_MARGIN);
  assert.equal(d.action, 'HOLD');
});
test('spec changed-market fixture: REBALANCE', () => {
  const d = shouldRebalance(rebalanceScenario);
  assert.equal(d.action, 'REBALANCE');
  assert.equal(d.shouldRebalance, true);
  near(d.netBenefit, 0.00360958904109589);
  // Exact fixture advantage is 373/73000; 0.0015 * 30 / advantage = 3285/373.
  near(d.breakEvenDays, 3285 / 373);
});
for (const [delta, expected] of [[-1e-12, false], [0, true], [1e-12, true]]) {
  test(`inclusive safety margin boundary, delta ${delta}`, () => {
    const current = { ...opportunities.USDC, baseApr: 0, expectedFxReturn30d: 0.006 };
    const target = { ...current, asset: 'ARGt', expectedFxReturn30d: 0.01 + delta };
    const decision = shouldRebalance({ ...holdScenario, current, target, costs: { gasCostPct: 0.002, swapFeesPct: 0, slippagePct: 0, otherExecutionFeesPct: 0 } });
    assert.equal(decision.shouldRebalance, expected);
  });
}
for (const [elapsed, expected] of [[0, false], [12 * 3600000 - 1, false], [12 * 3600000, true], [13 * 3600000, true]]) {
  test(`cooldown elapsed ${elapsed}ms`, () => {
    assert.equal(shouldRebalance({ ...rebalanceScenario, lastNonEmergencyRebalanceAtMs: rebalanceScenario.nowMs - elapsed }).shouldRebalance, expected);
  });
}
test('same asset never moves even in emergency', () => {
  assert.equal(shouldRebalance({ ...holdScenario, target: holdScenario.current, emergency: true }).reason, 'SAME_ASSET');
});
for (const flag of ['current', 'external']) {
  test(`emergency (${flag}) exits to USDC despite cooldown and negative benefit`, () => {
    const d = shouldRebalance({ ...holdScenario, current: { ...base, criticalRisk: flag === 'current' }, emergency: flag === 'external', target: opportunities.USDC, lastNonEmergencyRebalanceAtMs: holdScenario.nowMs });
    assert.equal(d.action, 'EMERGENCY_EXIT');
    assert.equal(d.shouldRebalance, true);
    assert.ok(d.netBenefit < 0);
  });
}
test('emergency requires USDC', () => {
  assert.equal(shouldRebalance({ ...rebalanceScenario, emergency: true }).reason, 'EMERGENCY_REQUIRES_USDC');
});
for (const [label, targetPatch, executionPatch, slippage] of gates) {
  test(`emergency still enforces ${label}`, () => {
    const d = shouldRebalance({ ...holdScenario, emergency: true, target: { ...opportunities.USDC, ...targetPatch }, execution: { ...execution, ...executionPatch }, costs: { ...costs, slippagePct: slippage } });
    assert.equal(d.shouldRebalance, false);
    assert.equal(d.reason, 'TARGET_INELIGIBLE');
  });
}
test('break-even uses annualized advantage, handles zero costs and no advantage', () => {
  near(breakEvenDays(0.002, 0.1), 7.3);
  assert.equal(breakEvenDays(0, 0.1), 0);
  assert.equal(breakEvenDays(0.002, 0), null);
  assert.equal(breakEvenDays(0.002, -0.1), null);
  assert.equal(breakEvenDays(0, 0), null);
});

for (const invalid of [NaN, Infinity, -Infinity]) {
  test(`non-finite inputs rejected: ${invalid}`, () => {
    for (const key of ['baseApr', 'incentiveApr', 'incentiveDaysLeft', 'expectedFxReturn30d', 'fxVolatility30d']) {
      assert.throws(() => netCarry30d({ ...base, [key]: invalid }), RangeError);
    }
    assert.throws(() => netCarry30d(base, invalid), RangeError);
    for (const key of Object.keys(costs)) assert.throws(() => estimateSwitchCost({ ...costs, [key]: invalid }), RangeError);
    for (const key of ['positionSizeUsd', 'withdrawableUsd', 'routeLiquidityUsd']) assert.throws(() => checkEligibility(base, { ...execution, [key]: invalid }, 0), RangeError);
    assert.throws(() => checkEligibility({ ...base, depositCapacityUsd: invalid }, execution, 0), RangeError);
    assert.throws(() => checkEligibility(base, execution, invalid), RangeError);
    assert.throws(() => shouldRebalance({ ...holdScenario, nowMs: invalid }), RangeError);
    assert.throws(() => shouldRebalance({ ...holdScenario, lastNonEmergencyRebalanceAtMs: invalid }), RangeError);
    assert.throws(() => breakEvenDays(invalid, 0.1), RangeError);
    assert.throws(() => breakEvenDays(0.1, invalid), RangeError);
  });
}
test('negative magnitudes and invalid timestamps rejected', () => {
  for (const key of ['incentiveApr', 'incentiveDaysLeft', 'fxVolatility30d']) assert.throws(() => netCarry30d({ ...base, [key]: -1 }), RangeError);
  assert.throws(() => netCarry30d(base, -1), RangeError);
  for (const key of Object.keys(costs)) assert.throws(() => estimateSwitchCost({ ...costs, [key]: -1 }), RangeError);
  for (const key of ['positionSizeUsd', 'withdrawableUsd', 'routeLiquidityUsd']) assert.throws(() => checkEligibility(base, { ...execution, [key]: -1 }, 0), RangeError);
  assert.throws(() => checkEligibility(base, { ...execution, positionSizeUsd: 0 }, 0), RangeError);
  assert.throws(() => checkEligibility({ ...base, depositCapacityUsd: -1 }, execution, 0), RangeError);
  assert.throws(() => checkEligibility(base, execution, -1), RangeError);
  assert.throws(() => breakEvenDays(-1, 0.1), RangeError);
  assert.throws(() => shouldRebalance({ ...holdScenario, nowMs: -1 }), RangeError);
  assert.throws(() => shouldRebalance({ ...holdScenario, lastNonEmergencyRebalanceAtMs: -1 }), RangeError);
  assert.throws(() => shouldRebalance({ ...holdScenario, lastNonEmergencyRebalanceAtMs: holdScenario.nowMs + 1 }), RangeError);
});
test('overflow is rejected', () => {
  assert.throws(() => effectiveApr({ baseApr: Number.MAX_VALUE, incentiveApr: Number.MAX_VALUE, incentiveDaysLeft: 30 }), RangeError);
  assert.throws(() => estimateSwitchCost({ ...costs, gasCostPct: Number.MAX_VALUE, swapFeesPct: Number.MAX_VALUE }), RangeError);
});
test('missing execution evidence fails closed', () => {
  assert.equal(checkEligibility(base, { ...execution, swapAvailable: undefined }, 0).eligible, false);
  assert.throws(() => checkEligibility(base, { ...execution, routeLiquidityUsd: undefined }, 0), RangeError);
});
test('pure deterministic evaluation does not mutate caller data', () => {
  const input = structuredClone(rebalanceScenario);
  for (const value of Object.values(input)) if (value && typeof value === 'object') Object.freeze(value);
  Object.freeze(input);
  const before = structuredClone(input);
  assert.deepEqual(shouldRebalance(input), shouldRebalance(input));
  assert.deepEqual(input, before);
});
