import { fetchJson, record, rows, numeric } from '../../http.js';
import { metric } from '../../../macro/buildMacroEventPack.js';
import type { MacroRelease } from '../../../macro/types.js';

export const FOCUS_ENDPOINT='https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativaMercadoMensais';
export const IBGE_ENDPOINT='https://servicodados.ibge.gov.br/api/v3/noticias/?busca=IPCA&qtd=100';
export function focusUrl(date:string):string{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new TypeError('Invalid Focus reference date');
  const params=new URLSearchParams({'$filter':`(Indicador eq 'Câmbio' or Indicador eq 'IPCA' or Indicador eq 'Selic') and Data eq '${date}' and baseCalculo eq 0`,'$format':'json','$top':'1000'});
  return `${FOCUS_ENDPOINT}?${params}`;
}
export function normalizeFocus(raw:unknown,date:string,availableAt:string,publicationNote:string):MacroRelease{
  const data=record(raw);if(data['@odata.nextLink'])throw new Error('Focus pagination incomplete');
  const items=rows(data.value).map(record);
  const id=`bcb-focus-${date}`;
  const fx=items.filter(r=>r.Indicador==='Câmbio'&&r.Data===date&&r.baseCalculo===0&&/^(09|10)\/2026$/.test(String(r.DataReferencia)));
  if(!fx.length)throw new Error('Focus FX forecast missing');
  const event={id,publishedAt:availableAt,source:focusUrl(date),title:`BCB Focus, survey close ${date}`,
    summary:`Aggregate 30-day respondent medians for monthly average PTAX: ${fx.map(r=>`${r.DataReferencia}: ${numeric(r.Mediana)} BRL/USD`).join('; ')}. Survey expectations, not central-bank promises.`,publicationNote};
  const forecasts=fx.map(r=>{const [month,year]=String(r.DataReferencia).split('/').map(Number);return {
    ...metric(numeric(r.Mediana),availableAt,id),horizonKind:'MONTHLY_AVERAGE' as const,
    periodStart:new Date(Date.UTC(year!,month!-1,1)).toISOString(),periodEnd:new Date(Date.UTC(year!,month!,1)-1).toISOString()};});
  const inflation=items.find(r=>r.Indicador==='IPCA'&&r.Data===date&&r.baseCalculo===0&&r.DataReferencia==='09/2026');
  const selic=items.find(r=>r.Indicador==='Selic'&&r.Data===date&&r.baseCalculo===0&&r.DataReferencia==='09/2026');
  return {currency:'BRL',event,forecasts,
    ...(inflation?{inflation:{expectedMonthly:metric(numeric(inflation.Mediana)/100,availableAt,id)}}:{}),
    ...(selic?{rates:{expectedPolicyRate:metric(numeric(selic.Mediana)/100,availableAt,id)}}:{})};
}
export async function fetchFocus(date:string,availableAt:string,publicationNote:string):Promise<MacroRelease>{
  return normalizeFocus(await fetchJson(focusUrl(date)),date,availableAt,publicationNote);
}
/** IBGE timestamp is Brasilia local (UTC-3 in this window), not UTC. */
export function normalizeIbge(raw:unknown):MacroRelease[]{
  return rows(record(raw).items).map(record).filter(r=>r.tipo==='Release'&&/^IPCA(?:-15)? (fica|foi|é)/.test(String(r.titulo)))
    .map(r=>{
      const match=String(r.data_publicacao).match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/);
      if(!match)throw new Error('IBGE publication timestamp unavailable');
      const at=new Date(`${match[3]}-${match[2]}-${match[1]}T${match[4]}-03:00`).toISOString();
      const description=String(r.introducao),monthly=String(r.titulo).match(/(-?\d+,\d+)%/),annual=description.match(/(?:índice ficou em|meses,?[^%]*?em) (\d+,\d+)%/);
      if(!monthly)throw new Error('IBGE monthly value unavailable');
      const id=`ibge-${r.id}`,preview=String(r.titulo).startsWith('IPCA-15');
      return {currency:'BRL' as const,event:{id,publishedAt:at,source:String(r.link).replace(/^http:/,'https:'),title:String(r.titulo),
        summary:`Official IBGE release: monthly ${preview?'IPCA-15 preview':'IPCA'} ${monthly[1]}%.${annual?` Twelve-month inflation ${annual[1]}%.`:''}`,
        publicationNote:'Publication timestamp from IBGE news API; Brasilia UTC-3.'},
        ...(!preview?{inflation:{latestMonthly:metric(Number(monthly[1]!.replace(',','.'))/100,at,id),
          ...(annual?{latestAnnual:metric(Number(annual[1]!.replace(',','.'))/100,at,id)}:{})}}:{})};
    });
}
export async function fetchIbge():Promise<MacroRelease[]>{return normalizeIbge(await fetchJson(IBGE_ENDPOINT));}
export async function fetchSelic(date:string):Promise<MacroRelease>{
  const [year,month,day]=date.split('-');
  const url=`https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=${day}/${month}/${year}&dataFinal=${day}/${month}/${year}`;
  const raw=rows(await fetchJson(url)).map(record).find(r=>r.data===`${day}/${month}/${year}`);
  if(!raw)throw new Error('BCB policy-rate observation unavailable');
  const at=new Date(Date.parse(`${date}T03:00:00Z`)+86400000).toISOString(),id=`bcb-selic-${date}`,value=numeric(raw.valor)/100;
  return {currency:'BRL',event:{id,publishedAt:at,source:url,title:'BCB Selic target rate',summary:`Selic target: ${numeric(raw.valor)}% annual.`,
    publicationNote:'Daily SGS observation conservatively available after end of local day; exact release clock unavailable.'},rates:{policyRate:metric(value,at,id,`${date}T03:00:00Z`)}};
}
