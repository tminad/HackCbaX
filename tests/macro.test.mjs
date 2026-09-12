import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMacroEventPack, reuseUnchangedMacroPack } from '../dist/macro/buildMacroEventPack.js';
import { boundedAiAdjustment, composeExpectedFxReturn, MAX_AI_FX_ADJUSTMENT_30D } from '../dist/macro/composeExpectedFxReturn.js';
import { MemoryMacroSignalCache, resolveMacroSignal } from '../dist/macro/macroIntelligenceProvider.js';
import { validateMacroSignal } from '../dist/macro/macroSignalSchema.js';

const event={id:'survey',publishedAt:'2026-09-05T03:00:00.000Z',source:'https://example.com/survey',title:'Survey',summary:'Published market survey'};
const fxEvent={id:'fx',publishedAt:'2026-09-06T00:00:00.000Z',source:'https://example.com/fx',title:'FX',summary:'Observed FX'};
const pack=()=>buildMacroEventPack({asOf:'2026-09-06T00:00:00.000Z',currency:'ARS',events:[event,fxEvent],fx:{
  spotLocalPerUsd:{value:1505,publishedAt:fxEvent.publishedAt,sourceEventId:'fx',observedAt:'2026-09-05T00:00:00.000Z'},
  marketForecastLocalPerUsd:{value:1565,publishedAt:event.publishedAt,sourceEventId:'survey',periodStart:'2026-10-01T00:00:00.000Z',periodEnd:'2026-10-31T23:59:59.999Z',horizonKind:'MONTHLY_AVERAGE'}
}});
const signal={currency:'ARS',macroScore:0.5,confidence:0.8,impact:'positive',eventRisk:'medium',summary:'Supportive',factors:[{sourceEventId:'survey',direction:'positive',reason:'Survey evidence'}]};

test('future macro evidence is rejected',()=>{
  assert.throws(()=>buildMacroEventPack({asOf:'2026-09-06T00:00:00.000Z',currency:'ARS',events:[{...event,publishedAt:'2026-09-07T00:00:00.000Z'}],fx:{}}));
});

test('macro signal bounds and evidence IDs are enforced',()=>{
  assert.equal(validateMacroSignal(signal,pack()).macroScore,0.5);
  assert.throws(()=>validateMacroSignal({...signal,macroScore:1.1},pack()));
  assert.throws(()=>validateMacroSignal({...signal,factors:[{...signal.factors[0],sourceEventId:'missing'}]},pack()));
});

test('AI adjustment is deterministic and capped by inputs',()=>{
  assert.equal(MAX_AI_FX_ADJUSTMENT_30D,0.005);
  assert.equal(boundedAiAdjustment(1,1),0.005);
  assert.equal(boundedAiAdjustment(-1,1),-0.005);
  assert.equal(boundedAiAdjustment(0.5,0.8),0.002);
  assert.throws(()=>boundedAiAdjustment(2,1));
});

test('published monthly forecast composes with bounded AI adjustment',()=>{
  const p=pack();
  const result={aiStatus:'live',signal,inputHash:'x',model:'fake',generatedAt:'2026-09-12T00:00:00.000Z',asOf:p.asOf,failure:null,modelVersion:'fake-v1'};
  const out=composeExpectedFxReturn(p,result,'PUBLISHED_HORIZON_APPROXIMATION');
  assert.ok(Math.abs(out.baseFxReturn30d-(1505/1565-1))<1e-12);
  assert.equal(out.aiAdjustment,0.002);
  assert.ok(Math.abs(out.finalExpectedFxReturn30d-(1505/1565-1+0.002))<1e-12);
  assert.equal(out.forecastStatus,'available');
  assert.match(out.approximation,/MONTHLY_AVERAGE/);
});

test('provider cache prevents repeated model calls',async()=>{
  const p=pack();let calls=0;
  const provider={model:'fake-model',async generate(){calls++;return {output:signal,modelVersion:'fake-v1'};}};
  const cache=new MemoryMacroSignalCache();
  const first=await resolveMacroSignal(p,provider,cache,{now:()=> '2026-09-12T00:00:00.000Z'});
  const second=await resolveMacroSignal(p,provider,cache,{now:()=> '2026-09-12T00:01:00.000Z'});
  assert.equal(first.aiStatus,'live');assert.equal(second.aiStatus,'cached');assert.equal(calls,1);
});

test('provider failure never fabricates a macro signal',async()=>{
  const p=pack();const provider={model:'fake-model',async generate(){throw new Error('down');}};
  const result=await resolveMacroSignal(p,provider,new MemoryMacroSignalCache(),{timeoutMs:50});
  assert.equal(result.aiStatus,'unavailable');assert.equal(result.signal,null);
  const out=composeExpectedFxReturn(p,result,'PUBLISHED_HORIZON_APPROXIMATION');
  assert.equal(out.aiAdjustment,0);
  assert.ok(out.finalExpectedFxReturn30d!==null);
});

test('unchanged evidence reuses earlier pack and therefore cache identity',()=>{
  const p=pack();
  const later=buildMacroEventPack({...p,asOf:'2026-09-06T01:00:00.000Z'});
  const reused=reuseUnchangedMacroPack(p,later);
  assert.equal(reused.asOf,p.asOf);
});

import { evaluateAiCheckpoint } from '../dist/historical/macro/aiAssistedCheckpoint.js';

test('AI historical checkpoint keeps defensive USDC when all local carries are negative',()=>{
  const row={timestamp:Date.parse('2026-09-06T00:00:00.000Z'),
    argt:{baseApr:0.12,incentiveApr:0,incentiveDaysLeft:0,fxVolatility30d:0.01,availableLiquidityUsd:1000,sources:[],missing:[]},
    brat:{baseApr:0.10,incentiveApr:0,incentiveDaysLeft:0,fxVolatility30d:0.01,availableLiquidityUsd:1000,sources:[],missing:[]}};
  const explanation=(fx)=>({baseFxReturn30d:fx,baseSource:'https://example.com',forecastHorizonDays:30,forecastPeriod:null,approximation:null,
    macroScore:0,confidence:1,aiAdjustment:0,finalExpectedFxReturn30d:fx,aiStatus:'cached',forecastStatus:'available',inputHash:'x',model:'fake'});
  const model={name:'BASE',swapFeePct:0.006,estimatedSlippagePct:0.001,gasPct:0.0005,otherFeesPct:0,calibrationTimestamp:1,positionSizeUsd:100,evidence:[],assumptions:[]};
  const result=evaluateAiCheckpoint(row,{ARGt:explanation(-0.03),BRAt:explanation(-0.02)},model,
    {positionSizeUsd:100,routeLiquidityUsd:1000,currentAsset:null,lastRebalanceAtMs:null});
  assert.equal(result.preAiWinner,'ARGt');
  assert.equal(result.aiWinner,'USDC');
  assert.equal(result.action,'STAY_USDC');
  assert.equal(result.currentAsset,'USDC');
  assert.equal(result.aiAssisted.find(x=>x.asset==='USDC').netCarry30d,0);
});
