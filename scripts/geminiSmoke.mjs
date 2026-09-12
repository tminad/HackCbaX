import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {GeminiMacroProvider} from '../dist/adapters/gemini/geminiMacroProvider.js';
import {validateMacroSignal} from '../dist/macro/macroSignalSchema.js';
import {macroInputHash} from '../dist/macro/macroIntelligenceProvider.js';
import {historicalMacroPack} from '../dist/historical/macro/historicalMacroPacks.js';

const path='data/macro/historical/gemini-smoke.json';await mkdir('data/macro/historical',{recursive:true});
const metadata={checkedAt:new Date().toISOString(),model:process.env.GEMINI_MODEL||null};
if(!process.env.GEMINI_API_KEY||!process.env.GEMINI_MODEL){
  await writeFile(path,JSON.stringify({...metadata,status:'NOT_RUN',reason:'Missing environment configuration'},null,2)+'\n');
  console.log('Gemini smoke NOT_RUN: GEMINI_API_KEY and GEMINI_MODEL are required.');
}else{
  try{
    const source=JSON.parse(await readFile('data/historical/source-history.json','utf8'));
    const collected=JSON.parse(await readFile('data/macro/sources/collected-releases.json','utf8'));
    const pack=historicalMacroPack('2026-09-06T00:00:00.000Z','ARS',collected.releases,source.assets.ARGt.fx,'https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial');
    await writeFile('data/macro/historical/2026-09-06-ARS-smoke-pack.json',JSON.stringify(pack,null,2)+'\n');
    const provider=new GeminiMacroProvider();const response=await provider.generate(pack,AbortSignal.timeout(30000));
    const signal=validateMacroSignal(response.output,pack);
    await writeFile(path,JSON.stringify({...metadata,status:'PASSED',modelVersion:response.modelVersion??null,inputHash:macroInputHash(pack,provider.model),signal},null,2)+'\n');
    console.log(`Gemini smoke PASSED: ${provider.model}; live API response validated.`);
  }catch(error){
    await writeFile(path,JSON.stringify({...metadata,status:'FAILED',reason:'API request, macro corpus, or schema validation failed; sensitive details suppressed'},null,2)+'\n');
    console.error('Gemini smoke FAILED. Check that macro:collect ran, .env is valid, and the configured model is available.');
    process.exitCode=1;
  }
}
