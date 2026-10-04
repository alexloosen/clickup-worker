import {updateTicket} from './scope.mjs';

export async function cancelBug(store,{ticket_id,expected_status},client){
 return (await store.mutate(async s=>{
  const r=s.runs[ticket_id];
  if(r&&(!['released','investigated'].includes(r.status)||r.finishing))throw Error('Stop the active task and release its assignment before cancelling this ticket.');
  const update=await client.cancelBug(ticket_id,expected_status);
  updateTicket(s,ticket_id,update);
  if(r){r.clickup_synced_at=new Date().toISOString();r.sync_error=null;}
 })).state;
}
