import {readFile,writeFile,link,unlink,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function owner(path){try{const record=JSON.parse(await readFile(path,'utf8'));return record&&Number.isInteger(record.pid)&&typeof record.hostname==='string'&&typeof record.token==='string'?record:{legacy:true};}catch(e){if(e.code==='ENOENT')return null;if(e instanceof SyntaxError)return {legacy:true};throw e;}}
function dead(record){
 if(!record||record.hostname!==hostname()||!Number.isInteger(record.pid)||record.pid<1)return false;
 try{process.kill(record.pid,0);return false;}catch(e){return e.code==='ESRCH';}
}

// Publish a complete owner record atomically. Never reclaim a live process's lock.
export async function acquireLock(path,{timeout=5000,depth=0}={}){
 await mkdir(dirname(path),{recursive:true,mode:0o700});
 const token=randomUUID(),temp=path+'.'+token+'.tmp';
 await writeFile(temp,JSON.stringify({pid:process.pid,hostname:hostname(),token}),{mode:0o600,flag:'wx'});
 const until=Date.now()+timeout;
 try{
  do{
   try{await link(temp,path);return async()=>{if((await owner(path))?.token===token)await unlink(path).catch(e=>{if(e.code!=='ENOENT')throw e;});};}
   catch(e){if(e.code!=='EEXIST')throw e;}
   const previous=await owner(path);
   if(dead(previous)&&depth<4){
    // Serialize reapers, then recheck ownership so a second reaper cannot
    // unlink a replacement lock acquired by a new writer.
    const release=await acquireLock(path+'.recovery',{timeout,depth:depth+1});
    try{const current=await owner(path);if(current?.token===previous.token&&dead(current))await unlink(path).catch(e=>{if(e.code!=='ENOENT')throw e;});}finally{await release();}
    continue;
   }
   if(previous?.legacy)throw Error('A lock from an older version needs recovery. Stop previous plugin operations, restart Codex, then use Board tools → Recover local data.');
   await sleep(50);
  }while(Date.now()<until);
  throw Error('Another operation is still running. Wait for it to finish, then try again.');
 }finally{await unlink(temp).catch(()=>{});}
}

export async function recoverLegacyLock(path){
 const release=await acquireLock(path+'.recovery');
 try{if((await owner(path))?.legacy)await unlink(path);}finally{await release();}
}
