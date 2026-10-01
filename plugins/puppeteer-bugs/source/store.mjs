import { readFile, writeFile, mkdir, rename, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
export class Store {
  constructor(directory){this.directory=directory;this.file=join(directory,'state.json');}
  async read(){try{const s=JSON.parse(await readFile(this.file,'utf8'));if(s.version!==1||!Array.isArray(s.tickets)||!s.runs)throw new Error('Invalid local board data.');return s;}catch(e){if(e.code==='ENOENT')return {version:1,revision:'',fetched_at:null,complete:false,error:null,tickets:[],runs:{}};throw e;}}
  async mutate(fn){
    await mkdir(this.directory,{recursive:true});let lock;
    for(let n=0;n<1200;n++){try{lock=await open(join(this.directory,'state.lock'),'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,100));}}
    if(!lock)throw new Error('The board is being updated by another process. Please try again.');
    const temp=join(this.directory,randomUUID()+'.tmp');
    try{const s=await this.read();const value=await fn(s);s.revision=randomUUID();await writeFile(temp,JSON.stringify(s),{mode:0o600});await rename(temp,this.file);return {state:s,value};}finally{await lock.close();await unlink(join(this.directory,'state.lock'));await unlink(temp).catch(()=>{});}
  }
}

