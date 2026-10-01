import {samePath} from './platform.mjs';
import {isAbsolute,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ClickUpClient} from './clickup.mjs';
import {command} from './github.mjs';
import {repositorySlug} from './pr.mjs';
export function parseClickUpLink(value){
 let u;try{u=new URL(value);}catch{throw Error('Enter a ClickUp workspace, Space, Folder or List link.');}
 if(u.protocol!=='https:'||u.hostname!=='app.clickup.com'||u.port||u.username||u.password)throw Error('Use an https://app.clickup.com project link.');
 const p=u.pathname.replace(/\/$/,'');let m;
 if(m=p.match(/^\/(\d+)$/))return {workspaceId:m[1],kind:'workspace',id:m[1],clickupUrl:u.origin+p};
 if(m=p.match(/^\/(\d+)\/v\/(?:o\/)?(s|f)\/(\d+)$/))return {workspaceId:m[1],kind:m[2]==='s'?'space':'folder',id:m[3],clickupUrl:u.origin+p};
 if(m=p.match(/^\/(\d+)\/v\/(?:li|l)\/(\d+)$/))return {workspaceId:m[1],kind:'list',id:m[2],clickupUrl:u.origin+p};
 if(m=p.match(/^\/(\d+)\/v\/l\/(4|5|6)-(\d+)(?:-\d+)?$/))return {workspaceId:m[1],kind:({'4':'space','5':'folder','6':'list'})[m[2]],id:m[3],clickupUrl:u.origin+p};
 throw Error('Copy the workspace, Space overview, Folder overview or List link. Task links and custom view links are not project links.');
}
export async function validateSetup(input,token,{fetcher=fetch,run=command}={}){
 const link=parseClickUpLink(input.clickupUrl),slug=repositorySlug(input.repositoryUrl);
 if(typeof input.repositoryPath!=='string'||!isAbsolute(input.repositoryPath)||input.repositoryPath.length>1000)throw Error('Enter the absolute path of your local repository, already added as a project in Codex.');
 const path=resolve(input.repositoryPath),branch=String(input.baseBranch||'').trim();
 if(!branch||branch.startsWith('-')||branch.length>200)throw Error('Enter the repository target branch, for example main.');
 await run('git',['check-ref-format','--branch',branch],{cwd:path});
 const top=await run('git',['rev-parse','--show-toplevel'],{cwd:path});
 if(!samePath(resolve(top),path))throw Error('Choose the repository root directory.');
 const origin=await run('git',['remote','get-url','origin'],{cwd:path});
 if(repositorySlug(origin).toLowerCase()!==slug.toLowerCase())throw Error('The local repository origin does not match the GitHub URL.');
 await run('git',['rev-parse','--verify',`refs/heads/${branch}^{commit}`],{cwd:path});
 const root=new ClickUpClient(token,fetcher,{workspaceId:link.workspaceId}),catalog=await root.catalog();
 const lists=catalog.lists.filter(l=>link.kind==='workspace'||link.kind==='space'&&l.space_id===link.id||link.kind==='folder'&&l.folder_id===link.id||link.kind==='list'&&l.id===link.id);
 if(!lists.length)throw Error('The ClickUp link has no accessible active lists for this API token.');
 const defaultListIds=link.kind==='workspace'?[]:lists.map(l=>l.id);
 return {setup:{...link,defaultListIds,repositorySlug:slug,repositoryUrl:'https://github.com/'+slug+'.git',repositoryPath:path,baseBranch:branch,projectId:'',projectName:slug.split('/')[1],hostId:'local',configured:true},catalog,filter:{list_ids:defaultListIds,time_zone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}};
}
export async function saveSetup(store,credentials,input,options={}){
 const before=await store.read();
 if(input.expectedSetupId!==(before.setup?.setupId||''))throw Error('Setup changed in another window. Reopen Setup.');
 const token=input.token?.trim()||await credentials.get();
 if(process.env.CLICKUP_API_TOKEN&&token!==process.env.CLICKUP_API_TOKEN)throw Error('A ClickUp token is supplied by the environment. Remove that override before saving a different token.');
 if(!/^pk_[^\s]{10,1000}$/.test(token))throw Error('Enter a personal ClickUp API token starting with pk_.');
 const checked=await validateSetup(input,token,options);
 return store.mutate(async s=>{
  if(input.expectedSetupId!==(s.setup?.setupId||''))throw Error('Setup changed in another window. Reopen Setup.');
  const existing=s.setup,changed=!existing||['workspaceId','clickupUrl','repositoryUrl','repositoryPath','baseBranch'].some(k=>existing[k]!==checked.setup[k]);
  if(changed&&Object.values(s.runs).some(r=>r.status!=='released'&&!r.finish?.completed_at))throw Error('Finish or stop and release existing assignments before changing the project.');
  if(input.token?.trim())await credentials.save(token);
  if(changed){const history=s.setup_history||[];if(existing)history.push({setup:existing,runs:s.runs,history:s.history});for(const key of Object.keys(s))delete s[key];Object.assign(s,{version:1,tickets:[],runs:{},setup_history:history,filter:checked.filter,catalog:checked.catalog});}
  s.setup={...checked.setup,setupId:randomUUID()};s.catalog=checked.catalog;s.connection_verified_at=new Date().toISOString();s.connection_required=false;s.setup_error=null;s.error=null;
 });
}
