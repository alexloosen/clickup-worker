export async function recoverComment(store,{ticket_id,launch_id,kind,confirmed_absent},client){
 if(!confirmed_absent)throw Error('Check ClickUp and stop the previous publication attempt before recovering a comment.');
 return store.withTickets([ticket_id],async()=>{
  const s=await store.read(),r=s.runs[ticket_id];
  if(!r||r.launch_id!==launch_id||r.status==='released')throw Error('Assignment changed.');
  const marker=kind==='investigation'?`[ClickUp investigation: ${launch_id}]`:kind==='acceptance'?r.finish?.pr_url&&`[Puppeteer Bugs acceptance: ${r.finish.pr_url}]`:r.pr_url;
  if(!marker)throw Error('No matching comment attempt is recorded.');
  const comments=await client.comments(ticket_id),existing=comments.find(c=>c.text.includes(marker));
  return (await store.mutate(s=>{
   const r=s.runs[ticket_id];if(r?.launch_id!==launch_id||r.status==='released')throw Error('Assignment changed.');
   if(kind==='pr'){r.pr_comment_pending=false;if(existing)r.pr_comment_id=existing.id;}
   else {const target=kind==='investigation'?r.investigation:r.finish;if(!target)throw Error('No comment attempt is recorded.');target.comment_pending=false;if(existing)target.comment_id=existing.id;}
   r.summary=existing?'Existing ClickUp comment found. Retry the original action to continue.':'Comment retry unlocked after inspection. Retry the original action when ready.';
  })).state;
 });
}
