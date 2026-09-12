import { asOf } from '../buildHistoricalDataset.js';
import { buildMacroEventPack, metric, instant } from '../../macro/buildMacroEventPack.js';
import type { Observation } from '../historicalTypes.js';
import type { Currency, MacroEventPack, MacroRelease } from '../../macro/types.js';

/** All data selection precedes the model call. Future releases are never sent. */
export function historicalMacroPack(asOfTimestamp:string,currency:Currency,releases:readonly MacroRelease[],fx:readonly Observation[],fxSource:string):MacroEventPack{
  const now=instant(asOfTimestamp),known=releases.filter(r=>r.currency===currency&&instant(r.event.publishedAt)<=now)
    .sort((a,b)=>instant(a.event.publishedAt)-instant(b.event.publishedAt));
  const events=known.map(r=>r.event),pack:MacroEventPack={currency,asOf:asOfTimestamp,events:[...events],fx:{}};
  for(const r of known){if(r.inflation)pack.inflation={...pack.inflation,...r.inflation};if(r.rates)pack.rates={...pack.rates,...r.rates};}
  const spot=asOf(fx,now,5*86400000);
  if(spot){
    const id=`fx-${currency}-${new Date(spot.timestamp).toISOString()}`,publishedAt=new Date(spot.availableAt).toISOString();
    pack.events.push({id,publishedAt,source:fxSource,title:`Observed official fiat FX proxy for ${currency}`,
      summary:`Last published price ${1/spot.value} local currency per USD. This is an official fiat proxy, not a Twin token executable price.`,
      publicationNote:'Uses original historical adapter publication lag; observedAt identifies the price day.'});
    pack.fx.spotLocalPerUsd=metric(1/spot.value,publishedAt,id,new Date(spot.timestamp).toISOString());
    for(const days of [7,30] as const){const prior=asOf(fx,spot.timestamp-days*86400000,5*86400000);
      if(prior)pack.fx[days===7?'change7d':'change30d']=metric(spot.value/prior.value-1,publishedAt,id,new Date(spot.timestamp).toISOString());}
  }
  // Latest published survey first; nearest monthly midpoint to T+30 days second.
  const forecasts=known.flatMap(r=>r.forecasts??[]).filter(f=>instant(f.publishedAt)<=now&&instant(f.periodEnd)>now);
  forecasts.sort((a,b)=>instant(b.publishedAt)-instant(a.publishedAt)||
    Math.abs((instant(a.periodStart)+instant(a.periodEnd))/2-(now+30*86400000))-
    Math.abs((instant(b.periodStart)+instant(b.periodEnd))/2-(now+30*86400000)));
  if(forecasts[0])pack.fx.marketForecastLocalPerUsd=forecasts[0];
  return buildMacroEventPack(pack);
}
