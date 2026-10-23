// Device caches stay usable offline. Revision checks prevent silent overwrites.
export const KEYS=['cfh_card_panel_preferences_v1','cfh_eastwest_cycle_overrides_v1','cfh_calendar_bells_v1','cfh_calendar_event_deletions_v1','cfh_metrobank_due_overrides_v1','cfh_metrobank_status_v1','cfh_calendar_entries_v1'];
export async function startCalendarSync(client,owner) {
 const META='cfh-cloud-calendar-v1',BACKUP='cfh-calendar-before-cloud-v1';
 const originalSet=Storage.prototype.setItem,originalRemove=Storage.prototype.removeItem;
 let meta;try{meta=JSON.parse(localStorage.getItem(META)||'{}');}catch{meta={};}
 meta.revisions||={};meta.pending||={};let busy=false,applying=false,ready=false,timer,requested=false,deferred=false,channel,retryTimer;
 const panel=document.createElement('div');panel.className='cfh-push-panel';panel.id='cfhCloudPanel';
 panel.innerHTML='<strong>Calendar sync</strong><p role="status">Connecting your saved schedules…</p><button type="button">Sync now</button>';
 document.getElementById('cfhCalendarSchedule')?.prepend(panel);
 const status=text=>panel.querySelector('[role=status]').textContent=text;
 function persist(){originalSet.call(localStorage,META,JSON.stringify(meta));}
 function backup(){if(!localStorage.getItem(BACKUP))originalSet.call(localStorage,BACKUP,JSON.stringify(Object.fromEntries(KEYS.map(k=>[k,localStorage.getItem(k)]))));}
 function changed(key,value){if(applying||!KEYS.includes(key))return;meta.pending[key]={value,revision:meta.revisions[key]||0};persist();queue();window.dispatchEvent(new Event('cfh-native-schedule-change'));}
 Storage.prototype.setItem=function(key,value){originalSet.call(this,key,value);if(this===localStorage)changed(String(key),String(value));};
 Storage.prototype.removeItem=function(key){originalRemove.call(this,key);if(this===localStorage)changed(String(key),null);};
 function queue(){clearTimeout(timer);timer=setTimeout(sync,700);}
 function editorOpen(){return ['cfhEditorOverlay','cfhCardPanel'].some(id=>{const el=document.getElementById(id);return el&&!el.hidden;});}
 function apply(row){applying=true;try{if(row.value===null)originalRemove.call(localStorage,row.storage_key);else originalSet.call(localStorage,row.storage_key,row.value);meta.revisions[row.storage_key]=row.revision;}finally{applying=false;}}
 function render(){window.cfhReloadCalendarFromStorage?.();window.dispatchEvent(new Event('cfh-native-schedule-change'));}
 async function sync(){
  if(busy){requested=true;return;}if(!navigator.onLine){status('Saved on this device · Waiting for connection');return;}
  clearTimeout(retryTimer);busy=true;
  try{
   const {data,error}=await client.from('cfh_calendar_state').select('*').eq('owner_id',owner);if(error)throw error;
   const rows=new Map(data.map(row=>[row.storage_key,row]));let refreshed=false;
   if(!ready){
    backup();
    for(const key of KEYS){const row=rows.get(key),local=localStorage.getItem(key);
     if(!row&&!meta.pending[key]&&local!==null)meta.pending[key]={value:local,revision:0};
     if(row&&!meta.pending[key]){apply(row);refreshed=true;}
    }ready=true;persist();
   }
   for(const key of KEYS){
    const pending=meta.pending[key],row=rows.get(key);
    if(pending){
     if((row?.revision||0)!==pending.revision){
      if(row?.value===pending.value){meta.revisions[key]=row.revision;delete meta.pending[key];persist();continue;}
      status('Different edits found on another device. Choose which version to keep.');
      let choices=panel.querySelector('[data-conflict]');if(!choices){choices=document.createElement('div');choices.dataset.conflict=key;panel.append(choices);}
      choices.replaceChildren();
      for(const [label,useLocal] of [['Keep this device’s edit',true],['Use synced version',false]]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{if(useLocal)meta.pending[key].revision=row?.revision||0;else {apply(row);delete meta.pending[key];render();}persist();choices.remove();queue();};choices.append(button);}
      return;
     }
     const sent={...pending};const {data:saved,error:saveError}=await client.rpc('cfh_save_calendar_state',{p_key:key,p_value:sent.value,p_revision:sent.revision});if(saveError)throw saveError;
     if(!saved?.length){queue();continue;}
     meta.revisions[key]=saved[0].revision;
     // A user may keep typing while this request is in flight.
     if(meta.pending[key]?.value===sent.value)delete meta.pending[key];else meta.pending[key].revision=saved[0].revision;
     persist();
    }else if(row&&row.revision!==meta.revisions[key]){if(editorOpen())deferred=true;else {apply(row);refreshed=true;}}
   }
   if(refreshed)render();persist();status(Object.keys(meta.pending).length?'Saving calendar changes…':'Calendar synced across devices');
  }catch(error){status('Saved on this device · Sync will retry');console.error('Calendar sync:',error.message);retryTimer=setTimeout(()=>{if(!document.hidden&&navigator.onLine)void sync();},15000);}
  finally{busy=false;if(requested){requested=false;queue();}}
 }
 panel.querySelector('button').onclick=sync;
 function disconnect(){if(channel){const previous=channel;channel=null;client.removeChannel(previous);}}
 function connect(){
  if(channel||document.hidden||!navigator.onLine)return;
  const current=client.channel('cfh-calendar-'+owner);channel=current;
  current.on('postgres_changes',{event:'*',schema:'public',table:'cfh_calendar_state',filter:'owner_id=eq.'+owner},payload=>{
   if(channel!==current||document.hidden)return;
   const row=payload.new;
   if(row?.storage_key&&row.revision===meta.revisions[row.storage_key]&&!meta.pending[row.storage_key])return;
   queue();
  }).subscribe(state=>{if(channel===current&&state==='SUBSCRIBED')queue();});
 }
 window.addEventListener('online',()=>{connect();queue();});window.addEventListener('offline',disconnect);
 window.addEventListener('focus',()=>{connect();queue();});
 window.addEventListener('storage',event=>{if(KEYS.includes(event.key)){changed(event.key,event.newValue);render();}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)disconnect();else {connect();queue();}});
 // Apply remote changes deferred during editing when the editor actually closes.
 const observer=new MutationObserver(()=>{if(deferred&&!editorOpen()){deferred=false;queue();}});
 for(const id of ['cfhEditorOverlay','cfhCardPanel']){const el=document.getElementById(id);if(el)observer.observe(el,{attributes:true,attributeFilter:['hidden','class','style']});}
 window.addEventListener('pagehide',disconnect);
 window.addEventListener('pageshow',()=>{connect();queue();});
 connect();await sync();
}
