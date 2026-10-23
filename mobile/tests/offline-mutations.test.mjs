import test from 'node:test';
import assert from 'node:assert/strict';
import {CashflowOfflineQueue} from '../../supabase/cfh-offline-queue.mjs';
import {CashflowSnapshot} from '../../supabase/cfh-snapshot.mjs';
import {CashflowWriteApi} from '../../supabase/cfh-write-api.mjs';
import {CFH_OWNER_ID} from '../../supabase/cfh-store.mjs';
const base={id:'11111111-1111-4111-8111-111111111111',client_request_id:'22222222-2222-4222-8222-222222222222',owner_id:CFH_OWNER_ID,tab_key:'cash_in_out',amount:50,category:'GCash',description:'Original',occurred_at:'2026-10-23T01:00:00.000Z',source_values:['2026-10-23T01:00:00.000Z','2026-10-23T01:00:00.000Z',50,'GCash','Original'],payload:{},revision:3,deleted_at:null};
function fixture(persistence){
 const saved=new Map();persistence ||= {list:async()=>structuredClone([...saved.values()]),put:async row=>{saved.set(row.key,structuredClone(row));},remove:async key=>{saved.delete(key);}};
 let current=structuredClone(base),online=false,calls=0,lose=false;
 const store={onChange(fn){this.listener=fn;},emit(row){this.listener(row);},validateTab(){},client:{from(){return{select(){return this;},eq(){return this;},single:async()=>({data:structuredClone(current)})};}},async updateRecord(r,values){calls++;assert.equal(r.revision,current.revision);current={...current,...values,revision:current.revision+1};if(lose){lose=false;throw Error('Lost acknowledgement');}this.emit(current);return current;},async setDeleted(r,deleted){return this.updateRecord(r,{deleted_at:deleted?'2026-10-23T02:00:00.000Z':null});}};
 const snapshot=new CashflowSnapshot(store);snapshot.records.set(base.tab_key,new Map([[base.id,structuredClone(base)]]));const reads={snapshot};const queue=new CashflowOfflineQueue(store,reads,persistence,{online:()=>online,verify:async()=>{}});snapshot.pendingView=(tab,records)=>queue.view(tab,records);
 const writes=new CashflowWriteApi(store,reads);writes.outbox=queue;
 return{writes,queue,snapshot,persistence,store,reset:row=>current=structuredClone(row),connect:()=>online=true,get current(){return current;},change:()=>current={...current,description:'Other device',revision:4},lose:()=>lose=true,calls:()=>calls};
}
const params={sheet:'Cash In/Out',rowNumber:base.id,rowFingerprint:base.id+':3'};
test('offline edit survives restart and changes cached display before upload',async()=>{
 const a=fixture();await a.queue.init();const result=await a.writes.request({...params,action:'transactionEdit',values:{amount:75}});assert.equal(result.pendingSync,true);assert.equal((await a.snapshot.load(base.tab_key))[0].amount,75);assert.equal(a.calls(),0);
 const b=fixture(a.persistence);await b.queue.init();assert.equal((await b.snapshot.load(base.tab_key))[0].amount,75);b.connect();await b.queue.flush();assert.equal(b.current.amount,75);assert.equal(b.current.revision,4);assert.equal(b.queue.items.length,0);assert.equal((await b.snapshot.load(base.tab_key))[0].pending_sync,undefined);
});
test('offline delete and restore apply locally, then synchronize',async()=>{
 for(const deleting of [true,false]){const a=fixture();await a.queue.init();if(!deleting){a.snapshot.records.get(base.tab_key).get(base.id).deleted_at='2026-10-22T00:00:00Z';}
 const r=await a.writes.request({...params,action:deleting?'transactionDelete':'transactionRestore'});assert.equal(r.pendingSync,true);assert.equal(!!(await a.snapshot.load(base.tab_key))[0].deleted_at,deleting);a.connect();await a.queue.flush();assert.equal(!!a.current.deleted_at,deleting);assert.equal(a.queue.items.length,0);}
});
test('lost edit response is recognized on retry without a second mutation',async()=>{
 const a=fixture();await a.queue.init();await a.writes.request({...params,action:'transactionEdit',values:{amount:80}});a.connect();a.lose();await a.queue.flush();assert.equal(a.queue.items.length,1);assert.equal(a.calls(),1);await a.queue.flush();assert.equal(a.queue.items.length,0);assert.equal(a.calls(),1);
});
test('another device revision keeps local edit for review without overwriting the server',async()=>{
 const a=fixture();await a.queue.init();await a.writes.request({...params,action:'transactionEdit',values:{amount:90}});a.change();a.connect();await a.queue.flush();assert.equal(a.calls(),0);assert.match(a.queue.error,/another device/);assert.equal((await a.snapshot.load(base.tab_key))[0].amount,90);assert.equal(a.queue.items.length,1);await a.queue.discard(a.queue.items[0].key);assert.equal(a.queue.items.length,0);
});
test('storage failure never acknowledges an offline edit',async()=>{
 const a=fixture({list:async()=>[],put:async()=>{throw Error('Storage full');},remove:async()=>{}});await a.queue.init();await assert.rejects(a.writes.request({...params,action:'transactionEdit',values:{amount:80}}),/Storage full/);assert.equal((await a.snapshot.load(base.tab_key))[0].amount,50);
});

test('a new offline entry can be edited before its initial sync and resolves its real server ID',async()=>{
 const a=fixture();a.reset({...base,revision:1});await a.queue.init();
 const p={p_request_id:base.client_request_id,p_tab_key:base.tab_key,p_occurred_at:base.occurred_at,p_amount:50,p_category:base.category,p_description:base.description,p_payload:{},p_source_values:base.source_values};
 a.store.save=async()=>{a.store.emit(a.current);return a.current;};
 await a.queue.enqueue({plan:{tab:base.tab_key},prepared:[p],params:{}});
 a.snapshot.records.set(base.tab_key,new Map());const id='pending:'+base.client_request_id;
 await a.writes.request({...params,rowNumber:id,rowFingerprint:id+':0',action:'transactionEdit',values:{amount:95}});
 assert.equal(a.queue.items.length,2);assert.equal(a.snapshot.view(base.tab_key)[0].amount,95);
 a.connect();await a.queue.flush();assert.equal(a.queue.items.length,0);assert.equal(a.current.amount,95);assert.equal(a.snapshot.view(base.tab_key).length,1);assert.equal(a.snapshot.view(base.tab_key)[0].id,base.id);
});

test('several offline edits and undoing a deletion preserve revision order',async()=>{
 const a=fixture();await a.queue.init();await a.writes.request({...params,action:'transactionEdit',values:{amount:60}});
 await a.writes.request({...params,rowFingerprint:base.id+':4',action:'transactionDelete'});
 assert.ok(a.snapshot.view(base.tab_key)[0].deleted_at);
 await a.writes.request({...params,rowFingerprint:base.id+':5',action:'transactionRestore'});
 const preview=a.snapshot.view(base.tab_key)[0];assert.equal(preview.amount,60);assert.equal(preview.deleted_at,null);assert.equal(preview.revision,6);
 a.connect();await a.queue.flush();assert.equal(a.queue.items.length,0);assert.equal(a.current.revision,6);assert.equal(a.current.amount,60);assert.equal(a.current.deleted_at,null);
});
