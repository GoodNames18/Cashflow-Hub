import test from 'node:test';
import assert from 'node:assert/strict';
import { CashflowWriteApi } from '../cfh-write-api.mjs';

test('installment retries retain identity, separate plans get separate identities',async()=>{
  const ids=[];let fail=true,refreshes=0;
  const store={client:{rpc:async(name,args)=>{assert.equal(name,'cfh_create_installment');ids.push(args.p_id);if(fail){fail=false;return {error:new Error('network')};}return {data:{success:true,months:12}};}}};
  const api=new CashflowWriteApi(store,{snapshot:{load:async(tab,force)=>{assert.equal(tab,'money_flow');assert.equal(force,true);refreshes++;}}});
  const params={action:'installmentCreate',item:'Phone',total:90000,months:12,firstDate:'2026-10-01'};
  assert.equal(api.handles(params.action),true);
  await assert.rejects(api.request(params),/network/);
  assert.equal((await api.request(params)).success,true);
  await api.request({...params,item:'Laptop'});
  assert.equal(ids[0],ids[1]);assert.notEqual(ids[1],ids[2]);assert.equal(refreshes,2);
});
