export type ReplayDecisionAsset = 'USDC' | 'BRAt' | 'ARGt';

export interface ReplayChartPoint {
  day: number;
  usdc: number;
  brat: number;
  argt: number;
}

export interface MonthlyReplayMetrics {
  nominalApr: number;
  fxOutlook: number;
  aiAdjustment: number;
  riskBuffer: number;
  netCarry: number;
}

export interface MonthlyReplayStrategy {
  asset: ReplayDecisionAsset;
  status: 'stay' | 'swap';
  title: string;
  why: string;
}

export interface HistoricalReplayMonth {
  id: 'month1' | 'month2' | 'month3';
  label: string;
  shortLabel: string;
  period: string;
  decision: MonthlyReplayStrategy;
  marketStory: string;
  headline: string;
  aiSummary: string;
  signals: {
    ARS: { score: number; confidence: number; note: string };
    BRL: { score: number; confidence: number; note: string };
  };
  metrics: {
    USDC: Pick<MonthlyReplayMetrics, 'netCarry'>;
    BRAt: MonthlyReplayMetrics;
    ARGt: MonthlyReplayMetrics;
  };
}

export const historicalReplayChart: readonly ReplayChartPoint[] = [
  { day: 0, usdc: 0, brat: 0, argt: 0 },
  { day: 4, usdc: 0.0005, brat: -0.001, argt: -0.0015 },
  { day: 8, usdc: 0.0011, brat: -0.0028, argt: -0.0044 },
  { day: 12, usdc: 0.0016, brat: -0.0054, argt: -0.0072 },
  { day: 16, usdc: 0.0021, brat: -0.0074, argt: -0.0096 },
  { day: 20, usdc: 0.0024, brat: -0.007, argt: -0.0108 },
  { day: 24, usdc: 0.0028, brat: -0.0051, argt: -0.0116 },
  { day: 30, usdc: 0.0032, brat: -0.0018, argt: -0.0102 },

  { day: 36, usdc: 0.0038, brat: 0.0038, argt: -0.0068 },
  { day: 42, usdc: 0.0043, brat: 0.0104, argt: -0.0021 },
  { day: 48, usdc: 0.0049, brat: 0.0178, argt: 0.0034 },
  { day: 54, usdc: 0.0054, brat: 0.0242, argt: 0.0079 },
  { day: 60, usdc: 0.0059, brat: 0.0311, argt: 0.0117 },

  { day: 66, usdc: 0.0063, brat: 0.0386, argt: 0.0187 },
  { day: 72, usdc: 0.0068, brat: 0.0425, argt: 0.0281 },
  { day: 78, usdc: 0.0072, brat: 0.0449, argt: 0.0388 },
  { day: 84, usdc: 0.0078, brat: 0.0431, argt: 0.0504 },
  { day: 90, usdc: 0.0082, brat: 0.0416, argt: 0.0587 },
];

export const historicalReplayMonths: readonly HistoricalReplayMonth[] = [
  {
    id: 'month1',
    label: 'Month 1',
    shortLabel: 'M1',
    period: 'Weeks 1–4 · Defensive phase',
    headline: 'Waiting in dollars wins the first month.',
    marketStory: 'USDC stays slightly positive while both local-currency strategies lose money after FX pressure and risk adjustments.',
    decision: {
      asset: 'USDC',
      status: 'stay',
      title: 'Stay in USDC',
      why: 'Neither BRAt nor ARGt beats the defensive dollar benchmark. The model keeps capital protected and avoids forcing a carry trade too early.',
    },
    aiSummary: 'Macro evidence is still defensive: Brazil has not yet built enough momentum and Argentina remains under FX pressure.',
    signals: {
      ARS: { score: -0.42, confidence: 0.81, note: 'Inflation and devaluation expectations keep ARS unattractive.' },
      BRL: { score: 0.08, confidence: 0.63, note: 'Brazil is stabilizing, but the advantage is still too small.' },
    },
    metrics: {
      USDC: { netCarry: 0.0032 },
      BRAt: { nominalApr: 0.12, fxOutlook: -0.009, aiAdjustment: 0.0003, riskBuffer: 0.0031, netCarry: -0.0018 },
      ARGt: { nominalApr: 0.17, fxOutlook: -0.0132, aiAdjustment: -0.0017, riskBuffer: 0.004, netCarry: -0.0102 },
    },
  },
  {
    id: 'month2',
    label: 'Month 2',
    shortLabel: 'M2',
    period: 'Weeks 5–8 · Brazil breakout',
    headline: 'Brazil takes the lead and triggers the first swap.',
    marketStory: 'BRAt improves sharply thanks to stronger yield plus a better macro backdrop. It overtakes USDC and becomes the highest expected carry.',
    decision: {
      asset: 'BRAt',
      status: 'swap',
      title: 'Swap to BRAt',
      why: 'Now the spread over USDC is finally strong enough. The model sees a meaningful advantage in BRAt and rotates from cash into Brazil.',
    },
    aiSummary: 'Mocked macro/news inputs favor Brazil: stable inflation, supportive central-bank tone and positive regional flow lift BRL expectations.',
    signals: {
      ARS: { score: -0.18, confidence: 0.73, note: 'Argentina improves slightly, but still trails after risk and FX.' },
      BRL: { score: 0.61, confidence: 0.84, note: 'Brazil receives the strongest positive AI signal of the replay.' },
    },
    metrics: {
      USDC: { netCarry: 0.0059 },
      BRAt: { nominalApr: 0.12, fxOutlook: 0.0118, aiAdjustment: 0.0026, riskBuffer: 0.0041, netCarry: 0.0311 },
      ARGt: { nominalApr: 0.17, fxOutlook: -0.0022, aiAdjustment: -0.0007, riskBuffer: 0.0048, netCarry: 0.0117 },
    },
  },
  {
    id: 'month3',
    label: 'Month 3',
    shortLabel: 'M3',
    period: 'Weeks 9–12 · Argentina overtakes',
    headline: 'Argentina becomes the new best carry trade.',
    marketStory: 'ARGt accelerates and overtakes BRAt during the third month. The model sees enough upside to rebalance from Brazil into Argentina.',
    decision: {
      asset: 'ARGt',
      status: 'swap',
      title: 'Swap to ARGt',
      why: 'Argentina now offers the strongest expected return. After comparing yield, FX outlook and risk, the model exits BRAt and reallocates into ARGt.',
    },
    aiSummary: 'Mocked macro/news inputs favor Argentina: disinflation surprise, rate stability and a stronger short-term FX expectation improve ARGt carry.',
    signals: {
      ARS: { score: 0.72, confidence: 0.88, note: 'Argentina gets a strong positive AI adjustment in month 3.' },
      BRL: { score: -0.12, confidence: 0.66, note: 'Brazil cools off and loses momentum after its strong month 2.' },
    },
    metrics: {
      USDC: { netCarry: 0.0082 },
      BRAt: { nominalApr: 0.12, fxOutlook: 0.0061, aiAdjustment: -0.0004, riskBuffer: 0.0042, netCarry: 0.0416 },
      ARGt: { nominalApr: 0.17, fxOutlook: 0.0216, aiAdjustment: 0.0032, riskBuffer: 0.0051, netCarry: 0.0587 },
    },
  },
] as const;

export const replayDecisionLegend: readonly { asset: ReplayDecisionAsset; label: string; color: string }[] = [
  { asset: 'USDC', label: 'USDC', color: '#2db4ff' },
  { asset: 'BRAt', label: 'BRAt', color: '#9adf3f' },
  { asset: 'ARGt', label: 'ARGt', color: '#ffd84a' },
] as const;
