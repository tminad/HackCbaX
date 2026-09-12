import type { MacroEventPack, MacroMetric } from './types.js';

export function object(value: unknown): Record<string, unknown> {
  if(!value || typeof value!=='object'||Array.isArray(value))throw new TypeError('Expected object');
  return value as Record<string,unknown>;
}
export function textValue(value: unknown, max=2000): string {
  if(typeof value!=='string'||!value.trim()||value.length>max)throw new TypeError('Invalid text');return value;
}
export function finiteValue(value: unknown): number {
  if(typeof value!=='number'||!Number.isFinite(value))throw new TypeError('Invalid number');return value;
}
export function instant(value: unknown): number {
  const s=textValue(value,50);
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)||!Number.isFinite(Date.parse(s)))throw new TypeError('Explicit ISO timezone required');
  return Date.parse(s);
}
export function keys(value: Record<string,unknown>, allowed: string[]): void {
  if(Object.keys(value).some(k=>!allowed.includes(k)))throw new TypeError('Unknown schema field');
}
/** Runtime boundary: no future releases, orphan metrics or hidden financial inputs. */
export function buildMacroEventPack(input: unknown): MacroEventPack {
  const p=object(input);keys(p,['asOf','currency','fx','inflation','rates','events']);
  const asOf=instant(p.asOf);if(!['ARS','BRL'].includes(String(p.currency)))throw new TypeError('Unsupported currency');
  if(!Array.isArray(p.events)||p.events.length>100)throw new TypeError('Invalid events');
  const ids=new Map<string,number>();
  for(const raw of p.events){const e=object(raw);keys(e,['id','publishedAt','source','title','summary','publicationNote']);
    const id=textValue(e.id,200),published=instant(e.publishedAt);
    if(ids.has(id)||published>asOf)throw new RangeError('Duplicate event or future publication');ids.set(id,published);
    const url=new URL(textValue(e.source));if(!['https:','http:'].includes(url.protocol))throw new TypeError('Invalid source URL');
    textValue(e.title,300);textValue(e.summary,3000);if(e.publicationNote!==undefined)textValue(e.publicationNote);
  }
  const validateMetric=(raw: unknown,forecast=false):void=>{
    const m=object(raw);keys(m,['value','publishedAt','sourceEventId','observedAt',...(forecast?['periodStart','periodEnd','horizonKind']:[])]);
    finiteValue(m.value);const published=instant(m.publishedAt),id=textValue(m.sourceEventId,200);
    if(published>asOf||!ids.has(id)||ids.get(id)!>published)throw new RangeError('Unpublished or unreferenced metric');
    if(m.observedAt!==undefined && (instant(m.observedAt)>asOf||instant(m.observedAt)>published))throw new RangeError('Future observation');
    if(forecast){if(!['MONTHLY_AVERAGE','MONTH_END','EXACT_30D'].includes(String(m.horizonKind)))throw new TypeError('Invalid horizon');
      if(instant(m.periodEnd)<instant(m.periodStart)||finiteValue(m.value)<=0)throw new RangeError('Invalid forecast period/value');}
  };
  const fx=object(p.fx);keys(fx,['spotLocalPerUsd','change7d','change30d','marketForecastLocalPerUsd']);
  for(const [key,value] of Object.entries(fx))validateMetric(value,key==='marketForecastLocalPerUsd');
  if(fx.spotLocalPerUsd!==undefined&&finiteValue(object(fx.spotLocalPerUsd).value)<=0)throw new RangeError('Invalid spot');
  for(const [name,allowed] of [['inflation',['latestMonthly','latestAnnual','expectedMonthly']],['rates',['policyRate','expectedPolicyRate']]] as const){
    if(p[name]!==undefined){const group=object(p[name]);keys(group,[...allowed]);Object.values(group).forEach(v=>validateMetric(v));}
  }
  const result=structuredClone(p) as unknown as MacroEventPack;
  result.asOf=new Date(asOf).toISOString();
  result.events.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  return result;
}
export function canonicalJson(value: unknown): string {
  if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
/** Keep the exact original evidence cutoff; do NOT remove asOf from cache hashing. */
export function reuseUnchangedMacroPack(previous: MacroEventPack|undefined, next: MacroEventPack): MacroEventPack {
  const normalized=buildMacroEventPack(next);
  if(!previous)return normalized;
  const prior=buildMacroEventPack(previous);
  if(instant(prior.asOf)>instant(normalized.asOf))throw new RangeError('Cannot reuse a future pack');
  return canonicalJson({...prior,asOf:null})===canonicalJson({...normalized,asOf:null})?prior:normalized;
}
export function metric(value:number,publishedAt:string,sourceEventId:string,observedAt?:string):MacroMetric {
  return {value,publishedAt,sourceEventId,...(observedAt?{observedAt}:{})};
}
