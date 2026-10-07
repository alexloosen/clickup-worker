import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {OpenAIExtensions} from '@openai/mcp-extensions/app';
import {DEFAULT_FILTER,normalizeFilter} from './filters.mjs';
import {MODELS,DEFAULT_MODEL,DEFAULT_THINKING,thinkingModes} from './models.mjs';
import {safePr} from './pr.mjs';
import {VERSION} from './config.mjs';

// Exercise the panel's actual launch handlers, substituting only the host and rendering.
const source=(await readFile(new URL('./app.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').split('document.addEventListener')[0];
function panel({supported=true,creations=[{ticket_id:'ticket-a',thread_id:'worker-a'}],failure=false,reject=false,setupUrl='http://127.0.0.1:12345/setup/abcdef'}={}){
 const messages=[],calls=[],links=[];
 class HostApp{
  getHostCapabilities(){return supported?{experimental:{'openai/message':{}}}:{};}
  getHostContext(){return {};}
  async sendMessage(args){messages.push(args);if(reject)throw Error('Transport failed');return failure?{isError:true}:{};}
  async openLink(args){links.push(args);return {};}
  async callServerTool(args){calls.push(args);if(reject)throw Error('Transport failed');return failure?{isError:true,content:[{type:'text',text:'Creation unavailable'}]}:{structuredContent:args.name==='open_clickup_settings'?{url:setupUrl}:{creations,state:{tickets:[],runs:{}}}};}
 }
 const context=vm.createContext({App:HostApp,OpenAIExtensions,DEFAULT_FILTER,normalizeFilter,MODELS,DEFAULT_MODEL,DEFAULT_THINKING,thinkingModes,safePr,VERSION,document:{getElementById:()=>null}});
 vm.runInContext(source+'\nperform=async action=>action();accept=()=>{};render=()=>{};boardSettings=()=>{menuId="board";};connected=true;globalThis.testApi={start,connect,error:()=>localError};',context);
 return {...context.testApi,messages,calls,links};
}
const single=panel();await single.start(['ticket-a']);
assert.equal(single.calls.length,1);assert.equal(single.messages.length,0);
assert.equal(single.calls[0].name,'start_bug_implementations');
assert.equal(single.calls[0].arguments.options[0].model,DEFAULT_MODEL);
assert.equal(single.calls[0].arguments.options[0].thinking,DEFAULT_THINKING);
const investigation=panel();await investigation.start(['ticket-a'],'investigation');
assert.equal(investigation.calls.length,1);assert.equal(investigation.messages.length,0);
assert.equal(investigation.calls[0].name,'start_bug_investigations');
assert.equal(investigation.calls[0].arguments.options[0].model,DEFAULT_MODEL);
const failedInvestigation=panel({failure:true});await assert.rejects(()=>failedInvestigation.start(['ticket-a'],'investigation'),/Creation unavailable/);
assert.equal(failedInvestigation.calls.length,1);assert.equal(failedInvestigation.messages.length,0);
const batch=panel({creations:[{thread_id:'worker-a'},{client_thread_id:'client-new-thread:worker-b'}]});await batch.start(['ticket-a','ticket-b']);
assert.equal(batch.messages.length,0);assert.equal(batch.calls[0].name,'start_bug_implementations');
assert.equal(batch.calls[0].arguments.options.length,2);
const duplicate=panel({creations:[]});await duplicate.start(['ticket-a']);assert.equal(duplicate.messages.length,0);
const unsupported=panel({supported:false});await unsupported.start(['ticket-a']);assert.equal(unsupported.calls.length,1);assert.equal(unsupported.messages.length,0);
const failed=panel({failure:true});await assert.rejects(()=>failed.start(['ticket-a']),/Creation unavailable/);
assert.equal(failed.messages.length,0);
const transport=panel({reject:true});await assert.rejects(()=>transport.start(['ticket-a']),/Transport failed/);
assert.equal(transport.messages.length,0);assert.equal(transport.calls.length,1);
const partial=panel({creations:[{thread_id:'worker-a'},{ticket_id:'ticket-b',error:'Worktree creation failed'}]});await assert.rejects(()=>partial.start(['ticket-a','ticket-b']),/ticket-b: Worktree creation failed/);assert.equal(partial.messages.length,0);
const setup=panel();await setup.connect();assert.equal(setup.calls.length,1);assert.equal(setup.calls[0].name,'open_clickup_settings');assert.equal(Object.keys(setup.calls[0].arguments).length,0);assert.equal(setup.links[0].url,'http://127.0.0.1:12345/setup/abcdef');assert.equal(setup.error(),'');
const badSetup=panel({setupUrl:'https://example.com/setup/abcdef'});await badSetup.connect();assert.equal(badSetup.links.length,0);assert.equal(badSetup.error(),'Invalid setup URL.');
const failedSetup=panel({failure:true});await failedSetup.connect();assert.equal(failedSetup.links.length,0);assert.equal(failedSetup.error(),'Creation unavailable');
console.log('PASS: single/batch buttons invoke direct implementation tool, never send a dispatcher message; settings preserved; failures/partial failures never fall back or retry; native chat navigation.');

// Exercise real menu/detail rendering and action handlers with a small DOM stand-in.
// Dynamic IDs only exist if the renderer put them in the HTML.
const elements=new Map(),uiCalls=[];
function element(id){
 let html='';const node={id,style:{},classList:{add(){},remove(){},contains(){return false;}},contains(){return false;},focus(){},getBoundingClientRect:()=>({left:0,bottom:0}),offsetWidth:290,offsetHeight:400};
 Object.defineProperty(node,'innerHTML',{get:()=>html,set:value=>{html=value;for(const match of value.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){const child=elements.get(match[1])||element(match[1]);child.disabled=/\sdisabled(?:\s|>)/.test(match[0]);}}});
 elements.set(id,node);return node;
}
for(const id of ['utility','detail'])element(id);
class MenuHost{async callServerTool(args){uiCalls.push(args);return {structuredContent:{tickets:[],runs:{},creations:[{thread_id:'worker'}]}};}}
const menuContext=vm.createContext({App:MenuHost,OpenAIExtensions,DEFAULT_FILTER,normalizeFilter,MODELS,DEFAULT_MODEL,DEFAULT_THINKING,thinkingModes,safePr,VERSION,innerWidth:1200,innerHeight:900,window:{innerWidth:1200,innerHeight:900},document:{getElementById:id=>elements.get(id)||null}});
vm.runInContext(source+`\nperform=async action=>action();accept=()=>{};render=()=>{};connected=true;
 state={tickets:[{id:'ticket-a',name:'Example',status:'to do',finished:false,assignees:[]}],runs:{},ticket_comments:{'ticket-a':{comments:[],fetched_at:'2026-01-01'}}};selected='ticket-a';
 globalThis.ui={openMenu,renderDetail,setRun:r=>{state.runs['ticket-a']=r;},finish:()=>{state.tickets[0].finished=true;}};`,menuContext);
menuContext.ui.renderDetail();assert.match(elements.get('detail').innerHTML,/id="investigate"/);await elements.get('investigate').onclick();assert.equal(uiCalls.at(-1).name,'start_bug_investigations');
menuContext.ui.openMenu('ticket-a',{left:0,bottom:0});assert.equal(elements.get('cancelTicket').disabled,false);
await elements.get('cancelTicket').onclick();assert.equal(uiCalls.at(-1).name,'cancel_bug_ticket');assert.equal(uiCalls.at(-1).arguments.expected_status,'to do');
menuContext.ui.setRun({status:'in_progress',work_kind:'investigation',thread_id:'worker'});
menuContext.ui.openMenu('ticket-a',{left:0,bottom:0});assert.equal(elements.get('cancelTicket').disabled,true);
menuContext.ui.renderDetail();assert.doesNotMatch(elements.get('detail').innerHTML,/id="investigate"|id="fix"|id="finish"/);
menuContext.ui.setRun({status:'investigated',work_kind:'investigation',thread_id:'worker'});
menuContext.ui.renderDetail();assert.match(elements.get('detail').innerHTML,/id="fix"/);assert.match(elements.get('detail').innerHTML,/Investigation chat/);
menuContext.ui.openMenu('ticket-a',{left:0,bottom:0});assert.equal(elements.get('cancelTicket').disabled,false);
menuContext.ui.finish();menuContext.ui.openMenu('ticket-a',{left:0,bottom:0});assert.doesNotMatch(elements.get('utility').innerHTML,/id="cancelTicket"/);
console.log('PASS: investigation button routing, cancellation menu rendering/action, active-assignment guards and implementation after investigation.');

menuContext.ui.setRun({status:"in_progress",work_kind:"implementation",thread_id:"worker"});
menuContext.ui.renderDetail();await elements.get("chat").onclick();assert.equal(uiCalls.at(-1).name,"open_bug_chat");assert.equal(uiCalls.at(-1).arguments.ticket_id,"ticket-a");
assert.doesNotMatch(source,/sendMessage|extensions\.message/);
