import { SCOPE } from './config.mjs';
import {taskScope} from './scope.mjs';
export class ClickUpError extends Error { constructor(message, kind='upstream', retryAfter=0) { super(message); this.kind=kind; this.retryAfter=retryAfter; } }
export class ClickUpClient {
  constructor(token, fetcher=fetch, scope=SCOPE) { this.token=token; this.fetcher=fetcher;this.scope={...scope};this.dynamic=scope!==SCOPE; }
  async get(path, params={}) { return this.request(path, params); }
  async request(path, params={}, method='GET', body) {
    const url=new URL('https://api.clickup.com/api/v2/'+path);
    for(const [key,value] of Object.entries(params)) { if(Array.isArray(value)) value.forEach(v=>url.searchParams.append(key+'[]',v)); else url.searchParams.set(key,String(value)); }
    let response;
    try { response=await this.fetcher(url,{method,body:body===undefined?undefined:JSON.stringify(body),headers:{Authorization:this.token,Accept:'application/json','Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)}); }
    catch { throw new ClickUpError('Could not reach ClickUp. Your previous ticket list has been kept.'); }
    if(response.status===401||response.status===403) throw new ClickUpError('ClickUp access was denied. Reconnect with a token that can access the selected ClickUp lists.','authentication');
    if(response.status===429) {const reset=Number(response.headers.get('x-ratelimit-reset'));const seconds=Number(response.headers.get('retry-after'));const retry=seconds>0?seconds*1000:reset>0?Math.max(1000,reset*1000-Date.now()):60000;throw new ClickUpError('ClickUp rate limit reached. Please wait before refreshing again.','rate_limit',Math.min(Math.max(retry,1000),3600000));}
    if(!response.ok) throw new ClickUpError(`ClickUp returned HTTP ${response.status}. Your previous ticket list has been kept.`);
    try { const body=await response.text(); if(body.length>10000000) throw new Error(); return JSON.parse(body); } catch { throw new ClickUpError('ClickUp returned an invalid response.'); }
  }
  async verifyScope() {
    const spaces=await this.get(`team/${this.scope.workspaceId}/space`,{archived:false});
    if(!Array.isArray(spaces.spaces)||!spaces.spaces.some(s=>String(s.id)===this.scope.spaceId&&(this.dynamic||s.name===this.scope.spaceName))) throw new ClickUpError('The configured Space was not found in the expected ClickUp workspace.','scope');
    const list=await this.get(`list/${this.scope.listId}`);
    if(String(list.id)!==this.scope.listId||(!this.dynamic&&list.name!==this.scope.listName)||String(list.space?.id)!==this.scope.spaceId||list.archived===true||!Array.isArray(list.statuses)) throw new ClickUpError('ClickUp list identity does not match configured project. No other board will be used.','scope');
    return list;
  }
  async verifyTicket(id) {
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id))throw new ClickUpError('Invalid ticket ID.');
    await this.verifyScope();const t=await this.get('task/'+id);
    if(String(t.id)!==id||String(t.list?.id)!==this.scope.listId||String(t.space?.id)!==this.scope.spaceId||String(t.team_id)!==this.scope.workspaceId)throw new ClickUpError('Ticket scope mismatch.','scope');return t;
  }
  async comments(id) {
    await this.verifyTicket(id);const all=new Map();let params={},lastCursor='';
    const normalize=(c,parent_id=null)=>{if(!/^\d+$/.test(String(c.id)))throw new ClickUpError('Invalid comment ID.');return {id:String(c.id),parent_id,author:c.user?.username||'Unknown author',date:String(c.date||''),text:typeof c.comment_text==='string'?c.comment_text:(c.comment||[]).map(p=>p.text||'').join('')};};
    for(let page=0;page<200;page++){
      const data=await this.get('task/'+id+'/comment',params);if(!Array.isArray(data.comments))throw new ClickUpError('Invalid comment response.');
      if(!data.comments.length)return [...all.values()].sort((a,b)=>Number(a.date)-Number(b.date));
      for(const c of data.comments){const normalized=normalize(c);all.set(normalized.id,normalized);
        if(Number(c.reply_count)>0){const replies=await this.get('comment/'+normalized.id+'/reply');if(!Array.isArray(replies.comments)||replies.comments.length<Number(c.reply_count))throw new ClickUpError('Could not load the complete comment thread.');for(const reply of replies.comments){const n=normalize(reply,normalized.id);all.set(n.id,n);}}
      }
      const last=data.comments.at(-1);const cursor=String(last.date)+':'+String(last.id);if(cursor===lastCursor||!/^\d+$/.test(String(last.date)))throw new ClickUpError('Comment pagination did not advance.');lastCursor=cursor;params={start:last.date,start_id:last.id};
      if(all.size>10000)throw new ClickUpError('Too many comments to load safely.');
    }throw new ClickUpError('Comment history exceeded the page limit.');
  }
  async postAcceptance(id,text){await this.verifyTicket(id);const result=await this.request('task/'+id+'/comment',{},'POST',{comment_text:text,notify_all:false});if(!result.id)throw new ClickUpError('Comment publication was not confirmed.');return String(result.id);}
  async setWorkStage(id, stage) {
    if(!['in progress','review requested'].includes(stage)||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id))throw new ClickUpError('Invalid work stage.');
    const list=await this.verifyScope();const task=await this.get('task/'+id);
    if(String(task.id)!==id||String(task.list?.id)!==this.scope.listId||String(task.space?.id)!==this.scope.spaceId||String(task.team_id)!==this.scope.workspaceId)throw new ClickUpError('Ticket scope mismatch.','scope');
    const current=list.statuses.find(s=>s.status===task.status?.status);
    if(!current)throw new ClickUpError('Unknown current ClickUp status.');
    const finished=['done','closed'].includes(current.type);
    if(finished||(stage==='in progress'&&(['review requested','reviewed'].includes(current.status.toLowerCase())||current.status===this.scope.workflow?.review_requested)))return {status:current.status,finished};
    const mapped=this.scope.workflow?.[stage==='in progress'?'in_progress':'review_requested'];const matches=list.statuses.filter(s=>(mapped?s.status===mapped:s.status.toLowerCase()===stage)&&!['done','closed'].includes(s.type));
    if(matches.length!==1)throw new ClickUpError('Required ClickUp status is unavailable: '+stage);
    const target=matches[0].status;
    if(current.status!==target)await this.request('task/'+id,{},'PUT',{status:target});
    const verified=await this.get('task/'+id);
    if(verified.status?.status!==target)throw new ClickUpError('Status update not confirmed. Retry status sync.');
    return {status:target,finished:false};
  }
  async finishBug(id, expectedStatus) {
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id)) throw new ClickUpError('Invalid ticket ID.');
    const list=await this.verifyScope();
    const task=await this.get('task/'+id);
    if(String(task.id)!==id||String(task.list?.id)!==this.scope.listId||String(task.space?.id)!==this.scope.spaceId||String(task.team_id)!==this.scope.workspaceId)
      throw new ClickUpError('Ticket does not belong to the configured configured project list.','scope');
    const current=list.statuses.find(s=>s.status===task.status?.status);
    if(!current) throw new ClickUpError('Ticket status is no longer configured on this list.');
    if(['done','closed'].includes(current.type)) return {status:current.status,finished:true};
    if(current.status!==expectedStatus) throw new ClickUpError('Ticket status changed. Refresh before marking it finished.');
    const completion=this.scope.workflow?.complete;const candidates=list.statuses.filter(s=>completion?s.status===completion&&['done','closed'].includes(s.type):s.type==='done');
    if(candidates.length!==1) throw new ClickUpError('Expected one configured done status. Choose the completion status in ClickUp, then refresh.');
    const target=candidates[0].status;
    await this.request('task/'+id,{},'PUT',{status:target});
    const verified=await this.get('task/'+id);
    if(verified.status?.status!==target) throw new ClickUpError('ClickUp did not confirm completion. Refresh before retrying.');
    return {status:target,finished:true};
  }

  async catalog(){
    const {spaces}=await this.get('team/'+this.scope.workspaceId+'/space',{archived:false});if(!Array.isArray(spaces))throw new ClickUpError('Invalid workspace hierarchy.');
    const lists=[],seen=new Set();
    const add=(items,space,folder)=>{if(!Array.isArray(items))throw new ClickUpError('Invalid list hierarchy.');for(const l of items){if(l.archived)continue;if(!/^\d+$/.test(String(l.id))||l.space?.id!=null&&String(l.space.id)!==String(space.id))throw new ClickUpError('List hierarchy scope mismatch.','scope');if(seen.has(String(l.id)))continue;seen.add(String(l.id));lists.push({id:String(l.id),name:l.name,space_id:String(space.id),space_name:space.name,folder_id:folder?String(folder.id):null,folder_name:folder?.name||'',statuses:l.statuses||[]});}};
    for(const space of spaces){if(space.archived)continue;if(!/^\d+$/.test(String(space.id)))throw new ClickUpError('Invalid space ID.');const direct=await this.get('space/'+space.id+'/list',{archived:false});add(direct.lists,space);const folders=await this.get('space/'+space.id+'/folder',{archived:false});if(!Array.isArray(folders.folders))throw new ClickUpError('Invalid folder hierarchy.');for(const folder of folders.folders){if(folder.archived)continue;if(!/^\d+$/.test(String(folder.id)))throw new ClickUpError('Invalid folder ID.');const response=await this.get('folder/'+folder.id+'/list',{archived:false});add(response.lists,space,folder);}}
    const user=await this.get('user');if(!/^\d+$/.test(String(user.user?.id)))throw new ClickUpError('Could not identify your ClickUp user.');
    let members=[{id:String(user.user.id),name:user.user.username||'Me'}];try{const teams=await this.get('team');const team=teams.teams?.find(t=>String(t.id)===this.scope.workspaceId);if(team?.members)members=team.members.map(m=>({id:String(m.user.id),name:m.user.username||String(m.user.id)}));}catch{}
    return {workspace_id:this.scope.workspaceId,spaces:spaces.filter(s=>!s.archived).map(s=>({id:String(s.id),name:s.name})),lists:lists.sort((a,b)=>(a.space_name+'/'+a.folder_name+'/'+a.name).localeCompare(b.space_name+'/'+b.folder_name+'/'+b.name)),me:{id:String(user.user.id),name:user.user.username||'Me'},members,fetched_at:new Date().toISOString()};
  }
  normalizeTask(t,catalog,sourceIds){if(t.team_id!=null&&String(t.team_id)!==this.scope.workspaceId)throw new ClickUpError('Task workspace mismatch.','scope');if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(t.id)||typeof t.name!=='string'||typeof t.status?.status!=='string')throw new ClickUpError('Invalid ticket response.');const home=catalog.lists.find(l=>l.id===String(t.list?.id||sourceIds[0]));if(!home||t.space?.id!=null&&String(t.space.id)!==home.space_id)throw new ClickUpError('Task home list is outside the accessible workspace hierarchy.','scope');const scope=taskScope({workspaceId:this.scope.workspaceId,spaceId:home.space_id,spaceName:home.space_name,listId:home.id,listName:home.name});return {id:t.id,name:t.name,status:t.status.status,status_type:t.status.type,finished:['done','closed'].includes(t.status.type),priority:t.priority?.priority||null,assignees:(t.assignees||[]).map(a=>a.username||String(a.id)),assignee_ids:(t.assignees||[]).map(a=>String(a.id)),description:t.markdown_description??t.text_content??t.description??'',url:'https://app.clickup.com/t/'+t.id,scope,source_list_ids:sourceIds,tags:(t.tags||[]).map(t=>t.name),parent:t.parent||null,due_date:t.due_date||null,created_date:t.date_created||null,updated_date:t.date_updated||null,custom_fields:(t.custom_fields||[]).map(c=>({id:c.id,name:c.name,type:c.type,type_config:c.type_config,value:c.value}))};}
  async workspaceTasks(catalog,lists){
    const selected=lists.map(l=>l.id),tasks=new Map(),pages=new Set();if(!selected.length)return [];
    for(let page=0;page<1000;page++){const response=await this.get('team/'+this.scope.workspaceId+'/task',{page,list_ids:selected,include_closed:true,subtasks:true,include_markdown_description:true,order_by:'created',reverse:true});if(!Array.isArray(response.tasks))throw new ClickUpError('Invalid workspace task page.');const signature=response.tasks.map(t=>t.id).join(',');if(signature&&pages.has(signature))throw new ClickUpError('Workspace task pagination repeated. No partial result was saved.');pages.add(signature);for(const t of response.tasks){if(!t.archived){const n=this.normalizeTask(t,catalog,selected.includes(String(t.list?.id))?[String(t.list.id)]:selected);tasks.set(n.id,n);}}if(response.last_page===true||!response.tasks.length)return [...tasks.values()];}throw new ClickUpError('Workspace pagination exceeded the safety limit.');
  }
  async tasks(catalog){
    const list=await this.verifyScope();const entry=catalog.lists.find(l=>l.id===this.scope.listId);if(entry)entry.statuses=list.statuses;
    const tasks=new Map(),pages=new Set();
    for(let page=0;page<1000;page++){
      const result=await this.get('list/'+this.scope.listId+'/task',{page,archived:false,subtasks:true,include_closed:true,include_timl:true,include_markdown_description:true,order_by:'created',reverse:true});if(!Array.isArray(result.tasks))throw new ClickUpError('Invalid task page.');const signature=result.tasks.map(t=>t.id).join(',');if(signature&&pages.has(signature))throw new ClickUpError('Task pagination repeated; no partial result was saved.');pages.add(signature);
      for(const t of result.tasks){if(!t.archived){const n=this.normalizeTask(t,catalog,[this.scope.listId]);tasks.set(n.id,n);}}
      if(result.last_page===true||!result.tasks.length)return [...tasks.values()];
    }throw new ClickUpError('Task pagination exceeded the safety limit.');
  }
  async openBugs(includeFinished=false) {
    const list=await this.verifyScope();
    const openStatuses=list.statuses.filter(s=>includeFinished||!['done','closed'].includes(s.type)).map(s=>s.status);
    if(openStatuses.some(s=>typeof s!=='string')) throw new ClickUpError('ClickUp returned invalid status definitions.');
    const statuses=new Set(openStatuses), tasks=new Map(), pageSignatures=new Set();
    if(statuses.size===0) return [];
    for(let page=0;page<1000;page++) {
      const result=await this.get(`list/${this.scope.listId}/task`,{page,archived:false,subtasks:true,include_closed:includeFinished,include_timl:true,include_markdown_description:true,statuses:openStatuses,order_by:'created',reverse:true});
      if(!Array.isArray(result.tasks)) throw new ClickUpError('ClickUp returned an invalid task page.');
      const signature=result.tasks.map(t=>t.id).join(',');
      if(result.tasks.length&&pageSignatures.has(signature)) throw new ClickUpError('ClickUp repeated a task page. The incomplete result was not saved.');
      pageSignatures.add(signature);
      for(const t of result.tasks) {
        if(t.team_id!=null&&String(t.team_id)!==this.scope.workspaceId) throw new ClickUpError('A task belongs to a different workspace. Refresh stopped.','scope');
        if(t.space?.id!=null&&String(t.space.id)!==this.scope.spaceId) throw new ClickUpError('A task belongs to a different space. Refresh stopped.','scope');
        if(t.archived||(!includeFinished&&['done','closed'].includes(t.status?.type))||!statuses.has(t.status?.status))continue;
        if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(t.id)||typeof t.name!=='string') throw new ClickUpError('ClickUp returned an invalid ticket.');
        tasks.set(t.id,{id:t.id,name:t.name,status:t.status.status,finished:list.statuses.some(s=>s.status===t.status.status&&['done','closed'].includes(s.type)),priority:t.priority?.priority||null,assignees:(t.assignees||[]).map(a=>a.username||String(a.id)),description:t.markdown_description??t.text_content??t.description??'',url:`https://app.clickup.com/t/${t.id}`});
      }
      // Read the next page unless ClickUp explicitly says this is the last one.
      // An empty page is the backwards-compatible termination condition.
      if(result.last_page===true||result.tasks.length===0)return [...tasks.values()];
    }
    throw new ClickUpError('ClickUp pagination exceeded the safety limit. No partial result was saved.');
  }
}

