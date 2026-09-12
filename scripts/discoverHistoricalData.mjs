import { mkdir, writeFile } from 'node:fs/promises';
import { fetchJson } from '../dist/adapters/http.js';
import { discoverVaults, fetchVaultHistory, MORPHO_ENDPOINT } from '../dist/adapters/morpho/client.js';
import { normalizeMorphoSeries, apyToApr } from '../dist/adapters/morpho/normalization.js';
import { campaignHistory } from '../dist/adapters/merkl/client.js';
import { fetchFx } from '../dist/adapters/fx/client.js';
import { curvePools, rpc, poolFee, getDy, CURVE_REGISTRY, ARBITRUM_RPC } from '../dist/adapters/curve/client.js';
import { INFRASTRUCTURE as infra } from '../dist/adapters/twin/infrastructure.js';
import { commonStart } from '../dist/historical/buildHistoricalDataset.js';

const HOUR=3600000, DAY=24*HOUR;
const retrievedAt=new Date().toISOString(), end=Math.floor(Date.now()/HOUR)*HOUR-HOUR;
const assets={}, sources={}, tokens={}, pools={}, curveHistory={}, failures=[];
const source=(id,url,details={})=>(sources[id]={url,...details},id);
const optional=async(url)=>{try{return await fetchJson(url);}catch(error){failures.push({url,error:String(error)});return null;}};
console.log('Discovering exact Arbitrum vaults, pools and official FX history...');
const [vaults,registry,fx]=await Promise.all([
  discoverVaults([infra.ARGt.token,infra.BRAt.token]),curvePools(),
  fetchFx('2026-04-01',new Date(end-DAY).toISOString().slice(0,10)),
]);
for(const asset of ['ARGt','BRAt']){
  const item=infra[asset], vault=vaults.v2.find(v=>v.address.toLowerCase()===item.vault.toLowerCase());
  if(!vault || vault.asset.address.toLowerCase()!==item.token.toLowerCase())throw Error(`Vault mismatch ${asset}`);
  const pool=registry.find(p=>p.address.toLowerCase()===item.pool.toLowerCase());
  if(!pool || pool.coinsAddresses[0].toLowerCase()!==item.token.toLowerCase() || pool.coinsAddresses[1].toLowerCase()!==infra.intermediateToken.toLowerCase())throw Error(`Pool mismatch ${asset}`);
  pools[asset]={address:pool.address,id:pool.id,name:pool.name,creationTimestamp:Number(pool.creationTs)*1000,
    creationBlock:pool.creationBlockNumber,coins:pool.coins,priceOracle:Number(pool.priceOracle),tvlUsd:pool.usdTotal};
  const addressUrl=`https://arbitrum.blockscout.com/api/v2/addresses/${item.token}`;
  const address=await fetchJson(addressUrl);
  const txUrl=`https://arbitrum.blockscout.com/api/v2/transactions/${address.creation_transaction_hash}`;
  const tx=await fetchJson(txUrl);
  tokens[asset]={address:item.token,creationTimestamp:Date.parse(tx.timestamp),creationTransaction:address.creation_transaction_hash,
    creationBlock:tx.block_number,addressUrl,transactionUrl:txUrl,currentEthUsd:Number(address.exchange_rate)};
  console.log(`Retrieving ${asset} hourly Morpho history and daily Merkl campaigns...`);
  const start=Number(vault.creationTimestamp)*1000;
  const [history,campaigns]=await Promise.all([fetchVaultHistory(item.vault,start,end),campaignHistory(item.merklOpportunity)]);
  const series=(field,transform=x=>x)=>normalizeMorphoSeries(history[field],source(`morpho:${asset}:${field}`,MORPHO_ENDPOINT,
    {vault:item.vault,chainId:42161,field,interval:'HOUR',lookbackHours:field.includes('Apy')?1:undefined,startTimestamp:Math.floor(start/1000),endTimestamp:Math.floor(end/1000)}),transform)
    .filter(p=>p.timestamp<=end && p.timestamp>=start && p.timestamp%HOUR===0);
  for(const c of campaigns)for(const key of ['apr','tvl'])for(const p of c[key])p.source=source(`merkl:${c.id}:${key}`,p.source,
    {rateType:key==='apr'?'APR; source percentage points normalized to decimals':undefined,availability:'daily bucket + 24h; projected reward rate, not realized payout'});
  for(const p of fx[asset])p.source=source(`fx:${asset}`,p.source,{kind:'official fiat proxy, not token market price',availableAt:'next UTC day'});
  assets[asset]={asset,token:item.token,vault:item.vault,creationTimestamp:start,
    baseApr:series('avgApy',x=>apyToApr(x,8760)),reportedNetApy:series('avgNetApy'),
    totalAssets:series('totalAssets',x=>x/10**vault.asset.decimals),idleAssets:series('idleAssets',x=>x/10**vault.asset.decimals),
    tvlUsd:series('totalAssetsUsd'),fx:fx[asset],campaigns};
  const ohlcUrl=`https://prices.curve.finance/v1/ohlc/arbitrum/${item.pool}?main_token=${item.token}&reference_token=${infra.intermediateToken}&agg_units=day&start=${Math.floor(pool.creationTs)}&end=${Math.floor(end/1000)}`;
  const liquidityUrl=`https://prices.curve.finance/v1/liquidity/arbitrum/${item.pool}?per_page=100&include_state=true`;
  const [ohlc,liquidity]=await Promise.all([optional(ohlcUrl),optional(liquidityUrl)]);
  curveHistory[asset]={ohlcUrl,liquidityUrl,liquidityCount:liquidity?.count??null,
    prices:(ohlc?.data??[]).map(p=>({timestamp:p.time*1000,availableAt:p.time*1000+DAY,value:1/p.close,
      source:source(`curve:${asset}:ohlc`,ohlcUrl,{rawUnit:'local token per USDt0; inverted to USDt0 per local token',availability:'daily close available next day'})})).filter(p=>p.availableAt<=end)};
}
console.log('Calibrating CURRENT two-hop quotes (read-only), not reconstructing historical slippage...');
const block=await rpc('eth_blockNumber',[]);
const fees=await Promise.all(['ARGt','BRAt'].map(a=>poolFee(infra[a].pool,block)));
const quotes=[];
for(const asset of ['ARGt','BRAt']){
  const target=asset==='ARGt'?'BRAt':'ARGt';
  for(const amount of [1,100,1000]){
    const input=BigInt(Math.floor(amount*pools[asset].priceOracle*1e6))*10n**12n;
    const intermediate=await getDy(infra[asset].pool,0,1,input,block);
    const output=await getDy(infra[target].pool,1,0,intermediate,block);
    quotes.push({asset,target,amount,input:input.toString(),intermediate:intermediate.toString(),output:output.toString()});
  }
}
const gasPriceWei=Number(BigInt(await rpc('eth_gasPrice',[])));
const calibration={timestamp:Date.now(),block,rpc:ARBITRUM_RPC,fees,quotes,gasPriceWei,ethUsd:tokens.ARGt.currentEthUsd,
  gasUnitsAssumption:1000000,stressSlippageMultiplier:2,stressGasMultiplier:3};
const infrastructureStart=commonStart([...Object.values(tokens).map(t=>t.creationTimestamp),...Object.values(assets).map(a=>a.creationTimestamp),...Object.values(pools).map(p=>p.creationTimestamp)]);
const discovery={schemaVersion:1,retrievedAt,end,infrastructure:infra,infrastructureStart,tokens,vaults,pools,curveHistory,calibration,sources,
  registryUrl:CURVE_REGISTRY,directArgtBratPools:registry.filter(p=>p.coinsAddresses?.some(a=>a.toLowerCase()===infra.ARGt.token.toLowerCase())&&p.coinsAddresses?.some(a=>a.toLowerCase()===infra.BRAt.token.toLowerCase())).map(p=>p.address),failures};
await mkdir('data/historical',{recursive:true});
await writeFile('data/historical/discovery.json',JSON.stringify(discovery,null,2)+'\n');
await writeFile('data/historical/source-history.json',JSON.stringify({retrievedAt,assets})+'\n');
console.log(JSON.stringify({infrastructureStart:new Date(infrastructureStart).toISOString(),end:new Date(end).toISOString(),
  samples:Object.fromEntries(Object.entries(assets).map(([a,h])=>[a,h.baseApr.length])),fees,failures},null,2));
