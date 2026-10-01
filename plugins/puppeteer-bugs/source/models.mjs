export const MODELS=Object.freeze([
 {id:'gpt-6-luna',label:'GPT6-Luna'},
 {id:'gpt-5.6-luna',label:'GPT5.6-Luna'},
 {id:'gpt-6-astra',label:'GPT6-Astra'},
 {id:'gpt-6.1-sol',label:'GPT6.1-Sol'}
]);
export function validModel(model){return model===undefined||model===''||MODELS.some(m=>m.id===model);}


export const DEFAULT_MODEL='gpt-6.1-sol';
export const DEFAULT_THINKING='high';
export const THINKING=['low','medium','high','xhigh','max','ultra'];
export const thinkingModes=model=>model==='gpt-6-luna'?THINKING.slice(0,-1):THINKING;
export const validThinking=(model,value)=>thinkingModes(model||DEFAULT_MODEL).includes(value||DEFAULT_THINKING);
