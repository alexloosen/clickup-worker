import {updateTicket} from './scope.mjs';
// Serialize finish attempts per ticket across server processes. Persist each external
// step independently so retries cannot erase completed work or repost blindly.
export async function finishBug(store,{ticket_id,expected_status,confirmed_tested},client,repository){
 if(confirmed_tested!==true)throw Error('Finishing requires the user to confirm that the fix was tested and accepted.');
 return store.withTickets([ticket_id],async()=>{
 let launch;
 const save=async fn=>(await store.mutate(s=>{const r=s.runs[ticket_id];if(!r||r.launch_id!==launch||r.status==='released')throw Error('Assignment changed during finishing.');fn(r,s);})).state;
 try{
  const state=await store.read(),r=state.runs[ticket_id];launch=r?.launch_id;
  if(!r||r.work_kind==='investigation'||r.status==='released'||(!r.pr_url&&!['direct_develop','local_commit'].includes(r.delivery_mode)))throw Error('A verified delivery is required before finishing this bug.');
  const pr=r.delivery_mode==='local_commit'?await repository.localDelivery(r.commit_sha,r.branch):r.delivery_mode==='direct_develop'?await repository.directDelivery(r.commit_sha,r.branch):await repository.pullRequest(r.pr_url);
  const ticket=await client.verifyTicket(ticket_id);
  if(ticket.status?.status!==expected_status&&!['done','closed'].includes(ticket.status?.type))throw Error('Ticket status changed. Refresh before finishing.');
  const marker=`[Puppeteer Bugs acceptance: ${pr.url}]`;
  if(r.finish?.pr_url&&r.finish.pr_url!==pr.url)throw Error('The completion record belongs to a different PR.');
  await save(run=>{run.finish??={pr_url:pr.url};run.finish_error=null;run.finishing=true;});
  const comments=await client.comments(ticket_id);const existing=comments.find(c=>c.text.includes(marker));
  if(existing)await save(run=>{run.finish.comment_id=existing.id;run.finish.comment_pending=false;});
  else if(!r.finish?.comment_id){
   if(r.finish?.comment_pending)throw Error('A previous comment request has an uncertain outcome. Check ClickUp; no duplicate comment was posted.');
   await save(run=>{run.finish.comment_pending=true;});
   const text=`${pr.local?'Local fix accepted (not published)':pr.direct?'Direct fix accepted and verified in the target branch':'PR accepted and merged into the target branch'}: ${pr.url}\nThe user confirmed that the task was successfully tested and is considered fixed by clicking Mark finished in Puppeteer Tasks.\n${marker}`;
   let id;try{id=await client.postAcceptance(ticket_id,text);}catch(e){if(e.definiteRejection)await save(run=>{run.finish.comment_pending=false;});throw e;}
   await save(run=>{run.finish.comment_id=id;run.finish.comment_pending=false;});
  }
  // Use the shared state lock for status changes, just like progress synchronization.
  const updated=await client.finishBug(ticket_id,expected_status);
  await save((run,s)=>{updateTicket(s,ticket_id,updated);run.clickup_synced_at=new Date().toISOString();run.sync_error=null;run.finish.completed_at=new Date().toISOString();});
  const cleanup=pr.local?'Existing checkout and local commit retained.':await repository.cleanup(ticket_id,pr,r.branch);
  await save(run=>{run.finish.cleanup=cleanup;run.finish.cleanup_done=true;run.finish_error=null;});
 }catch(e){if(launch)await save(r=>{r.finish_error=e.message||'Finishing failed. Retry after checking the ticket.';}).catch(()=>{});else throw e;}
 finally{if(launch)await save(r=>{r.finishing=false;}).catch(()=>{});}
 return await store.read();
 });
}
