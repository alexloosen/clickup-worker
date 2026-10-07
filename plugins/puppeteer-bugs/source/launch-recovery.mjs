const stalledAfter=120000;
export function launchNeedsAttention(run,now=Date.now()){
 return Boolean(run?.launch_attempted_at&&!run.thread_id&&!['released','investigated','completed','review_requested'].includes(run.status)&&now-Date.parse(run.launch_attempted_at)>stalledAfter);
}
export function launchDisplay(run,now=Date.now()){
 if(!launchNeedsAttention(run,now))return run;
 return {...run,launch_attention:true,summary:run.launch_error||'Chat creation has not been confirmed. Check Codex for the pending chat, reconnect an existing chat, or stop the pending launch before releasing this assignment.'};
}

// Do not guess a final thread ID from titles or convert a clientThreadId.
// An explicit reconnect must find the immutable launch ID in the actual chat.
export async function reconnectLaunch(store,{ticket_id,launch_id,thread_id},host,caller,signal){
 if(!/^[a-zA-Z0-9-]{1,100}$/.test(thread_id))throw Error('Enter a final Codex chat ID, not a pending client ID.');
 return store.withTickets([ticket_id],async()=>{
  const before=await store.read(),run=before.runs[ticket_id];
  if(!run||run.launch_id!==launch_id||run.status==='released')throw Error('Assignment changed.');
  if(run.thread_id&&run.thread_id!==thread_id)throw Error('This assignment already belongs to another chat.');
  const chat=await host.call('read_thread',{threadId:thread_id,turnLimit:20,includeOutputs:false,maxOutputCharsPerItem:20000},caller,signal);
  if(!JSON.stringify(chat).includes(launch_id))throw Error('This chat did not contain the exact launch ID. Open the original task chat and ask it to record progress, or check the ID. Nothing was reconnected.');
  return (await store.mutate(s=>{const r=s.runs[ticket_id];if(r?.launch_id!==launch_id||r.status==='released')throw Error('Assignment changed.');r.thread_id=thread_id;delete r.launch_error;r.updated_at=new Date().toISOString();r.summary='Existing chat reconnected. Open it to check its progress.';})).state;
 });
}
