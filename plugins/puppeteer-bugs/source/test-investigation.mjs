import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from './store.mjs';
import {SCOPE} from './config.mjs';
import {ClickUpClient} from './clickup.mjs';
import {reserveLaunches,recordWork,releaseAssignment} from './dispatch.mjs';
import {creationArguments,launchDirect} from './direct-launch.mjs';
import {completeInvestigation,conclusions} from './investigation.mjs';
import {cancelBug} from './cancel.mjs';
import {syncWorkStage} from './sync.mjs';

function fixture({missing=false,ambiguous=false,wrong=false,unconfirmed=false,mapped=false}={}){
 let status='to do',writes=0,posts=0,failStatus=false,loseComment=false,comments=[];
 const review=mapped?'Ready for review':'review requested';
 const statuses=[{status:'to do',type:'open'},{status:'in progress',type:'custom'},{status:review,type:'custom'},{status:'complete',type:'done'},...missing?[]:[{status:'Cancelled',type:'custom'}],...ambiguous?[{status:'cancelled',type:'closed'}]:[]];
 const task=()=>({id:'fixture',name:'Fixture',list:{id:wrong?'999':SCOPE.listId},space:{id:SCOPE.spaceId},team_id:SCOPE.workspaceId,status:{status,type:statuses.find(s=>s.status===status)?.type}});
 const client=new ClickUpClient('synthetic',async(u,o)=>{
  if(o.method==='PUT'){if(failStatus)throw Error('offline');writes++;if(!unconfirmed)status=JSON.parse(o.body).status;return Response.json({});}
  if(o.method==='POST'){posts++;const text=JSON.parse(o.body).comment_text;comments.push({id:String(posts),date:String(posts),comment_text:text,user:{username:'Investigator'}});if(loseComment)throw Error('Lost response');return Response.json({id:posts});}
  if(u.pathname.endsWith('/comment'))return Response.json({comments:u.searchParams.has('start')?[]:comments});
  if(u.pathname.endsWith('/space'))return Response.json({spaces:[{id:SCOPE.spaceId,name:SCOPE.spaceName}]});
  if(u.pathname.endsWith('/fixture'))return Response.json(task());
  return Response.json({id:SCOPE.listId,name:SCOPE.listName,space:{id:SCOPE.spaceId},statuses});
 },{...SCOPE,workflow:mapped?{review_requested:review}:undefined});
 return {client,task,statuses,review,get status(){return status;},set status(s){status=s;},get writes(){return writes;},get posts(){return posts;},get comments(){return comments;},set failStatus(v){failStatus=v;},set loseComment(v){loseComment=v;},hideComments(){comments=[];}};
}
async function reserve(){
 const store=new Store(await mkdtemp(join(tmpdir(),'clickup-investigation-'))),ticket={id:'fixture',name:'Fixture',status:'to do',finished:false,comments:[{text:'Existing context'}]};
 await store.mutate(s=>{s.tickets=[ticket];});
 const packet=(await reserveLaunches(store,[ticket],[ticket.id],[{ticket_id:ticket.id,model:'gpt-6-luna',thinking:'high',delivery_mode:'local_commit',additional_context:'Inspect player prefab'}],'investigation')).value.launches[0];
 return {store,ticket,packet,args:{ticket_id:ticket.id,launch_id:packet.launch_id,conclusion:'already_present',findings:'Player.prefab references PlayerAbility.cs, which implements the requested ability.'}};
}
const {store,ticket,packet,args}=await reserve(),f=fixture({mapped:true});
assert.equal(packet.work_kind,'investigation');assert.equal(creationArguments(packet).target.environment.type,'local');
for(const text of ['Existing context','Inspect player prefab','already in the game','prefabs','refactor','Do not edit repository files','complete_bug_investigation'])assert.ok(packet.prompt.includes(text),text);
assert.equal((await reserveLaunches(store,[ticket],[ticket.id])).value.launches.length,0,'implementation cannot overlap investigation');
await assert.rejects(()=>cancelBug(store,{ticket_id:ticket.id,expected_status:'to do'},f.client),/release/);
await assert.rejects(()=>recordWork(store,{...args,status:'review_requested',pr_url:'https://github.com/example-owner/ExampleProject/pull/6'}),/complete_bug_investigation/);
await recordWork(store,{ticket_id:ticket.id,launch_id:packet.launch_id,status:'in_progress'});
await syncWorkStage(store,ticket.id,packet.launch_id,()=>f.client);assert.equal(f.writes,0,'investigation does not mark implementation in progress');
await assert.rejects(()=>completeInvestigation(store,{...args,launch_id:'stale'},f.client),/changed/);assert.equal(f.posts,0);
// Overlong summaries must not claim the comment slot, publish, or alter status.
const beforeRejection=await store.read();
for(const findings of ['word '.repeat(181),'x'.repeat(2001)]){
 await assert.rejects(()=>completeInvestigation(store,{...args,findings},f.client),/Rewrite it in plain language.*Nothing was posted/);
 assert.deepEqual(await store.read(),beforeRejection);assert.equal(f.posts,0);assert.equal(f.writes,0);
}
await completeInvestigation(store,args,f.client);assert.equal(f.posts,1);assert.match(f.comments[0].comment_text,/already in the game/);
f.failStatus=true;let state=await syncWorkStage(store,ticket.id,packet.launch_id,()=>f.client);
assert.ok(state.runs.fixture.sync_error);assert.equal(state.runs.fixture.status,'investigated');
f.failStatus=false;state=await syncWorkStage(store,ticket.id,packet.launch_id,()=>f.client);assert.equal(f.status,f.review);assert.equal(state.runs.fixture.sync_error,null);
await completeInvestigation(store,args,f.client);assert.equal(f.posts,1,'completion retry deduplicates');
await recordWork(store,{ticket_id:ticket.id,launch_id:packet.launch_id,status:'queued',thread_id:'investigation-chat'});assert.equal((await store.read()).runs.fixture.status,'investigated','late dispatcher cannot relock');
ticket.comments=await f.client.comments(ticket.id);
const implementation=(await reserveLaunches(store,[ticket],[ticket.id],[{ticket_id:ticket.id,delivery_mode:'local_commit'}])).value.launches[0];
assert.equal(implementation.work_kind,'implementation');assert.match(implementation.prompt,/PlayerAbility.cs/);assert.match(implementation.prompt,/already in the game/);
assert.equal((await store.read()).history.fixture[0].investigation.comment_id,'1');
await assert.rejects(()=>completeInvestigation(store,args,f.client),/changed/);

// The approved example and word-limit boundary are accepted without truncation.
const approvedFindings=`The ballista’s firing animation and gate-destruction video are already implemented and connected in the scene.

What’s missing is the gameplay result: firing the ballista does not yet permanently open the overworld route to L3.1.

Recommended changes:
- Reuse the existing animation and video.
- Save that the ballista has fired, so it stays used after reloading.
- Make the overworld gate remember its destroyed state and remove the obstacle blocking the route.

Design decision: L3.1 also requires a key. Should that requirement remain after the gate is destroyed?

Verification needed: These findings come from inspecting scripts and scene setup. In-game behavior, route access and save/reload still need testing.`;
for(const findings of [approvedFindings,Array(180).fill('word').join(' ')]){
 const x=await reserve(),fixtureClient=fixture();
 await completeInvestigation(x.store,{...x.args,conclusion:'refactor_existing',findings:`\n ${findings} \n`},fixtureClient.client);
 assert.equal(fixtureClient.posts,1);assert.ok(fixtureClient.comments[0].comment_text.includes(findings));
 assert.equal((await x.store.read()).runs.fixture.investigation.findings,findings);
}

// Every conclusion publishes its explicit classification and requests review.
for(const conclusion of Object.keys(conclusions)){
 const x=await reserve(),fixtureClient=fixture();
 await launchDirect(x.store,[x.packet],{async call(){await completeInvestigation(x.store,{...x.args,conclusion},fixtureClient.client);return {threadId:'fast-investigator'};}},{},{sync:()=>syncWorkStage(x.store,'fixture',x.packet.launch_id,()=>fixtureClient.client)});
 assert.equal((await x.store.read()).runs.fixture.status,'investigated');assert.equal(fixtureClient.status,'review requested');assert.ok(fixtureClient.comments[0].comment_text.includes(conclusions[conclusion]));
}
// Lost POST response: recover from ClickUp; if absent, retain the uncertain lock.
for(const found of [true,false]){
 const x=await reserve(),fixtureClient=fixture();fixtureClient.loseComment=true;
 await assert.rejects(()=>completeInvestigation(x.store,x.args,fixtureClient.client));
 assert.equal((await x.store.read()).runs.fixture.status,'dispatching');
 if(!found)fixtureClient.hideComments();
 if(found)await completeInvestigation(x.store,x.args,fixtureClient.client);
 else await assert.rejects(()=>completeInvestigation(x.store,x.args,fixtureClient.client),/uncertain/);
 assert.equal(fixtureClient.posts,1);
}
// Simultaneous completions can publish only once across server instances.
{
 const x=await reserve(),fixtureClient=fixture();
 const results=await Promise.allSettled([completeInvestigation(x.store,x.args,fixtureClient.client),completeInvestigation(x.store,x.args,fixtureClient.client)]);
 assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(fixtureClient.posts,1);
}
// Cancellation works without a delivery and is idempotent, scoped and stale-safe.
const unassigned=new Store(await mkdtemp(join(tmpdir(),'clickup-cancel-')));
await unassigned.mutate(s=>{s.tickets=[ticket];});const cancelled=fixture();
state=await cancelBug(unassigned,{ticket_id:'fixture',expected_status:'to do'},cancelled.client);
assert.equal(state.tickets[0].status,'Cancelled');assert.equal(state.tickets[0].finished,true);
await cancelBug(unassigned,{ticket_id:'fixture',expected_status:'to do'},cancelled.client);assert.equal(cancelled.writes,1);
const normalized=cancelled.client.normalizeTask(cancelled.task(),{lists:[{id:SCOPE.listId,space_id:SCOPE.spaceId}]},[SCOPE.listId]);assert.equal(normalized.finished,true,'custom Cancelled stays finished on refresh');
await cancelled.client.setWorkStage('fixture','review requested');assert.equal(cancelled.writes,1,'late stage sync must preserve cancellation');
for(const options of [{missing:true},{ambiguous:true},{wrong:true}]){const bad=fixture(options);await assert.rejects(()=>bad.client.cancelBug('fixture','to do'));assert.equal(bad.writes,0);}
const stale=fixture();stale.status='in progress';await assert.rejects(()=>stale.client.cancelBug('fixture','to do'),/changed/);assert.equal(stale.writes,0);
const done=fixture();done.status='complete';await assert.rejects(()=>done.client.cancelBug('fixture','complete'),/finished/);
await assert.rejects(()=>fixture({unconfirmed:true}).client.cancelBug('fixture','to do'),/not confirmed/);
const x=await reserve(),cancelFixture=fixture();await completeInvestigation(x.store,x.args,cancelFixture.client);
await cancelBug(x.store,{ticket_id:'fixture',expected_status:'to do'},cancelFixture.client);assert.equal(cancelFixture.status,'Cancelled');
const run=(await store.read()).runs.fixture;
await releaseAssignment(store,{ticket_id:'fixture',expected_launch_id:run.launch_id,expected_updated_at:run.updated_at,confirmed_stopped:true});
await cancelBug(store,{ticket_id:'fixture',expected_status:f.status},f.client);assert.equal(f.status,'Cancelled');
console.log('PASS: investigation launches, all conclusions, review sync/retry, comment handoff, fast workers, deduplication and uncertain writes; scoped cancellation, active/stale/finished guards and refresh persistence.');
