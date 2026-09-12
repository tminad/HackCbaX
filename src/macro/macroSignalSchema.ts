import type { MacroEventPack, MacroSignal } from './types.js';
import { buildMacroEventPack, object, keys, textValue, finiteValue } from './buildMacroEventPack.js';

export const MACRO_SIGNAL_SCHEMA={type:'object',additionalProperties:false,required:['currency','macroScore','confidence','impact','eventRisk','summary','factors'],
  properties:{currency:{type:'string',enum:['ARS','BRL']},macroScore:{type:'number',minimum:-1,maximum:1},confidence:{type:'number',minimum:0,maximum:1},
    impact:{type:'string',enum:['strong_negative','negative','neutral','positive','strong_positive']},eventRisk:{type:'string',enum:['low','medium','high']},
    summary:{type:'string',maxLength:1200},factors:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,
      required:['sourceEventId','direction','reason'],properties:{sourceEventId:{type:'string'},direction:{type:'string',enum:['negative','neutral','positive']},reason:{type:'string',maxLength:800}}}}}};
export function validateMacroSignal(input:unknown,pack:MacroEventPack):MacroSignal {
  buildMacroEventPack(pack);
  let raw=input;if(typeof input==='string'){try{raw=JSON.parse(input);}catch{throw new TypeError('Invalid Gemini JSON');}}
  const s=object(raw);keys(s,['currency','macroScore','confidence','impact','eventRisk','summary','factors']);
  if(s.currency!==pack.currency)throw new TypeError('Signal currency mismatch');
  const score=finiteValue(s.macroScore),confidence=finiteValue(s.confidence);
  if(score < -1||score > 1||confidence<0||confidence>1)throw new RangeError('Signal outside bounds');
  if(!MACRO_SIGNAL_SCHEMA.properties.impact.enum.includes(String(s.impact))||!MACRO_SIGNAL_SCHEMA.properties.eventRisk.enum.includes(String(s.eventRisk)))throw new TypeError('Invalid signal enum');
  textValue(s.summary,1200);
  if(!Array.isArray(s.factors)||s.factors.length>20)throw new TypeError('Invalid factors');
  const ids=new Set(pack.events.map(e=>e.id));
  for(const raw of s.factors){const f=object(raw);keys(f,['sourceEventId','direction','reason']);
    if(!ids.has(textValue(f.sourceEventId,200)))throw new TypeError('Unknown source event');
    if(!['negative','neutral','positive'].includes(String(f.direction)))throw new TypeError('Invalid direction');textValue(f.reason,800);}
  if(s.factors.length===0&&score*confidence!==0)throw new TypeError('Nonzero adjustment requires evidence');
  return structuredClone(s) as unknown as MacroSignal;
}
