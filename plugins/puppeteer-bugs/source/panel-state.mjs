import {normalizeFilter,filterTickets,presets,DEFAULT_FILTER} from './filters.mjs';
import {launchDisplay,launchNeedsAttention} from './launch-recovery.mjs';

export function panelState(s,connection,scope,now=Date.now(),focusId){
 const tickets=filterTickets(s.tickets,s.filter||DEFAULT_FILTER,s.catalog?.me?.id),ids=new Set(tickets.map(t=>t.id));
 const runs=Object.fromEntries(Object.entries(s.runs).filter(([id,r])=>ids.has(id)||id===focusId||!['released','investigated'].includes(r.status)&&!r.finish?.completed_at).map(([id,r])=>{
  const {launch,investigation,...rest}=r;
  return [id,launchDisplay({...rest,...investigation?{investigation:{comment_id:investigation.comment_id,comment_pending:investigation.comment_pending}}:{}},now)];
 }));
 const snapshot_key=JSON.stringify([s.revision,connection,s.recovery,focusId,Object.values(runs).filter(r=>launchNeedsAttention(r,now)).map(r=>r.launch_id)]);
 const focused=s.tickets.find(t=>t.id===focusId)||s.ticket_records?.[focusId];
 return {revision:s.revision,snapshot_key,fetched_at:s.fetched_at,complete:s.complete,error:s.error,setup_error:s.setup_error,recovery:s.recovery,filter:normalizeFilter(s.filter||DEFAULT_FILTER),presets:presets(s),active_preset:s.active_preset,catalog:s.catalog,workflows:s.workflows,tickets,runs,...focused?{ticket_records:{[focusId]:focused}}:{},scope,connection};
}
