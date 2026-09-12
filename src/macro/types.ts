/** Macro rates/returns are decimal fractions. Sources may publish percentage points. */
export type Currency = 'ARS' | 'BRL';
export interface MacroEvent { id: string; publishedAt: string; source: string; title: string; summary: string; publicationNote?: string }
export interface MacroMetric { value: number; publishedAt: string; sourceEventId: string; observedAt?: string }
export interface FxForecast extends MacroMetric {
  periodStart: string; periodEnd: string;
  horizonKind: 'MONTHLY_AVERAGE' | 'MONTH_END' | 'EXACT_30D';
}
export interface MacroEventPack {
  asOf: string; currency: Currency;
  fx: { spotLocalPerUsd?: MacroMetric; change7d?: MacroMetric; change30d?: MacroMetric; marketForecastLocalPerUsd?: FxForecast };
  inflation?: { latestMonthly?: MacroMetric; latestAnnual?: MacroMetric; expectedMonthly?: MacroMetric };
  rates?: { policyRate?: MacroMetric; expectedPolicyRate?: MacroMetric };
  events: MacroEvent[];
}
export interface MacroRelease {
  currency: Currency; event: MacroEvent; forecasts?: FxForecast[];
  inflation?: MacroEventPack['inflation']; rates?: MacroEventPack['rates'];
}
export interface MacroSignal {
  currency: Currency; macroScore: number; confidence: number;
  impact: 'strong_negative' | 'negative' | 'neutral' | 'positive' | 'strong_positive';
  eventRisk: 'low' | 'medium' | 'high'; summary: string;
  factors: { sourceEventId: string; direction: 'negative' | 'neutral' | 'positive'; reason: string }[];
}
export type AiStatus = 'live' | 'cached' | 'fallback_neutral' | 'unavailable';
export interface SignalResult {
  aiStatus: AiStatus; signal: MacroSignal | null; inputHash: string; model: string;
  generatedAt: string | null; asOf: string; failure: string | null; modelVersion: string | null;
}
export interface CachedMacroSignal {
  generatedAt: string; asOf: string; model: string; modelVersion: string | null;
  inputHash: string; promptVersion: string; signal: MacroSignal; sourceEventIds: string[];
}
export interface MacroSignalCache { get(hash: string): Promise<unknown>; set(hash: string, value: CachedMacroSignal): Promise<void> }
export interface MacroIntelligenceProvider {
  readonly model: string;
  generate(pack: MacroEventPack, abortSignal: AbortSignal): Promise<{ output: unknown; modelVersion?: string }>;
}
export type ForecastMode = 'EXACT_30D' | 'PUBLISHED_HORIZON_APPROXIMATION' | 'DIAGNOSTIC_ZERO_BASELINE';
export interface ExpectedFxExplanation {
  baseFxReturn30d: number | null; baseSource: string | null;
  forecastHorizonDays: number | null; forecastPeriod: { start: string; end: string; kind: string } | null;
  approximation: string | null; macroScore: number | null; confidence: number | null;
  aiAdjustment: number; finalExpectedFxReturn30d: number | null;
  aiStatus: AiStatus; forecastStatus: 'available' | 'unavailable' | 'diagnostic_zero';
  inputHash: string; model: string;
}
