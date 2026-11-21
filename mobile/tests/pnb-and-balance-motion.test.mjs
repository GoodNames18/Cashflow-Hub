import test from 'node:test';import assert from 'node:assert/strict';
import {planEntry} from '../../supabase/cfh-entry-plan.mjs';
import {CashflowReadApi} from '../../supabase/cfh-read-api.mjs';
import {buildTransactionEdit,editableTransactionFields} from '../../supabase/cfh-transaction-edit.mjs';
import {ManilaDate} from '../../supabase/manila-date.mjs';
import {createBalanceMotion,writeDashboard} from '../../supabase/cfh-balance-motion.mjs';
const now=new ManilaDate('2026-11-21T12:00:00+08:00');
const entry=(category,amount,description='Shopee withdrawal')=>planEntry({action:'twiceAdd',account:'PNB',category,amount,description},now).records[0];
const dashboard=async records=>new CashflowReadApi({load:async()=>records.map((r,i)=>({id:'test-'+i,revision:1,...r}))}).request({action:'twiceDashboard',year:2026,month:11});
test('PNB opening funds count only in balances; withdrawals and stocks affect totals once',async()=>{
 const initial=await dashboard([]);assert.equal(initial.bankBalance,900.78);assert.equal(initial.totalMoney,900.78);assert.equal(initial.income,0);assert.equal(initial.profit,0);
 const income=entry('Income',1000),expense=entry('Expense',200.25,'Supplies / stocks');
 assert.equal(income.source_values[4],'[PNB] Shopee withdrawal');
 const data=await dashboard([income,expense]);assert.equal(data.bankBalance,1700.53);assert.equal(data.totalMoney,1700.53);assert.equal(data.income,1000);assert.equal(data.expenses,200.25);assert.equal(data.profit,799.75);
 const previous=await new CashflowReadApi({load:async()=>[income,expense].map((r,i)=>({...r,id:"row-"+i,revision:1}))}).request({action:'twiceDashboard',year:2026,month:10});assert.equal(previous.bankBalance,1700.53);assert.equal(previous.income,0);
});
test('old transactions are retained without silently assigning them to PNB',async()=>{
 const old=planEntry({action:'twiceAdd',text:'500 historical income',category:'Income'},now).records[0];const data=await dashboard([old]);assert.equal(data.bankBalance,900.78);assert.equal(data.totalMoney,1400.78);assert.equal(data.income,500);
});
test('PNB edits, deletion, restoration and description changes keep bank routing and sheet values',async()=>{
 const original=entry('Income',1000);const fields=editableTransactionFields(original);assert.equal(fields.find(f=>f.key==='description').value,'Shopee withdrawal');
 const updated={...original,...buildTransactionEdit(original,{amount:'500',description:'Shopee payout corrected'})};assert.equal(updated.description,'[PNB] Shopee payout corrected');assert.equal(updated.source_values[4],updated.description);assert.equal((await dashboard([updated])).bankBalance,1400.78);
 assert.equal((await dashboard([{...updated,deleted_at:'2026-11-21'}])).bankBalance,900.78);assert.equal((await dashboard([{...updated,deleted_at:null}])).bankBalance,1400.78);
 const expense={...updated,...buildTransactionEdit(updated,{category:'Expense'})};assert.equal((await dashboard([expense])).bankBalance,400.78);
});
test('PNB rejects invalid amounts, categories, and descriptions',()=>{
 for(const amount of [0,-1,1.001,Infinity])assert.throws(()=>entry('Income',amount),/positive/);
 assert.throws(()=>entry('Transfer',10),/Income or Expense/);for(const description of ['', 'x'.repeat(201),'bad\nline'])assert.throws(()=>entry('Income',10,description),/description/);
});
function animationFixture(){let time=0,key='2026-11',values={cash:100},hidden=false,reduce=false,seq=0;const jobs=new Map(),paints={},badges=[];const motion=createBalanceMotion({readValues:()=>({...values}),paint:(id,v)=>paints[id]=v,showDelta:(id,v)=>badges.push([id,v]),visible:()=>!hidden,period:()=>key,now:()=>time,reduced:()=>reduce,frame:fn=>{jobs.set(++seq,fn);return seq;},cancel:id=>jobs.delete(id)});return {motion,paints,badges,set values(v){values=v;},set key(v){key=v;},set hidden(v){hidden=v;},set reduced(v){reduce=v;},tick(ms){time+=ms;const callbacks=[...jobs.values()];jobs.clear();callbacks.forEach(f=>f());}};}
test('balance animation skips first paint, cache replay, refresh and month switches',()=>{
 const f=animationFixture();f.motion.render('gcash');f.values={cash:110};f.motion.render('gcash');assert.equal(f.badges.length,0);
 f.motion.arm('gcash');f.motion.render('gcash');assert.equal(f.badges.length,0);f.values={cash:120};f.motion.render('gcash');assert.deepEqual(f.badges,[['cash',10]]);f.tick(600);assert.equal(f.paints.cash,120);f.motion.render('gcash');assert.equal(f.badges.length,1);
 f.motion.arm('gcash');f.key='2026-10';f.values={cash:50};f.motion.render('gcash');assert.equal(f.badges.length,1);assert.equal(f.paints.cash,50);
});
test('rapid signed changes finish at exact cents and reduced motion paints immediately',()=>{
 const f=animationFixture();f.motion.render('konek');f.motion.arm('konek');f.values={cash:110};f.motion.render('konek');f.tick(300);const halfway=f.paints.cash;assert(halfway>100&&halfway<110);
 f.motion.arm('konek');f.values={cash:-.25};f.motion.render('konek');assert.equal(f.paints.cash,halfway);assert.deepEqual(f.badges.at(-1),['cash',-110.25]);f.tick(600);assert.equal(f.paints.cash,-.25);
 f.reduced=true;f.motion.arm('konek');f.values={cash:.01};f.motion.render('konek');assert.equal(f.paints.cash,.01);assert.equal(f.badges.length,2);
 f.reduced=false;f.hidden=true;f.motion.arm('konek');f.values={cash:999};f.motion.render('konek');assert.equal(f.badges.length,2);assert.equal(f.paints.cash,999);
});
test('only successful financial write routes arm their own dashboard',()=>{
 assert.equal(writeDashboard({action:'gcashQuickAdd'}),'gcash');assert.equal(writeDashboard({action:'testDashboard'}),undefined);assert.equal(writeDashboard({action:'twiceDashboard'}),undefined);assert.equal(writeDashboard({action:'twiceAdd'}),'twice');assert.equal(writeDashboard({action:'transactionEdit',sheet:'Konek2Card'}),'konek');
});
