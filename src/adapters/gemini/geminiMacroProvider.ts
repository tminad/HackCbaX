import { GoogleGenAI } from '@google/genai';
import { buildMacroEventPack } from '../../macro/buildMacroEventPack.js';
import { MACRO_SYSTEM_PROMPT } from '../../macro/macroIntelligenceProvider.js';
import { MACRO_SIGNAL_SCHEMA } from '../../macro/macroSignalSchema.js';
import type { MacroEventPack, MacroIntelligenceProvider } from '../../macro/types.js';

/** Server/CLI only. Credentials are read exclusively from the process environment. */
export class GeminiMacroProvider implements MacroIntelligenceProvider {
  readonly model:string;
  constructor(){
    this.model=process.env.GEMINI_MODEL?.trim()??'';
    if(!this.model)throw new Error('GEMINI_MODEL is required');
  }
  async generate(pack:MacroEventPack,abortSignal:AbortSignal):Promise<{output:unknown;modelVersion?:string}>{
    const normalized=buildMacroEventPack(pack);
    if(!process.env.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY is unavailable');
    try{
      const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
      const response=await client.interactions.create({model:this.model,input:JSON.stringify(normalized),
        system_instruction:MACRO_SYSTEM_PROMPT,store:false,
        generation_config:{seed:0,max_output_tokens:2200},
        response_format:{type:'text',mime_type:'application/json',schema:MACRO_SIGNAL_SCHEMA},
      },{signal:abortSignal});
      if(response.status!=='completed'||!response.output_text)throw new Error('Incomplete Gemini response');
      return {output:response.output_text,...(typeof response.model==='string'?{modelVersion:response.model}:{})};
    }catch{throw new Error('Gemini request failed or returned an incomplete response');}
  }
}
