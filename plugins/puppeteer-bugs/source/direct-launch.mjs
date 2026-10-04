import {normalizePath as normalized} from './platform.mjs';
import {SCOPE} from './config.mjs';
import {recordWork} from './dispatch.mjs';
export function verifyProject(data){
 const matches=(data?.projects||[]).filter(p=>p.hostId===SCOPE.hostId&&normalized(p.path)===normalized(SCOPE.repositoryPath)&&p.isGitRepository===true);const project=matches.length===1?matches[0]:null;
 if(!project||typeof project.projectId!=='string'||!project.projectId||project.hostId!==SCOPE.hostId||normalized(project.path)!==normalized(SCOPE.repositoryPath)||project.isGitRepository!==true)throw Error('Add the configured repository folder as exactly one local Git project in Codex. No implementation was started.');
 SCOPE.projectId=project.projectId;SCOPE.projectName=project.label;return project;
}
export function creationArguments(packet){
 if(packet.target?.type!=='project'||packet.target.projectId!==SCOPE.projectId||(packet.work_kind==='investigation'||packet.delivery_mode==='local_commit'?(packet.target.environment?.type!=='local'||packet.target.environment.startingState!==undefined):(packet.target.environment?.type!=='worktree'||packet.target.environment.startingState?.type!=='branch'||packet.target.environment.startingState.branchName!==SCOPE.baseBranch))||!packet.prompt)throw Error('Invalid project/worktree launch packet.');
 return {target:packet.target,prompt:packet.prompt,title:packet.title,...packet.model?{model:packet.model}:{},...packet.thinking?{thinking:packet.thinking}:{}};
}
export function createdIdentity(result){
 if(typeof result?.threadId==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(result.threadId))return {thread_id:result.threadId};
 if(typeof result?.clientThreadId==='string'&&/^(?:client-new-thread:)?[a-zA-Z0-9-]{1,100}$/.test(result.clientThreadId))return {client_thread_id:result.clientThreadId};
 throw Error('Codex did not return a valid chat identity. Check existing chats before retrying.');
}
export async function launchDirect(store,packets,host,caller,{signal,sync=async()=>{}}={}){
 // Atomic per-launch claim protects retries even when the host outcome is uncertain.
 return Promise.all(packets.map(async packet=>{
  const args=creationArguments(packet);
  const claimed=await store.mutate(s=>{const run=s.runs[packet.ticket_id];if(!run||run.launch_id!==packet.launch_id||run.status!=='dispatching'||run.thread_id||run.client_thread_id||run.launch_attempted_at)return false;run.launch_attempted_at=new Date().toISOString();run.summary=packet.work_kind==='investigation'?'Investigation chat requested in the existing checkout (read-only).':packet.delivery_mode==='local_commit'?'Creating the coding chat in the existing checkout.':'Creating the coding chat directly in a worktree from the configured target branch.';run.updated_at=new Date().toISOString();return true;});
  if(!claimed.value)return {ticket_id:packet.ticket_id,launch_id:packet.launch_id,skipped:true};
  try{
   const identity=createdIdentity(await host.call('create_thread',args,caller,signal));
   await recordWork(store,{ticket_id:packet.ticket_id,launch_id:packet.launch_id,status:'queued',...identity,summary:packet.work_kind==='investigation'?'Investigation chat requested in the existing checkout (read-only).':packet.delivery_mode==='local_commit'?'Coding chat requested in the existing checkout.':identity.thread_id?'Coding chat created in a worktree from the configured target branch.':'Coding chat requested; worktree setup is pending.'});
   try{await sync(packet.ticket_id,packet.launch_id);}catch{}
   return {ticket_id:packet.ticket_id,launch_id:packet.launch_id,...identity};
  }catch(e){
   // A disconnected or rejected response may arrive after creation. Keep the lock.
   await store.mutate(s=>{const run=s.runs[packet.ticket_id];if(run?.launch_id===packet.launch_id&&run.status==='dispatching'){run.summary=e.message;run.launch_error=e.message;run.updated_at=new Date().toISOString();}});
   return {ticket_id:packet.ticket_id,launch_id:packet.launch_id,error:e.message};
  }
 }));
}
