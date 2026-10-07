import {safePr} from './pr.mjs';

export async function publishPrComment(store,{ticket_id,launch_id,summary},client){
 return store.withTickets([ticket_id],async()=>{
  const run=(await store.read()).runs[ticket_id];
  if(!run||run.launch_id!==launch_id||run.status==='released'||!safePr(run.pr_url))throw Error('Record the verified PR for this launch first.');
  const save=fn=>store.mutate(s=>{const r=s.runs[ticket_id];if(r?.launch_id!==launch_id||r.status==='released')throw Error('Assignment changed.');fn(r);});
  const existing=(await client.comments(ticket_id)).find(c=>c.text.includes(run.pr_url));
  if(existing){await save(r=>{r.pr_comment_pending=false;r.pr_comment_id=existing.id;});return 'The PR link is already present.';}
  await save(r=>{if(r.pr_comment_pending)throw Error('Comment outcome is uncertain. Inspect ClickUp before retrying.');r.pr_comment_pending=true;});
  let id;
  try{id=await client.postAcceptance(ticket_id,'Implementation pull request: '+run.pr_url+'\n'+summary);}
  catch(e){if(e.definiteRejection)await save(r=>{r.pr_comment_pending=false;});throw e;}
  await save(r=>{r.pr_comment_pending=false;r.pr_comment_id=id;});return 'PR comment added.';
 });
}
