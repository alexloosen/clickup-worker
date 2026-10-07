// Only accepted deliveries are candidates; age alone never proves work is disposable.
export async function cleanupFinishedWorktrees(store,repository){
 const state=await store.read();
 const results=[];
 const records=[...Object.entries(state.runs),...Object.entries(state.history||{}).flatMap(([id,runs])=>runs.map(r=>[id,r]))];
 for(const [ticket_id,r] of records){
  if(!r.finish?.completed_at||r.delivery_mode==='local_commit')continue;
  if(Object.entries(state.runs).some(([id,other])=>(id!==ticket_id||other.launch_id!==r.launch_id)&&other.status!=='released'&&!other.finish?.completed_at&&(other.branch===r.branch||other.commit_sha&&other.commit_sha===r.commit_sha))){results.push(`${ticket_id}: preserved; another assignment uses this branch or commit.`);continue;}
  try{
   await store.withTickets([ticket_id],async()=>{
    const latest=await store.read();if(Object.values(latest.runs).some(other=>other.launch_id!==r.launch_id&&other.status!=='released'&&!other.finish?.completed_at&&(other.branch===r.branch||other.commit_sha&&other.commit_sha===r.commit_sha)))throw Error('Another assignment uses this branch or commit; preserved.');
    const pr=r.delivery_mode==='direct_develop'?await repository.directDelivery(r.commit_sha,r.branch):await repository.pullRequest(r.pr_url);
    results.push(`${ticket_id}: ${await repository.cleanupWorktrees(ticket_id,pr,r.branch)}`);
   });
  }catch(e){results.push(`${ticket_id}: ${e.message}`);}
 }
 return results.length?results:['No accepted worktree deliveries are recorded for this project.'];
}
