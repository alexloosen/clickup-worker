import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {HostTools,callerContext,decodeToolResult} from './host.mjs';
import {verifyProject,creationArguments,createdIdentity,launchDirect} from './direct-launch.mjs';
import {Store} from './store.mjs';
import {reserveLaunches,recordWork} from './dispatch.mjs';
import {SCOPE} from './config.mjs';
const caller=callerContext({_meta:{'x-codex-turn-metadata':JSON.stringify({thread_id:'caller-chat',turn_id:'caller-turn'})}});
assert.deepEqual(caller,{threadId:'caller-chat',turnId:'caller-turn'});
assert.throws(()=>callerContext(),/calling chat identity/);
assert.throws(()=>callerContext({_meta:{'x-codex-turn-metadata':'invalid'}}),/calling chat identity/);
assert.equal(callerContext({_meta:{'openai/threadId':'host-bound-chat'}}).threadId,'host-bound-chat');
assert.deepEqual(decodeToolResult({success:true,contentItems:[{type:'inputText',text:'{"threadId":"worker"}'}]}),{threadId:'worker'});
assert.throws(()=>decodeToolResult({success:false,contentItems:[{type:'inputText',text:'Rejected by host'}]}),/Rejected by host/);
assert.throws(()=>decodeToolResult({success:true,contentItems:[{type:'inputText',text:'Unstructured success'}]}),/no structured result/);
await assert.rejects(()=>new HostTools('').discover(),/connection is unavailable/);
const project={projectId:SCOPE.projectId,label:SCOPE.projectName,path:process.platform==='win32'?SCOPE.repositoryPath.toUpperCase().replaceAll('\\','/'):SCOPE.repositoryPath,hostId:SCOPE.hostId,isGitRepository:true};
assert.equal(verifyProject({projects:[project]}),project);
for(const change of [{path:'C:/Other'},{hostId:'remote'},{isGitRepository:false}]){assert.throws(()=>verifyProject({projects:[{...project,...change}]}),/exactly one local Git project/);}
const directory=await mkdtemp(join(tmpdir(),'puppeteer-direct-test-')),store=new Store(directory);
const tickets=['a','b','c'].map(id=>({id,name:'Task '+id,description:'Full evidence '+id,status:'to do',comments:[{text:'Reproduction note '+id}]}));
const reserved=await reserveLaunches(store,tickets,['a','b'],[{ticket_id:'a',model:'gpt-6-luna',thinking:'max',delivery_mode:'direct_develop',additional_context:'Context a'},{ticket_id:'b',model:'gpt-6.1-sol',thinking:'high'}]);
const packets=reserved.value.launches,calls=[];
// Both delivery modes and the installed skill must carry the recovery contract.
// Keep approval in the command path, never in create_thread permission overrides.
const skill=await readFile(new URL('../skills/fix-bug/SKILL.md',import.meta.url),'utf8');
for(const instructions of [...packets.map(p=>p.prompt),skill]){
 assert.match(instructions,/default permissions first/);
 assert.match(instructions,/require_escalated/);
 assert.match(instructions,/approved command retry is not a change to sandbox or approval settings/);
 assert.match(instructions,/Respect rejection or unavailable escalation/);
 assert.match(instructions,/Never bypass a denial/);
 assert.match(instructions,/Never substitute a temporary/);
 assert.match(instructions,/git branch --show-current/);
 assert.match(instructions,/unauthenticated.*gh.*alone does not establish that Git credentials are missing/);
 assert.match(instructions,/repository's required batch launcher/);
 assert.match(instructions,/Distinguish sandbox access failures/);
}
const host={async call(name,args,boundCaller){calls.push({name,args,boundCaller});if(args.title==='Task a'){await recordWork(store,{ticket_id:'a',launch_id:packets[0].launch_id,status:'in_progress',summary:'Worker already started'});return {threadId:'worker-a'};}return {clientThreadId:'client-new-thread:worker-b'};}};
const [created,replayed]=await Promise.all([launchDirect(store,packets,host,caller,{sync:async()=>{throw Error('ClickUp offline');}}),launchDirect(store,packets,host,caller)]);
assert.equal(calls.length,2);assert.equal([...created,...replayed].filter(c=>c.skipped).length,2);
for(const call of calls){const packet=packets.find(p=>p.title===call.args.title);assert.equal(call.name,'create_thread');assert.equal(call.args.prompt,packet.prompt);assert.equal(call.args.model,packet.model);assert.equal(call.args.thinking,packet.thinking);assert.deepEqual(call.args.target,packet.target);assert.deepEqual(call.boundCaller,caller);assert.ok(call.args.prompt.includes('Reproduction note'));assert.equal(Object.hasOwn(call.args,'approval_policy'),false);}
const state=await store.read();assert.equal(state.runs.a.thread_id,'worker-a');assert.equal(state.runs.a.status,'in_progress');assert.equal(state.runs.b.client_thread_id,'client-new-thread:worker-b');assert.equal(state.runs.b.thread_id,undefined);
for(const {args} of calls){assert.deepEqual(Object.keys(args).sort(),['model','prompt','target','thinking','title']);}
await launchDirect(store,packets,host,caller);assert.equal(calls.length,2);
const next=(await reserveLaunches(store,tickets,['c'])).value.launches;let attempts=0;
const failing={async call(){attempts++;throw Error('Connection lost after request');}};
const failed=await launchDirect(store,next,failing,caller);assert.equal(failed[0].error,'Connection lost after request');
await launchDirect(store,next,failing,caller);assert.equal(attempts,1);assert.equal((await store.read()).runs.c.status,'dispatching');assert.ok((await store.read()).runs.c.launch_attempted_at);
assert.deepEqual(createdIdentity({clientThreadId:'client-new-thread:test'}),{client_thread_id:'client-new-thread:test'});
assert.throws(()=>createdIdentity({threadId:'invalid:id'}),/valid chat identity/);
assert.throws(()=>creationArguments({...packets[0],target:{type:'projectless'}}),/Invalid project/);
console.log('PASS: exact project validation; host-bound caller metadata; complete prompt/model/thinking/worktree preservation; one worker per packet; atomic retry protection; pending IDs; fast-worker progress race; sync failure retention; uncertain outcomes remain locked; no permission overrides.');
