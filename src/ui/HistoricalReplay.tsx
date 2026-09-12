import { useMemo, useState } from 'react';
import { AssetIcon, money, percent } from './components.js';
import { historicalReplayChart, historicalReplayMonths, replayDecisionLegend, type ReplayDecisionAsset } from './historicalReplayData.js';

const chartColors: Record<ReplayDecisionAsset, string> = {
  USDC: '#68b7d8',
  BRAt: '#b5da76',
  ARGt: '#dfc96c',
};

function assetSeries(asset: ReplayDecisionAsset) {
  return historicalReplayChart.map(point => ({ day: point.day, value: asset === 'USDC' ? point.usdc : asset === 'BRAt' ? point.brat : point.argt }));
}

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return '';
  let path = `M ${points[0]!.x.toFixed(1)} ${points[0]!.y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

function ReplayChart() {
  const width = 1040;
  const height = 390;
  const padX = 52;
  const padTop = 32;
  const padBottom = 56;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padTop - padBottom;
  const allValues = historicalReplayChart.flatMap(point => [point.usdc, point.brat, point.argt]);
  const min = Math.min(...allValues) - 0.006;
  const max = Math.max(...allValues) + 0.006;
  const x = (day: number) => padX + day / 90 * innerWidth;
  const y = (value: number) => padTop + (max - value) / (max - min) * innerHeight;

  const pointValue = (asset: ReplayDecisionAsset, day: number) => {
    const exact = historicalReplayChart.find(point => point.day === day);
    if (exact) return asset === 'USDC' ? exact.usdc : asset === 'BRAt' ? exact.brat : exact.argt;
    const afterIndex = historicalReplayChart.findIndex(point => point.day > day);
    if (afterIndex <= 0) {
      const point = historicalReplayChart[Math.max(0, afterIndex)] ?? historicalReplayChart[historicalReplayChart.length - 1]!;
      return asset === 'USDC' ? point.usdc : asset === 'BRAt' ? point.brat : point.argt;
    }
    const before = historicalReplayChart[afterIndex - 1]!;
    const after = historicalReplayChart[afterIndex]!;
    const t = (day - before.day) / (after.day - before.day);
    const a = asset === 'USDC' ? before.usdc : asset === 'BRAt' ? before.brat : before.argt;
    const b = asset === 'USDC' ? after.usdc : asset === 'BRAt' ? after.brat : after.argt;
    return a + (b - a) * t;
  };

  const seriesPath = (asset: ReplayDecisionAsset) => smoothPath(assetSeries(asset).map(point => ({ x: x(point.day), y: y(point.value) })));

  const decisionMarkers = [
    { day: 18, asset: 'USDC' as const, title: 'Hold USDC', subtitle: 'No edge detected yet', side: 'right' as const },
    { day: 38, asset: 'BRAt' as const, title: 'Ride BRAt', subtitle: 'Signal confirmed · +8 days', side: 'right' as const },
    { day: 69, asset: 'ARGt' as const, title: 'Ride ARGt', subtitle: 'Signal confirmed · +9 days', side: 'right' as const },
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
            <stop offset="0%" stopColor="#1d2419" />
            <stop offset="55%" stopColor="#171c15" />
            <stop offset="100%" stopColor="#121610" />
          </linearGradient>
          <linearGradient id="usdcStroke" x1={padX} y1="0" x2={width - padX} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4e8da7" /><stop offset="55%" stopColor="#68b7d8" /><stop offset="100%" stopColor="#86c9e3" />
          </linearGradient>
          <linearGradient id="bratStroke" x1={padX} y1="0" x2={width - padX} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7f9e4f" /><stop offset="55%" stopColor="#b5da76" /><stop offset="100%" stopColor="#d1ec9b" />
          </linearGradient>
          <linearGradient id="argtStroke" x1={padX} y1="0" x2={width - padX} y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a9954f" /><stop offset="55%" stopColor="#dfc96c" /><stop offset="100%" stopColor="#efe09b" />
          </linearGradient>
          <filter id="softLineGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
          </filter>
          <filter id="markerGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="blur" />
          </filter>
          <clipPath id="chartClip"><rect x={padX} y={padTop} width={innerWidth} height={innerHeight} rx="8" /></clipPath>
        </defs>
        <rect x="0" y="0" width={width} height={height} rx="24" fill="url(#chartBg)" />

        {[0, 0.015, 0.03, 0.045, 0.06].map(level => <g key={level}>
          <line x1={padX} x2={width - padX} y1={y(level)} y2={y(level)} stroke="#354030" strokeDasharray="4 9" strokeWidth="1" opacity=".75" />
          <text x="14" y={y(level) + 4} className="axis-label">{percent(level, 0, true)}</text>
        </g>)}
        <line x1={padX} x2={width - padX} y1={y(-0.015)} y2={y(-0.015)} stroke="#47382d" strokeDasharray="4 9" strokeWidth="1" opacity=".55" />
        <text x="12" y={y(-0.015) + 4} className="axis-label negative">{percent(-0.015, 0, true)}</text>

        {[30, 60].map(monthEdge => <line key={monthEdge} x1={x(monthEdge)} x2={x(monthEdge)} y1={padTop} y2={height - padBottom + 4} stroke="#708060" strokeWidth="1" strokeDasharray="8 10" opacity=".7" />)}

        <g clipPath="url(#chartClip)">
          {(['USDC', 'BRAt', 'ARGt'] as const).map(asset => {
            const path = seriesPath(asset);
            const stroke = asset === 'USDC' ? 'url(#usdcStroke)' : asset === 'BRAt' ? 'url(#bratStroke)' : 'url(#argtStroke)';
            return <g key={asset}>
              <path d={path} fill="none" stroke={chartColors[asset]} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity=".09" filter="url(#softLineGlow)" />
              <path d={path} fill="none" stroke="#0b0e0a" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
              <path d={path} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </g>;
          })}
        </g>

        <text x={x(7)} y={y(pointValue('USDC', 7)) - 12} fill={chartColors.USDC} className="asset-line-label">USDC</text>
        <text x={x(43)} y={y(pointValue('BRAt', 43)) - 15} fill={chartColors.BRAt} className="asset-line-label">BRAt</text>
        <text x={x(82)} y={y(pointValue('ARGt', 82)) - 16} fill={chartColors.ARGt} className="asset-line-label">ARGt</text>

        {decisionMarkers.map((marker, index) => {
          const value = pointValue(marker.asset, marker.day);
          const markerX = x(marker.day);
          const markerY = y(value);
          const bubbleWidth = marker.asset === 'USDC' ? 145 : 158;
          const preferRight = markerX + bubbleWidth + 52 < width - padX;
          const bubbleX = preferRight ? markerX + 28 : markerX - bubbleWidth - 28;
          const badgeY = Math.max(padTop + 24, markerY - 55);
          const bubbleY = Math.max(padTop + 5, badgeY - 22);
          const color = chartColors[marker.asset];
          return <g key={`${marker.asset}-${marker.day}`} className={`decision-marker marker-${index}`}>
            <line x1={markerX} y1={markerY} x2={markerX} y2={badgeY + 17} stroke={color} strokeWidth="1.2" strokeDasharray="3 5" opacity=".72" />
            <circle cx={markerX} cy={markerY} r="8" fill={color} opacity=".18" filter="url(#markerGlow)" />
            <circle cx={markerX} cy={markerY} r="4.8" fill={color} stroke="#11150f" strokeWidth="2" />
            <circle cx={markerX} cy={badgeY} r="20" fill="#11160f" stroke={color} strokeWidth="1.5" />
            <circle cx={markerX - 7} cy={badgeY + 5} r="5" fill="none" stroke={color} strokeWidth="1.7" />
            <circle cx={markerX + 8} cy={badgeY + 5} r="5" fill="none" stroke={color} strokeWidth="1.7" />
            <path d={`M ${markerX - 7} ${badgeY + 5} L ${markerX - 1} ${badgeY - 5} L ${markerX + 4} ${badgeY + 5} M ${markerX - 1} ${badgeY - 5} L ${markerX + 8} ${badgeY - 5} M ${markerX + 4} ${badgeY + 5} L ${markerX + 10} ${badgeY - 2}`} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            <rect x={bubbleX} y={bubbleY} width={bubbleWidth} height="46" rx="12" fill="#11150f" stroke={color} strokeWidth="1" />
            <text x={bubbleX + 12} y={bubbleY + 18} className="chart-callout-title">{marker.title}</text>
            <text x={bubbleX + 12} y={bubbleY + 34} className="chart-callout-copy">{marker.subtitle}</text>
          </g>;
        })}

        {[
          { x: x(15), label: 'MONTH 1', copy: 'Defensive phase' },
          { x: x(45), label: 'MONTH 2', copy: 'Brazil breakout' },
          { x: x(75), label: 'MONTH 3', copy: 'Argentina overtakes' },
        ].map(item => <g key={item.label}>
          <text x={item.x - 27} y={height - 12} className="month-axis-label">{item.label}</text>
          <text x={item.x - 36} y={height - 30} className="month-axis-copy">{item.copy}</text>
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
