import test from 'node:test';
import assert from 'node:assert/strict';
import {CashflowWriteApi} from '../../supabase/cfh-write-api.mjs';
import {CashflowStore} from '../../supabase/cfh-store.mjs';
test('GCash confirms the database save without waiting for history or dashboard',async()=>{
 let calls=0;
 const store=new CashflowStore({rpc:async(name,args)=>{calls++;return {data:{id:args.p_request_id,tab_key:args.p_tab_key,revision:1}};}});
 const reads={snapshot:{load(){throw Error('History must not hold the save');}},request(){throw Error('Dashboard must not hold the save');}};
 const api=new CashflowWriteApi(store,reads);
 const result=await api.request({action:'gcashTextAdd',text:'20 gcash'});
 assert.equal(result.success,true);assert.equal(result.amount,20);assert.equal(calls,1);assert.equal(result.records.length,1);
});
test('GCash still reports a failed write and retries using the same request ID',async()=>{
 const ids=[];let fail=true;
 const store=new CashflowStore({rpc:async(name,args)=>{ids.push(args.p_request_id);if(fail){fail=false;return {error:Error('Network failed')};}return {data:{id:args.p_request_id,tab_key:args.p_tab_key,revision:1}};}});
 const api=new CashflowWriteApi(store,{snapshot:{},request(){}});
 const params={action:'gcashTextAdd',text:'20 gcash'};
 await assert.rejects(api.request(params),/Network failed/);assert.equal((await api.request(params)).success,true);assert.equal(ids[0],ids[1]);
});
