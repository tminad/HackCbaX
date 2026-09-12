import { useState } from 'react';
import { AssetIcon, money, percent } from './components.js';
import { historicalReplayCheckpoints, type HistoricalReplaySignal } from './historicalReplayData.js';

const labelForStatus = (signal: HistoricalReplaySignal) => signal.status === 'cached' ? 'CACHED AI' : signal.status === 'live' ? 'LIVE AI' : 'SAFE FALLBACK';
const classForStatus = (signal: HistoricalReplaySignal) => signal.status === 'unavailable' ? 'fallback' : signal.status;

function SignalCard({ currency, signal }: { currency: 'ARS' | 'BRL'; signal: HistoricalReplaySignal }) {
  return <article className="macro-signal-card">
    <div className="macro-signal-head"><span>{currency === 'ARS' ? 'ARGENTINA' : 'BRAZIL'} MACRO</span><b className={`ai-pill ${classForStatus(signal)}`}>{labelForStatus(signal)}</b></div>
    <div className="macro-score-row"><div><span>MACRO SCORE</span><strong>{signal.score === null ? '—' : `${signal.score > 0 ? '+' : ''}${signal.score.toFixed(2)}`}</strong></div><div><span>CONFIDENCE</span><strong>{signal.confidence === null ? '—' : percent(signal.confidence, 0)}</strong></div></div>
    <p>{signal.summary}</p>
  </article>;
}

function AssetReplayCard({ asset, data, best }: { asset: 'ARGt' | 'BRAt'; data: typeof historicalReplayCheckpoints[number]['assets']['ARGt']; best: boolean }) {
  return <article className={`replay-asset-card ${best ? 'yield-winner' : ''}`}>
    <div className="replay-asset-head"><AssetIcon asset={asset} /><div><strong>{asset === 'ARGt' ? 'Argentina' : 'Brazil'}</strong><span>{asset}</span></div>{best && <b>YIELD-ONLY LEADER</b>}</div>
    <div className="replay-carry negative">{percent(data.netCarry, 2, true)}</div>
    <span className="replay-carry-label">FINAL EXPECTED 30-DAY CARRY</span>
    <div className="replay-breakdown">
      <div><span>30d yield</span><strong>{percent(data.yield30d, 2, true)}</strong></div>
      <div><span>Base FX forecast</span><strong className="negative">{percent(data.baseFx, 2, true)}</strong></div>
      <div><span>Gemini adjustment</span><strong className={data.aiAdjustment < 0 ? 'negative' : ''}>{percent(data.aiAdjustment, 2, true)}</strong></div>
      <div><span>Final FX expectation</span><strong className="negative">{percent(data.finalFx, 2, true)}</strong></div>
      <div><span>Risk buffer</span><strong className="negative">{percent(-data.riskBuffer, 2, true)}</strong></div>
    </div>
  </article>;
}

export function HistoricalReplay({ onExit }: { onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const checkpoint = historicalReplayCheckpoints[index]!;
  const date = new Date(checkpoint.checkpoint);
  const first = index === 0;
  const last = index === historicalReplayCheckpoints.length - 1;
  const decisionTitle = first ? 'Stay in USDC' : 'Hold USDC';
  const decisionReason = first
    ? 'Both local-currency opportunities turn negative after FX expectations and risk. The agent keeps dry powder instead of forcing a trade.'
    : 'Market yields changed, but neither local strategy beats the 0% defensive USDC benchmark after FX expectations and risk.';

  return <main className="historical-layout">
    <section className="replay-hero">
      <div><span className="eyebrow">HISTORICAL AI REPLAY · REAL MARKET EVIDENCE</span><h1>Would the agent<br /><em>actually move?</em></h1><p>We replay point-in-time data from September 2026. Gemini interprets only the macro evidence available then; deterministic code calculates the final decision.</p></div>
      <div className="replay-hero-meta"><div><span>POSITION</span><strong>{money(100)} USDC</strong></div><div><span>MODE</span><strong>Historical</strong></div><div><span>EXECUTION</span><strong>Modeled costs</strong></div></div>
    </section>

    <section className="replay-timeline" aria-label="Historical checkpoints">
      {historicalReplayCheckpoints.map((item, i) => <button key={item.checkpoint} className={i === index ? 'active' : i < index ? 'complete' : ''} onClick={() => setIndex(i)}><i /><span>{new Date(item.checkpoint).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</span><small>{new Date(item.checkpoint).toISOString().slice(11,16)} UTC</small></button>)}
    </section>

    <div className="replay-grid">
      <div className="replay-main">
        <section className="replay-decision-card">
          <div className="panel-heading"><span className="spark">✳</span><span className="eyebrow">AUTOPILOT DECISION</span><span className="subtle-tag">{date.toISOString().slice(0,16).replace('T',' ')} UTC</span></div>
          <div className="replay-decision-top"><div><span>FINAL DECISION</span><h2>{decisionTitle}</h2><p>{decisionReason}</p></div><div className="usdc-benchmark"><AssetIcon asset="USDC" /><span>DEFENSIVE BENCHMARK</span><strong>0.00%</strong><small>30-day carry · no local FX exposure</small></div></div>
          <div className="replay-callout"><span>Without FX + macro:</span><strong>{checkpoint.preAiWinner} looked best.</strong><b>After market expectations + AI:</b><strong>USDC wins.</strong></div>
        </section>

        <section className="replay-opportunities"><div className="section-heading"><div><span className="eyebrow">POINT-IN-TIME COMPARISON</span><h2>Yield is only half the story.</h2></div><span className="subtle-tag">NO LOOK-AHEAD DATA</span></div>
          <div className="replay-assets"><AssetReplayCard asset="ARGt" data={checkpoint.assets.ARGt} best={checkpoint.preAiWinner === 'ARGt'} /><AssetReplayCard asset="BRAt" data={checkpoint.assets.BRAt} best={checkpoint.preAiWinner === 'BRAt'} /><article className="replay-asset-card cash-winner"><div className="replay-asset-head"><AssetIcon asset="USDC" /><div><strong>US Dollar</strong><span>USDC</span></div><b>FINAL CHOICE</b></div><div className="replay-carry">0.00%</div><span className="replay-carry-label">DEFENSIVE 30-DAY BENCHMARK</span><p className="cash-copy">No yield is assumed here. USDC is the option to wait when neither carry trade compensates for currency risk.</p></article></div>
        </section>

        <section className="macro-layer"><div className="section-heading"><div><span className="eyebrow">MACRO INTELLIGENCE LAYER</span><h2>AI interprets. Code decides.</h2></div><span className="subtle-tag">GEMINI 3.6 FLASH</span></div><div className="macro-signal-grid"><SignalCard currency="ARS" signal={checkpoint.signals.ARS} /><SignalCard currency="BRL" signal={checkpoint.signals.BRL} /></div>
          <p className="macro-note">A failed AI signal never creates a guess: SAFE FALLBACK means the engine used the published quantitative FX baseline with a 0% AI adjustment.</p></section>
      </div>

      <aside className="replay-side">
        <section className="replay-proof"><span className="eyebrow">WHAT IS REAL?</span><div><b>✓</b><p><strong>Morpho yield history</strong><small>Hourly historical observations</small></p></div><div><b>✓</b><p><strong>Merkl incentives</strong><small>Historical reward APR</small></p></div><div><b>✓</b><p><strong>Fiat FX observations</strong><small>Point-in-time proxy data</small></p></div><div><b>✓</b><p><strong>Gemini signals</strong><small>Validated live responses cached for replay</small></p></div><div><b>~</b><p><strong>Curve execution cost</strong><small>Conservative modeled scenario</small></p></div></section>
        <section className="replay-controls"><span className="eyebrow">PRESENTER CONTROL</span><h3>{last ? 'Replay complete.' : 'Advance the market.'}</h3><p>{last ? 'The market changed twice, but the agent refused to force an unprofitable trade.' : 'Move to the next real historical checkpoint and recalculate.'}</p>{!last ? <button className="primary-button" onClick={() => setIndex(i => Math.min(i + 1, historicalReplayCheckpoints.length - 1))}>NEXT CHECKPOINT <span>↗</span></button> : <button className="primary-button" onClick={() => setIndex(0)}>REPLAY AGAIN <span>↺</span></button>}<button className="secondary-button replay-back" onClick={onExit}>BACK TO DEMO MODE <b>→</b></button></section>
      </aside>
    </div>
  </main>;
}
