// Development-only UI preview. Every host/API interaction is synthetic.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

const fixture={revision:'preview',scope:{configured:true,setupId:'preview',repositorySlug:'studio/atlas',baseBranch:'main'},connection:{configured:true,verified:true},fetched_at:new Date().toISOString(),filter:{},catalog:{spaces:[{id:'1',name:'Atlas'}],lists:[{id:'2',name:'Product',space_id:'1',space_name:'Atlas',statuses:[{status:'To do',type:'open'},{status:'In progress',type:'custom'},{status:'Review requested',type:'custom'},{status:'Complete',type:'done'}]}]},tickets:[
 {id:'task-search',name:'Keep search filters when returning to the board',description:'People lose their place when they return from a task. Remember the selected list and filters so they can pick up where they left off.\n\nAcceptance criteria\n• Restore the last selected list.\n• Keep the search query until it is cleared.\n• Make the active filters easy to see.',status:'To do',priority:'high',assignees:['Alex'],finished:false,scope:{spaceName:'Atlas',listName:'Product'}},
 {id:'task-keyboard',name:'Improve keyboard navigation in the task menu',description:'Make every task action reachable by keyboard and return focus after closing the menu.',status:'In progress',priority:'normal',assignees:['Sam'],finished:false,scope:{spaceName:'Atlas',listName:'Product'}},
 {id:'task-empty',name:'Give the empty board a useful starting point',description:'Explain how to connect a project and load the first tasks.',status:'Review requested',priority:'low',assignees:[],finished:false,scope:{spaceName:'Atlas',listName:'Product'}}
],runs:{'task-keyboard':{launch_id:'00000000-0000-4000-8000-000000000001',status:'completed',delivery_mode:'local_commit',thread_id:'preview-chat',branch:'feature/keyboard',commit_sha:'a'.repeat(40),summary:'Keyboard navigation updated and checked. Changes are committed locally; nothing was pushed.'},'task-empty':{status:'review_requested',delivery_mode:'pull_request',pr_url:'https://github.com/studio/atlas/pull/12',thread_id:'preview-review',summary:'Ready to review and merge.'}}};
const mock=`const fixture=${JSON.stringify(fixture)};let revision=0;
const scenario=new URLSearchParams(location.search).get('scenario');
if(scenario==='empty'){fixture.tickets=[];fixture.runs={};fixture.scope={configured:false};fixture.connection={configured:false};fixture.fetched_at=null;}
if(scenario==='pending'){fixture.runs['task-search']={status:'queued',launch_id:'00000000-0000-4000-8000-000000000001',launch_attention:true,client_thread_id:'client-new-thread:preview',summary:'Chat creation has not been confirmed. Check Codex for the pending chat before releasing this assignment.'};}
if(scenario==='recovery')fixture.recovery={kind:'backup',message:'Local data needs repair. A backup is available. Open Board tools → Recover local data.'};
export class App {
 async connect(){queueMicrotask(()=>this.ontoolresult?.({structuredContent:structuredClone(fixture)}));}
 getHostContext(){return {theme:new URLSearchParams(location.search).get('theme')||'light'};}
 async openLink(){return {};}
 async callServerTool({name,arguments:args}){
  if(name==='get_bug_comments')return {structuredContent:{ticket_id:args.ticket_id,entry:{fetched_at:new Date().toISOString(),comments:[{id:'1',date:String(Date.now()-3600000),author:'Sam',text:'This happens after opening a task in another tab. Please also check keyboard navigation.'}]}}};
  if(name==='get_bug_board_state')return {structuredContent:{unchanged:true}};
  if(name==='get_direct_launch_status')return {structuredContent:{available:true}};
  if(name==='open_bug_chat')return {structuredContent:{opened:true}};
  if(name==='cleanup_finished_worktrees')return {structuredContent:{messages:['Preview only. No worktrees were removed.']}};
  if(name==='mark_bug_finished'){const t=fixture.tickets.find(t=>t.id===args.ticket_id);t.finished=true;t.status='Complete';fixture.runs[t.id].finish={completed_at:new Date().toISOString(),cleanup_done:true,cleanup:'Existing checkout and local commit retained.'};}
  if(name==='start_bug_implementations'||name==='start_bug_investigations')return {structuredContent:{state:structuredClone(fixture),creations:[{thread_id:'preview-created'}]}};
  if(name==='recover_local_data')delete fixture.recovery;
  fixture.revision=String(++revision);fixture.fetched_at=new Date().toISOString();return {structuredContent:structuredClone(fixture)};
 }
}
export function applyDocumentTheme(){} export function applyHostStyleVariables(){}`;
const built=await build({entryPoints:['app.mjs'],bundle:true,write:false,platform:'browser',format:'esm',plugins:[{name:'preview-host',setup(build){build.onResolve({filter:/^@modelcontextprotocol\/ext-apps$/},()=>({path:'host',namespace:'preview'}));build.onLoad({filter:/.*/,namespace:'preview'},()=>({contents:mock,loader:'js'}));}}]});
const html=(await readFile('board.html','utf8')).replace('<script>/* APP_SCRIPT */</script>',()=>`<script type="module">${built.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(html);});
server.listen(0,'127.0.0.1',()=>console.log(`Synthetic UI preview: http://127.0.0.1:${server.address().port}`));
