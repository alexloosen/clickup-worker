import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {OpenAIExtensions} from '@openai/mcp-extensions/app';
import {DEFAULT_FILTER,normalizeFilter} from './filters.mjs';
import {MODELS,DEFAULT_MODEL,DEFAULT_THINKING,thinkingModes} from './models.mjs';
import {safePr} from './pr.mjs';

// Exercise the panel's actual launch handlers, substituting only the host and rendering.
const source=(await readFile(new URL('./app.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').split('document.addEventListener')[0];
function panel({supported=true,creations=[{ticket_id:'ticket-a',thread_id:'worker-a'}],failure=false,reject=false}={}){
 const messages=[],calls=[];
 class HostApp{
  getHostCapabilities(){return supported?{experimental:{'openai/message':{}}}:{};}
  getHostContext(){return {};}
  async sendMessage(args){messages.push(args);if(reject)throw Error('Transport failed');return failure?{isError:true}:{};}
  async callServerTool(args){calls.push(args);if(reject)throw Error('Transport failed');return failure?{isError:true,content:[{type:'text',text:'Creation unavailable'}]}:{structuredContent:{creations,state:{tickets:[],runs:{}}}};}
 }
 const context=vm.createContext({App:HostApp,OpenAIExtensions,DEFAULT_FILTER,normalizeFilter,MODELS,DEFAULT_MODEL,DEFAULT_THINKING,thinkingModes,safePr});
 vm.runInContext(source+'\nperform=async action=>action();accept=()=>{};globalThis.testApi={start,send};',context);
 return {...context.testApi,messages,calls};
}
const single=panel();await single.start(['ticket-a']);
assert.equal(single.calls.length,1);assert.equal(single.messages.length,0);
assert.equal(single.calls[0].name,'start_bug_implementations');
assert.equal(single.calls[0].arguments.options[0].model,DEFAULT_MODEL);
assert.equal(single.calls[0].arguments.options[0].thinking,DEFAULT_THINKING);
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
const existing=panel();await existing.send('Open the existing coding chat');assert.equal(existing.messages[0]._meta['openai/message'].target,'active');
const fallback=panel({supported:false});await fallback.send('Open the existing coding chat');assert.equal(fallback.messages[0]._meta['openai/message'].target,'active');
console.log('PASS: single/batch buttons invoke direct implementation tool, never send a dispatcher message; settings preserved; failures/partial failures never fall back or retry; existing-chat navigation unchanged.');
