import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CachedMacroSignal, MacroSignalCache } from '../../macro/types.js';

export class FileMacroSignalCache implements MacroSignalCache {
  constructor(private directory:string){}
  private path(hash:string):string{if(!/^[a-f0-9]{64}$/.test(hash))throw new TypeError('Invalid cache hash');return join(this.directory,`${hash}.json`);}
  async get(hash:string):Promise<unknown>{try{return JSON.parse(await readFile(this.path(hash),'utf8'));}catch{return undefined;}}
  async set(hash:string,value:CachedMacroSignal):Promise<void>{
    const target=this.path(hash);await mkdir(this.directory,{recursive:true});
    const temp=`${target}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,2)+'\n');await rename(temp,target);
  }
}
