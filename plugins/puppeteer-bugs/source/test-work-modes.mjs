import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from './store.mjs';
import {reserveLaunches,recordWork} from './dispatch.mjs';
import {creationArguments,launchDirect} from './direct-launch.mjs';
import {Repository,command} from './github.mjs';
import {finishBug} from './finish.mjs';
import {cleanupFinishedWorktrees} from './cleanup.mjs';
import {SCOPE} from './config.mjs';

const root=await mkdtemp(join(tmpdir(),'clickup-work-modes-'));
try{
 const store=new Store(join(root,'state')),tickets=['a','b'].map(id=>({id,name:id}));
 const opts=tickets.map(t=>({ticket_id:t.id,delivery_mode:'local_commit'}));
 await assert.rejects(()=>reserveLaunches(store,tickets,['a','b'],opts),/one existing-checkout/);
 assert.deepEqual((await store.read()).runs,{});
 const attempts=await Promise.allSettled(tickets.map(t=>reserveLaunches(store,tickets,[t.id],[opts.find(o=>o.ticket_id===t.id)])));
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
 const packet=attempts.find(r=>r.status==='fulfilled').value.value.launches[0];
 assert.deepEqual(creationArguments(packet).target.environment,{type:'local'});
 assert.match(packet.prompt,/Do not create a worktree/);assert.match(packet.prompt,/Do not push or create a PR/);
 assert.throws(()=>creationArguments({...packet,target:{...packet.target,environment:{type:'worktree'}}}),/Invalid/);
 let calls=0;
 await launchDirect(store,[packet],{call:async(name,args)=>{calls++;assert.deepEqual(args.target.environment,{type:'local'});return {threadId:'local-worker'};}},{});
 assert.equal(calls,1);
 const other=tickets.find(t=>t.id!==packet.ticket_id);
 await assert.rejects(()=>reserveLaunches(store,tickets,[other.id],[{ticket_id:other.id,delivery_mode:'local_commit'}]),/active task/);
 await recordWork(store,{ticket_id:packet.ticket_id,launch_id:packet.launch_id,status:'completed',commit_sha:'a'.repeat(40)});
 assert.equal((await reserveLaunches(store,tickets,[other.id],[{ticket_id:other.id,delivery_mode:'local_commit'}])).value.launches.length,1);

 const local=join(root,'repo');await mkdir(local);
 const git=(args,cwd=local)=>command('git',args,{cwd});
 await git(['init']);await git(['config','user.name','Fixture']);await git(['config','user.email','fixture@example.invalid']);
 await git(['remote','add','origin',SCOPE.repositoryUrl]);await writeFile(join(local,'file'),'base');await git(['add','.']);await git(['commit','-m','base']);
 const sha=await git(['rev-parse','HEAD']),branch='fix/cu-fixture-clean';
 const repo=new Repository({path:local});
 assert.equal((await repo.localDelivery(sha,'main')).local,true);
 await assert.rejects(()=>repo.localDelivery('0'.repeat(40),'main'),/no longer contained/);
  const clean=join(root,'clean'),dirty=join(root,'dirty'),locked=join(root,'locked'),changed=join(root,'changed');
  await git(['worktree','add','-b',branch,clean]);await git(['worktree','add','--detach',dirty,sha]);await git(['worktree','add','--detach',locked,sha]);await git(['worktree','add','--detach',changed,sha]);
  assert.match(await repo.cleanupWorktrees('fixture',{branch,sha},branch),/1 clean/);
  await access(dirty);await access(locked);await access(changed); // Unrelated detached copies are retained.
  await git(['switch',branch],dirty);
 await writeFile(join(dirty,'untracked'),'keep');await git(['worktree','lock',locked]);await writeFile(join(changed,'file'),'changed');await git(['commit','-am','changed'],changed);
 await assert.rejects(()=>repo.cleanupWorktrees('fixture',{branch,sha},branch),/uncommitted/);
 await assert.rejects(()=>access(clean));await access(local);await access(dirty);await access(locked);await access(changed);
  await rm(join(dirty,'untracked'));
  assert.match(await repo.cleanupWorktrees('fixture',{branch,sha},branch),/1 clean/);
  await git(['worktree','unlock',locked]);await git(['switch',branch],locked);await git(['worktree','lock',locked]);
 await assert.rejects(()=>repo.cleanupWorktrees('fixture',{branch,sha},branch),/locked/);
 await assert.rejects(()=>access(dirty));await git(['worktree','unlock',locked]);
 assert.match(await repo.cleanupWorktrees('fixture',{branch,sha},branch),/1 clean/);
 await access(local);await access(changed);
 // Old cleanup deleted the branch but left detached worktrees. Reclaim those too.
  const old=join(root,'old');await git(['worktree','add',old,branch]);await git(['switch','--detach',sha],old);await git(['branch','-D',branch]);
 await store.mutate(s=>{s.runs={fixture:{launch_id:'accepted',branch,pr_url:'https://github.com/example-owner/ExampleProject/pull/1',finish:{completed_at:'2026-10-01'}}};});
 const messages=await cleanupFinishedWorktrees(store,{pullRequest:async()=>({branch,sha}),cleanupWorktrees:repo.cleanupWorktrees.bind(repo)});
 assert.match(messages.join(' '),/1 clean/);await assert.rejects(()=>access(old));await access(local);
 // Acceptance of a local commit neither pushes nor cleans the existing checkout.
 await store.mutate(s=>{s.runs={fixture:{launch_id:'local',delivery_mode:'local_commit',status:'completed',commit_sha:sha,branch:'main'}};s.tickets=[{id:'fixture',status:'in progress'}];});
 let acceptance='';
 const client={verifyTicket:async()=>({status:{status:'in progress'}}),comments:async()=>[],postAcceptance:async(id,text)=>{acceptance=text;return 'one';},finishBug:async()=>({status:'complete',finished:true})};
 const done=await finishBug(store,{ticket_id:'fixture',expected_status:'in progress',confirmed_tested:true},client,{localDelivery:repo.localDelivery.bind(repo),cleanup:()=>assert.fail('Local checkout must not be cleaned')});
 assert.equal(done.runs.fixture.finish.cleanup_done,true);assert.match(acceptance,/not published/);await access(local);
 console.log('PASS: local chat routing, atomic checkout lock, local commit acceptance, linked and legacy detached worktree removal, primary/dirty/locked/changed preservation.');
}finally{await rm(root,{recursive:true,force:true});}
