import {SCOPE} from './config.mjs';
const listFields=['workspaceId','spaceId','spaceName','listId','listName'];
export function taskScope(value){if(!value)return {...SCOPE};const scope={...SCOPE};for(const key of listFields)if(value[key]!=null)scope[key]=String(value[key]);if(scope.workspaceId!==SCOPE.workspaceId||!/^\d+$/.test(scope.spaceId)||!/^\d+$/.test(scope.listId))throw Error('Invalid ClickUp ticket location.');if(value.workflow){if(Object.values(value.workflow).some(v=>typeof v!=='string'||v.length>100))throw Error('Invalid workflow mapping.');scope.workflow={...value.workflow};}return scope;}
export function updateTicket(s,id,update){const t=s.tickets.find(t=>t.id===id);if(t)Object.assign(t,update);s.ticket_records??={};if(s.ticket_records[id])Object.assign(s.ticket_records[id],update);else if(t)s.ticket_records[id]={...t};}
export function clientScope(s,id){const r=s.runs[id];return taskScope(r?.scope||s.ticket_records?.[id]?.scope||s.tickets.find(t=>t.id===id)?.scope);}
