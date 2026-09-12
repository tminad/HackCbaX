import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeArgentinaReleases} from '../dist/adapters/macro/argentina/argentinaMacro.js';
import {fetchFocus,normalizeFocus,fetchIbge,normalizeIbge,fetchSelic,IBGE_ENDPOINT} from '../dist/adapters/macro/brazil/brazilMacro.js';
const archive=JSON.parse(await readFile('data/macro/sources/argentina-releases.json','utf8'));
const releases=normalizeArgentinaReleases(archive.releases);
const reviewedFocus=JSON.parse(await readFile('data/macro/sources/brazil-focus-reviewed.json','utf8'));
const reviewedIbge=JSON.parse(await readFile('data/macro/sources/ibge-reviewed.json','utf8'));
async function ibgeWithFallback(){
  try{return await fetchIbge();}
  catch{console.warn('IBGE live fetch failed; using reviewed local IBGE snapshot.');return normalizeIbge(reviewedIbge);}
}
async function optionalSelic(date){
  try{return await fetchSelic(date);}
  catch{console.warn(`BCB Selic live fetch failed for ${date}; continuing without that optional rate observation.`);return null;}
}
async function focusWithFallback(date,availableAt,publicationNote){
  try{return await fetchFocus(date,availableAt,publicationNote);}
  catch(error){
    console.warn(`BCB Focus live fetch failed for ${date}; using reviewed local BCB snapshot.`);
    return normalizeFocus(reviewedFocus,date,availableAt,`${publicationNote} Live Olinda fetch was unavailable during collection; values came from the reviewed local BCB snapshot in data/macro/sources/brazil-focus-reviewed.json.`);
  }
}
const verified=[];
// Verify that reviewed primary extracts still resolve; preserve digest for source audit.
for(const event of releases.map(r=>r.event)){
  try{
    const response=await fetch(event.source,{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const bytes=Buffer.from(await response.arrayBuffer());verified.push({id:event.id,url:event.source,status:'LIVE_OK',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
  }catch{
    console.warn(`Primary-source recheck failed for ${event.id}; preserving reviewed local extract.`);
    verified.push({id:event.id,url:event.source,status:'LOCAL_REVIEWED_FALLBACK'});
  }
}
const [focus1,focus2,ibge,selic1,selic2]=await Promise.all([
  focusWithFallback('2026-08-28','2026-09-01T03:00:00.000Z','Survey date is NOT publication date. Released August 31 per contemporaneous publication coverage; conservatively usable after end of Brasilia local release day. BCB schedule: https://www.bcb.gov.br/controleinflacao/relatoriofocus'),
  focusWithFallback('2026-09-04','2026-09-09T03:00:00.000Z','Released September 8 after the September 7 holiday; date corroborated by https://economia.uol.com.br/noticias/redacao/2026/09/08/relatorio-focus-8-de-setembro.ghtm . Exact clock not reconstructed; conservatively usable after end of local release day.'),
  ibgeWithFallback(),optionalSelic('2026-09-04'),optionalSelic('2026-09-11'),
]);
releases.push(focus1,focus2,...[selic1,selic2].filter(Boolean),...ibge.filter(r=>r.event.publishedAt>='2026-08-01T00:00:00.000Z'&&r.event.publishedAt<='2026-09-12T10:00:00.000Z'));
await mkdir('data/macro/sources',{recursive:true});
await writeFile('data/macro/sources/collected-releases.json',JSON.stringify({retrievedAt:new Date().toISOString(),releases,verified,ibgeEndpoint:IBGE_ENDPOINT,
  notes:['Economic values are primary-source data. Focus publication calendar is corroborated by contemporaneous secondary coverage; that coverage supplies no forecast numbers.',
    'Date-only releases use a conservative next-local-day availability bound in publishedAt, explicitly identified by publicationNote.',
    'Reviewed Argentina extracts are not an automatic future PDF parser. Future releases require reviewed ingestion.',
    'BCB Focus uses the live Olinda API when available; on HTTP/API failure it falls back to a reviewed local BCB snapshot for the two historical survey dates used by this replay.',
    'IBGE uses the live API when available and a reviewed local official snapshot if unavailable. Selic observations are optional and omitted rather than fabricated when SGS is unavailable.',
    'Failure to re-download a reviewed primary Argentina source does not abort the replay; the local reviewed extract is preserved and provenance marks the fallback.',
    'Curated finite macro corpus, not an exhaustive news archive. Model may use only this corpus; pretraining knowledge leakage cannot be proven absent.']},null,2)+'\n');
console.log(`Collected ${releases.length} real macro releases; no Gemini calls.`);
