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
