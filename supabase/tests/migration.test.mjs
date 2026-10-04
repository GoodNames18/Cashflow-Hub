import test from 'node:test';
import assert from 'node:assert/strict';
import { planEntry } from '../cfh-entry-plan.mjs';
import { ManilaDate, sourceDate } from '../manila-date.mjs';
import { configureKonekSeed, computeTestDashboardFromRows_ } from '../legacy-rules.mjs';
import { CashflowReadApi } from '../cfh-read-api.mjs';
import { checkKonekEntry } from '../cfh-financial-checks.mjs';

const seed={reset_at:'2026-10-01T00:00:00+08:00',gcash:20,bank_card:5000,
  cash_on_hand:500,loan_remaining:0,others_loan:0,held_money:100,savings_included_in_total:0};
const now=new ManilaDate('2026-10-04T00:00:00Z');
test('GCash dashboard and filtered history preserve the same UUID for deletion',async()=>{
  const id='12345678-1234-1234-1234-123456789012';
  const record={...planEntry({action:'gcashQuickAdd',category:'gcash',amount:10},now).records[0],id,revision:2};
  const api=new CashflowReadApi({load:async()=>[record]});
  for(const params of [{action:'gcashDashboard',year:2026,month:10},{action:'gcashTransactions',category:'gcash',limit:10}]) {
    const result=await api.request(params);
    const items=result.recentTransactions||result.transactions||result.items;
    assert.ok(items?.length,JSON.stringify(result));
    assert.equal(items[0].rowNumber,id);
    assert.equal(items[0].rowFingerprint,id+':2');
  }
});
test('Manila calendar is independent of the device timezone',()=>{
  assert.equal(new ManilaDate('2026-09-30T17:00:00Z').getMonth(),9);
  assert.equal(new ManilaDate(2026,9,1).toISOString(),'2026-09-30T16:00:00.000Z');
  assert.equal(sourceDate('08:30:00').getHours(),8);
});
test('collection total includes fees, with the original system/earned split',()=>{
  const entry=planEntry({action:'testAapCollection',text:'35 30000',destination:'cash'},now);
  assert.equal(entry.receipt.cashReceived,30000);
  assert.equal(entry.receipt.feeEarned,105);
  assert.equal(entry.receipt.appDeduction,29895);
  assert.equal(entry.records[0].payload.sheet,'Konek2Card');
});
test('loan payment and rebate are planned as a two-record bundle',()=>{
  const entry=planEntry({action:'testLoan',amount:415,rebate:50},now);
  assert.deepEqual(entry.records.map(r=>r.amount),[415,50]);
  assert.deepEqual(entry.records.map(r=>r.description),['Loan payment','Loan rebate']);
});
test('hold and release change spendable card money and total money',()=>{
  configureKonekSeed(seed);
  const toRows=entries=>entries.flatMap(e=>e.records.map(r=>
    r.source_values.map((v,i)=>i<2?sourceDate(v):v)));
  const start=computeTestDashboardFromRows_([],seed.reset_at);
  const hold=planEntry({action:'testHoldMoney',amount:600,holdAction:'hold'},now);
  const held=computeTestDashboardFromRows_(toRows([hold]),seed.reset_at);
  assert.equal(held.heldMoney,700);
  assert.equal(held.card,start.card-600);
  assert.equal(held.totalMoney,start.totalMoney-600);
  const release=planEntry({action:'testHoldMoney',amount:500,holdAction:'release'},
    new ManilaDate(now.getTime()+1000));
  const released=computeTestDashboardFromRows_(toRows([release,hold]),seed.reset_at);
  assert.equal(released.heldMoney,200);
  assert.equal(released.card,held.card+500);
  assert.equal(released.totalMoney,held.totalMoney+500);
});
test('monthly interest reverses input order and updates all earned/card totals',()=>{
  configureKonekSeed(seed);
  const entries=['100 23','23 100'].map(text=>planEntry({action:'testMonthlyInterest',text},now));
  for(const entry of entries) {
    assert.equal(entry.records[0].amount,77);
    const rows=entry.records.map(r=>r.source_values.map((v,i)=>i<2?sourceDate(v):v));
    const before=computeTestDashboardFromRows_([],seed.reset_at);
    const after=computeTestDashboardFromRows_(rows,seed.reset_at);
    for(const field of ['card','totalMoney','totalEarned','thisWeekEarned'])assert.equal(after[field]-before[field],77,field);
  }
  assert.equal(planEntry({action:'testMonthlyInterest',text:'100 0'},now).receipt.amount,100);
  assert.throws(()=>planEntry({action:'testMonthlyInterest',text:'-1 100'},now),/nonnegative/);
});
test('source balance checks allow GCash-to-Card debt and refuse oversized releases',()=>{
  const params={action:'testTransfer',text:'600',direction:'gcashToCard'};
  assert.doesNotThrow(()=>checkKonekEntry(planEntry(params,now),params,{gcash:20,card:500}));
  const release={action:'testHoldMoney',amount:600,holdAction:'release'};
  assert.throws(()=>checkKonekEntry(planEntry(release,now),release,{heldMoney:100}),/greater/);
  const repayment={action:'testOthersLoan',text:'600',loanAction:'minus'};
  assert.throws(()=>checkKonekEntry(planEntry(repayment,now),repayment,{card:1000,othersLoan:100}),/greater/);
});
test('collection destinations and transfers preserve the expected money movement',()=>{
  configureKonekSeed(seed);
  const before=computeTestDashboardFromRows_([],seed.reset_at);
  const run=params=>{
    const entry=planEntry(params,now);
    return computeTestDashboardFromRows_(entry.records.map(r=>r.source_values.map((v,i)=>i<2?sourceDate(v):v)),seed.reset_at);
  };
  for(const destination of ['cash','gcash']) {
    const after=run({action:'testAapCollection',text:'1 100',destination});
    assert.equal(after.card-before.card,-97);
    assert.equal(after[destination==='cash'?'cashOnHand':'gcash']-before[destination==='cash'?'cashOnHand':'gcash'],100);
    assert.equal(after.totalMoney-before.totalMoney,3);
    assert.equal(after.totalEarned-before.totalEarned,3);
  }
  for(const [direction,from,to] of [['cashToGcash','cashOnHand','gcash'],['gcashToCard','gcash','card'],['cardToGcash','card','gcash'],['gcashToCash','gcash','cashOnHand']]) {
    const after=run({action:'testTransfer',text:'10',direction});
    assert.equal(after[from]-before[from],-10,direction);
    assert.equal(after[to]-before[to],10,direction);
    assert.equal(after.totalMoney,before.totalMoney,direction);
  }
  const atm=run({action:'testAtmWithdraw',amount:1000});
  assert.equal(atm.card-before.card,-1000);assert.equal(atm.cashOnHand-before.cashOnHand,1000);
  const loan=run({action:'testLoan',amount:415,rebate:50});
  assert.equal(loan.card-before.card,-365);assert.equal(loan.totalMoney-before.totalMoney,-365);
  const borrowed=run({action:'testOthersLoan',text:'100 5 Test',loanAction:'add'});
  assert.equal(borrowed.card-before.card,95);assert.equal(borrowed.othersLoan-before.othersLoan,100);
});
test('all seven tabs preserve their original sheet values',()=>{
  const cases=[
    {action:'lifeLogAdd',category:'Car',description:'Car wash'},
    {action:'expense',text:'100 gas cash'},
    {action:'rentalAdd',text:'1200 event',category:'Chair & Table',entryType:'income'},
    {action:'twiceAdd',text:'200 sale',category:'income'},
    {action:'printingAdd',text:'50 print',category:'income'},
    {action:'gcashQuickAdd',category:'gcash',amount:10},
    {action:'testCashOut',text:'Ana 2000'}
  ];
  const entries=cases.map(params=>planEntry(params,now));
  assert.equal(new Set(entries.map(e=>e.tab)).size,7);
  assert.ok(entries.every(e=>e.records.every(r=>r.occurred_at===now.toISOString())));
});
test('GCash category history filters the selected Manila month before pagination',async()=>{
 const records=[10,9,8,7].flatMap(month=>Array.from({length:12},(_,i)=>({
   ...planEntry({action:'gcashQuickAdd',category:'gcash',amount:month},new ManilaDate(2026,month-1,4,12,i)).records[0],
   id:`month-${month}-${i}`,revision:1
 })));
 const api=new CashflowReadApi({load:async()=>records});
 for(const month of [9,8,7]) {
   const first=await api.request({action:'gcashTransactions',category:'gcash',year:2026,month,limit:10});
   assert.equal(first.transactions.length,10);
   assert.ok(first.transactions.every(t=>t.rowNumber.startsWith(`month-${month}-`)));
   const next=await api.request({action:'gcashTransactions',category:'gcash',year:2026,month,cursor:first.nextCursor,limit:10});
   assert.equal(next.transactions.length,2);
   assert.equal(next.hasMore,false);
 }
});
