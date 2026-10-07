import {updateTicket} from './scope.mjs';

export async function cancelBug(store,{ticket_id,expected_status},client){
 return store.withTickets([ticket_id],async()=>{
  const s=await store.read();
  const r=s.runs[ticket_id];
  if(r&&(!['released','investigated'].includes(r.status)||r.finishing))throw Error('Stop the active task and release its assignment before cancelling this ticket.');
  const update=await client.cancelBug(ticket_id,expected_status);
  return (await store.mutate(s=>{updateTicket(s,ticket_id,update);const current=s.runs[ticket_id];if(current){current.clickup_synced_at=new Date().toISOString();current.sync_error=null;}})).state;
 });
}
