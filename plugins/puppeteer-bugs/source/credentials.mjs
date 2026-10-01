import {openSetupPage} from './setup-page.mjs';
import { readFile, writeFile, mkdir, rename, unlink, chmod } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';


export class Credentials {
  constructor(directory){this.directory=directory;this.file=join(directory,process.platform==='win32'?'clickup-token.dpapi':'clickup-token');}
  async configured(){if(process.env.CLICKUP_API_TOKEN)return true;try{await readFile(this.file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
  async protect(value,mode){if(process.platform!=='win32')throw new Error('Encrypted token storage requires Windows. Use CLICKUP_API_TOKEN on other hosts.');if(!['protect','unprotect'].includes(mode))throw new Error('Invalid credential operation.');const script=await readFile(join(dirname(fileURLToPath(import.meta.url)),'protect.ps1'),'utf8');return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',`& { ${script} } -Mode ${mode}`],{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='';const timeout=setTimeout(()=>child.kill(),15000);
    child.stdout.on('data',d=>output+=d);child.stderr.resume();child.on('error',()=>{clearTimeout(timeout);reject(new Error('Windows credential protection could not be started.'));});child.on('close',code=>{clearTimeout(timeout);code===0?resolve(output):reject(new Error('Windows credential protection failed.'));});child.stdin.on('error',()=>{});child.stdin.end(value);
  });}
  async get(){if(process.env.CLICKUP_API_TOKEN)return process.env.CLICKUP_API_TOKEN;try{const value=await readFile(this.file,'utf8');return process.platform==='win32'?await this.protect(value,'unprotect'):value;}catch(e){if(e.code==='ENOENT')throw new Error('Connect ClickUp to enable direct refresh.');throw e;}}
  async save(token){await mkdir(this.directory,{recursive:true,mode:0o700});if(process.platform!=='win32')await chmod(this.directory,0o700);const temp=join(this.directory,randomUUID()+'.tmp');try{await writeFile(temp,process.platform==='win32'?await this.protect(token,'protect'):token,{mode:0o600,flag:'wx'});await rename(temp,this.file);}finally{await unlink(temp).catch(()=>{});}}
  async remove(){await unlink(this.file).catch(e=>{if(e.code!=='ENOENT')throw e;});}
  async settings(options={}){return openSetupPage({credentials:this,...options});}
}
