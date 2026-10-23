import {CFH_OWNER_ID} from './cfh-store.mjs?v=offline-home1';
import {checkKonekEntry} from './cfh-financial-checks.mjs?v=live2';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;

export async function openOfflineQueue(){
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('cashflow-hub-home-outbox',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('requests',{keyPath:'key'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 const access=(mode,operation)=>new Promise((resolve,reject)=>{
  const tx=db.transaction('requests',mode),request=operation(tx.objectStore('requests'));
  tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
 return {list:async()=>(await access('readonly',s=>s.getAll())).filter(x=>x.owner===CFH_OWNER_ID).sort((a,b)=>a.createdAt-b.createdAt||a.key.localeCompare(b.key)),
  put:entry=>access('readwrite',s=>s.put(entry)),remove:key=>access('readwrite',s=>s.delete(key))};
}

export class CashflowOfflineQueue{
 constructor(store,reads,persistence,{online=()=>globalThis.navigator?.onLine!==false,verify=()=>store.requireOwner(),settings=null}={}){
  Object.assign(this,{store,reads,persistence,online,verify,settings});this.items=[];this.listeners=new Set();this.busy=null;this.error='';
 }
 async init(){this.items=await this.persistence.list();this.publish();return this;}
 onChange(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 publish(){for(const fn of this.listeners)try{fn({count:this.items.length,busy:!!this.busy,error:this.error,items:this.items});}catch(e){console.warn(e);}}
 records(tab){return this.items.flatMap(item=>(item.prepared||[]).filter(p=>p.p_tab_key===tab).map(p=>({
  id:'pending:'+p.p_request_id,client_request_id:p.p_request_id,owner_id:CFH_OWNER_ID,tab_key:p.p_tab_key,
  occurred_at:p.p_occurred_at,amount:p.p_amount,category:p.p_category,description:p.p_description,payload:p.p_payload,
  source_values:p.p_source_values,revision:0,deleted_at:null,created_at:p.p_occurred_at,updated_at:p.p_occurred_at,pending_sync:true
 })));}
 view(tab,records){
  const pending=this.records(tab),confirmed=new Set(records.map(r=>r.client_request_id));
  const result=new Map([...records,...pending.filter(r=>!confirmed.has(r.client_request_id))].map(r=>[r.id,r]));
  for(const item of this.items){if(item.mutation?.record.tab_key!==tab)continue;
   const {record,values,type,deleted}=item.mutation;
   // Keep local changes visible without modifying the last confirmed revision.
   const target=[...result.values()].find(row=>row.id===record.id||record.client_request_id&&row.client_request_id===record.client_request_id)||record;
   result.set(target.id,{...target,...(type==='edit'?values:{deleted_at:deleted?new Date(item.createdAt).toISOString():null}),revision:record.id.startsWith('pending:')&&Number(record.revision)===0?2:Number(record.revision)+1,pending_sync:true});
  }
  return [...result.values()];
 }
 async enqueueMutation(record,change){
  if(this.busy)await this.busy;
  this.items=await this.persistence.list();
  const createdAt=this.items.reduce((next,item)=>Math.max(next,item.createdAt+1),Date.now());
  const item={key:CFH_OWNER_ID+':mutation:'+crypto.randomUUID(),owner:CFH_OWNER_ID,createdAt,plan:{tab:record.tab_key},mutation:{record:structuredClone(record),...change}};
  await this.persistence.put(item);this.items=await this.persistence.list();this.error='';this.publish();this.reads.snapshot.emit(record.tab_key);void this.flush();
  const local=this.view(record.tab_key,[record]).find(r=>r.id===record.id);
  return {success:true,pendingSync:true,record:local,deleted:!!local.deleted_at};
 }
 async discard(key){
  if(this.busy)await this.busy;
  const item=this.items.find(item=>item.key===key);if(!item)return;
  const ids=new Set([item.mutation?.record.client_request_id,...(item.prepared||[]).map(p=>p.p_request_id)].filter(Boolean));
  for(const pending of this.items)if(pending.key===key||pending.createdAt>=item.createdAt&&pending.mutation&&(pending.mutation.record.id===item.mutation?.record.id||ids.has(pending.mutation.record.client_request_id)))await this.persistence.remove(pending.key);
  this.items=await this.persistence.list();this.error='';this.publish();
  if(item.plan?.tab)this.reads.snapshot.emit(item.plan.tab);void this.flush();
 }
 async syncMutation(mutation){
  const {record,type,values,deleted}=mutation;
  const pending=record.id.startsWith('pending:'),expected=pending&&Number(record.revision)===0?1:Number(record.revision);
  const {data:current,error}=await this.store.client.from('cfh_records').select('*').eq('owner_id',CFH_OWNER_ID).eq(pending?'client_request_id':'id',pending?record.client_request_id:record.id).eq('tab_key',record.tab_key).single();
  if(error)throw error;
  const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  const matches=type==='edit'?Object.keys(values).every(key=>key==='occurred_at'?Date.parse(current[key])===Date.parse(values[key]):equal(current[key],values[key])):!!current.deleted_at===deleted;
  // A lost response after a commit must not repeat the edit or deletion.
  if(matches&&Number(current.revision)===expected+1){this.store.emit(current);return;}
  if(Number(current.revision)!==expected){this.store.emit(current);throw Error('This transaction changed on another device. Your offline change is kept. Review it before discarding or retrying.');}
  if(type==='edit')await this.store.updateRecord(current,values);else await this.store.setDeleted(current,deleted);
 }
 async enqueue({plan,prepared,params,installment}){
  const id=installment?.p_id||prepared[0].p_request_id;
  const createdAt=this.items.reduce((next,item)=>Math.max(next,item.createdAt+1),Date.now());
  const item={key:CFH_OWNER_ID+':'+id,owner:CFH_OWNER_ID,createdAt,plan,prepared,params,installment};
  // Do not acknowledge a save until the IndexedDB transaction commits.
  await this.persistence.put(item);this.items=await this.persistence.list();this.error='';this.publish();
  if(plan?.tab)this.reads.snapshot.emit(plan.tab);
  void this.flush();
  return {success:true,pendingSync:true,...(plan?.receipt||{}),...(installment?{id:installment.p_id,monthly:Math.floor(installment.p_total*100/installment.p_months)/100,months:installment.p_months,posted:0}:{}),records:this.records(plan?.tab).filter(r=>prepared?.some(p=>p.p_request_id===r.client_request_id))};
 }
 flush(){
  if(this.busy)return this.busy;
  if(!this.online())return Promise.resolve();
  const work=()=>this.drain();
  this.busy=(globalThis.navigator?.locks?navigator.locks.request('cfh-home-sync:'+CFH_OWNER_ID,work):work())
   .catch(error=>{this.error=error.message||String(error);})
   .finally(()=>{this.busy=null;this.publish();});this.publish();return this.busy;
 }
 async drain(){
  this.items=await this.persistence.list();if(!this.items.length)return;
  await this.verify();if(this.settings)await this.settings();
  while(this.online()){
   this.items=await this.persistence.list();const item=this.items[0];if(!item)break;
   try{
    let alreadySaved=false;
    if(!item.mutation&&item.plan?.tab==='konek2card'){
     // An acknowledgement can be lost after the server commits. Check UUIDs
     // before balance validation so a retry cannot be rejected by its own debit.
     const {data,error}=await this.store.client.from('cfh_records').select('*').eq('owner_id',CFH_OWNER_ID)
      .in('client_request_id',item.prepared.map(p=>p.p_request_id));
     if(error)throw error;
     alreadySaved=data.length===item.prepared.length;
     if(alreadySaved)for(const record of data)this.store.emit(record);
     else {
      if(data.length)throw Error('A partial transaction needs review before sync can continue.');
      const balance=await this.reads.request({action:'testDashboard'},true,{includePending:false,requireNetwork:true});
      checkKonekEntry(item.plan,item.params,balance);
     }
    }
    if(item.mutation){await this.syncMutation(item.mutation);}
    else if(item.installment){const {error}=await this.store.client.rpc('cfh_create_installment',item.installment);if(error)throw error;}
    else if(!alreadySaved){if(item.prepared.length===1)await this.store.save(item.prepared[0]);else await this.store.saveBundle(item.prepared);}
    await this.persistence.remove(item.key);this.items=await this.persistence.list();this.error='';
    if(item.plan?.tab)this.reads.snapshot.emit(item.plan.tab);this.publish();
   }catch(error){
    this.error=error.message||String(error);item.error=this.error;
    await this.persistence.put(item);this.items=await this.persistence.list();break;
   }
  }
 }
}

// Keep offline retry and reconnect behavior without replacing transaction notes
// or mounting a visible sync panel in the Home layout.
export function mountHomeSyncStatus(queue){
 let timer,delay=5000;
 const render=()=>{
  const count=queue.items.length,offline=navigator.onLine===false;
  clearTimeout(timer);
  if(count&&!offline&&!document.hidden&&!queue.busy){timer=setTimeout(()=>{delay=Math.min(delay*2,60000);void queue.flush();},delay);}else if(!count)delay=5000;
 };
 queue.onChange(render);window.addEventListener('online',()=>{delay=5000;render();void queue.flush();});window.addEventListener('offline',render);
 document.addEventListener('visibilitychange',()=>{render();if(!document.hidden)void queue.flush();});window.addEventListener('pageshow',()=>void queue.flush());
 render();void queue.flush();
}
