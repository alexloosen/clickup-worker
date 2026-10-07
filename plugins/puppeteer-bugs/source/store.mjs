import { readFile, writeFile, mkdir, rename, unlink, copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {acquireLock,recoverLegacyLock} from './locks.mjs';
const empty=()=>({version:1,revision:'',fetched_at:null,complete:false,error:null,tickets:[],runs:{}});
function parse(text){const s=JSON.parse(text);if(s.version!==1||!Array.isArray(s.tickets)||!s.runs||typeof s.runs!=='object'||Array.isArray(s.runs))throw Error('Invalid local board data.');return s;}
export class Store {
 constructor(directory){this.directory=directory;this.file=join(directory,'state.json');this.backup=this.file+'.backup';}
 async withTickets(ids,fn){
  const releases=[];
  try{for(const id of [...new Set(ids)].sort()){if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id))throw Error('Invalid ticket ID.');releases.push(await acquireLock(join(this.directory,`finish-${id}.lock`)));}const s=await this.read();if(s.recovery)throw Error(s.recovery.message);return await fn();}
  finally{for(const release of releases.reverse())await release();}
 }
 async read(){
  try{return parse(await readFile(this.file,'utf8'));}catch(e){
   if(e.code&&e.code!=='ENOENT')throw e;
   try{const s=parse(await readFile(this.backup,'utf8'));return {...s,recovery:{kind:'backup',message:'Local data needs repair. A backup is available. Open Board tools → Recover local data.'}};}
   catch(backupError){if(e.code==='ENOENT'&&backupError.code==='ENOENT')return empty();return {...empty(),recovery:{kind:'reset',message:'Local data could not be read. Open Board tools → Recover local data. Existing files will be preserved.'}};}
  }
 }
 async atomic(path,text){const temp=path+'.'+randomUUID()+'.tmp';try{await writeFile(temp,text,{mode:0o600,flag:'wx'});await rename(temp,path);}finally{await unlink(temp).catch(()=>{});}}
 async mutate(fn){
  const release=await acquireLock(join(this.directory,'state.lock'));
  try{
   const s=await this.read();if(s.recovery)throw Error(s.recovery.message);
   const previous=JSON.stringify(s),value=await fn(s);s.revision=randomUUID();
   if(s.ticket_comments){const entries=Object.entries(s.ticket_comments).sort((a,b)=>String(b[1].fetched_at).localeCompare(String(a[1].fetched_at)));s.ticket_comments=Object.fromEntries(entries.slice(0,30));}
   const keep=new Set([...s.tickets.map(t=>t.id),...Object.keys(s.runs)]);
   if(s.ticket_records)s.ticket_records=Object.fromEntries(Object.entries(s.ticket_records).filter(([id])=>keep.has(id)));
   await this.atomic(this.backup,previous);await this.atomic(this.file,JSON.stringify(s));return {state:s,value};
  }finally{await release();}
 }
 async repair({confirmed_stopped=false,reset=false}={}){
  if(!confirmed_stopped)throw Error('Stop previous plugin operations and coding chats before recovering data.');
  await mkdir(this.directory,{recursive:true,mode:0o700});
  await recoverLegacyLock(join(this.directory,'state.lock'));
  const release=await acquireLock(join(this.directory,'state.lock')),ticketReleases=[];
  try{
   for(const name of await readdir(this.directory))if(/^finish-[a-zA-Z0-9_-]+\.lock$/.test(name)){const path=join(this.directory,name);await recoverLegacyLock(path);ticketReleases.push(await acquireLock(path,{timeout:100}));}
   const current=await this.read();if(!current.recovery)return current;
   if(current.recovery.kind==='reset'&&!reset)throw Error('No readable backup is available. Select Reset local board after checking existing chats and ClickUp.');
   const stamp=randomUUID();
   for(const path of [this.file,this.backup])await copyFile(path,path+'.preserved-'+stamp).catch(e=>{if(e.code!=='ENOENT')throw e;});
   const restored=reset?empty():current;delete restored.recovery;
   for(const r of Object.values(restored.runs)){r.finishing=false;if(!['released','investigated'].includes(r.status)&&!r.finish?.completed_at){r.status='blocked';r.summary='Restored from backup. Inspect the existing chat and ClickUp before continuing or releasing this assignment.';}}
   restored.revision=randomUUID();restored.error='Local data recovered. Check existing chats and ClickUp before starting or retrying work.';
   await this.atomic(this.file,JSON.stringify(restored));return restored;
  }finally{for(const unlock of ticketReleases.reverse())await unlock();await release();}
 }
}
