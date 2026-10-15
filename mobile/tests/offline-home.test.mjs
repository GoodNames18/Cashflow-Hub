import test from 'node:test';
import assert from 'node:assert/strict';
import {CashflowStore,CFH_OWNER_ID} from '../../supabase/cfh-store.mjs?v=offline-home1';
import {CashflowSnapshot} from '../../supabase/cfh-snapshot.mjs?v=offline-home1';
import {CashflowReadApi} from '../../supabase/cfh-read-api.mjs?v=offline-home1';
import {CashflowWriteApi} from '../../supabase/cfh-write-api.mjs?v=offline-home1';
import {CashflowOfflineQueue} from '../../supabase/cfh-offline-queue.mjs?v=offline-home1';

const memory=()=>{const rows=new Map();return {list:async()=>structuredClone([...rows.values()]),put:async item=>{rows.set(item.key,structuredClone(item));},remove:async key=>{rows.delete(key);}};};
function setup({persistence=memory(),rpc,online=()=>false}={}){
 const remote=new Map();let requests=0;
 const store=new CashflowStore({rpc:rpc||(async(name,p)=>{requests++;const args=name==='cfh_save_bundle'?p.p_records:[p];const rows=args.map(p=>{if(!remote.has(p.p_request_id))remote.set(p.p_request_id,{id:crypto.randomUUID(),client_request_id:p.p_request_id,owner_id:CFH_OWNER_ID,tab_key:p.p_tab_key,occurred_at:p.p_occurred_at,source_values:p.p_source_values,amount:p.p_amount,category:p.p_category,description:p.p_description,payload:p.p_payload,revision:1});return remote.get(p.p_request_id);});return {data:name==='cfh_save_bundle'?rows:rows[0]};})});
 const snapshot=new CashflowSnapshot(store);for(const tab of ['money_flow','cash_in_out','rental','life_log','printing','twice_as_nyce','konek2card'])snapshot.records.set(tab,new Map());
 const reads=new CashflowReadApi(snapshot),writes=new CashflowWriteApi(store,reads);
 const queue=new CashflowOfflineQueue(store,reads,persistence,{online,verify:async()=>{}});writes.outbox=queue;snapshot.pendingRecords=tab=>queue.records(tab);
 return {store,reads,writes,queue,snapshot,remote,requests:()=>requests,persistence};
}
test('offline Home entries persist through restart, update totals, then sync exactly once',async()=>{
 let online=false;const first=setup();await first.queue.init();
 const saved=await first.writes.request({action:'expense',text:'60 pandesal',entryType:'Expense'});
 assert.equal(saved.pendingSync,true);assert.equal(first.requests(),0);
 const pending=first.queue.items[0],originalTime=pending.prepared[0].p_occurred_at;
 const second=setup({persistence:first.persistence,online:()=>online});await second.queue.init();
 const local=await second.reads.request({action:'dashboard'});assert.equal(local.monthlyExpenses,60);
 assert.equal(second.queue.items[0].prepared[0].p_occurred_at,originalTime);
 online=true;await Promise.all([second.queue.flush(),second.queue.flush()]);
 assert.equal(second.remote.size,1);assert.equal(second.requests(),1);assert.equal(second.queue.items.length,0);
 assert.equal((await second.reads.request({action:'dashboard'})).monthlyExpenses,60);
});
test('a lost acknowledgement retains its UUID across restart and does not double-save',async()=>{
 const seen=new Map();let fail=true,online=false;
 const rpc=async(name,p)=>{if(!seen.has(p.p_request_id))seen.set(p.p_request_id,{id:'confirmed',client_request_id:p.p_request_id,tab_key:p.p_tab_key,revision:1,source_values:p.p_source_values});if(fail){fail=false;return {error:Error('Connection lost after commit')};}return {data:seen.get(p.p_request_id)};};
 const a=setup({rpc,online:()=>online});await a.queue.init();await a.writes.request({action:'gcashQuickAdd',category:'gcash',amount:20});
 online=true;await a.queue.flush();assert.equal(a.queue.items.length,1);assert.match(a.queue.error,/lost/);
 const b=setup({rpc,persistence:a.persistence,online:()=>true});await b.queue.init();await b.queue.flush();
 assert.equal(seen.size,1);assert.equal(b.queue.items.length,0);
});
test('a full device storage never acknowledges or clears an unsaved entry',async()=>{
 const a=setup({persistence:{list:async()=>[],put:async()=>{throw Error('Storage full');},remove:async()=>{}}});await a.queue.init();
 await assert.rejects(a.writes.request({action:'gcashQuickAdd',category:'gcash',amount:20}),/Storage full/);
 assert.equal(a.queue.items.length,0);assert.equal(a.requests(),0);
});
test('acknowledged UUIDs suppress pending duplicates in snapshots and forced validation cannot use stale cache',async()=>{
 const a=setup();await a.queue.init();await a.writes.request({action:'gcashQuickAdd',category:'gcash',amount:20});
 const p=a.queue.items[0].prepared[0];a.snapshot.records.get('cash_in_out').set('remote',{id:'remote',client_request_id:p.p_request_id,tab_key:'cash_in_out',source_values:p.p_source_values,revision:1});
 assert.equal((await a.snapshot.load('cash_in_out')).length,1);
 assert.equal((await a.snapshot.load('cash_in_out',false,{includePending:false})).length,1);
 a.snapshot.refresh=async()=>{throw Error('Network unreachable');};
 await assert.rejects(a.snapshot.load('cash_in_out',true,{includePending:false,requireNetwork:true}),/Network unreachable/);
});
test('two intentional identical entries have different request IDs',async()=>{
 const a=setup();await a.queue.init();for(let i=0;i<2;i++)await a.writes.request({action:'gcashQuickAdd',category:'gcash',amount:20});
 assert.equal(a.queue.items.length,2);assert.notEqual(a.queue.items[0].prepared[0].p_request_id,a.queue.items[1].prepared[0].p_request_id);
});
test('rapid entries preserve their input order even when the device clock does not advance',async()=>{
 const a=setup();await a.queue.init();const now=Date.now;
 try{Date.now=()=>1234567890000;for(let i=1;i<=3;i++)await a.writes.request({action:'gcashQuickAdd',category:'gcash',amount:i});}finally{Date.now=now;}
 assert.deepEqual(a.queue.items.map(item=>item.plan.receipt.amount),[1,2,3]);
 assert.ok(a.queue.items[0].createdAt<a.queue.items[1].createdAt&&a.queue.items[1].createdAt<a.queue.items[2].createdAt);
});
test('a Konek2Card retry detects an earlier commit before checking its now-lower balance',async()=>{
 const a=setup();await a.queue.init();const plan={tab:'konek2card',receipt:{amount:100},records:[]};
 const prepared=[a.store.prepare({tab_key:'konek2card',occurred_at:new Date(),amount:100})];
 await a.queue.enqueue({plan,prepared,params:{action:'testCashOut'}});
 const saved={id:'confirmed-k2c',client_request_id:prepared[0].p_request_id,tab_key:'konek2card',revision:1};
 a.store.client.from=()=>({select(){return this;},eq(){return this;},in:async()=>({data:[saved]})});
 a.reads.request=()=>{throw Error('Must not debit twice or recheck a committed debit');};a.queue.online=()=>true;
 await a.queue.flush();assert.equal(a.queue.items.length,0);assert.equal(a.requests(),0);
});
test('bundled entries keep all request IDs together and wait for the bundle acknowledgement',async()=>{
 const a=setup();await a.queue.init();const plan={tab:'konek2card',receipt:{},records:[]},params={action:'testLoan'};
 const prepared=[1,2].map(amount=>a.store.prepare({tab_key:'konek2card',occurred_at:new Date(),amount}));
 await a.queue.enqueue({plan,prepared,params});assert.deepEqual(a.queue.items[0].prepared.map(p=>p.p_request_id),prepared.map(p=>p.p_request_id));
 assert.equal(a.queue.records('konek2card').length,2);
});
test('all seven Home categories accept local input using their existing parsers',async()=>{
 const a=setup();await a.queue.init();a.reads.konekSeed={reset_at:'2026-01-01T00:00:00Z',gcash:1000,bank_card:1000,cash_on_hand:1000,loan_remaining:0,others_loan:0,held_money:0,savings_included_in_total:0};
 const entries=[{action:'lifeLogAdd',category:'Health',description:'Offline note'},{action:'twiceAdd',category:'Income',text:'20 sale'},{action:'printingAdd',category:'Expense',text:'20 paper'},{action:'gcashQuickAdd',category:'gcash',amount:20},{action:'expense',entryType:'Expense',text:'20 bread'},{action:'rentalAdd',category:'Chair & Table',entryType:'Income',text:'20 rental'},{action:'testMonthlyInterest',text:'100 23'}];
 for(const params of entries)assert.equal((await a.writes.request(params)).pendingSync,true);
 assert.equal(new Set(a.queue.items.map(item=>item.plan.tab)).size,7);
});
test('an installment is retained locally with a stable server request ID',async()=>{
 const a=setup();await a.queue.init();const result=await a.writes.request({action:'installmentCreate',item:'Phone',total:'100',months:'3',firstDate:'2026-10-15'});
 assert.equal(result.pendingSync,true);assert.equal(result.monthly,33.33);assert.equal(a.queue.items[0].installment.p_id,result.id);
 await assert.rejects(a.writes.request({action:'installmentCreate',item:'Phone',total:'100',months:'0',firstDate:'2026-10-15'}),/valid/);
});
test('a stale Konek2Card balance blocks upload without discarding the offline entry',async()=>{
 const a=setup();await a.queue.init();const plan={tab:'konek2card',receipt:{amount:100},records:[]};
 const prepared=[a.store.prepare({tab_key:'konek2card',occurred_at:new Date(),amount:100})];await a.queue.enqueue({plan,prepared,params:{action:'testCashOut'}});
 a.store.client.from=()=>({select(){return this;},eq(){return this;},in:async()=>({data:[]})});
 a.reads.request=async(params,force,options)=>{assert.equal(force,true);assert.equal(options.requireNetwork,true);assert.equal(options.includePending,false);return {cashOnHand:0};};
 a.queue.online=()=>true;await a.queue.flush();assert.equal(a.requests(),0);assert.equal(a.queue.items.length,1);assert.match(a.queue.error,/Not enough/);
});
