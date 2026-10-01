import assert from 'node:assert/strict';
import { ClickUpClient } from './clickup.mjs';
import { SCOPE } from './config.mjs';
import { safePr } from './pr.mjs';
const url='https://github.com/example-owner/ExampleProject/pull/6';
assert.ok(safePr(url)); assert.ok(safePr(url.replace('example-owner','example-owner')));
for(const bad of [url+'/files',url+'?redirect=evil',url.replace('github.com','github.com.evil'),url.replace('example-owner','someone'),url.replace('/6','/0')]) assert.equal(safePr(bad),false);
function fixture({wrong=false,ambiguous=false,stale=false}={}) {
 let status='to do', writes=0;
 const list={id:SCOPE.listId,name:'Bugs',space:{id:SCOPE.spaceId},statuses:[{status:'to do',type:'open'},{status:'complete',type:'done'},...(ambiguous?[{status:'another',type:'done'}]:[])]};
 const task=()=>({id:'fixture',name:'Fixture',list:{id:wrong?'wrong':SCOPE.listId},space:{id:SCOPE.spaceId},team_id:SCOPE.workspaceId,status:{status:stale?'in progress':status,type:status==='complete'?'done':'open'},assignees:[]});
 const client=new ClickUpClient('fixture-only',async(u,o)=>{
  assert.equal(u.origin,'https://api.clickup.com');
  if(o.method==='PUT'){writes++;assert.deepEqual(JSON.parse(o.body),{status:'complete'});status='complete';return Response.json(task());}
  if(u.pathname.endsWith('/space'))return Response.json({spaces:[{id:SCOPE.spaceId,name:SCOPE.spaceName}]});
  if(u.pathname.endsWith('/task')) {assert.equal(u.searchParams.get('include_closed'),'true');return Response.json({tasks:[task(),{...task(),id:'done',status:{status:'complete',type:'done'}}],last_page:true});}
  return Response.json(u.pathname.endsWith('/fixture')?task():list);
 });
 return {client,writes:()=>writes};
}
const good=fixture(); assert.deepEqual(await good.client.finishBug('fixture','to do'),{status:'complete',finished:true});assert.equal(good.writes(),1);
await good.client.finishBug('fixture','to do');assert.equal(good.writes(),1);
for(const opts of [{wrong:true},{ambiguous:true},{stale:true}]) {const f=fixture(opts);await assert.rejects(()=>f.client.finishBug('fixture','to do'));assert.equal(f.writes(),0);}
const loaded=await fixture().client.openBugs(true);assert.deepEqual(loaded.map(t=>t.finished),[false,true]);
console.log('PASS: canonical/legacy PR URLs; rejects other repositories and malformed URLs; scoped manual completion, idempotency, stale/ambiguous status guards; open and finished loading.');
