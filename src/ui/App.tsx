import { useState } from 'react';
import { countries, isBusy } from '../application/demoEngine.js';
import { useDemo } from './useDemo.js';
import { ActivityFeed, AssetIcon, DecisionTrace, Execution, money, Opportunities, Orbit, percent } from './components.js';
import { HistoricalReplay } from './HistoricalReplay.js';

export function App() {
  const { state, dispatch } = useDemo();
  const [amount, setAmount] = useState('1000');
  const [view, setView] = useState<'demo' | 'historical'>('demo');
  const idle = state.stage === 'IDLE';
  const busy = isBusy(state.stage);
  const position = state.position;
  const canSimulate = !!position && !busy;
  const status = state.stage === 'SCANNING' ? 'Scanning opportunities' : state.stage === 'DEPLOYING' ? 'Deploying simulated capital'
    : state.stage === 'REBALANCING' ? 'Rebalancing automatically' : state.stage === 'MARKET_CHANGE' ? 'Market change detected'
    : state.stage === 'ANALYZING_REBALANCE' ? 'Evaluating the move' : state.stage === 'SELECTED' ? 'Opportunity selected'
    : state.stage === 'BLOCKED' ? 'No eligible destination' : 'Your money has a plan.';
  if (view === 'historical') return <div className="app-shell">
    <header className="topbar"><button className="brand brand-button" onClick={() => setView('demo')} aria-label="Carry home"><span className="brand-mark">↗</span>CARRY<span className="brand-sub">AUTOPILOT</span></button>
      <div className="header-actions"><span className="demo-badge historical-badge"><i /> HISTORICAL AI REPLAY · STORY MODE</span><button className="text-button" onClick={() => setView('demo')}>Back to demo ↺</button></div></header>
    <HistoricalReplay onExit={() => setView('demo')} />
    <footer><span>CARRY <span className="footer-dot">/</span> HISTORICAL AI REPLAY</span><p>Mocked historical story for a clearer product demo. <span>Hackathon MVP.</span></p></footer>
  </div>;
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="./" aria-label="Carry home"><span className="brand-mark">↗</span>CARRY<span className="brand-sub">AUTOPILOT</span></a>
      <div className="header-actions"><span className="demo-badge"><i /> DEMO MODE</span><button className="text-button" onClick={() => setView('historical')}>Historical AI Replay</button>{!idle && <button className="text-button" onClick={() => dispatch({ type: 'RESET' })}>Reset demo ↺</button>}</div>
    </header>
    {idle ? <main className="landing">
      <section className="landing-content"><span className="eyebrow"><span className="tiny-line" /> YOUR MONEY, IN MOTION</span>
        <h1>Make your<br />money <em>work.</em></h1>
        <p className="landing-description">One deposit. An autopilot that finds the opportunity,<br className="desktop-only" /> weighs the risk, and knows when to move.</p>
        <form className="deposit-form" onSubmit={event => { event.preventDefault(); dispatch({ type: 'START', amount: Number(amount), at: Date.now() }); }}>
          <label htmlFor="deposit">Start with simulated capital</label>
          <div className="deposit-input"><span>$</span><input id="deposit" name="deposit" inputMode="decimal" type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} aria-describedby="deposit-note" /><span className="currency-pill"><AssetIcon asset="USDC" />USDC</span></div>
          <button className="primary-button" type="submit">START AUTOPILOT <span>↗</span></button>
          {state.error && <p className="error" role="alert">{state.error}</p>}
          <p id="deposit-note" className="deposit-note">◈ Demo funds only. No wallet connection. No real transactions.</p>
        </form>
        <button className="secondary-button replay-launch" type="button" onClick={() => setView('historical')}><span>STORY MODE</span> RUN HISTORICAL AI REPLAY <b>→</b></button>
      </section>
      <section className="landing-art" aria-label="USDC, Argentina and Brazil opportunities"><Orbit /><div className="art-caption"><span className="live-small"><i /> DETERMINISTIC BY DESIGN</span><p>Higher yield isn't always a better move.<br /><strong>Autopilot does the math.</strong></p></div></section>
      <div className="landing-principles"><div><span>01</span><strong>Deposit once</strong><p>One starting point. Three markets.</p></div><div><span>02</span><strong>Let the math decide</strong><p>Yield, FX and risk in one clear decision.</p></div><div><span>03</span><strong>Move with a reason</strong><p>Only when the improvement justifies it.</p></div></div>
    </main> : <main className="wallet-layout">
      <div className="wallet-heading"><div><span className="eyebrow">YOUR AUTONOMOUS WALLET</span><h1>{status}</h1></div><span className={`autopilot-status ${busy ? 'working' : ''}`}><i />{busy ? 'AUTOPILOT WORKING' : position ? 'AUTOPILOT ACTIVE' : 'ALLOCATION PAUSED'}</span></div>
      {(state.stage === 'MARKET_CHANGE' || state.stage === 'ANALYZING_REBALANCE') && <div className="market-banner" role="status"><span>↗</span> MARKET CHANGE DETECTED <small>Mock snapshot updated · recalculating with the financial core</small></div>}
      {state.error && <p role="alert" className="error">{state.error}</p>}
      <div className="workspace"><div className="primary-column">
        <section className="wallet-card"><div className="wallet-card-content"><div className="wallet-label"><span>PORTFOLIO</span><span className="subtle-tag">SIMULATED CAPITAL</span></div><div className="portfolio-value" data-testid="portfolio-value">{money(state.amount)}<span>USD</span></div>
          <p className="portfolio-note">Demo principal · no accrued returns or execution debits</p>
          <div className="wallet-position"><div><span className="label">CURRENT POSITION</span><div className="position-name">{position ? <><AssetIcon asset={position.asset} /><strong data-testid="current-asset">{position.asset}</strong><span>{countries[position.asset]}</span></> : <><AssetIcon asset="USDC" /><strong>USDC</strong><span>Awaiting allocation</span></>}</div><span className="strategy-caption">{position ? `${position.protocol} yield strategy · simulated` : 'Your deposit is ready. Autopilot is evaluating.'}</span></div>
            <div className="wallet-carry"><span className="label">EXPECTED 30-DAY CARRY</span><strong>{state.positionCarry ? percent(state.positionCarry.netCarry30d, 2, true) : '—'}</strong><small>Estimated · subject to market conditions</small></div></div>
        </div><div className="wallet-orbit"><Orbit active={!!position} /></div></section>
        <Opportunities state={state} />
        <Execution state={state} />
        <details className="technical-panel"><summary><span>◈</span> How your money is working <small>THE TECHNICAL LAYER</small></summary>
          <div className="technical-grid"><div><span>ASSET</span><strong>{position?.asset ?? state.scan?.selected?.snapshot.asset ?? 'USDC'}</strong><small>{(position?.asset ?? state.scan?.selected?.snapshot.asset ?? 'USDC') === 'USDC' ? 'US dollar stablecoin' : 'Twin Finance local-currency stablecoin'}</small></div><div><span>YIELD STRATEGY</span><strong>Morpho</strong><small>External yield, not token-native yield</small></div><div><span>FX / SWAP</span><strong>Curve</strong><small>Intended swap venue</small></div><div><span>NETWORK</span><strong>Arbitrum</strong><small>Intended execution network</small></div></div>
          <p>Infrastructure shown is the intended integration path. All execution and market data in this demo are simulated. No protocol APIs are connected.</p>
        </details>
      </div><aside className="secondary-column"><DecisionTrace state={state} />
        <section className="demo-controls" aria-labelledby="demo-title"><div className="panel-heading"><span className="demo-badge">DEMO MODE</span><span className="presenter-label">PRESENTER CONTROLS</span></div><h3 id="demo-title">Fast-forward the market.</h3><p>Inject a new snapshot. Let the core decide whether to stay or move.</p>
          <button className="secondary-button" disabled={!canSimulate} onClick={() => dispatch({ type: 'MARKET', market: 'hold', at: Date.now() })}><span>01</span> Test a small improvement <b>→</b></button>
          <button className="primary-button" disabled={!canSimulate} onClick={() => dispatch({ type: 'MARKET', market: 'rebalance', at: Date.now() })}>SIMULATE MARKET CHANGE <span>↗</span></button>
          <small>{position?.asset === 'ARGt' ? 'Move complete. Reset the demo to replay the Brazil → Argentina story.' : 'Try the small improvement first, then the stronger opportunity.'}</small>
        </section><ActivityFeed state={state} />
      </aside></div>
    </main>}
    <footer><span>CARRY <span className="footer-dot">/</span> BUILT FOR MONEY IN MOTION</span><p>Real financial logic. Mock markets, funds & execution. <span>Hackathon MVP.</span></p></footer>
  </div>;
}
