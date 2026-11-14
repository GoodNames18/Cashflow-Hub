const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
 ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);

export function createNotesSync(key,{changed,status,localMedia}){
 const cache=key+':sync';
 function load(name,fallback){
  try{return JSON.parse(localStorage.getItem(name))??fallback;}catch{return fallback;}
 }
 let state=load(cache,null);
 if(!state){
  const notes=load(key,[]).filter(note=>typeof note?.id==='string');
  const prefs=Object.fromEntries(['labels','order'].map(name=>[name,load(key+':'+name,null)]).filter(([,value])=>value!==null));
  const pending=Object.fromEntries([...notes.map(note=>[note.id,note]),...Object.entries(prefs).map(([name,value])=>['@'+name,value])]
   .map(([id,payload])=>[id,{payload,removed:[],seed:true}]));
  state={notes,prefs,pending};
 }
 let client,owner,busy=false,again=false,timer;
 const uploaded=new Set();
 const bucket=()=>client.storage.from('cfh-note-media');
 const path=id=>owner+'/'+id;
 function commit(next){
  localStorage.setItem(cache,JSON.stringify(next));
  state=next;
 }
 function schedule(){
  clearTimeout(timer);
  timer=setTimeout(()=>void sync(),350);
 }
 function saveNotes(notes){
  const before=new Map(state.notes.map(note=>[note.id,note]));
  const after=new Map(notes.map(note=>[note.id,note]));
  const pending={...state.pending};
  for(const id of new Set([...before.keys(),...after.keys()])){
   const old=before.get(id),note=after.get(id);
   if(canonical(old)===canonical(note))continue;
   const keep=new Set((note?.attachments||[]).map(media=>media.id));
   const removed=[...(pending[id]?.removed||[]),...(old?.attachments||[]).map(media=>media.id)];
   pending[id]={payload:note??null,removed:[...new Set(removed.filter(media=>!keep.has(media)))]};
  }
  commit({...state,notes,pending});
  schedule();
 }
 async function sync(){
  if(!client||!navigator.onLine)return;
  if(busy){again=true;return;}
  busy=true;
  try{
   const table=()=>client.from('cfh_notes');
   for(const [id,entry] of Object.entries(state.pending)){
    try{
     for(const media of entry.payload?.attachments||[]){
      if(uploaded.has(media.id))continue;
      const blob=await localMedia(media.id);
      if(!blob)continue;
      const {error}=await bucket().upload(path(media.id),blob,{contentType:blob.type||'application/octet-stream'});
      if(error&&Number(error.statusCode)!==409&&!['Duplicate','ResourceAlreadyExists','KeyAlreadyExists'].includes(error.error))throw error;
      uploaded.add(media.id);
     }
     if(state.pending[id]!==entry)continue;
     const {error}=await table().upsert({owner_id:owner,id,payload:entry.payload},{ignoreDuplicates:!!entry.seed});
     if(error)throw error;
     if(entry.removed.length){
      const {error:removeError}=await bucket().remove(entry.removed.map(path));
      if(removeError)throw removeError;
     }
     if(state.pending[id]===entry){
      const pending={...state.pending};
      delete pending[id];
      commit({...state,pending});
     }
    }catch(error){console.warn('Note upload:',error.message);}
   }
   const remote=new Map();
   for(let offset=0;;offset+=250){
    const {data,error}=await table().select('id,payload').eq('owner_id',owner).order('id').range(offset,offset+249);
    if(error)throw error;
    for(const row of data)remote.set(row.id,row.payload);
    if(data.length<250)break;
   }
   for(const [id,entry] of Object.entries(state.pending))remote.set(id,entry.payload);
   const notes=[],prefs={};
   for(const [id,payload] of remote){
    if(id.startsWith('@'))prefs[id.slice(1)]=payload;
    else if(payload)notes.push(payload);
   }
   const updated=canonical(notes)!==canonical(state.notes)||canonical(prefs)!==canonical(state.prefs);
   commit({notes,prefs,pending:state.pending});
   status(Object.keys(state.pending).length?'Saved on this device · Sync pending':'Synced');
   if(updated)changed();
  }catch(error){
   console.warn('Notes sync:',error.message);
   status('Saved on this device · Sync pending');
  }finally{
   busy=false;
   if(again){again=false;schedule();}
  }
 }
 return {
  read:()=>structuredClone(state.notes),
  saveNotes,
  pref:name=>state.prefs[name],
  savePref(name,value){
   commit({...state,prefs:{...state.prefs,[name]:value},pending:{...state.pending,['@'+name]:{payload:value,removed:[]}}});
   schedule();
  },
  async download(id){
   if(!client||!navigator.onLine)return;
   const {data,error}=await bucket().download(path(id));
   if(!error)return data;
  },
  start(connection,id){
   if(client)return;
   client=connection;owner=id;
   client.channel('cfh-notes:'+owner).on('postgres_changes',
    {event:'*',schema:'public',table:'cfh_notes',filter:'owner_id=eq.'+owner},schedule)
    .subscribe(result=>{if(result==='SUBSCRIBED')schedule();});
   window.addEventListener('online',schedule);
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
   setInterval(()=>{if(!document.hidden)schedule();},30000);
   schedule();
  }
 };
}
