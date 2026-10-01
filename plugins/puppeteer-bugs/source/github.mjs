import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {normalizePath} from './platform.mjs';
import {SCOPE} from './config.mjs';
import {safePr,repositorySlug} from './pr.mjs';
const shaPattern=/^[a-f0-9]{40}$/;
const allowedRemote=u=>{try{return repositorySlug(u).toLowerCase()===SCOPE.repositorySlug.toLowerCase();}catch{return false;}};
// Never expose stderr or credential-helper output. All arguments bypass the shell.
export function command(exe,args,{cwd=SCOPE.repositoryPath,input='',timeout=30000}={}){
 return new Promise((resolve,reject)=>{const child=spawn(exe,args,{cwd,windowsHide:true,shell:false,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'},stdio:['pipe','pipe','pipe']});let out='',size=0;const timer=setTimeout(()=>child.kill(),timeout);child.stdout.on('data',d=>{size+=d.length;if(size>4000000)child.kill();else out+=d;});child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(Error('Repository command could not be started.'));});child.on('close',code=>{clearTimeout(timer);if(code===0&&size<=4000000)resolve(out.trim());else reject(Error('Repository command failed. Check repository access and retry.'));});child.stdin.on('error',()=>{});child.stdin.end(input);});
}
export class Repository {
 constructor({run=command,fetcher=fetch,path=SCOPE.repositoryPath}={}){this.run=run;this.fetcher=fetcher;this.path=path;}
 git(args,options={}){return this.run('git',args,{cwd:this.path,...options});}
 async verify(){const u=await this.git(['remote','get-url','origin']);if(!allowedRemote(u))throw Error('Repository origin does not match the configured repository.');return u;}
 async pullRequest(url){
  if(!safePr(url))throw Error('This ticket needs a verified PR for the configured repository before finishing.');
  const origin=await this.verify();let token='';
  try{const credential=await this.git(['credential','fill'],{input:`protocol=https\nhost=github.com\npath=${SCOPE.repositorySlug}.git\n\n`});token=credential.split(/\r?\n/).find(l=>l.startsWith('password='))?.slice(9)||'';}catch{}
  if(!token)try{token=await this.run('gh',['auth','token','--hostname','github.com'],{cwd:this.path});}catch{}
  if(!token)throw Error('Cannot verify PR merge: repository GitHub credentials are unavailable.');
  let response;try{response=await this.fetcher(`https://api.github.com/repos/${SCOPE.repositorySlug}/pulls/${url.split('/').pop()}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error('Cannot reach GitHub to verify the PR merge.');}finally{token='';}
  if(!response.ok)throw Error(`GitHub merge verification failed (HTTP ${response.status}).`);
  const pr=await response.json();
  if(!safePr(pr.html_url)||pr.number!==Number(url.split('/').pop())||pr.base?.repo?.full_name?.toLowerCase()!==SCOPE.repositorySlug.toLowerCase()||pr.base?.ref!==SCOPE.baseBranch)throw Error('PR repository or target branch does not match this project.');
  if(pr.merged!==true||!pr.merged_at)throw Error(pr.state==='closed'?'This PR was closed without being merged. Merge the fix before marking it finished.':'This PR is still open and has not been merged. Merge it on GitHub before marking it finished.');
  if(pr.head?.repo?.full_name?.toLowerCase()!==SCOPE.repositorySlug.toLowerCase()||!shaPattern.test(pr.head?.sha||''))throw Error('Merged PR source cannot be safely verified for cleanup.');
  return {url:pr.html_url,branch:pr.head.ref,sha:pr.head.sha,merged_at:pr.merged_at};
 }
 async directDelivery(commit,branch){
  if(!shaPattern.test(commit||''))throw Error('A verified published commit is required before finishing direct delivery.');
  const origin=await this.verify();await this.git(['fetch','--no-tags',origin,SCOPE.baseBranch]);
  try{await this.git(['merge-base','--is-ancestor',commit,'FETCH_HEAD']);}catch{throw Error('The delivered commit is not contained in the configured remote target branch.');}
  return {url:'https://github.com/'+SCOPE.repositorySlug+'/commit/'+commit,branch,sha:commit,direct:true};
 }
 async localDelivery(commit,branch){
  if(!shaPattern.test(commit||''))throw Error('A verified local commit is required.');
  await this.verify();
  try{await this.git(['merge-base','--is-ancestor',commit,'HEAD']);}catch{throw Error('The local commit is no longer contained in this checkout.');}
  return {url:`local commit ${commit}`,branch,sha:commit,local:true};
 }
 async cleanupWorktrees(ticketId,pr,recordedBranch){
  if(pr.branch!==recordedBranch||!pr.branch?.startsWith(`fix/cu-${ticketId}-`)||!shaPattern.test(pr.sha))throw Error('Worktree identity does not match this ticket.');
  await this.verify();
  const trees=(await this.git(['worktree','list','--porcelain'])).split(/\r?\n\r?\n/);
  let removed=0;
  for(const [index,block] of trees.entries()){
   const lines=block.split(/\r?\n/),path=lines.find(l=>l.startsWith('worktree '))?.slice(9);
   // Git lists the primary checkout first. Also protect the configured checkout.
   if(!index||!path||normalizePath(resolve(path))===normalizePath(resolve(this.path)))continue;
   if(!lines.includes(`HEAD ${pr.sha}`)||!(lines.includes(`branch refs/heads/${pr.branch}`)||lines.includes('detached')))continue;
   if(lines.includes('detached')){
    // A matching commit alone could belong to an unrelated, newly created chat.
    const lastMove=await this.git(['reflog','show','-1','--format=%gs','HEAD'],{cwd:path});
    if(lastMove!==`checkout: moving from ${pr.branch} to ${pr.sha}`)continue;
   }
   if(lines.some(l=>l.startsWith('locked')||l.startsWith('prunable')))throw Error('Matching worktree is locked/unavailable; preserved.');
   if(await this.git(['status','--porcelain','--untracked-files=all'],{cwd:path}))throw Error('Worktree has uncommitted files; preserved.');
   if(await this.git(['rev-parse','HEAD'],{cwd:path})!==pr.sha)throw Error('Worktree changed during cleanup; preserved.');
   // Never force removal: Git rechecks dirtiness, locks and submodules.
   await this.git(['worktree','remove','--',resolve(path)]);
   removed++;
  }
  return `${removed} clean worktree(s) removed.`;
 }
 async cleanup(ticketId,pr,recordedBranch){
  if(pr.branch===SCOPE.baseBranch)throw Error('The configured target branch is protected from cleanup.');
  if(!pr.branch.startsWith(`fix/cu-${ticketId}-`)||pr.branch!==recordedBranch||!shaPattern.test(pr.sha))throw Error('Branch identity does not match this ticket. Branches were preserved.');
  await this.verify();await this.git(['check-ref-format',`refs/heads/${pr.branch}`]);
  const pushUrl=await this.git(['remote','get-url','--push','origin']);if(!allowedRemote(pushUrl))throw Error('Unexpected push remote. Branches were preserved.');
  const ref=`refs/heads/${pr.branch}`,notes=[];
  notes.push(await this.cleanupWorktrees(ticketId,pr,recordedBranch));
  // Compare-and-delete prevents deleting a branch updated after merge verification.
  const remote=await this.git(['ls-remote','--heads',pushUrl,ref]);
  if(remote){if(remote.split(/\s+/)[0]!==pr.sha)throw Error('Remote branch has changes beyond the merged PR. Branches were preserved.');await this.git(['push',`--force-with-lease=${ref}:${pr.sha}`,pushUrl,`:${ref}`]);}
  notes.push('Remote branch deleted or already absent.');
  const local=await this.git(['for-each-ref','--format=%(objectname)',ref]);
  if(local){
   if(local!==pr.sha)throw Error('Remote cleanup finished. Local branch contains other commits and was preserved.');
   const trees=(await this.git(['worktree','list','--porcelain'])).split(/\r?\n\r?\n/);
   for(const block of trees){const lines=block.split(/\r?\n/);if(!lines.includes(`branch ${ref}`))continue;const path=lines.find(l=>l.startsWith('worktree '))?.slice(9);if(!path||lines.some(l=>l.startsWith('locked')||l.startsWith('prunable')))throw Error('Local branch is in a locked/unavailable worktree. Cleanup can be retried.');
    if(await this.git(['status','--porcelain','--untracked-files=all'],{cwd:path}))throw Error('Local branch has uncommitted files. Worktree and branch were preserved.');
    if(await this.git(['rev-parse','HEAD'],{cwd:path})!==pr.sha)throw Error('Worktree changed during cleanup. Local branch was preserved.');
    await this.git(['switch','--detach',pr.sha],{cwd:path});
   }
   if((await this.git(['worktree','list','--porcelain'])).split(/\r?\n/).includes(`branch ${ref}`))throw Error('Local branch is still checked out. Cleanup can be retried.');
   await this.git(['update-ref','-d',ref,pr.sha]);
  }
  const tracking='refs/remotes/origin/'+pr.branch;const tracked=await this.git(['for-each-ref','--format=%(objectname)',tracking]);if(tracked===pr.sha)await this.git(['update-ref','-d',tracking,pr.sha]);
  notes.push('Local branch deleted or already absent; primary checkout retained.');return notes.join(' ');
 }
}
