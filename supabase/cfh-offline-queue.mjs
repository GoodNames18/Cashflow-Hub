import {CFH_OWNER_ID} from './cfh-store.mjs?v=offline-home1';
import {checkKonekEntry} from './cfh-financial-checks.mjs?v=live2';

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
    if(item.plan?.tab==='konek2card'){
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
    if(item.installment){const {error}=await this.store.client.rpc('cfh_create_installment',item.installment);if(error)throw error;}
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
