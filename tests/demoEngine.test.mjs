import test from 'node:test';
import assert from 'node:assert/strict';
import { demoReducer, initialState, isBusy } from '../dist/application/demoEngine.js';
import { mockMarket } from '../dist/application/mockMarket.js';
import { shouldRebalance } from '../dist/domain/index.js';
import { holdScenario, rebalanceScenario } from '../dist/fixtures/scenarios.js';

const now = 1_800_000_000_000;
function start(amount = 1000, request) {
  return demoReducer(initialState(), { type: 'START', amount, at: now, request });
}
function settle(state) {
  let count = 0;
  while (isBusy(state.stage)) {
    assert.ok(count++ < 30, 'flow terminates');
    state = demoReducer(state, { type: 'TICK', at: (state.activity.at(-1)?.at ?? now) + 1000 });
  }
  return state;
}
const market = (state, name) => demoReducer(state, { type: 'MARKET', market: name, at: state.activity.at(-1).at + 1000 });

test('initial scan selects through core and only commits position after complete execution', () => {
  let state = start();
  const stages = [];
  while (isBusy(state.stage)) {
    stages.push(state.stage);
    assert.equal(state.position, null);
    state = demoReducer(state, { type: 'TICK', at: now + stages.length * 1000 });
  }
  assert.equal(state.stage, 'ACTIVE');
  assert.equal(state.position.asset, 'BRAt');
  assert.equal(state.amount, 1000);
  assert.ok(state.steps.every(step => step.status === 'complete'));
  assert.ok(stages.includes('SCANNING') && stages.includes('SELECTED') && stages.includes('DEPLOYING'));
  assert.equal(state.lastRebalanceAt, null);
  assert.match(state.message, /lower nominal APR than Argentina/);
});
test('initial winner is not hardcoded and USDC direct deployment skips swap', () => {
  const request = mockMarket('initial', 2500);
  request.candidates = request.candidates.map(c => ({ ...c, snapshot: { ...c.snapshot, depositAvailable: c.snapshot.asset === 'USDC' } }));
  const state = settle(start(2500, request));
  assert.equal(state.position.asset, 'USDC');
  assert.equal(state.amount, 2500);
  assert.ok(state.steps.every(step => !step.label.includes('Swapping')));
});
test('initial empty/no-eligible request never deploys and preserves excluded reasons', () => {
  const empty = settle(start(1000, { ...mockMarket('initial', 1000), candidates: [] }));
  assert.equal(empty.stage, 'BLOCKED');
  assert.equal(empty.position, null);
  const large = settle(start(100001));
  assert.equal(large.stage, 'BLOCKED');
  assert.equal(large.scan.excluded.length, 3);
  assert.equal(large.steps.length, 0);
});
test('HOLD scenario reproduces domain output and does not create an execution', () => {
  const active = settle(start());
  const state = settle(market(active, 'hold'));
  assert.equal(state.stage, 'HOLDING');
  assert.equal(state.position.asset, 'BRAt');
  assert.equal(state.steps.length, 0);
  assert.deepEqual(state.evidence.decision, shouldRebalance(holdScenario));
  assert.equal(state.message, 'Moving would destroy value after execution costs.');
  assert.equal(state.lastRebalanceAt, null);
});
test('strong market scenario produces real decision, automatic six-step move and updated position', () => {
  let state = market(settle(market(settle(start()), 'hold')), 'rebalance');
  state = demoReducer(state, { type: 'TICK', at: now + 30_000 });
  assert.equal(state.stage, 'ANALYZING_REBALANCE');
  state = demoReducer(state, { type: 'TICK', at: now + 31_000 });
  assert.equal(state.stage, 'REBALANCING');
  assert.equal(state.position.asset, 'BRAt');
  assert.equal(state.steps.length, 6);
  assert.deepEqual(state.evidence.decision, shouldRebalance(rebalanceScenario));
  while (state.stage === 'REBALANCING') {
    const activeSteps = state.steps.filter(s => s.status === 'active');
    assert.equal(activeSteps.length, 1);
    state = demoReducer(state, { type: 'TICK', at: state.activity.at(-1).at + 1000 });
  }
  assert.equal(state.position.asset, 'ARGt');
  assert.equal(state.stage, 'ACTIVE');
  assert.equal(state.positionCarry.netCarry30d, state.evidence.target.netCarry30d);
  assert.ok(state.lastRebalanceAt > now);
  assert.equal(state.amount, 1000, 'demo principal is not fake mark-to-market P&L');
});
test('repeat market injection evaluates actual current asset rather than replaying a hardcoded move', () => {
  const state = settle(market(settle(market(settle(start()), 'rebalance')), 'rebalance'));
  assert.equal(state.stage, 'HOLDING');
  assert.equal(state.position.asset, 'ARGt');
  assert.equal(state.evidence.decision.reason, 'SAME_ASSET');
});
test('existing cooldown is respected by orchestration', () => {
  const active = { ...settle(start()), lastRebalanceAt: now };
  const state = settle(market(active, 'rebalance'));
  assert.equal(state.stage, 'HOLDING');
  assert.equal(state.evidence.decision.reason, 'COOLDOWN_ACTIVE');
  assert.equal(state.position.asset, 'BRAt');
});
test('different deposit amount flows through scanner and withdrawal evidence', () => {
  const state = settle(market(settle(start(5000)), 'rebalance'));
  assert.equal(state.position.asset, 'ARGt');
  assert.equal(state.scan.depositAmountUsd, 5000);
  assert.equal(state.amount, 5000);
});
test('invalid deposits display error without entering simulation', () => {
  for (const amount of [0, -5, NaN, Infinity]) {
    const state = start(amount);
    assert.equal(state.stage, 'IDLE');
    assert.ok(state.error);
    assert.equal(state.position, null);
  }
});
test('duplicate clicks and idle ticks cannot start concurrent runs', () => {
  const idle = initialState();
  assert.equal(demoReducer(idle, { type: 'TICK', at: now }), idle);
  assert.equal(demoReducer(idle, { type: 'MARKET', market: 'hold', at: now }), idle);
  const scanning = start();
  assert.equal(demoReducer(scanning, { type: 'START', amount: 5000, at: now }), scanning);
  assert.equal(demoReducer(scanning, { type: 'MARKET', market: 'hold', at: now }), scanning);
});
test('reset cancels state and stale timer tick cannot resume previous execution', () => {
  const state = demoReducer(start(), { type: 'RESET' });
  assert.deepEqual(state, initialState());
  assert.deepEqual(demoReducer(state, { type: 'TICK', at: now }), initialState());
});
test('events are generated chronologically by transitions with unique IDs', () => {
  const state = settle(market(settle(start()), 'rebalance'));
  assert.ok(state.activity.some(e => e.message.includes('MARKET CHANGE DETECTED')));
  assert.ok(state.activity.some(e => e.message.includes('switching costs checked')));
  assert.equal(new Set(state.activity.map(e => e.id)).size, state.activity.length);
  assert.deepEqual(state.activity.map(e => e.at), state.activity.map(e => e.at).sort((a,b) => a-b));
});
test('fixtures and state are unchanged by pure evaluation; replay is deterministic', () => {
  const request = mockMarket('initial', 1000);
  const copy = structuredClone(request);
  assert.deepEqual(settle(start(1000, request)), settle(start(1000, request)));
  assert.deepEqual(request, copy);
  const scanning = start();
  const before = structuredClone(scanning);
  demoReducer(scanning, { type: 'TICK', at: now + 1000 });
  assert.deepEqual(scanning, before);
});
