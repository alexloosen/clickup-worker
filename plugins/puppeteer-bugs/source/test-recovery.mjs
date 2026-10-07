import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import vm from 'node:vm';
import {acquireLock} from './locks.mjs';
import {Store} from './store.mjs';
import {ClickUpClient} from './clickup.mjs';
import {completeInvestigation} from './investigation.mjs';
import {finishBug} from './finish.mjs';
import {recoverComment} from './comment-recovery.mjs';
import {syncWorkStage} from './sync.mjs';
import {reconnectLaunch,launchDisplay} from './launch-recovery.mjs';
import {panelState} from './panel-state.mjs';
import {HostTools,hostModels} from './host.mjs';
import {validThinking} from './models.mjs';
import {publishPrComment} from './pr-comment.mjs';

const root=await mkdtemp(join(tmpdir(),'clickup-recovery-')),store=new Store(join(root,'state'));
// Kill a real lock owner. Two new writers must safely recover and retain both updates.
const lock=join(store.directory,'state.lock');
const child=spawn(process.execPath,['--input-type=module','-e',`import {acquireLock} from ${JSON.stringify(new URL('./locks.mjs',import.meta.url).href)};await acquireLock(process.argv[1]);console.log('ready');setInterval(()=>{},1000);`,lock],{stdio:['ignore','pipe','pipe'],windowsHide:true});
try{
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Lock fixture exited early');}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Lock fixture timed out')),10000);t.unref();})]);
 const exited=once(child,'exit');child.kill();await exited;
 const other=new Store(store.directory);
 await Promise.all([store.mutate(s=>{s.count=(s.count||0)+1;}),other.mutate(s=>{s.count=(s.count||0)+1;})]);
 assert.equal((await store.read()).count,2);
}finally{child.kill();}
const release=await acquireLock(lock);
await assert.rejects(()=>acquireLock(lock,{timeout:60}),/still running/);await release();
await Promise.all(Array.from({length:12},()=>store.mutate(s=>{s.count++;})));
assert.equal((await store.read()).count,14);
await writeFile(lock,'');await assert.rejects(()=>store.mutate(()=>{}),/older version/);
await store.repair({confirmed_stopped:true});await store.mutate(s=>{s.count++;});assert.equal((await store.read()).count,15);

await store.mutate(s=>{s.runs.a={launch_id:'launch-a',status:'in_progress',finishing:true};});
await store.mutate(s=>{s.count++;});
await writeFile(store.file,'broken JSON');
assert.equal((await store.read()).recovery.kind,'backup');
await assert.rejects(()=>store.mutate(()=>{}),/repair/);
await assert.rejects(()=>store.repair(),/Stop previous/);
const repaired=await store.repair({confirmed_stopped:true});assert.equal(repaired.runs.a.status,'blocked');assert.equal(repaired.runs.a.finishing,false);
assert.ok((await readdir(store.directory)).some(n=>n.startsWith('state.json.preserved-')));
await writeFile(store.file,'broken');await writeFile(store.backup,'also broken');
await assert.rejects(()=>store.repair({confirmed_stopped:true}),/No readable backup/);
assert.equal((await store.repair({confirmed_stopped:true,reset:true})).tickets.length,0);

// Definite server rejections allow retry; lost responses and 5xx keep the write intent.
for(const status of [400,401,403,404,422,429,500]){
 const api=new ClickUpClient('fixture',async()=>new Response('{}',{status}));
 let rejected;try{await api.request('task/a/comment',{},'POST',{});}catch(e){rejected=e;}
 assert.equal(rejected.definiteRejection,status!==500);
 const s=new Store(join(root,'comment-'+status));
 await s.mutate(s=>{s.runs.a={launch_id:'launch-a',work_kind:'investigation',status:'in_progress'};});
 let posts=0,fail=true;
 const client={comments:async()=>[],postAcceptance:async()=>{posts++;if(fail)throw rejected;return 'comment-1';}};
 const args={ticket_id:'a',launch_id:'launch-a',conclusion:'inconclusive',findings:'More evidence is needed.'};
 await assert.rejects(()=>completeInvestigation(s,args,client));fail=false;
 if(status===500){await assert.rejects(()=>completeInvestigation(s,args,client),/uncertain/);assert.equal(posts,1);await recoverComment(s,{...args,kind:'investigation',confirmed_absent:true},client);}
 await completeInvestigation(s,args,client);assert.equal(posts,2);assert.equal((await s.read()).runs.a.investigation.comment_pending,false);
}
const acceptanceStore=new Store(join(root,'acceptance'));
await acceptanceStore.mutate(s=>{s.runs.a={launch_id:'launch-a',status:'completed',delivery_mode:'local_commit',commit_sha:'a'.repeat(40)};});
let rejectPost=true,acceptancePosts=0;
const acceptanceClient={verifyTicket:async()=>({status:{status:'in progress'}}),comments:async()=>[],postAcceptance:async()=>{acceptancePosts++;if(rejectPost)throw Object.assign(Error('Rejected'),{definiteRejection:true});return 'one';},finishBug:async()=>({status:'complete',finished:true})};
const finishArgs={ticket_id:'a',expected_status:'in progress',confirmed_tested:true},repo={localDelivery:async()=>({local:true,url:'local commit abc'})};
await finishBug(acceptanceStore,finishArgs,acceptanceClient,repo);assert.equal((await acceptanceStore.read()).runs.a.finish.comment_pending,false);
rejectPost=false;await finishBug(acceptanceStore,finishArgs,acceptanceClient,repo);assert.equal(acceptancePosts,2);

const prStore=new Store(join(root,'pr-comment')),prUrl='https://github.com/example-owner/ExampleProject/pull/1';
await prStore.mutate(s=>{s.runs.a={launch_id:'launch-a',status:'review_requested',pr_url:prUrl};});
let prPosts=0,prRejected=true,prComments=[];
const prClient={comments:async()=>prComments,postAcceptance:async()=>{prPosts++;if(prRejected)throw Object.assign(Error('Rate limited'),{definiteRejection:true});return 'pr-one';}},prArgs={ticket_id:'a',launch_id:'launch-a',summary:'Checks passed.'};
await assert.rejects(()=>publishPrComment(prStore,prArgs,prClient));assert.equal((await prStore.read()).runs.a.pr_comment_pending,false);
prRejected=false;await publishPrComment(prStore,prArgs,prClient);assert.equal(prPosts,2);
await prStore.mutate(s=>{s.runs.a.pr_comment_pending=true;});prComments=[{id:'found',text:prUrl}];await publishPrComment(prStore,prArgs,prClient);assert.equal((await prStore.read()).runs.a.pr_comment_pending,false);assert.equal(prPosts,2);

// A slow external status update must not hold the board-wide lock.
const slowStore=new Store(join(root,'slow'));await slowStore.mutate(s=>{s.runs.a={launch_id:'launch-a',status:'in_progress'};});
let unblock,started;const entered=new Promise(r=>started=r),gate=new Promise(r=>unblock=r);
const syncing=syncWorkStage(slowStore,'a','launch-a',()=>({setWorkStage:async()=>{started();await gate;return {status:'in progress'};}}));
await entered;await slowStore.mutate(s=>{s.unrelated='still responsive';});assert.equal((await slowStore.read()).unrelated,'still responsive');unblock();await syncing;

assert.equal(validThinking('gpt-5.6-luna','ultra'),false);
const catalog=hostModels({inputSchema:{properties:{model:{description:'Models: gpt-6-luna (Fast; supported reasoning efforts: low, high, max), gpt-6.1-sol (Best; supported reasoning efforts: high, ultra).'}}}});
const host=new HostTools('unused');host.models=catalog;
assert.throws(()=>host.validateOptions([{model:'gpt-6-luna',thinking:'ultra'}]),/No task was reserved/);
host.validateOptions([{model:'gpt-6.1-sol',thinking:'high'}]);

const pending={launch_id:'launch-a',status:'queued',client_thread_id:'client-new-thread:pending',launch_attempted_at:new Date(0).toISOString()};
assert.equal(launchDisplay(pending,120001).launch_attention,true);assert.equal(launchDisplay({...pending,thread_id:'real'},120001).launch_attention,undefined);
await slowStore.mutate(s=>{s.runs.a=pending;});
await assert.rejects(()=>reconnectLaunch(slowStore,{ticket_id:'a',launch_id:'launch-a',thread_id:'other'},{call:async()=>({title:'Same title'})},{},undefined),/exact launch ID/);
await reconnectLaunch(slowStore,{ticket_id:'a',launch_id:'launch-a',thread_id:'worker'},{call:async()=>({turns:[{prompt:'Task launch-a'}]})},{},undefined);
assert.equal((await slowStore.read()).runs.a.thread_id,'worker');
const projection=panelState({version:1,revision:'1',tickets:[{id:'a',name:'Task'}],runs:{a:{...pending,launch:{prompt:'private prompt'}}},history:{old:'private history'},ticket_records:{old:'private record'},ticket_comments:{a:'private comments'},setup_history:['private setup']},{configured:true},{configured:true},120001);
assert.equal(projection.runs.a.launch_attention,true);
for(const key of ['history','ticket_records','ticket_comments','setup_history'])assert.equal(Object.hasOwn(projection,key),false);
assert.equal(projection.runs.a.launch,undefined);

// Exercise the actual poll function with a deferred transport.
const source=await readFile(new URL('./app.mjs',import.meta.url),'utf8');
const pollSource=source.slice(source.indexOf('async function poll()'),source.indexOf('\nsetInterval(poll'));
let resolveCall,calls=0;
const context=vm.createContext({document:{hidden:false},call:()=>{calls++;return new Promise(r=>resolveCall=r);},unpack:r=>r,accept:()=>{},render:()=>{}});
vm.runInContext("let connected=true,polling=false,pollError='',busy=false,state={snapshot_key:'one'};"+pollSource+';globalThis.poll=poll;',context);
const first=context.poll();await context.poll();assert.equal(calls,1);resolveCall({unchanged:true});await first;
console.log('PASS: dead/live/legacy locks, concurrent writers, backup/reset preservation, rejected/uncertain comment recovery, responsive state during slow writes, model capability validation, stalled/reconnected launches, bounded panel payloads and non-overlapping polls.');
