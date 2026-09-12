import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { historicalMacroPack } from '../dist/historical/macro/historicalMacroPacks.js';
import { reuseUnchangedMacroPack } from '../dist/macro/buildMacroEventPack.js';
import { composeExpectedFxReturn } from '../dist/macro/composeExpectedFxReturn.js';
import { resolveMacroSignal } from '../dist/macro/macroIntelligenceProvider.js';
import { FileMacroSignalCache } from '../dist/adapters/gemini/fileMacroSignalCache.js';
import { GeminiMacroProvider } from '../dist/adapters/gemini/geminiMacroProvider.js';
import { evaluateAiCheckpoint } from '../dist/historical/macro/aiAssistedCheckpoint.js';

const read=async p=>JSON.parse(await readFile(p,'utf8'));
const write=async(p,v)=>{await mkdir(p.split('/').slice(0,-1).join('/'),{recursive:true});await writeFile(p,JSON.stringify(v,null,2)+'\n');};
const pct=x=>x===null||x===undefined?'MISSING':`${(x*100).toFixed(3)}%`;
const checkpoints=['2026-09-06T00:00:00.000Z','2026-09-12T10:00:00.000Z','2026-09-12T11:00:00.000Z'];
const dataset=await read('data/historical/normalized-history.json');
const source=await read('data/historical/source-history.json');
const collected=await read('data/macro/sources/collected-releases.json');
const replay100=await read('data/historical/replay-100-base.json');
const model=replay100.model, routeLiquidityUsd=replay100.options.modeledRouteLiquidityUsd;
if(!model||model.positionSizeUsd!==100)throw new Error('Expected saved $100 BASE execution model');
if(!Number.isFinite(routeLiquidityUsd)||routeLiquidityUsd<=0)throw new Error('Saved route-liquidity assumption unavailable');

const modelName=(process.env.GEMINI_MODEL||'').trim();
const hasCredentials=Boolean(process.env.GEMINI_API_KEY&&modelName);
const provider=hasCredentials?new GeminiMacroProvider():{model:modelName||'gemini-unconfigured',async generate(){throw new Error('Gemini unavailable');}};
const cache=new FileMacroSignalCache('data/macro/cache');
const fxSources={ARS:'https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial',BRL:'https://api.frankfurter.dev/'};
const releases=collected.releases;
let previousPack={ARS:undefined,BRL:undefined};
let currentAsset=null,lastRebalanceAtMs=null;
const rows=[], signals=[];

for(const checkpoint of checkpoints){
  const timestamp=Date.parse(checkpoint),market=dataset.snapshots.find(s=>s.timestamp===timestamp);
  if(!market)throw new Error(`Historical snapshot missing: ${checkpoint}`);
  const explanations={};
  const checkpointSignals={};
  for(const [currency,asset] of [['ARS','ARGt'],['BRL','BRAt']]){
    const raw=historicalMacroPack(checkpoint,currency,releases,source.assets[asset].fx,fxSources[currency]);
    const effective=reuseUnchangedMacroPack(previousPack[currency],raw);previousPack[currency]=effective;
    const fileDate=checkpoint.slice(0,13).replace('T','-').replace(':','');
    await write(`data/macro/historical/${fileDate}-${currency}-pack.json`,effective);
    const signal=await resolveMacroSignal(effective,provider,cache,{allowNetwork:hasCredentials,timeoutMs:30000});
    const explanation=composeExpectedFxReturn(effective,signal,'PUBLISHED_HORIZON_APPROXIMATION');
    explanations[asset]=explanation;checkpointSignals[currency]=signal;
    signals.push({checkpoint,currency,packAsOf:effective.asOf,reusedPack:effective.asOf!==checkpoint,...signal,explanation});
  }
  const evaluated=evaluateAiCheckpoint(market,{ARGt:explanations.ARGt,BRAt:explanations.BRAt},model,
    {positionSizeUsd:100,routeLiquidityUsd,currentAsset,lastRebalanceAtMs});
  if(evaluated.action==='INITIAL_ALLOCATION'||evaluated.action==='STAY_USDC'||evaluated.action==='REBALANCE'){
    if(evaluated.action==='REBALANCE')lastRebalanceAtMs=timestamp;
    currentAsset=evaluated.currentAsset;
  }
  rows.push({checkpoint,signals:checkpointSignals,fx:explanations,result:evaluated});
}
await write('data/macro/historical/signals.json',signals);
await write('data/macro/historical/ai-assisted-replay.json',{generatedAt:new Date().toISOString(),model:provider.model,liveGeminiEnabled:hasCredentials,
  positionSizeUsd:100,executionModel:model,routeLiquidityUsd,checkpoints:rows});

const lines=[];
for(const row of rows){
  lines.push(`## ${row.checkpoint}`,'',`Action: **${row.result.action}** — ${row.result.reason}`,'',
    `PRE-AI winner: **${row.result.preAiWinner??'NONE'}**  `,`AI-assisted winner: **${row.result.aiWinner??'NONE'}**`,'',
    `Defensive USDC benchmark: **0.000% Net Carry**`,'');
  for(const asset of ['ARGt','BRAt']){
    const currency=asset==='ARGt'?'ARS':'BRL',sig=row.signals[currency],fx=row.fx[asset],pre=row.result.preAi.find(x=>x.asset===asset),post=row.result.aiAssisted.find(x=>x.asset===asset);
    lines.push(`### ${asset} / ${currency}`,'',`- AI status: ${sig.aiStatus}`,
      `- Macro score / confidence: ${sig.signal?`${sig.signal.macroScore.toFixed(3)} / ${sig.signal.confidence.toFixed(3)}`:'MISSING'}`,
      `- Base FX: ${pct(fx.baseFxReturn30d)}`,
      `- AI adjustment: ${pct(fx.aiAdjustment)}`,
      `- Final expected FX: ${pct(fx.finalExpectedFxReturn30d)}`,
      `- PRE-AI Net Carry: ${pct(pre?.netCarry30d)}`,
      `- AI-assisted Net Carry: ${pct(post?.netCarry30d)}`,'');
  }
}
const report=`# Macro Intelligence Report\n\nGenerated: ${new Date().toISOString()}\n\n## Architecture\n\nGemini receives only point-in-time macro evidence. It returns a bounded MacroSignal; deterministic code composes the signal with a published FX baseline, and the approved financial core alone calculates Net Carry and HOLD/REBALANCE. Gemini never sees Morpho ranking or Curve costs.\n\n## Guardrails\n\n- Every historical evidence item must have publishedAt <= asOf.\n- AI adjustment = macroScore × confidence × 0.50%; absolute contribution is capped by construction at 0.50% over 30 days.\n- Monthly REM/Focus forecasts are used only in PUBLISHED_HORIZON_APPROXIMATION mode, unchanged and explicitly labeled as an approximation; no fake interpolation.\n- Gemini/API failure produces zero AI adjustment, never a fabricated signal.\n- Historical execution remains a $100 exploratory diagnostic with modeled Curve execution costs.\n\n## Gemini runtime\n\nConfigured model: **${provider.model}**. Live credentials available during this run: **${hasCredentials?'YES':'NO'}**.\n\n${lines.join('\n')}\n## Limitations\n\nThis is not a point-in-time audited trading backtest. Macro corpus is curated rather than exhaustive; monthly survey forecasts are approximations to a 30-day horizon; fiat FX is a proxy for Twin-token FX; Curve execution costs remain modeled; and Gemini pretraining knowledge leakage cannot be mathematically proven absent even though the prompt forbids outside/future knowledge.\n`;
await mkdir('docs',{recursive:true});await writeFile('docs/MACRO_INTELLIGENCE_REPORT.md',report);
console.log(JSON.stringify({model:provider.model,liveGeminiEnabled:hasCredentials,results:rows.map(r=>({checkpoint:r.checkpoint,action:r.result.action,preAiWinner:r.result.preAiWinner,aiWinner:r.result.aiWinner,
  ARS:r.signals.ARS.aiStatus,BRL:r.signals.BRL.aiStatus}))},null,2));
