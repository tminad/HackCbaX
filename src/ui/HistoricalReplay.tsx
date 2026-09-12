import { useMemo, useState } from 'react';
import { AssetIcon, money, percent } from './components.js';
import { historicalReplayChart, historicalReplayMonths, replayDecisionLegend, type ReplayDecisionAsset } from './historicalReplayData.js';

const chartColors: Record<ReplayDecisionAsset, string> = {
  USDC: '#2db4ff',
  BRAt: '#9adf3f',
  ARGt: '#ffd84a',
};

function assetSeries(asset: ReplayDecisionAsset) {
  return historicalReplayChart.map(point => ({ day: point.day, value: asset === 'USDC' ? point.usdc : asset === 'BRAt' ? point.brat : point.argt }));
}

function ReplayChart() {
  const width = 980;
  const height = 360;
  const padX = 44;
  const padY = 28;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;
  const allValues = historicalReplayChart.flatMap(point => [point.usdc, point.brat, point.argt]);
  const min = Math.min(...allValues) - 0.004;
  const max = Math.max(...allValues) + 0.004;
  const x = (day: number) => padX + day / 90 * innerWidth;
  const y = (value: number) => padY + (max - value) / (max - min) * innerHeight;
  const linePath = (asset: ReplayDecisionAsset) => assetSeries(asset)
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.day).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');

  const decisionMarkers = [
    { day: 30, asset: 'USDC' as const, title: 'Month 1 · Stay in USDC', subtitle: 'No profitable carry yet' },
    { day: 60, asset: 'BRAt' as const, title: 'Month 2 · Swap to BRAt', subtitle: 'Brazil overtakes USDC' },
    { day: 90, asset: 'ARGt' as const, title: 'Month 3 · Swap to ARGt', subtitle: 'Argentina becomes #1' },
  ];

  return <section className="historical-chart-panel">
    <div className="section-heading replay-chart-heading">
      <div>
        <span className="eyebrow">MOCKED HISTORICAL AI REPLAY</span>
        <h2>Three months. One curve of decisions.</h2>
      </div>
      <span className="subtle-tag">MOCKED NEWS + MOCKED DATA · DEMO STORY</span>
    </div>

    <div className="replay-chart-legend">
      {replayDecisionLegend.map(item => <span key={item.asset}><i style={{ background: item.color }} />{item.label}</span>)}
    </div>

    <div className="replay-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="replay-chart" role="img" aria-label="Three-month cumulative performance of USDC, BRAt and ARGt">
        <defs>
          <linearGradient id="chartBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e2519" />
            <stop offset="100%" stopColor="#141813" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={width} height={height} rx="24" fill="url(#chartBg)" />

        {[0, 0.015, 0.03, 0.045, 0.06].map(level => <g key={level}>
          <line x1={padX} x2={width - padX} y1={y(level)} y2={y(level)} stroke="#354030" strokeDasharray="5 7" strokeWidth="1" />
          <text x="14" y={y(level) + 4} className="axis-label">{percent(level, 0, true)}</text>
        </g>)}
        {[-0.015].map(level => <g key={level}>
          <line x1={padX} x2={width - padX} y1={y(level)} y2={y(level)} stroke="#3f3028" strokeDasharray="5 7" strokeWidth="1" />
          <text x="12" y={y(level) + 4} className="axis-label negative">{percent(level, 0, true)}</text>
        </g>)}

        {[30, 60].map(monthEdge => <line key={monthEdge} x1={x(monthEdge)} x2={x(monthEdge)} y1={padY} y2={height - padY} stroke="#8ea667" strokeWidth="1.5" strokeDasharray="10 8" />)}

        {(['USDC', 'BRAt', 'ARGt'] as const).map(asset => <path key={asset} d={linePath(asset)} fill="none" stroke={chartColors[asset]} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}

        <text x={x(8)} y={y(historicalReplayChart[2]!.usdc) - 12} fill={chartColors.USDC} className="asset-line-label">USDC</text>
        <text x={x(31)} y={y(0.002)} fill={chartColors.BRAt} className="asset-line-label">BRAt</text>
        <text x={x(64)} y={y(0.047)} fill={chartColors.ARGt} className="asset-line-label">ARGt</text>

        {decisionMarkers.map((marker, index) => {
          const value = marker.asset === 'USDC' ? historicalReplayChart.find(point => point.day === marker.day)!.usdc
            : marker.asset === 'BRAt' ? historicalReplayChart.find(point => point.day === marker.day)!.brat
            : historicalReplayChart.find(point => point.day === marker.day)!.argt;
          const markerX = x(marker.day);
          const markerY = y(value);
          const bubbleX = index === 2 ? markerX - 180 : markerX + 12;
          const bubbleY = Math.max(18, markerY - 68);
          return <g key={marker.day}>
            <circle cx={markerX} cy={markerY} r="7" fill={chartColors[marker.asset]} stroke="#0f120d" strokeWidth="2" />
            <line x1={markerX} y1={markerY} x2={bubbleX + 20} y2={bubbleY + 38} stroke={chartColors[marker.asset]} strokeWidth="2" strokeDasharray="3 5" />
            <rect x={bubbleX} y={bubbleY} width="170" height="52" rx="14" fill="#11150f" stroke={chartColors[marker.asset]} strokeWidth="1.4" />
            <text x={bubbleX + 14} y={bubbleY + 20} className="chart-callout-bike">🚲</text>
            <text x={bubbleX + 36} y={bubbleY + 20} className="chart-callout-title">{marker.title}</text>
            <text x={bubbleX + 36} y={bubbleY + 37} className="chart-callout-copy">{marker.subtitle}</text>
          </g>;
        })}

        {[
          { x: x(15), label: 'MONTH 1', copy: 'Stay in USDC' },
          { x: x(45), label: 'MONTH 2', copy: 'Swap to BRAt' },
          { x: x(75), label: 'MONTH 3', copy: 'Swap to ARGt' },
        ].map(item => <g key={item.label}>
          <text x={item.x - 26} y={height - 10} className="month-axis-label">{item.label}</text>
          <text x={item.x - 34} y={height - 28} className="month-axis-copy">{item.copy}</text>
        </g>)}
      </svg>
    </div>
  </section>;
}

function MetricRow({ asset, values, winner = false }: {
  asset: ReplayDecisionAsset;
  values: { nominalApr?: number; fxOutlook?: number; aiAdjustment?: number; riskBuffer?: number; netCarry: number };
  winner?: boolean;
}) {
  return <article className={`month-metric-card ${winner ? 'winner' : ''}`}>
    <div className="month-metric-head">
      <div className="month-asset-name"><AssetIcon asset={asset} /><div><strong>{asset}</strong><span>{asset === 'USDC' ? 'Defensive cash' : asset === 'BRAt' ? 'Brazil route' : 'Argentina route'}</span></div></div>
      {winner && <b>{asset === 'USDC' ? 'STAY' : 'SWAP TARGET'}</b>}
    </div>
    <div className={`month-carry ${values.netCarry < 0 ? 'negative' : ''}`}>{percent(values.netCarry, 2, true)}</div>
    <span className="replay-carry-label">EXPECTED RESULT FOR THIS MONTH</span>
    <div className="month-breakdown-grid">
      <div><span>Nominal APR</span><strong>{values.nominalApr === undefined ? '—' : percent(values.nominalApr, 0)}</strong></div>
      <div><span>FX outlook</span><strong className={values.fxOutlook !== undefined && values.fxOutlook < 0 ? 'negative' : ''}>{values.fxOutlook === undefined ? '—' : percent(values.fxOutlook, 2, true)}</strong></div>
      <div><span>AI adjustment</span><strong className={values.aiAdjustment !== undefined && values.aiAdjustment < 0 ? 'negative' : ''}>{values.aiAdjustment === undefined ? '—' : percent(values.aiAdjustment, 2, true)}</strong></div>
      <div><span>Risk buffer</span><strong className={values.riskBuffer !== undefined && values.riskBuffer > 0 ? 'negative' : ''}>{values.riskBuffer === undefined ? '—' : percent(-values.riskBuffer, 2, true)}</strong></div>
    </div>
  </article>;
}

export function HistoricalReplay({ onExit }: { onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const month = historicalReplayMonths[index]!;
  const previous = index > 0 ? historicalReplayMonths[index - 1] : null;
  const outcomeText = month.decision.asset === 'USDC'
    ? 'The model prefers to wait in dollars.'
    : `The model rotates capital into ${month.decision.asset}.`;
  const activeWinner = month.decision.asset;

  const scoreTone = useMemo(() => ({
    ARS: month.signals.ARS.score > 0 ? 'positive' : 'negative',
    BRL: month.signals.BRL.score > 0 ? 'positive' : 'negative',
  }), [month]);

  return <main className="historical-layout mocked-replay-layout">
    <section className="replay-hero replay-hero-mock">
      <div>
        <span className="eyebrow">HISTORICAL AI REPLAY · STORY MODE</span>
        <h1>Show the whole carry trade <em>journey</em>.</h1>
        <p>This version uses mocked historical news and synthetic monthly outcomes to tell a clearer story: wait in USDC, rotate to BRAt, then rebalance into ARGt.</p>
      </div>
      <div className="replay-hero-meta">
        <div><span>POSITION</span><strong>{money(100)} USDC</strong></div>
        <div><span>DURATION</span><strong>3 months</strong></div>
        <div><span>NARRATIVE</span><strong>Mocked story</strong></div>
      </div>
    </section>

    <ReplayChart />

    <section className="month-selector" aria-label="Replay month selector">
      {historicalReplayMonths.map((item, i) => <button key={item.id} className={i === index ? 'active' : i < index ? 'complete' : ''} onClick={() => setIndex(i)}>
        <small>{item.shortLabel}</small>
        <strong>{item.label}</strong>
        <span>{item.period}</span>
      </button>)}
    </section>

    <div className="replay-grid replay-grid-monthly">
      <div className="replay-main">
        <section className="replay-decision-card month-decision-card">
          <div className="panel-heading"><span className="spark">✳</span><span className="eyebrow">MONTHLY DECISION</span><span className="subtle-tag">{month.period}</span></div>
          <div className="month-decision-header">
            <div>
              <span>MODEL POSITION</span>
              <h2>{month.decision.title}</h2>
              <p>{month.decision.why}</p>
            </div>
            <div className={`month-bike-card ${month.decision.asset.toLowerCase()}`}>
              <span className="month-bike">🚲</span>
              <strong>{month.decision.asset}</strong>
              <small>{outcomeText}</small>
            </div>
          </div>
          <div className="replay-callout month-callout"><span>What changed this month?</span><strong>{month.marketStory}</strong><b>Decision logic:</b><strong>{month.headline}</strong></div>
          {previous && <p className="month-transition">Previous position: <strong>{previous.decision.asset}</strong> → Current position: <strong>{month.decision.asset}</strong></p>}
        </section>

        <section className="replay-opportunities month-opportunities">
          <div className="section-heading">
            <div>
              <span className="eyebrow">MONTHLY PERFORMANCE SNAPSHOT</span>
              <h2>Which token wins this month?</h2>
            </div>
            <span className="subtle-tag">SYNTHETIC MONTHLY OUTCOMES</span>
          </div>
          <div className="replay-assets month-assets">
            <MetricRow asset="USDC" values={month.metrics.USDC} winner={activeWinner === 'USDC'} />
            <MetricRow asset="BRAt" values={month.metrics.BRAt} winner={activeWinner === 'BRAt'} />
            <MetricRow asset="ARGt" values={month.metrics.ARGt} winner={activeWinner === 'ARGt'} />
          </div>
        </section>

        <section className="macro-layer month-macro-layer">
          <div className="section-heading"><div><span className="eyebrow">WHY THE MODEL DECIDED THIS</span><h2>AI explanation for {month.label.toLowerCase()}.</h2></div><span className="subtle-tag">MOCKED SIGNALS</span></div>
          <div className="mock-signals-grid">
            <article className="macro-signal-card">
              <div className="macro-signal-head"><span>ARGENTINA MACRO</span><b className={`ai-pill ${scoreTone.ARS}`}>{month.signals.ARS.score > 0 ? 'POSITIVE' : 'NEGATIVE'}</b></div>
              <div className="macro-score-row"><div><span>MACRO SCORE</span><strong>{month.signals.ARS.score > 0 ? '+' : ''}{month.signals.ARS.score.toFixed(2)}</strong></div><div><span>CONFIDENCE</span><strong>{percent(month.signals.ARS.confidence, 0)}</strong></div></div>
              <p>{month.signals.ARS.note}</p>
            </article>
            <article className="macro-signal-card">
              <div className="macro-signal-head"><span>BRAZIL MACRO</span><b className={`ai-pill ${scoreTone.BRL}`}>{month.signals.BRL.score > 0 ? 'POSITIVE' : 'NEGATIVE'}</b></div>
              <div className="macro-score-row"><div><span>MACRO SCORE</span><strong>{month.signals.BRL.score > 0 ? '+' : ''}{month.signals.BRL.score.toFixed(2)}</strong></div><div><span>CONFIDENCE</span><strong>{percent(month.signals.BRL.confidence, 0)}</strong></div></div>
              <p>{month.signals.BRL.note}</p>
            </article>
          </div>
          <div className="mock-ai-summary">
            <strong>Autopilot summary</strong>
            <p>{month.aiSummary}</p>
          </div>
        </section>
      </div>

      <aside className="replay-side">
        <section className="replay-proof month-proof">
          <span className="eyebrow">MONTH SUMMARY</span>
          <div><b>✓</b><p><strong>Starting position</strong><small>{index === 0 ? 'Fresh deposit in USDC' : previous?.decision.asset}</small></p></div>
          <div><b>✓</b><p><strong>Winning asset</strong><small>{month.decision.asset}</small></p></div>
          <div><b>✓</b><p><strong>Decision</strong><small>{month.decision.title}</small></p></div>
          <div><b>✓</b><p><strong>Why</strong><small>{month.headline}</small></p></div>
          <div><b>~</b><p><strong>Presentation note</strong><small>Mocked historical sequence approved for the hackathon demo.</small></p></div>
        </section>

        <section className="replay-controls">
          <span className="eyebrow">PRESENTER CONTROL</span>
          <h3>{index === historicalReplayMonths.length - 1 ? 'Story complete.' : 'Advance to the next month.'}</h3>
          <p>{index === historicalReplayMonths.length - 1 ? 'You showed the full journey: cash → Brazil → Argentina.' : 'Move the replay forward to show how the model changes position over time.'}</p>
          {index < historicalReplayMonths.length - 1
            ? <button className="primary-button" onClick={() => setIndex(i => Math.min(i + 1, historicalReplayMonths.length - 1))}>NEXT MONTH <span>↗</span></button>
            : <button className="primary-button" onClick={() => setIndex(0)}>REPLAY AGAIN <span>↺</span></button>}
          <button className="secondary-button replay-back" onClick={onExit}>BACK TO DEMO MODE <b>→</b></button>
        </section>
      </aside>
    </div>
  </main>;
}
