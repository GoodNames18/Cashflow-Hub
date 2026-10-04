import test from 'node:test';
import assert from 'node:assert/strict';
import {CashflowStore,CFH_OWNER_ID} from '../cfh-store.mjs';
import {CashflowWriteApi} from '../cfh-write-api.mjs';
import {CashflowSnapshot} from '../cfh-snapshot.mjs';
const id='12345678-1234-1234-1234-123456789012';
test('uncertain saves retry the same UUID, successful new entries get new UUIDs',async()=>{
  const calls=[];let fail=true;
  const client={rpc:async(name,args)=>{
    calls.push(args.p_request_id);
    if(fail){fail=false;return {error:new Error('Network interrupted')};}
    return {data:{id,tab_key:'life_log',revision:1,...args}};
  }};
  const store=new CashflowStore(client);
  const reads={snapshot:{load:async()=>[]},request:async()=>{throw new Error('Display failed');}};
  const api=new CashflowWriteApi(store,reads);
  const params={action:'lifeLogAdd',category:'Car',description:'Car wash'};
  await assert.rejects(api.request(params),/Network interrupted/);
  assert.equal((await api.request(params)).success,true);
  assert.equal(calls[0],calls[1]);
  await api.request(params);assert.notEqual(calls[1],calls[2]);
});
test('old delete fingerprint cannot delete a restored record',async()=>{
  let deleted=false;
  const record={id,owner_id:CFH_OWNER_ID,tab_key:'cash_in_out',revision:3,deleted_at:null};
  const query={eq(){return this;},single:async()=>({data:record})};
  const store={client:{from:()=>({select:()=>query})},setDeleted:async()=>{deleted=true;return record;}};
  const api=new CashflowWriteApi(store,{});
  await assert.rejects(api.request({action:'transactionDelete',sheet:'Cash In/Out',rowNumber:id,rowFingerprint:id+':1'}),/changed/);
  assert.equal(deleted,false);
});
test('a save during the first snapshot scan remains visible',async()=>{
  let listener,release;
  const page=new Promise(resolve=>{release=resolve;});
  const query={eq(){return this;},order(){return this;},limit(){return page;}};
  const store={onChange(fn){listener=fn;},validateTab(){},client:{from:()=>({select:()=>query})}};
  const snapshot=new CashflowSnapshot(store);
  const pending=snapshot.load('life_log');
  listener({id,tab_key:'life_log',revision:1});
  release({data:[]});
  assert.equal((await pending).length,1);
});
test('preview saves are tagged and unfinished financial actions cannot write',async()=>{
  const calls=[];
  const store=new CashflowStore({rpc:async(name,args)=>{calls.push(args);return {data:{id,tab_key:args.p_tab_key,revision:1}};}});
  const reads={snapshot:{load:async()=>[]},request:async()=>({})};
  const api=new CashflowWriteApi(store,reads,{testOnly:true});
  await api.request({action:'lifeLogAdd',category:'Car',description:'Preview car wash'});
  assert.equal(calls[0].p_payload.cfh_preview_test,true);
  await assert.rejects(api.request({action:'testHoldMoney',amount:100,holdAction:'hold'}),/next stage/);
  assert.equal(calls.length,1);
});
test('preview cannot delete existing imported transactions',async()=>{
  const record={id,owner_id:CFH_OWNER_ID,tab_key:'cash_in_out',revision:1,deleted_at:null,payload:{}};
  const query={eq(){return this;},single:async()=>({data:record})};
  let writes=0;
  const store={client:{from:()=>({select:()=>query})},setDeleted:async()=>{writes++;}};
  const api=new CashflowWriteApi(store,{}, {testOnly:true});
  await assert.rejects(api.request({action:'transactionDelete',sheet:'Cash In/Out',id}),/only the test/);
  assert.equal(writes,0);
});
test('legacy cached row numbers resolve through the UUID fingerprint',async()=>{
  const record={id,owner_id:CFH_OWNER_ID,tab_key:'cash_in_out',revision:1,deleted_at:null,payload:{cfh_preview_test:true}};
  let queriedId;
  const query={eq(key,value){if(key==='id')queriedId=value;return this;},single:async()=>({data:record})};
  const store={client:{from:()=>({select:()=>query})},setDeleted:async()=>({...record,deleted_at:'2026-10-04T00:00:00Z'})};
  const api=new CashflowWriteApi(store,{}, {testOnly:true});
  assert.equal((await api.request({action:'transactionDelete',sheet:'Cash In/Out',rowNumber:5,rowFingerprint:id+':1'})).deleted,true);
  assert.equal(queriedId,id);
});
