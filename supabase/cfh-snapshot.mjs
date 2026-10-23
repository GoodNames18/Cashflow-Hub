import { CFH_OWNER_ID } from './cfh-store.mjs?v=offline-home1';
// IndexedDB keeps transaction history across app closes without sharing the
// legacy dashboard cache namespace or clearing it during an update.
export class CashflowSnapshot {
  constructor(store, cache = null) {
    this.store = store;
    this.cache = cache;
    this.records = new Map();
    this.loading = new Map();
    this.listeners = new Set();
    this.mutations = new Map();
    store.onChange(record => {
      let changes = this.mutations.get(record.tab_key);
      if (!changes) this.mutations.set(record.tab_key, changes = new Map());
      changes.set(record.id, record);
      const tab = this.records.get(record.tab_key);
      if (tab) { tab.set(record.id, record); this.persist(record.tab_key); }
      this.emit(record.tab_key);
    });
  }
  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(tab) { for (const listener of this.listeners) {
    try { listener(tab); } catch (error) { console.warn("Cashflow display update failed",error); }
  } }
  async persist(tab) {
    try { await this.cache?.put(tab, Array.from(this.records.get(tab)?.values() || [])); }
    catch (error) { console.warn('Cashflow history cache could not be saved', error); }
  }
  view(tab,includePending=true){
    const records=Array.from(this.records.get(tab)?.values()||[]);
    if(!includePending)return records;
    const confirmed=new Set(records.map(r=>r.client_request_id));
    return this.pendingView?.(tab,records) ?? [...records,...(this.pendingRecords?.(tab)||[]).filter(r=>!confirmed.has(r.client_request_id))];
  }
  async load(tab, force = false, {includePending=true,requireNetwork=false}={}) {
    this.store.validateTab(tab);
    const offline=globalThis.navigator?.onLine===false;
    if(requireNetwork&&offline)throw Error('Connect to the internet to verify the current balance.');
    if ((!force||offline) && this.records.has(tab)) return this.view(tab,includePending);
    if ((!force||offline) && this.cache) {
      try {
        const cached = await this.cache.get(tab);
        if (Array.isArray(cached)) {
          this.records.set(tab, new Map(cached.map(r=>[r.id,r])));
          if(!offline)this.refresh(tab).catch(error=>console.warn('Cashflow background refresh failed',error));
          return this.view(tab,includePending);
        }
      } catch (error) { console.warn('Cashflow history cache unavailable',error); }
    }
    try {
      if(offline)throw Error('Open this Home tab once online to download its history. Your new entries are still saved on this device.');
      await this.refresh(tab);
    }catch(error){if(requireNetwork||!this.records.has(tab))throw error;}
    return this.view(tab,includePending);
  }
  async refreshChanges(tab) {
    if(this.loading.has(tab))return this.loading.get(tab);
    if(!this.records.has(tab))return this.load(tab);
    const current=this.records.get(tab);
    const dates=[...current.values()].map(r=>Date.parse(r.updated_at)).filter(Number.isFinite);
    if(!dates.length)return this.refresh(tab);
    // Overlap the newest timestamp; revision checks discard repeated rows.
    const since=new Date(Math.max(...dates)-2000).toISOString();
    let cursor=null,changed=false;
    for(;;) {
      let query=this.store.client.from('cfh_records').select('*')
        .eq('owner_id',CFH_OWNER_ID).eq('tab_key',tab).gte('updated_at',since);
      if(cursor)query=query.gt('id',cursor);
      const {data,error}=await query.order('id',{ascending:true}).limit(1000);
      if(error)throw error;
      for(const record of data) {
        const old=current.get(record.id);
        if(!old||Number(record.revision)>Number(old.revision)) {current.set(record.id,record);changed=true;}
      }
      if(data.length<1000)break;
      cursor=data.at(-1).id;
    }
    if(changed){await this.persist(tab);this.emit(tab);}
  }
  refresh(tab) {
    if (this.loading.has(tab)) return this.loading.get(tab);
    const promise = (async () => {
      const records = new Map();
      let cursor = null;
      // Full ID scan includes deleted records. Replacements remove stale history.
      // Each complete refresh builds a separate map; readers retain the old map.
      for (;;) {
        let query = this.store.client.from('cfh_records').select('*')
          .eq('owner_id',CFH_OWNER_ID).eq('tab_key',tab);
        if (cursor) query = query.gt('id',cursor);
        const { data, error } = await query.order('id',{ascending:true}).limit(1000);
        if (error) throw error;
        for (const record of data) records.set(record.id,record);
        if (data.length < 1000) break;
        cursor = data.at(-1).id;
      }
      // Preserve mutations acknowledged while the background scan was running.
      for (const record of this.mutations.get(tab)?.values() || []) {
        const fetched = records.get(record.id);
        if (!fetched || fetched.revision < record.revision) records.set(record.id,record);
      }
      const previous=this.records.get(tab);
      const changed=!previous || previous.size!==records.size || [...records].some(([id,r])=>previous.get(id)?.revision!==r.revision);
      this.records.set(tab,records);
      await this.persist(tab);
      if(changed)this.emit(tab);
      return Array.from(records.values());
    })().finally(()=>this.loading.delete(tab));
    this.loading.set(tab,promise);
    return promise;
  }
}
export async function openHistoryCache() {
  const db = await new Promise((resolve,reject)=>{
    const request = indexedDB.open('cashflow-hub-supabase-history',1);
    request.onupgradeneeded = () => request.result.createObjectStore('tabs');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  function access(tab, value, write) {
    return new Promise((resolve,reject)=>{
      const transaction = db.transaction('tabs',write?'readwrite':'readonly');
      const objectStore = transaction.objectStore('tabs');
      const request = write ? objectStore.put(value,CFH_OWNER_ID+':'+tab)
        : objectStore.get(CFH_OWNER_ID+':'+tab);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
  return { get:tab=>access(tab,null,false), put:(tab,value)=>access(tab,value,true) };
}
