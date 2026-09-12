import type { MacroRelease } from '../../../macro/types.js';
import { buildMacroEventPack } from '../../../macro/buildMacroEventPack.js';

/** Reviewed primary-release extracts keep PDF/XLSX transcription outside financial logic.
 * See data/macro/sources/argentina-releases.json for exact source cells/publication bounds.
 */
export function normalizeArgentinaReleases(releases:MacroRelease[]):MacroRelease[]{
  return releases.map(release=>{
    if(release.currency!=='ARS')throw new TypeError('Argentina currency mismatch');
    const {event,inflation,rates}=release;
    buildMacroEventPack({currency:'ARS',asOf:event.publishedAt,events:[event],fx:{},...(inflation?{inflation}:{}),...(rates?{rates}:{})});
    for(const f of release.forecasts??[])buildMacroEventPack({currency:'ARS',asOf:event.publishedAt,events:[event],fx:{marketForecastLocalPerUsd:f}});
    return structuredClone(release);
  });
}
