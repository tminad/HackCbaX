import { useEffect, useRef } from 'react';
import type { Asset } from '../domain/index.js';
import type { DemoState } from '../application/demoEngine.js';
import { countries, nominalApr } from '../application/demoEngine.js';

export const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
export const percent = (rate: number, digits = 2, signed = false) => new Intl.NumberFormat('en-US', {
  style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: signed ? 'exceptZero' : 'auto',
}).format(rate === 0 ? 0 : rate);

export function AssetIcon({ asset }: { asset: Asset }) {
  return <span className={`asset-icon ${asset.toLowerCase()}`} aria-label={countries[asset]}>{asset === 'USDC' ? '$' : asset === 'BRAt' ? <span className="brazil-diamond"><i /></span> : <span className="argentina-sun">✺</span>}</span>;
}

export function Orbit({ active = false }: { active?: boolean }) {
  return <div className={`orbit ${active ? 'orbit-active' : ''}`} aria-hidden="true">
    <div className="orbit-ring ring-outer" /><div className="orbit-ring ring-inner" />
    <div className="orbit-path"><i /></div>
    <div className="orbit-center">↗</div>
    <div className="orbit-token token-bra"><AssetIcon asset="BRAt" /><span>Brazil</span></div>
    <div className="orbit-token token-arg"><AssetIcon asset="ARGt" /><span>Argentina</span></div>
    <div className="orbit-token token-usd"><AssetIcon asset="USDC" /><span>USDC</span></div>
    <span className="orbit-caption">ONE DEPOSIT. ALWAYS IN MOTION.</span>
  </div>;
}

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={`metric ${emphasis ? 'metric-emphasis' : ''}`}><span>{label}</span><strong className={emphasis && value.startsWith('-') ? 'negative' : ''}>{value}</strong></div>;
}

export function Opportunities({ state }: { state: DemoState }) {
  const entries = [...(state.scan?.ranked ?? []), ...(state.scan?.excluded ?? [])]
    .sort((a, b) => ['USDC', 'ARGt', 'BRAt'].indexOf(a.snapshot.asset) - ['USDC', 'ARGt', 'BRAt'].indexOf(b.snapshot.asset));
  return <section aria-labelledby="opportunities-title" className="opportunities">
    <div className="section-heading"><div><span className="eyebrow">THE OPPORTUNITY SET</span><h2 id="opportunities-title">Three markets. One smart move.</h2></div><span className="subtle-tag">30-day horizon</span></div>
    <div className="opportunity-grid">{entries.map((entry, index) => {
      const shown = index < state.revealed;
      const best = entry.id === state.scan?.selected?.id && shown && state.stage !== 'SCANNING';
      return <article key={entry.id} className={`opportunity-card ${best ? 'best' : ''} ${!shown ? 'unrevealed' : ''}`}>
        <div className="card-top"><AssetIcon asset={entry.snapshot.asset} /><span className="country"><strong>{countries[entry.snapshot.asset]}</strong><small>{entry.snapshot.asset}</small></span>{best && <span className="best-label">BEST CARRY ↗</span>}</div>
        {shown ? <div className="reveal">
          <span className="carry-label">EXPECTED 30-DAY CARRY</span>
          <div className={`carry-number ${entry.eligible && entry.calculation.netCarry30d < 0 ? 'negative' : ''}`}>{entry.eligible ? percent(entry.calculation.netCarry30d, 2, true) : '—'}</div>
          <div className="nominal-row"><span>Nominal APR</span><strong>{percent(nominalApr(entry.snapshot), 0)}</strong></div>
          {entry.eligible ? <div className="card-breakdown">
            <Metric label="Effective APR" value={percent(entry.calculation.effectiveApr)} />
            <Metric label="30-day yield" value={percent(entry.calculation.yield30d, 3, true)} />
            <Metric label="Expected FX" value={percent(entry.snapshot.expectedFxReturn30d, 2, true)} />
            <Metric label="Risk buffer" value={percent(-entry.calculation.riskBuffer)} />
          </div> : <ul className="exclusion-list">{entry.reasons.map(reason => <li key={reason.code}>{reason.message}</li>)}</ul>}
          <span className={`eligibility ${entry.eligible ? '' : 'negative'}`}>{entry.eligible ? '✓ Eligible · liquidity checked' : '× Excluded from allocation'}</span>
          <details className="card-details"><summary>Underlying inputs</summary>
            <Metric label="Base APR" value={percent(entry.snapshot.baseApr)} />
            <Metric label="Incentive APR" value={percent(entry.snapshot.incentiveApr)} />
            <Metric label="Incentive remaining" value={`${entry.snapshot.incentiveDaysLeft} days`} />
            <Metric label="FX volatility / 30d" value={percent(entry.snapshot.fxVolatility30d)} />
            <Metric label="Risk factor" value={String(state.scan?.riskFactor)} />
            <Metric label="Estimated slippage" value={percent(entry.route.estimatedSlippage, 3)} />
            <Metric label="Deposit capacity" value={money(entry.snapshot.depositCapacityUsd)} />
            <Metric label="Route liquidity" value={money(entry.route.routeLiquidityUsd)} />
          </details>
        </div> : <div className="card-skeleton"><span className="scan-line" /><p>Evaluating opportunity<span className="dots">...</span></p><div /><div /><div /></div>}
      </article>;
    })}</div>
    <p className="math-note"><span>≠</span> Nominal APR is not expected return. Yield, currency movement and volatility all count.</p>
  </section>;
}

export function DecisionTrace({ state }: { state: DemoState }) {
  const evidence = state.evidence;
  const selectionVisible = state.stage !== 'SCANNING';
  const selected = state.scan?.selected;
  const title = evidence ? evidence.decision.shouldRebalance ? `Move to ${countries[evidence.decision.targetAsset]}` : `HOLD ${evidence.decision.currentAsset}`
    : state.stage === 'BLOCKED' ? 'No eligible strategy' : selectionVisible && selected ? `${countries[selected.snapshot.asset]} selected` : 'Finding your next move';
  return <section className={`decision-panel ${evidence?.decision.shouldRebalance ? 'decision-move' : ''}`} aria-labelledby="decision-title">
    <div className="panel-heading"><span className="spark">✳</span><span className="eyebrow">AUTOPILOT DECISION</span><span className="subtle-tag">CORE LOGIC</span></div>
    <h2 id="decision-title">{title}</h2>
    {evidence && <span className="decision-action">{evidence.decision.action}</span>}
    <p className="decision-description" role="status">{state.message || 'Comparing expected carry across three eligible markets. The highest APR does not always win.'}</p>
    <div className="evidence-checks">
      {['Yield', 'FX expectation', 'Currency volatility', 'Liquidity'].map(label => <span key={label}><b>✓</b> {label} checked</span>)}
      <span><b>{evidence ? '✓' : '−'}</b> {evidence ? 'Switching costs checked' : 'Initial deposit · no switching hurdle'}</span>
    </div>
    {evidence && <div className="decision-math" data-testid="decision-math">
      <Metric label={`Current ${evidence.decision.currentAsset}`} value={percent(evidence.current.netCarry30d, 3, true)} />
      <Metric label={`Target ${evidence.decision.targetAsset}`} value={percent(evidence.target.netCarry30d, 3, true)} />
      <div className="math-divider" />
      <Metric label="Carry improvement" value={percent(evidence.decision.carryImprovement, 3, true)} />
      <Metric label="Cost to move" value={percent(-evidence.decision.switchCost, 3)} />
      <Metric label="Net benefit" value={percent(evidence.decision.netBenefit, 3, true)} emphasis />
      <Metric label="Required safety margin" value={percent(evidence.decision.safetyMargin, 3, true)} />
      <Metric label="Break-even" value={evidence.decision.breakEvenDays === null ? 'No positive advantage' : `${evidence.decision.breakEvenDays.toFixed(1)} days`} />
      <details className="cost-details"><summary>Execution cost breakdown</summary>
        <Metric label="Gas" value={percent(evidence.costs.gasCostPct, 3)} />
        <Metric label="Swap fees" value={percent(evidence.costs.swapFeesPct, 3)} />
        <Metric label="Slippage" value={percent(evidence.costs.slippagePct, 3)} />
        <Metric label="Other fees" value={percent(evidence.costs.otherExecutionFeesPct, 3)} />
        <p>Core reason: {evidence.decision.reason.replaceAll('_', ' ').toLowerCase()}</p>
      </details>
    </div>}
  </section>;
}

export function Execution({ state }: { state: DemoState }) {
  if (!state.steps.length) return null;
  const complete = state.steps.every(step => step.status === 'complete');
  return <section className="execution-panel" aria-label="Simulated execution">
    <div className="section-heading"><span className="eyebrow">{complete ? 'CAPITAL DEPLOYED' : 'CAPITAL IN MOTION'}</span><span className="subtle-tag">SIMULATED EXECUTION</span></div>
    <ol className="execution-steps">{state.steps.map((step, index) => <li key={step.label} className={step.status} aria-current={step.status === 'active' ? 'step' : undefined}>
      <span className="step-node">{step.status === 'complete' ? '✓' : index + 1}</span><span>{step.label}</span><small>{step.status}</small>
    </li>)}</ol>
  </section>;
}

export function ActivityFeed({ state }: { state: DemoState }) {
  const feed = useRef<HTMLDivElement>(null);
  useEffect(() => { if (feed.current) feed.current.scrollTop = feed.current.scrollHeight; }, [state.activity.length]);
  return <section className="activity-panel"><div className="section-heading"><h3>Activity stream</h3><span className="live-small"><i /> DEMO SESSION</span></div>
    <div className="activity-feed" ref={feed} role="log" aria-label="Autopilot activity" aria-live="polite">
      {state.activity.map(event => <div className="activity-event" key={event.id}><time dateTime={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleTimeString('en-GB')}</time><span>{event.message}</span></div>)}
    </div>
  </section>;
}
