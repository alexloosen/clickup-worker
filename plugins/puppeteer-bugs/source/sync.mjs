import {updateTicket} from './scope.mjs';
// Serialize with the same cross-process state lock as progress/release updates.
// Failures preserve verified work and leave a visible retryable sync error.
export async function syncWorkStage(store,ticketId,launchId,clientFactory){
 return (await store.mutate(async s=>{
  const r=s.runs[ticketId];if(!r||r.launch_id!==launchId||r.status==='released')throw Error('Assignment changed; no status update made.');
  const stage=r.work_kind==='investigation'?(r.status==='investigated'&&r.investigation?.comment_id?'review requested':null):r.status==='review_requested'&&r.pr_url?'review requested':(['queued','in_progress'].includes(r.status)&&(r.status==='in_progress'||r.thread_id||r.client_thread_id))?'in progress':null;
  if(!stage)return;
  try{const update=await (await clientFactory()).setWorkStage(ticketId,stage);updateTicket(s,ticketId,update);r.sync_error=null;r.clickup_synced_at=new Date().toISOString();}
  catch(e){r.sync_error=e.message||'ClickUp status sync failed. Retry from ticket options.';}
 })).state;
}
