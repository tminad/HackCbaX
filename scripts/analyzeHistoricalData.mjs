import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { buildHistoricalSnapshots, asOf } from '../dist/historical/buildHistoricalDataset.js';
import { executionCosts, stressModel } from '../dist/historical/executionCostModel.js';
import { historicalReplay, replayStatistics } from '../dist/historical/historicalReplay.js';
import { effectiveApr, estimateSwitchCost } from '../dist/domain/index.js';

const read=async name=>JSON.parse(await readFile(`data/historical/${name}.json`,'utf8'));
const write=async(name,data)=>writeFile(`data/historical/${name}.json`,JSON.stringify(data)+'\n');
const discovery=await read('discovery'), {assets}=await read('source-history');
const c=discovery.calibration, DAY=86400000;
const iso=t=>t===undefined||t===null?'MISSING':new Date(t).toISOString();
const pct=x=>x===null||x===undefined?'MISSING':`${(x*100).toFixed(6)}%`;
const range=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?{count:v.length,min:v[0],max:v.at(-1),median:(v[Math.floor((v.length-1)/2)]+v[Math.floor(v.length/2)])/2}:null;};
function modelFor(amount){
  const impact=['ARGt','BRAt'].map(asset=>{
    const small=c.quotes.find(q=>q.asset===asset&&q.amount===1),large=c.quotes.find(q=>q.asset===asset&&q.amount===amount);
    return 1-(Number(large.output)/Number(large.input))/(Number(small.output)/Number(small.input));
  });
  const model={name:'BASE',swapFeePct:c.fees.reduce((a,b)=>a+b,0),estimatedSlippagePct:Math.max(0,...impact),
    gasPct:c.gasPriceWei/1e18*c.gasUnitsAssumption*c.ethUsd/amount,otherFeesPct:0,
    calibrationTimestamp:c.timestamp,positionSizeUsd:amount,
    evidence:[`Current fee() on both pools at block ${c.block}: ${c.fees.join(' + ')}.`,
      `Current get_dy two-hop finite-size impact against $1 reference: ${impact.join(', ')} for $${amount}.`,
      `Current Arbitrum gas price ${c.gasPriceWei} wei; Blockscout ETH/USD ${c.ethUsd}.`],
    assumptions:[`Current fees/quotes projected backward as a scenario, NOT historical execution facts.`,
      `Gas budget ${c.gasUnitsAssumption} units is a configurable assumption; L1 posting overhead not reconstructed.`,
      'Other execution fees assumed zero; not verified historical absence.',
      'Two-hop worst-direction cost budget also conservatively gates initial deployment; no verified USDC entry route.',
      'Quote-size USD conversion uses current pool oracle; no claim of exact historical dollar execution.']};
  executionCosts(model);return model;
}
const snapshots=buildHistoricalSnapshots(assets,discovery.infrastructureStart,discovery.end);
for(const snapshot of snapshots){
  const curve={};
  for(const [asset,key] of [['ARGt','argtUsdt0Price'],['BRAt','bratUsdt0Price']]){
    const p=asOf(discovery.curveHistory[asset].prices,snapshot.timestamp,2*DAY);
    if(p)curve[key]=p.value;
  }
  if(curve.argtUsdt0Price!==undefined&&curve.bratUsdt0Price!==undefined)curve.argtBratPrice=curve.argtUsdt0Price/curve.bratUsdt0Price;
  if(Object.keys(curve).length)snapshot.curve=curve;
}
const dataset={schemaVersion:1,retrievedAt:discovery.retrievedAt,infrastructureStart:discovery.infrastructureStart,
  decisionFxBaseline:'NEUTRAL FX BASELINE — PRE-AI',sourceHistoryFile:'source-history.json',snapshots,
  notes:['Real retrieved Morpho and Merkl observations; missing fields omitted, never replaced with mock yields.',
    'Official ARS and BRL fiat FX proxies are not ARGt/BRAt executable token prices or peg evidence.',
    'Historical USD TVL and idle USD inventory are derived from real token totals and official FX proxies when direct USD data is missing.',
    'Merkl projected reward APR daily buckets are available next day. Campaigns with overridden schedules have no trusted historical daysLeft.',
    'Morpho hourly realized APY normalized to equivalent hourly-compounded APR; combined net APY is audit-only.',
    'Historical deployment/critical alert/route liquidity evidence is missing. Strict replay fails closed.',
    'As-of publication lags prevent future observations entering decisions; APIs may retrospectively revise historical data.',
    'No historical USDC yield strategy was discovered or synthesized. Initial USD funding access remains an exploratory assumption.']};
await write('normalized-history',dataset);
const fields=['baseApr','incentiveApr','incentiveDaysLeft','fxVolatility30d','usdPrice','usdReturnObservation','tvlUsd','tvlUsdBasis','totalAssets','idleAssets','idleLiquidityUsd','availableLiquidityUsd'];
const header=['timestamp','iso',...['argt','brat'].flatMap(a=>fields.map(f=>`${a}.${f}`)),'curve.argtUsdt0Price','curve.bratUsdt0Price','curve.argtBratPrice'];
await writeFile('data/historical/normalized-history.csv',[header.join(','),...snapshots.map(s=>[s.timestamp,iso(s.timestamp),...['argt','brat'].flatMap(a=>fields.map(f=>s[a][f]??'')),s.curve?.argtUsdt0Price??'',s.curve?.bratUsdt0Price??'',s.curve?.argtBratPrice??''].join(','))].join('\n')+'\n');
const base=modelFor(1000), stress=stressModel(base,c.stressSlippageMultiplier,c.stressGasMultiplier);
const options={mode:'EXPLORATORY',riskMode:'TRAILING_FX',modeledRouteLiquidityUsd:Math.min(...Object.values(discovery.pools).map(p=>p.tvlUsd))/2};
const run=(model,opts=options)=>{const records=historicalReplay(dataset,model,opts);return {model,options:opts,statistics:replayStatistics(records),records};};
const results={base:run(base),stress:run(stress),strict:run(base,{mode:'STRICT',riskMode:'TRAILING_FX'}),
  smallBase:run(modelFor(100)),smallStress:run(stressModel(modelFor(100),c.stressSlippageMultiplier,c.stressGasMultiplier))};
for(const [key,name] of [['base','replay-base'],['stress','replay-stress'],['strict','replay-strict'],['smallBase','replay-100-base'],['smallStress','replay-100-stress']])await write(name,results[key]);
const rates={};
for(const [asset,key] of [['ARGt','argt'],['BRAt','brat']]){
  const rows=snapshots.map(s=>s[key]), complete=rows.filter(r=>r.baseApr!==undefined&&r.incentiveApr!==undefined&&r.incentiveDaysLeft!==undefined);
  rates[asset]={baseApr:range(rows.map(r=>r.baseApr)),incentiveApr:range(rows.map(r=>r.incentiveApr)),
    effectiveApr:range(complete.map(effectiveApr)),nominalApr:range(complete.map(r=>r.baseApr+r.incentiveApr)),
    yield30d:range(complete.map(r=>effectiveApr(r)*30/365)),tvlUsd:range(rows.map(r=>r.tvlUsd)),idleLiquidityUsdProxy:range(rows.map(r=>r.idleLiquidityUsd)),
    merklRecordedTvlUsd:range(assets[asset].campaigns.flatMap(c=>c.tvl).filter(p=>p.timestamp>=discovery.infrastructureStart&&p.availableAt<=discovery.end).map(p=>p.value))};
}
const diagnostic=results.base.records.filter(r=>r.diagnosticRanking.length===2);
const counts={};for(const r of diagnostic){const a=r.diagnosticRanking[0].asset;counts[a]=(counts[a]??0)+1;}
let previous=null;const changes=[];
for(const r of diagnostic){const a=r.diagnosticRanking[0].asset;if(previous&&previous!==a)changes.push(r);previous=a;}
const picked=[];
const pick=(r,reason)=>{if(r&&!picked.some(p=>p.timestamp===r.timestamp))picked.push({timestamp:r.timestamp,iso:iso(r.timestamp),reason,ranking:r.diagnosticRanking,actualAction:r.action});};
pick(diagnostic[0],'First timestamp with complete financial inputs for BOTH assets (execution still modeled/blocked).');
for(const r of changes)if(picked.length<3)pick(r,'Best financial ranking changed; diagnostic ignores slippage, not an executed trade.');
pick([...diagnostic].sort((a,b)=>(b.diagnosticRanking[0].netCarry30d-b.diagnosticRanking[1].netCarry30d)-(a.diagnosticRanking[0].netCarry30d-a.diagnosticRanking[1].netCarry30d))[0],'Largest observed financial carry spread between two complete candidates.');
pick(diagnostic.at(-1),'Last complete two-asset observation.');
const summary={window:{infrastructureStart:iso(discovery.infrastructureStart),start:iso(snapshots[0]?.timestamp),end:iso(snapshots.at(-1)?.timestamp),
  samples:snapshots.length,granularity:'Hourly yield grid; daily incentives and official FX as-of with publication lag',
  firstCompleteTwoAssetFinancialSample:iso(diagnostic[0]?.timestamp),completeTwoAssetFinancialSamples:diagnostic.length,strictExecutableStart:null},
  rates,statistics:Object.fromEntries(Object.entries(results).map(([k,v])=>[k,v.statistics])),twoAssetDiagnosticWinnerCounts:counts,
  interestingTimestamps:picked.slice(0,3),recommendation:'NO'};
await write('analysis-summary',summary);
const statTable=['| Replay | Ranking changes | HOLD | Candidate rebalance | REBALANCE | Cooldown blocks | Ineligible asset observations | SKIP | Selected counts |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',...Object.entries(results).map(([name,r])=>{const s=r.statistics;return `| ${name} | ${s.rankingChanges} | ${s.holds} | ${s.candidateRebalances} | ${s.rebalances} | ${s.cooldownBlocked} | ${s.ineligibleObservations} | ${s.skipped} | ${JSON.stringify(s.selectedCounts)} |`;})].join('\n');
const rangeText=(r,rate=true)=>r?`${rate?pct(r.min):r.min.toFixed(2)} / ${rate?pct(r.max):r.max.toFixed(2)} / ${rate?pct(r.median):r.median.toFixed(2)} (n=${r.count})`:'MISSING';
const sourceRows=Object.entries(assets).flatMap(([asset,h])=>[
  `| ${asset} Morpho native yield | ${iso(h.baseApr[0]?.timestamp)} | ${h.baseApr.length} hourly APR observations |`,
  `| ${asset} official FX fetched warm-up | ${iso(h.fx[0]?.timestamp)} | ${h.fx.length} daily/business-day observations |`,
  `| ${asset} Merkl reward bucket | ${iso(Math.min(...h.campaigns.flatMap(c=>c.apr.map(p=>p.timestamp))))} | Daily projected APR, not payout; pre-campaign buckets rejected |`,
  `| ${asset} Curve OHLC | ${iso(discovery.curveHistory[asset].prices[0]?.timestamp)} | ${discovery.curveHistory[asset].prices.length} daily closes |`,
]);
const report=`# Historical Data Report

Generated from retrieved public data: ${discovery.retrievedAt}. Reproduce offline with \`npm run historical:analyze\`; refresh public sources with \`npm run historical:discover\`. Machine-readable sources/parameters are in [discovery.json](../data/historical/discovery.json); final metrics in [analysis-summary.json](../data/historical/analysis-summary.json).

## Recommendation: NO

Available history is not sufficient for a compelling, execution-valid autonomous replay at the demo's $1,000 size. The discovered pools are small, the calibrated two-hop slippage exceeds the approved 0.50% cap, and historical execution eligibility is incomplete. This is useful real-data groundwork and a transparent risk-gate demonstration, but it does not establish profitable or executable historical rebalancing. Adding AI cannot resolve missing liquidity or historical evidence. No market signal was fabricated to force a move.

## Infrastructure (Arbitrum 42161)

| Asset | Token | Selected Morpho V2 vault | Curve pool against USDt0 |
| --- | --- | --- | --- |
${['ARGt','BRAt'].map(a=>`| ${a} | ${discovery.infrastructure[a].token} | ${discovery.infrastructure[a].vault} | ${discovery.infrastructure[a].pool} |`).join('\n')}

Route: ARGt → USDt0 → BRAt (and reverse); intermediate ${discovery.infrastructure.intermediateToken}. Exact-token registry search found ${discovery.directArgtBratPools.length} direct ARGt/BRAt pools. No direct pair is silently assumed. Entry from USDC has not been verified; exploratory runs assume funding access, not a real USDC transaction.

Issuer: [Twin](https://stablecoins.twin.finance/). Pools: [Curve registry](${discovery.registryUrl}). Token creation is verified with Blockscout address → creation transaction endpoints in discovery.json. Pool deployment dates are registry creationTs, not press announcement dates.

| Infrastructure | Availability UTC |
| --- | --- |
${['ARGt','BRAt'].flatMap(a=>[`| ${a} token | ${iso(discovery.tokens[a].creationTimestamp)} |`,`| ${a} selected vault | ${iso(assets[a].creationTimestamp)} |`,`| ${a}/USDt0 pool | ${iso(discovery.pools[a].creationTimestamp)} |`]).join('\n')}

All discovered exact-token vaults (V1 count: ${discovery.vaults.v1.length}):

| Name | Address | Asset | Created UTC | Current native APY | Current reported net rate | Listed |
| --- | --- | --- | --- | ---: | ---: | --- |
${discovery.vaults.v2.map(v=>`| ${v.name||'(unnamed)'} | ${v.address} | ${v.asset.symbol} | ${iso(Number(v.creationTimestamp)*1000)} | ${pct(v.apy)} | ${pct(v.netApy)} | ${v.listed} |`).join('\n')}

Selected ARGt Prime and BRAt Prime match the named strategies and Merkl incentive campaigns. The other ARGt vault is unnamed, unlisted and reports zero rates; it is retained in discovery rather than silently selected. Selected vaults also report listed=false; discovery filters underlying addresses, not only a curated listed-vault screen. Historical USD TVL is mostly null in Morpho; token totalAssets and idleAssets exist hourly. Idle assets are NOT full maxWithdraw/deposit capacity. Incentives are reconstructed separately through Merkl where schedules are usable.

## Sources and rate normalization

- Morpho POST https://api.morpho.org/graphql: vaultV2s filtered by chainId_in:[42161], assetAddress_in; vaultV2ByAddress.historicalState avgApy/avgNetApy (lookbackHours:1), totalAssets, totalAssetsUsd, idleAssets with interval:HOUR. Exact bounds/fields are recorded in discovery.sources and the query builder in src/adapters/morpho/client.ts. [Morpho rate documentation](https://docs.morpho.org/developers/api/morpho-vaults/).
- Native hourly realized APY is converted in the adapter to equivalent APR: n × expm1(log1p(APY)/n), n=8760. This explicitly assumes hourly compounding; it does not assert recovery of an undocumented original nominal APR. Reward rates are APR, normalized from percentage points /100, without APY conversion. Combined avgNetApy is audit-only because native APY and reward APR must not be converted together. [Morpho yield components](https://docs.morpho.org/developers/earn/vault-ux/best-practices/).
- Merkl GET https://api.merkl.xyz/v4/campaigns?opportunityId=ID&items=100&page=PAGE, then /v4/campaigns/ID/metrics. Opportunity IDs: ARGt ${discovery.infrastructure.ARGt.merklOpportunity}, BRAt ${discovery.infrastructure.BRAt.merklOpportunity}. aprRecords are provider-recorded projected reward APR, not realized payout; tvlRecords are real recorded USD TVL. Daily buckets are delayed to next UTC day, pre-start buckets excluded, campaigns only considered after createdAt/start. hasOverrides campaigns have missing historical days-left; no current schedule is silently backdated. [Merkl API semantics](https://docs.merkl.xyz/integrate-merkl/app).
- ArgentinaDatos official ARS buy/sell midpoint: https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial. BRL/USD ECB observations through Frankfurter: ${discovery.sources['fx:BRAt'].url}. Both inverted to USD/local; actual token peg/spread risk remains missing. These are real equivalent fiat FX observations, not Twin token market prices.
- Curve registry ${discovery.registryUrl}: actual token pairs, current reserves/TVL/oracle and deployment dates. Prices API /v1/ohlc/arbitrum/POOL with exact URLs in discovery.curveHistory; daily close units are inverted from local/USDt0 to USDt0/local. /v1/liquidity/arbitrum/POOL?per_page=100&include_state=true returned counts ARGt=${discovery.curveHistory.ARGt.liquidityCount}, BRAt=${discovery.curveHistory.BRAt.liquidityCount}. Repeated OHLC closes do not prove repeated trades.
- Read-only ${c.rpc}: fee() selector 0xddca3f43, get_dy(uint256,uint256,uint256) selector 0x556d6e9f, pinned quote block ${c.block}; fee precision 1e10. eth_gasPrice and Blockscout exchange_rate provide current calibration inputs only. No signing or transaction execution.

## History and common window

Infrastructure commonStart = max(two token deployments, two selected vault deployments, BOTH required pool deployments) = **${iso(discovery.infrastructureStart)}**.

Hourly sampled replay: **${summary.window.start} → ${summary.window.end}**, **${snapshots.length} timestamps** (two asset slots each). Yield granularity HOUR; incentives daily; ARS daily and BRL business days. Hourly repetition of daily data is not additional independent FX information. First complete two-asset financial comparison: **${summary.window.firstCompleteTwoAssetFinancialSample}**, ${diagnostic.length} complete comparisons. A strict execution-ready commonStart is **MISSING**, because complete historical gate evidence has not been retrieved. Infrastructure availability is not proof that a trade was executable.

| Source | Earliest fetched non-null datapoint UTC | Coverage |
| --- | --- | --- |
${sourceRows.join('\n')}

Morpho yields and official FX exist before the pool commonStart. They can support longer strategy-validation research, but are not mixed into the strict infrastructure window. FX fetched from April 1 supplies trailing warm-up; it is not claimed as the FX provider's first-ever record. Dataset excludes off-grid/latest observations returned beyond the requested end.

## Real / modeled / missing matrix

| Variable | REAL retrieved | MODELED / derived | MISSING |
| --- | --- | --- | --- |
| Native yield | Morpho hourly realized APY | Explicit hourly APY→APR convention | Null observations omitted |
| Incentive yield | Merkl projected reward APR history | Daily availability lag | Overridden historical schedules / some campaign gaps |
| Total assets | Morpho token units hourly | USD valuation using official FX proxy | Most direct Morpho USD history |
| Vault USD TVL | Merkl daily tvlRecords preferred | Token assets × official FX only as fallback | Exact executable valuation |
| Withdrawability | Morpho idle token inventory | Idle USD proxy in exploratory runs | Full historical maxWithdraw/capacity |
| Fiat FX | Official ARS midpoint and ECB BRL | Used as token FX proxy; trailing volatility derived | Token depeg and executable spreads |
| Curve price | ARGt/USDt0 indexed daily closes | Daily close publication lag | BRAt closes and ARGt/BRAt cross |
| Curve reserves / TVL | Current registry | Current half-minimum-pool-TVL route budget in exploratory replay | Historical indexed liquidity/reserves |
| Swap fee | Current onchain fee() | Current two-leg fee projected backward | Exact historical fee series |
| Slippage | Current size-dependent get_dy quotes | Current impact projected backward; STRESS multiplier | Exact historical trade-size slippage |
| Gas | Current gas price / ETH quote | Assumed gas units and STRESS multiplier | Historical transaction gas / L1 posting overhead |
| Protocol eligibility / alerts | Selected protocol exists in approved whitelist | Exploratory assumes deposit allowed / no critical alert | Historical capacity, flags, route safety |

Missing fields stay absent in JSON and blank in CSV. No zero APY, liquidity, risk flag or price is inserted to replace missing data. Zero incentives are only assigned for unambiguous zero-native/zero-total source observations without a known active campaign.

## Past-only decisions

**NEUTRAL FX BASELINE — PRE-AI**: expectedFxReturn30d=0 on every StrategySnapshot. Realized FX movement is observation/ex-post context only, never a forecast. Trailing volatility uses sample standard deviation of log(price ratios)/sqrt(elapsed calendar days), scaled by sqrt(30), over the preceding 60 days; at least 20 returns, no gap over seven days. Both observation timestamp and publication availability must be <= T. Daily FX/incentive buckets become usable next day; stale FX (>5 days) is missing. Retrospective provider revisions and unknown historical reward-announcement timing remain limitations; this is not a point-in-time audited trading backtest.

The scanner, eligibility checks, effective APR/Net Carry, ShouldRebalance and 12-hour cooldown are imported unchanged from the approved core. No financial decisions are made in React. No Gemini, UI redesign, fabricated USDC strategy or blockchain execution.

## Execution scenarios and sensitivity

| Scenario | Size USD | Swap fee | Slippage | Gas | Other | Total estimated switch cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${['base','stress','smallBase','smallStress'].map(k=>{const m=results[k].model;return `| ${k} | ${m.positionSizeUsd} | ${pct(m.swapFeePct)} | ${pct(m.estimatedSlippagePct)} | ${pct(m.gasPct)} | ${pct(m.otherFeesPct)} | ${pct(estimateSwitchCost(executionCosts(m)).totalPct)} |`;}).join('\n')}

Current per-pool fees: ${c.fees.map(pct).join(' and ')}. The domain's additive switch-cost formula receives their sum. BASE slippage is the larger measured two-hop finite-size impact in either direction versus a $1 reference, not an arbitrary cheap assumption. Calibrated ${iso(c.timestamp)}. Gas budget=${c.gasUnitsAssumption} units is an explicit assumption (not an observed transaction); current gas=${c.gasPriceWei} wei, current ETH/USD=${c.ethUsd}. Other fees=0 is an assumption. STRESS multiplies impact by ${c.stressSlippageMultiplier} and gas by ${c.stressGasMultiplier}; these are scenario multipliers, not historical facts. All components are configurable outside src/domain. The two-hop budget is conservative for initial deployment, whose real USDC route remains unverified.

At $1,000 BASE and STRESS do not bypass the core's slippage gate. The additional $100 runs use fresh quotes at that size, not scaled-down arbitrary impact. They test size sensitivity only and do not replace the requested $1,000 result. Exact historical Curve fee/slippage/gas reconstruction was stopped after the simple indexed endpoints lacked sufficient coverage; transaction-perfect archive reconstruction is outside this hackathon session.

## Replay metrics

BASE/STRESS files are explicitly EXPLORATORY with modeled availability; strict results are separate. Market rate observations are real in all runs. Ineligible observations count excluded asset-time pairs, while SKIP counts timestamps. HOLD is counted only when ShouldRebalance actually returns HOLD; a blocked initial allocation is SKIP, not an invented HOLD. Candidate rebalances count a different target meeting the economic margin before cooldown/execution rejection; actual rebalances count approved moves. Initial allocation has no switching-cost deduction or cooldown.

${statTable}

Financial diagnostic ranking (ignores modeled slippage, is NOT an executable ranking): ${results.base.statistics.diagnosticRankingChanges} changes across available candidates. Two-complete-asset winner counts: ${JSON.stringify(counts)}. Missing candidates can change the available-universe leader; only complete two-asset comparisons are used for the demo dates below. No eligible selected strategy at $1,000 means most-selected executable strategy is NONE, not a fabricated winner.

BASE versus STRESS at $1,000: ${results.base.statistics.rebalances} versus ${results.stress.statistics.rebalances} rebalances; ${results.base.statistics.holds} versus ${results.stress.statistics.holds} HOLDs. Cost differences do not establish robustness when both runs are blocked. At $100: ${results.smallBase.statistics.rebalances} versus ${results.smallStress.statistics.rebalances} rebalances, ${results.smallBase.statistics.holds} versus ${results.smallStress.statistics.holds} HOLDs. These are modeled-availability diagnostics, not historical execution claims.

## Yield / liquidity statistics within the sampled common window

Numbers are min / max / median. APR fractions are displayed as percentages. Effective APR uses the approved incentive-persistence formula and only complete observations. Base APR is not mislabeled total yield. TVL prefers recorded source USD values and falls back to official FX only when needed (tvlUsdBasis records which). Neither TVL nor USD proxy ranges are liquidity gates.

| Variable | ARGt | BRAt |
| --- | --- | --- |
${['baseApr','incentiveApr','nominalApr','effectiveApr','yield30d','tvlUsd','idleLiquidityUsdProxy','merklRecordedTvlUsd'].map(k=>`| ${k} | ${rangeText(rates.ARGt[k],!k.toLowerCase().includes('usd'))} | ${rangeText(rates.BRAt[k],!k.toLowerCase().includes('usd'))} |`).join('\n')}

## Three historical demo inspection points

${summary.interestingTimestamps.map((p,i)=>`${i+1}. **${p.iso}** — ${p.reason} Ranking: ${p.ranking.map(r=>`${r.asset} carry ${pct(r.netCarry30d)}`).join(', ')}. Actual $1,000 action: ${p.actualAction}.`).join('\n')}

These dates explain market evidence and execution constraints; they are not selected to imply trades that did not happen.

## Limitations and next step

No complete strict execution history; short common pool window; daily incentive/publication assumptions; campaign overrides; official fiat/token basis mismatch; no historical BRAt Curve price; no historical USDC entry route or defensive yield strategy; current pool budgets projected backward; no realized portfolio P&L. ARGt idle inventory valued at official FX can exceed Merkl's recorded USD TVL because their price bases and timestamps differ; these USD series must not be interpreted as comparable maxWithdraw/TVL ratios. Historical vault-fee changes are not reconstructed; selected vaults currently report zero management/performance fees. Historical asset totals are converted from large integer token units to JS numbers for analytics, not transaction amounts. Read-only quote amounts retain BigInt precision. Optional endpoint failures: ${JSON.stringify(discovery.failures)}.

Next smallest step: present this saved dataset in a minimal read-only replay view using the existing UI components, with real/modeled/missing evidence and blocked-execution reasons visible. Before claiming executable replay, obtain dated deposit/withdrawal/alert evidence and verify a smaller-position entry/switch route. Keep Gemini and transaction execution separate.
`;
await mkdir('docs',{recursive:true});
await writeFile('docs/HISTORICAL_DATA_REPORT.md',report);
console.log(JSON.stringify(summary,null,2));
