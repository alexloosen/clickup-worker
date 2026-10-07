import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {DEFAULT_MODEL,DEFAULT_THINKING} from './models.mjs';
const MAX_FRAME_BYTES=8*1024*1024;
export function callerContext(extra={}){
 const meta=extra._meta||{};
 let turn=meta['x-codex-turn-metadata'];
 if(typeof turn==='string'){try{turn=JSON.parse(turn);}catch{turn=null;}}
 const first=keys=>keys.map(k=>meta[k]).find(v=>typeof v==='string'&&v.trim());
 const threadId=first(['openai/threadId','openai/thread_id','codexThreadId','codex_thread_id','threadId','thread_id'])||turn?.thread_id||meta.thread?.id;
 if(typeof threadId!=='string'||!threadId.trim())throw Error('Codex did not provide the calling chat identity. Reopen the panel in a Codex chat; no implementation was started.');
 return {threadId,turnId:first(['openai/turnId','openai/turn_id','codexTurnId','codex_turn_id','turnId','turn_id'])||turn?.turn_id||meta.turn?.id||`mcp-turn-${extra.requestId??randomUUID()}`};
}
export function decodeToolResult(result){
 if(result?.success!==true)throw Error((result?.contentItems||[]).filter(c=>c.type==='inputText').map(c=>c.text).join('\n')||'Codex rejected the request.');
 for(const item of result.contentItems||[]){if(item.type==='inputText'){try{return JSON.parse(item.text);}catch{}}}
 throw Error('Codex returned no structured result. Check existing chats before retrying.');
}
export function hostModels(tool){
 const description=tool?.inputSchema?.properties?.model?.description||'';
 return Object.fromEntries([...description.matchAll(/(gpt-[\w.-]+)\s*\([^)]*?supported reasoning efforts:\s*([^)]*)\)/g)].map(m=>[m[1],m[2].split(',').map(x=>x.trim())]));
}
// Use the same host-provided local bridge as the bundled codex-app-tools MCP.
// No new Codex process, credentials, permission overrides or private socket discovery.
export class HostTools{
 constructor(pipePath=process.env.CODEX_APP_TOOLS_PIPE_PATH){this.pipePath=pipePath;}
 async request(method,params,{timeout=60000,signal}={}){
  if(!this.pipePath)throw Error('Direct session connection is unavailable. Run the installer for your operating system from the plugin package, then restart Codex. No implementation was started.');
  signal?.throwIfAborted();
  const payload=Buffer.from(JSON.stringify({jsonrpc:'2.0',id:1,method,params}));
  if(payload.length>MAX_FRAME_BYTES)throw Error('The complete task prompt exceeds the Codex tool bridge limit.');
  const frame=Buffer.alloc(4+payload.length);frame.writeUInt32LE(payload.length,0);payload.copy(frame,4);
  return new Promise((resolve,reject)=>{
   const socket=net.createConnection(this.pipePath);let buffer=Buffer.alloc(0),settled=false;
   const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);socket.destroy();if(error){reject(error);}else{resolve(result);}};
   const abort=()=>finish(Error('Codex request interrupted. Check existing chats before retrying.'));
   const timer=setTimeout(()=>finish(Error('Codex request timed out. Check existing chats before retrying.')),timeout);
   signal?.addEventListener('abort',abort,{once:true});
   socket.on('error',e=>finish(Error(`Codex app tool bridge failed (${e.code||'connection error'}). Check existing chats before retrying.`)));
   socket.on('close',()=>finish(Error('Codex app tool bridge closed. Check existing chats before retrying.')));
   socket.on('connect',()=>socket.write(frame));
   socket.on('data',chunk=>{
    buffer=Buffer.concat([buffer,chunk]);
    if(buffer.length<4)return;
    const length=buffer.readUInt32LE(0);
    if(length>MAX_FRAME_BYTES){finish(Error('Codex response exceeds the tool bridge limit.'));return;}
    if(buffer.length<length+4)return;
    try{const response=JSON.parse(buffer.subarray(4,length+4).toString('utf8'));if(response.id!==1||response.jsonrpc!=='2.0')throw Error('Unexpected Codex response.');if(response.error){finish(Error(response.error.message||'Codex rejected the request.'));}else{finish(null,response.result);}}catch(e){finish(e);}
   });
  });
 }
 async discover(signal){
  const result=await this.request('tools/list',{threadStartKind:'all'},{signal});
  for(const name of ['list_projects','create_thread']){
   if(!result?.tools?.some(t=>t.name===name&&t.namespace==='codex_app'))throw Error(`Codex does not expose ${name}; no implementation was started.`);
  }
  this.tools=result.tools;this.models=hostModels(result.tools.find(t=>t.name==='create_thread'&&t.namespace==='codex_app'));
  return {models:this.models,navigation:result.tools.some(t=>t.name==='navigate_to_codex_page'&&t.namespace==='codex_app')};
 }
 validateOptions(options=[]){if(!Object.keys(this.models||{}).length)return;for(const option of options){const model=option.model||DEFAULT_MODEL,thinking=option.thinking||DEFAULT_THINKING;if(!this.models[model]?.includes(thinking))throw Error(`This Codex host does not support ${model} with ${thinking} thinking. Change Ticket options before starting. No task was reserved.`);}}
 async call(name,args,caller,signal){
  return decodeToolResult(await this.request('tools/call',{arguments:args,callerSource:'codex',namespace:'codex_app',tool:name,...caller,callId:`mcp-call-${randomUUID()}`},{signal,timeout:120000}));
 }
}
