import type { ExpectedFxExplanation, ForecastMode, MacroEventPack, SignalResult } from './types.js';
import { buildMacroEventPack, instant } from './buildMacroEventPack.js';
import { validateMacroSignal } from './macroSignalSchema.js';

export const MAX_AI_FX_ADJUSTMENT_30D=0.005;
export function boundedAiAdjustment(score:number,confidence:number):number {
  if(!Number.isFinite(score)||score < -1||score>1||!Number.isFinite(confidence)||confidence<0||confidence>1)throw new RangeError('Invalid AI adjustment input');
  return score*confidence*MAX_AI_FX_ADJUSTMENT_30D;
}
export function composeExpectedFxReturn(pack:MacroEventPack,result:SignalResult,mode:ForecastMode='EXACT_30D'):ExpectedFxExplanation {
  buildMacroEventPack(pack);
  if(result.asOf!==pack.asOf)throw new RangeError('Signal belongs to a different macro cutoff');
  const signal=result.signal?validateMacroSignal(result.signal,pack):null;
  const active=result.aiStatus==='live'||result.aiStatus==='cached';
  if(active&&!signal)throw new TypeError('Successful AI status requires signal');
  const adjustment=active?boundedAiAdjustment(signal!.macroScore,signal!.confidence):0;
  const f=pack.fx.marketForecastLocalPerUsd,spot=pack.fx.spotLocalPerUsd;
  let base:number|null=null,source:string|null=null,horizon:number|null=null,approximation:string|null=null;
  if(f&&spot){
    const target=f.horizonKind==='MONTHLY_AVERAGE'?(instant(f.periodStart)+instant(f.periodEnd))/2:instant(f.periodEnd);
    horizon=(target-instant(spot.observedAt??spot.publishedAt))/86400000;
    const fresh=instant(pack.asOf)-instant(spot.publishedAt)<=5*86400000 && instant(pack.asOf)-instant(f.publishedAt)<=45*86400000;
    if(horizon>0 && fresh && (mode==='PUBLISHED_HORIZON_APPROXIMATION'||(f.horizonKind==='EXACT_30D'&&horizon===30))){
      base=spot.value/f.value-1;source=pack.events.find(e=>e.id===f.sourceEventId)!.source;
      if(f.horizonKind!=='EXACT_30D')approximation=`${f.horizonKind} forecast used unchanged as a 30-day proxy; no interpolation, annualization or time scaling. Representative horizon ${horizon} days from spot observation.`;
    }
  }
  let forecastStatus:ExpectedFxExplanation['forecastStatus']=base===null?'unavailable':'available';
  if(mode==='DIAGNOSTIC_ZERO_BASELINE'){base=0;source=null;forecastStatus='diagnostic_zero';approximation='DIAGNOSTIC_ZERO_BASELINE: explicitly substitutes zero, never a production forecast.';}
  const final=base===null?null:base+adjustment;
  if(final!==null&&!Number.isFinite(final))throw new RangeError('FX composition overflow');
  return {baseFxReturn30d:base,baseSource:source,forecastHorizonDays:horizon,
    forecastPeriod:f?{start:f.periodStart,end:f.periodEnd,kind:f.horizonKind}:null,approximation,
    macroScore:signal?.macroScore??null,confidence:signal?.confidence??null,aiAdjustment:adjustment,
    finalExpectedFxReturn30d:final,aiStatus:result.aiStatus,forecastStatus,inputHash:result.inputHash,model:result.model};
}
