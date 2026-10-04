import test from 'node:test';
import assert from 'node:assert/strict';
import { planEntry } from '../cfh-entry-plan.mjs';
import { ManilaDate, sourceDate } from '../manila-date.mjs';
import { configureKonekSeed, computeTestDashboardFromRows_ } from '../legacy-rules.mjs';

const seed={reset_at:'2026-10-01T00:00:00+08:00',gcash:20,bank_card:5000,
  cash_on_hand:500,loan_remaining:0,others_loan:0,held_money:100,savings_included_in_total:0};
const now=new ManilaDate('2026-10-04T00:00:00Z');
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
