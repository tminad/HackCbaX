import test from 'node:test';
import assert from 'node:assert/strict';
import { apyToApr, percentageAprToDecimal, normalizeMorphoSeries } from '../dist/adapters/morpho/normalization.js';
import { fxObservation } from '../dist/adapters/fx/client.js';
import { commonStart, asOf, trailingVolatility30d, buildHistoricalSnapshots } from '../dist/historical/buildHistoricalDataset.js';
import { executionCosts, stressModel } from '../dist/historical/executionCostModel.js';
import { historicalReplay, replayStatistics } from '../dist/historical/historicalReplay.js';
import { estimateSwitchCost } from '../dist/domain/index.js';

// Synthetic inputs exist ONLY in unit tests, never in the historical artifacts.
const HOUR=3600000, DAY=24*HOUR, T=Date.parse('2026-08-01T00:00:00Z');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const obs=(timestamp,value,availableAt=timestamp)=>({timestamp,value,availableAt,source:'synthetic-test'});
const model={name:'BASE',swapFeePct:.0004,estimatedSlippagePct:.0005,gasPct:.0001,otherFeesPct:0,
  calibrationTimestamp:T,positionSizeUsd:1000,evidence:['test only'],assumptions:[]};
const strict={mode:'STRICT',riskMode:'TRAILING_FX'};
const exploratory={mode:'EXPLORATORY',riskMode:'TRAILING_FX',modeledRouteLiquidityUsd:10000};
const asset=(baseApr)=>({baseApr,incentiveApr:0,incentiveDaysLeft:0,fxVolatility30d:0,
  availableLiquidityUsd:10000,idleLiquidityUsd:10000,depositAvailable:true,depositCapacityUsd:10000,criticalRisk:false,sources:[],missing:[]});
const row=(hour,arg,bra)=>({timestamp:T+hour*HOUR,argt:asset(arg),brat:asset(bra),curve:{routeAvailable:true,routeSafe:true,routeLiquidityUsd:10000}});
const dataset=(snapshots)=>({schemaVersion:1,retrievedAt:'2026-09-01T00:00:00Z',infrastructureStart:T,
  decisionFxBaseline:'NEUTRAL FX BASELINE — PRE-AI',notes:[],snapshots});
const history=(name)=>({asset:name,token:'test',vault:'test',creationTimestamp:T,baseApr:[obs(T,.1)],reportedNetApy:[],
  totalAssets:[],idleAssets:[],tvlUsd:[],fx:[],campaigns:[]});

test('historical APY to APR has explicit compounding convention and round-trips',()=>{
  for(const n of [1,365,8760])for(const apy of [0,.12,-.01,1]){
    const apr=apyToApr(apy,n);near(Math.expm1(n*Math.log1p(apr/n)),apy);
  }
  assert.ok(apyToApr(.12,8760)<.12);
  for(const x of [-1,NaN,Infinity])assert.throws(()=>apyToApr(x,8760));
  assert.throws(()=>apyToApr(.1,0));
});
test('reward percentage APR is divided by 100, not APY-converted',()=>{
  near(percentageAprToDecimal(17),.17);near(percentageAprToDecimal(.5),.005);
  assert.throws(()=>percentageAprToDecimal(Infinity));
});
test('Morpho adapter sorts ascending, converts seconds, preserves real zero, omits null',()=>{
  const result=normalizeMorphoSeries([{x:3,y:.12},{x:1,y:null},{x:2,y:0}],'test',x=>apyToApr(x,8760));
  assert.deepEqual(result.map(p=>p.timestamp),[2000,3000]);assert.equal(result[0].value,0);
  near(result[1].value,apyToApr(.12,8760));assert.equal(result[1].availableAt,3000);
  assert.throws(()=>normalizeMorphoSeries([{x:1,y:'garbage'}],'test'));
});
test('FX adapter inverts local per USD and delays daily publication',()=>{
  const p=fxObservation('2026-08-01',5,'test');near(p.value,.2);assert.equal(p.availableAt,T+DAY);
  assert.throws(()=>fxObservation('invalid',5,'test'));assert.throws(()=>fxObservation('2026-08-01',0,'test'));
});
test('common infrastructure start requires all availability dates',()=>{
  assert.equal(commonStart([T,T+HOUR,T-DAY]),T+HOUR);
  for(const dates of [[],[T,null],[NaN,T]])assert.equal(commonStart(dates),null);
});
test('asOf excludes future observations, unpublished daily buckets and stale values',()=>{
  const data=[obs(T+HOUR,99),obs(T,.2,T+HOUR),obs(T-HOUR,.1)];
  assert.equal(asOf(data,T,DAY).value,.1);assert.equal(asOf(data,T+HOUR,DAY).value,99);
  assert.equal(asOf(data,T+3*DAY,DAY),undefined);
});
test('trailing volatility uses past published data only and rejects insufficient history',()=>{
  const data=Array.from({length:45},(_,i)=>obs(T-(44-i)*DAY,Math.exp(.002*Math.sin(i)),T-(43-i)*DAY));
  const vol=trailingVolatility30d(data,T);assert.ok(vol>0);
  assert.equal(trailingVolatility30d([...data,obs(T+DAY,1e10),obs(T,.8,T+DAY)],T),vol);
  assert.equal(trailingVolatility30d(data.slice(-10),T),undefined);
});
test('trailing volatility reports long gaps and never substitutes zero',()=>{
  const data=Array.from({length:25},(_,i)=>obs(T-(40-i)*DAY,1+i*.001));data.push(obs(T,1.1));
  assert.equal(trailingVolatility30d(data,T),undefined);
});
test('dataset builder orders hourly samples without changing inputs or filling missing rates',()=>{
  const a=history('ARGt'),b=history('BRAt');a.baseApr=[obs(T+HOUR,.2),obs(T,.1)];b.baseApr=[obs(T,.3)];
  const before=structuredClone({ARGt:a,BRAt:b});const result=buildHistoricalSnapshots(before,T,T+HOUR);
  assert.deepEqual(result.map(s=>s.timestamp),[T,T+HOUR]);assert.equal(result[0].argt.incentiveApr,undefined);
  assert.equal(result[0].argt.availableLiquidityUsd,undefined);assert.ok(result[0].argt.missing.includes('fxVolatility30d'));
  assert.deepEqual(before,{ARGt:a,BRAt:b});assert.throws(()=>buildHistoricalSnapshots(before,T,T-DAY));
});
test('future FX cannot change an earlier normalized snapshot',()=>{
  const a=history('ARGt'),b=history('BRAt');a.fx=[obs(T-DAY,.001)];
  const original=buildHistoricalSnapshots({ARGt:a,BRAt:b},T,T);
  a.fx.push(obs(T+DAY,10000),obs(T,999,T+DAY));
  assert.deepEqual(buildHistoricalSnapshots({ARGt:a,BRAt:b},T,T),original);
});
test('recorded historical USD TVL takes priority over proxy valuation with provenance',()=>{
  const a=history('ARGt'),b=history('BRAt');a.totalAssets=[obs(T,1000)];a.fx=[obs(T-DAY,.2)];
  a.campaigns=[{id:'test',start:T-DAY,end:T+DAY,createdAt:T-DAY,hasOverrides:false,apr:[],tvl:[obs(T-DAY,250)]}];
  let r=buildHistoricalSnapshots({ARGt:a,BRAt:b},T,T)[0].argt;
  assert.equal(r.tvlUsd,250);assert.equal(r.tvlUsdBasis,'SOURCE_USD');
  a.campaigns[0].tvl=[obs(T,9999,T+DAY)];r=buildHistoricalSnapshots({ARGt:a,BRAt:b},T,T)[0].argt;
  assert.equal(r.tvlUsd,200);assert.equal(r.tvlUsdBasis,'OFFICIAL_FX_PROXY');
  assert.equal(r.availableLiquidityUsd,undefined);
});
test('future campaign and unpublished metrics cannot provide incentives at T',()=>{
  const a=history('ARGt'),b=history('BRAt');
  a.campaigns=[{id:'test',start:T-DAY,end:T+30*DAY,createdAt:T+HOUR,hasOverrides:false,apr:[obs(T-DAY,.2)],tvl:[]}];
  assert.equal(buildHistoricalSnapshots({ARGt:a,BRAt:b},T,T)[0].argt.incentiveApr,undefined);
  a.campaigns[0].createdAt=T-DAY;a.campaigns[0].apr=[obs(T,.2,T+DAY)];
  assert.equal(buildHistoricalSnapshots({ARGt:a,BRAt:b},T,T)[0].argt.incentiveApr,undefined);
});
test('overridden campaign schedule stays missing, and pre-start metric is rejected',()=>{
  const a=history('ARGt'),b=history('BRAt');
  a.campaigns=[{id:'test',start:T-DAY,end:T+30*DAY,createdAt:T-DAY,hasOverrides:true,apr:[obs(T-DAY,.2)],tvl:[]}];
  let r=buildHistoricalSnapshots({ARGt:a,BRAt:b},T,T)[0].argt;
  assert.equal(r.incentiveApr,.2);assert.equal(r.incentiveDaysLeft,undefined);
  a.campaigns[0].apr=[obs(T-2*DAY,.5)];r=buildHistoricalSnapshots({ARGt:a,BRAt:b},T,T)[0].argt;
  assert.equal(r.incentiveApr,undefined);
});
test('execution cost mapping uses approved sum; STRESS has configurable conservative components',()=>{
  near(estimateSwitchCost(executionCosts(model)).totalPct,.001);
  const stressed=stressModel(model,2,3);near(stressed.estimatedSlippagePct,.001);near(stressed.gasPct,.0003);
  assert.equal(stressed.swapFeePct,model.swapFeePct);assert.equal(model.name,'BASE');
  assert.throws(()=>stressModel(model,.5,2));assert.throws(()=>executionCosts({...model,gasPct:-1}));
});
test('replay sorts timestamps, is deterministic and does not mutate inputs',()=>{
  const data=dataset([row(2,.1,.2),row(0,.2,.1),row(1,.1,.2)]),before=structuredClone(data);
  const a=historicalReplay(data,model,strict);assert.deepEqual(a,historicalReplay(data,model,strict));assert.deepEqual(data,before);
  assert.deepEqual(a.map(r=>r.timestamp),[T,T+HOUR,T+2*HOUR]);
  assert.throws(()=>historicalReplay(dataset([row(0,.2,.1),row(0,.1,.2)]),model,strict));
});
test('initial allocation ignores switching cost margin and sets neutral FX baseline',()=>{
  const r=historicalReplay(dataset([row(0,.12,.1)]),{...model,swapFeePct:.5},strict)[0];
  assert.equal(r.action,'INITIAL_ALLOCATION');assert.equal(r.selected,'ARGt');assert.equal(r.decision,undefined);
  near(r.ranking[0].netCarry30d,.12*30/365);assert.match(r.metadata.fxBaseline,/NEUTRAL FX BASELINE/);
});
test('historical ShouldRebalance observes 12-hour cooldown, including exact expiry',()=>{
  const result=historicalReplay(dataset([row(0,.2,.1),row(1,.1,.3),row(2,.4,.1),row(13,.4,.1)]),model,strict);
  assert.deepEqual(result.map(r=>r.action),['INITIAL_ALLOCATION','REBALANCE','HOLD','REBALANCE']);
  assert.equal(result[2].decision.reason,'COOLDOWN_ACTIVE');assert.equal(result[3].decision.reason,'SUFFICIENT_BENEFIT');
  assert.equal(replayStatistics(result).cooldownBlocked,1);
});
test('BASE can rebalance while STRESS holds using identical market data',()=>{
  const data=dataset([row(0,.15,.1),row(1,.1,.145)]);
  assert.equal(historicalReplay(data,model,strict)[1].action,'REBALANCE');
  assert.equal(historicalReplay(data,stressModel(model,4,5),strict)[1].action,'HOLD');
});
test('missing historical eligibility fails closed rather than producing HOLD or allocation',()=>{
  const sample=row(0,.2,.1);delete sample.argt.depositAvailable;delete sample.brat.criticalRisk;
  const r=historicalReplay(dataset([sample]),model,strict)[0];assert.equal(r.action,'SKIP');assert.equal(r.selected,null);
  assert.equal(r.exclusions.length,2);assert.equal(replayStatistics([r]).holds,0);
});
test('missing financial inputs are not fabricated even in exploratory mode',()=>{
  const sample=row(0,.2,.1);delete sample.argt.incentiveDaysLeft;delete sample.brat.fxVolatility30d;
  const r=historicalReplay(dataset([sample]),model,exploratory)[0];assert.equal(r.action,'SKIP');
  assert.equal(r.metadata.eligibility,'MODELED_AVAILABILITY');assert.ok(r.metadata.assumptions.length>0);
});
test('exploratory defaults never override observed risk, deposit or route failures',()=>{
  const sample=row(0,.2,.1);sample.argt.criticalRisk=true;sample.brat.depositAvailable=false;
  assert.equal(historicalReplay(dataset([sample]),model,exploratory)[0].action,'SKIP');
  sample.argt.criticalRisk=false;sample.brat.depositAvailable=true;sample.curve.routeSafe=false;
  assert.equal(historicalReplay(dataset([sample]),model,exploratory)[0].action,'SKIP');
});
test('excessive modeled slippage blocks entry, diagnostic ranking is never execution',()=>{
  const r=historicalReplay(dataset([row(0,.2,.1)]),{...model,estimatedSlippagePct:.012},strict)[0];
  assert.equal(r.action,'SKIP');assert.equal(r.ranking.length,0);assert.equal(r.diagnosticRanking.length,2);
  assert.ok(r.exclusions.every(c=>c.reasons.includes('EXCESSIVE_SLIPPAGE')));
});
test('adding future markets cannot change historical replay prefix',()=>{
  const samples=[row(0,.2,.1),row(1,.1,.3)],prefix=historicalReplay(dataset(samples),model,strict);
  assert.deepEqual(historicalReplay(dataset([...samples,row(100,100,200)]),model,strict).slice(0,2),prefix);
});
test('no replay runs before required swap infrastructure exists',()=>{
  const d=dataset([row(0,.2,.1)]);d.infrastructureStart=T+HOUR;
  assert.equal(historicalReplay(d,model,exploratory)[0].action,'SKIP');d.infrastructureStart=null;
  assert.equal(historicalReplay(d,model,strict)[0].action,'SKIP');
});
