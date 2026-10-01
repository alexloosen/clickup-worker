import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {parseClickUpLink,validateSetup,saveSetup} from './setup.mjs';
import {configureScope,SCOPE,VERSION} from './config.mjs';
import {Store} from './store.mjs';
import {Credentials} from './credentials.mjs';
import {Repository} from './github.mjs';
import {repositorySlug,safePr} from './pr.mjs';
import {reserveLaunches,recordWork} from './dispatch.mjs';
import {verifyProject,launchDirect} from './direct-launch.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

for(const [path,kind,id] of [['/11001','workspace','11001'],['/11001/v/o/s/22001','space','22001'],['/11001/v/o/f/44001','folder','44001'],['/11001/v/li/33001','list','33001'],['/11001/v/l/6-33001-1','list','33001']])assert.deepEqual({...parseClickUpLink('https://app.clickup.com'+path),clickupUrl:undefined},{workspaceId:'11001',kind,id,clickupUrl:undefined});
for(const value of ['http://app.clickup.com/11001','https://app.clickup.com.evil.test/11001','https://user:pass@app.clickup.com/11001','https://app.clickup.com/t/task-a','https://app.clickup.com/11001/v/b/custom'])assert.throws(()=>parseClickUpLink(value));
assert.equal(repositorySlug('git@github.com:sample-team/widget.git'),'sample-team/widget');
for(const value of ['https://github.com/owner/repo/issues','https://secret@github.com/owner/repo','https://github.com/owner/repo?token=bad'])assert.throws(()=>repositorySlug(value));
const path=resolve('C:/Fixtures/widget'),input={clickupUrl:'https://app.clickup.com/11001/v/li/33001',repositoryUrl:'https://github.com/sample-team/widget',repositoryPath:path,baseBranch:'release',token:'pk_synthetic_fixture_only',expectedSetupId:''},gitCalls=[];
const run=async(exe,args)=>{gitCalls.push({exe,args});if(args[0]==='remote')return 'git@github.com:sample-team/widget.git';if(args[0]==='rev-parse'&&args[1]==='--show-toplevel')return path;return 'a'.repeat(40);};
const api=async(url,options)=>{assert.equal(url.origin,'https://api.clickup.com');assert.equal(options.headers.Authorization,input.token);const p=url.pathname.replace('/api/v2/','');let body;if(p==='team/11001/space')body={spaces:[{id:'22001',name:'Engineering'}]};else if(p==='space/22001/list')body={lists:[{id:'33001',name:'Work',space:{id:'22001'}}]};else if(p==='space/22001/folder')body={folders:[{id:'44001',name:'Roadmap'}]};else if(p==='folder/44001/list')body={lists:[{id:'33002',name:'Backlog',space:{id:'22001'}}]};else if(p==='user')body={user:{id:99,username:'Fixture'}};else if(p==='team')body={teams:[{id:'11001'}]};else throw Error('Unexpected API: '+p);return new Response(JSON.stringify(body));};
const checked=await validateSetup(input,input.token,{fetcher:api,run});assert.equal(checked.setup.repositorySlug,'sample-team/widget');assert.equal(checked.setup.baseBranch,'release');assert.deepEqual(checked.filter.list_ids,['33001']);assert.ok(gitCalls.some(c=>c.args.includes('refs/heads/release^{commit}')));
await assert.rejects(()=>validateSetup({...input,repositoryUrl:'https://github.com/other/widget'},input.token,{fetcher:api,run}),/does not match/);
await assert.rejects(()=>validateSetup({...input,clickupUrl:'https://app.clickup.com/11001/v/li/999'},input.token,{fetcher:api,run}),/no accessible/);
const directory=await mkdtemp(join(tmpdir(),'clickup-portable-')),store=new Store(directory);let savedToken='';const credentials={get:async()=>savedToken,save:async t=>{savedToken=t;}};
await saveSetup(store,credentials,input,{fetcher:api,run});let state=await store.read();assert.equal(savedToken,input.token);assert.ok(!JSON.stringify(state).includes(input.token));assert.equal(state.setup.configured,true);configureScope(state.setup);
const project=verifyProject({projects:[{projectId:'friends-project-42',label:'Widget',hostId:'local',path,isGitRepository:true}]});assert.equal(project.projectId,'friends-project-42');
assert.throws(()=>verifyProject({projects:[project,project]}));assert.equal(safePr('https://github.com/sample-team/widget/pull/12'),true);assert.equal(safePr('https://github.com/other/widget/pull/12'),false);
const ticket={id:'task-a',name:'Fix selection',description:'Full reproduction',status:'open',scope:{workspaceId:'11001',spaceId:'22001',spaceName:'Engineering',listId:'33001',listName:'Work'},comments:[{text:'Comment evidence'}]};
const packet=(await reserveLaunches(store,[ticket],['task-a'],[{ticket_id:'task-a',additional_context:'Extra context'}])).value.launches[0];assert.equal(packet.target.projectId,'friends-project-42');assert.equal(packet.target.environment.startingState.branchName,'release');assert.ok(packet.prompt.includes('sample-team/widget'));assert.ok(packet.prompt.includes('Comment evidence'));assert.ok(packet.prompt.includes('Extra context'));assert.ok(packet.prompt.includes('pull request into release'));
let creations=0;await Promise.all([launchDirect(store,[packet],{call:async()=>{creations++;return {threadId:'fixture-worker'};}},{threadId:'caller',turnId:'turn'}),launchDirect(store,[packet],{call:async()=>{creations++;return {threadId:'duplicate'};}},{threadId:'caller',turnId:'turn'})]);assert.equal(creations,1);
await assert.rejects(()=>recordWork(store,{ticket_id:'task-a',launch_id:packet.launch_id,status:'review_requested',pr_url:'https://github.com/other/widget/pull/12'}),/configured repository/);
await assert.rejects(()=>saveSetup(store,credentials,{...input,expectedSetupId:state.setup.setupId,clickupUrl:'https://app.clickup.com/11001'},{fetcher:api,run}),/existing assignments/);
await assert.rejects(()=>saveSetup(store,credentials,input,{fetcher:api,run}),/changed in another/);
const repo=new Repository({path,run:async(exe,args)=>args[0]==='remote'?'https://github.com/other/widget.git':''});await assert.rejects(()=>repo.verify(),/does not match/);
await assert.rejects(()=>repo.cleanup('task-a',{branch:'release',sha:'a'.repeat(40)},'release'),/target branch is protected/);

const credentialDirectory=await mkdtemp(join(tmpdir(),'clickup-token-test-')),realCredentials=new Credentials(credentialDirectory);await realCredentials.save(input.token);assert.equal(await realCredentials.get(),input.token);assert.ok(!(await readFile(join(credentialDirectory,'clickup-token.dpapi'),'utf8')).includes(input.token));
let received;const page=await realCredentials.settings({setup:{...state.setup,repositoryUrl:'https://github.com/example/"<script>alert(1)</script>'},onSave:async args=>{received=args;}}),url=new URL(page.url),html=await(await fetch(url)).text();assert.ok(html.includes(`id="pluginVersion" value="${VERSION}" readonly`));assert.ok(html.includes('id="clickupUrl"'));assert.ok(html.includes('id="repositoryUrl"'));assert.ok(html.includes('type="password"'));assert.ok(!html.includes(input.token));assert.ok(!html.includes('<script>alert(1)</script>'));
const key=url.pathname.split('/').pop();assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:url.origin,'X-Setup-Key':key},body:JSON.stringify({...input,action:'connect'})})).status,200);assert.equal(received.repositoryPath,path);

const client=new Client({name:'portable-test',version:'1'}),empty=await mkdtemp(join(tmpdir(),'clickup-fresh-'));
await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve('../server/index.mjs')],env:{...process.env,CLICKUP_API_TOKEN:'',PUPPETEER_BUGS_DATA_DIR:empty},stderr:'pipe'}));
try{const tools=await client.listTools();const opener=tools.tools.find(t=>t.name==='open_bug_board');assert.ok(opener._meta['openai/ui'].entrypoints.some(e=>e.type==='global'));const board=await client.callTool({name:'open_bug_board',arguments:{}});assert.equal(board.structuredContent.scope.configured,false);assert.equal(board.structuredContent.tickets.length,0);const launch=await client.callTool({name:'start_bug_implementations',arguments:{ticket_ids:['task-a']}});assert.equal(launch.isError,true);const settings=await client.callTool({name:'open_clickup_settings',arguments:{}});assert.ok(settings.structuredContent.url.startsWith('http://127.0.0.1:'));const resource=await client.readResource({uri:'ui://puppeteer-bugs/board.html'});assert.ok(resource.contents[0].text.includes('Setup'));}finally{await client.close();}
console.log('PASS: independent ClickUp/GitHub configuration; link and origin validation; alternate branch and project resolution; complete task prompt; duplicate prevention; wrong-repository PR rejection; stale/active setup guards; encrypted token storage; local setup CSRF and HTML escaping; fresh-install MCP tools and global panel entrypoint.');
