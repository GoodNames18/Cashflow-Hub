import test from 'node:test';
import assert from 'node:assert/strict';
import {planEntry} from '../../supabase/cfh-entry-plan.mjs';
import {ManilaDate} from '../../supabase/manila-date.mjs';
import {computeTestDashboardFromRows_,configureKonekSeed} from '../../supabase/legacy-rules.mjs';

test('signed balance adjustments affect only their chosen balance and Total Money',()=>{
  configureKonekSeed({reset_at:'2026-09-20T16:00:00Z',bank_card:100,gcash:40,cash_on_hand:60,held_money:0,loan_remaining:500,others_loan:200,savings_included_in_total:0});
  const {records}=planEntry({action:'testBalanceAdjustment',adjustments:[
    {balance:'card',amount:20},{balance:'cash',amount:-10},{balance:'gcash',amount:5}
  ]},new ManilaDate('2026-10-18T12:00:00+08:00'));
  const rows=records.map(record=>record.source_values.map((value,index)=>index<2?new ManilaDate(value):value));
  const result=computeTestDashboardFromRows_(rows);
  assert.equal(result.card,120);
  assert.equal(result.cashOnHand,50);
  assert.equal(result.gcash,45);
  assert.equal(result.totalMoney,215);
  assert.equal(result.loanRemaining,500);
  assert.equal(result.othersLoan,200);
  assert.equal(result.totalEarned,0);
  assert.equal(result.thisWeekEarned,0);
});

test('balance adjustments reject zero, excess precision, duplicates and unknown balances',()=>{
  assert.throws(()=>planEntry({action:'testBalanceAdjustment',adjustments:[{balance:'card',amount:0}]}),/non-zero/);
  assert.throws(()=>planEntry({action:'testBalanceAdjustment',adjustments:[{balance:'card',amount:1.001}]}),/two decimal places/);
  assert.throws(()=>planEntry({action:'testBalanceAdjustment',adjustments:[{balance:'cash',amount:1},{balance:'cash',amount:-1}]}),/valid balance/);
  assert.throws(()=>planEntry({action:'testBalanceAdjustment',adjustments:[{balance:'loanRemaining',amount:1}]}),/valid balance/);
});


test('earned adjustments increase Card, Total Money, Total Earned and This Week Earned',()=>{
  configureKonekSeed({reset_at:'2026-09-20T16:00:00Z',bank_card:100,gcash:40,cash_on_hand:60,held_money:0,loan_remaining:500,others_loan:200,savings_included_in_total:0});
  const {records,receipt}=planEntry({action:'testEarnedAdjustment',amount:25.5},new ManilaDate('2026-10-18T12:00:00+08:00'));
  const rows=records.map(record=>record.source_values.map((value,index)=>index<2?new ManilaDate(value):value));
  const result=computeTestDashboardFromRows_(rows);
  assert.equal(receipt.amount,25.5);
  assert.equal(result.card,125.5);
  assert.equal(result.totalMoney,225.5);
  assert.equal(result.totalEarned,25.5);
  assert.equal(result.thisWeekEarned,25.5);
  assert.equal(result.cashOnHand,60);
  assert.equal(result.gcash,40);
});

test('earned adjustments require a positive amount with at most two decimal places',()=>{
  for (const amount of [0,-1,1.001])
    assert.throws(()=>planEntry({action:'testEarnedAdjustment',amount}),/positive amount/);
});

test('custom adjustment details preserve balance routing and the complete sheet row',()=>{
 configureKonekSeed({reset_at:'2026-09-20T16:00:00Z',bank_card:100,gcash:40,cash_on_hand:60,held_money:0,loan_remaining:500,others_loan:200,savings_included_in_total:0});
 const {records}=planEntry({action:'testBalanceAdjustment',adjustments:[{balance:'cash',amount:-10,description:' corrected cash count '},{balance:'card',amount:20,description:'Bank reconciliation'},{balance:'gcash',amount:5,description:'Wallet count'}]},new ManilaDate('2026-10-18T12:00:00+08:00'));
 assert.equal(records[0].description,'Money on Hand adjustment — corrected cash count');assert.equal(records[0].source_values[6],records[0].description);
 const rows=records.map(r=>r.source_values.map((v,i)=>i<2?new ManilaDate(v):v));const result=computeTestDashboardFromRows_(rows);
 assert.equal(result.cashOnHand,50);assert.equal(result.card,120);assert.equal(result.gcash,45);assert.equal(result.totalMoney,215);assert.equal(result.totalEarned,0);
 const earned=planEntry({action:'testEarnedAdjustment',amount:25.5,description:'Fee correction'},new ManilaDate('2026-10-18T12:00:00+08:00'));
 const all=[...rows,...earned.records.map(r=>r.source_values.map((v,i)=>i<2?new ManilaDate(v):v))];const updated=computeTestDashboardFromRows_(all);
 assert.equal(updated.card,145.5);assert.equal(updated.totalEarned,25.5);assert.equal(updated.thisWeekEarned,25.5);assert.equal(earned.records[0].source_values[6],'Earned adjustment — Fee correction');
});
test('adjustment details reject overlong and multiline descriptions',()=>{
 for(const description of ['x'.repeat(201),'first\nsecond']){assert.throws(()=>planEntry({action:'testBalanceAdjustment',adjustments:[{balance:'cash',amount:1,description}]}),/200 characters/);assert.throws(()=>planEntry({action:'testEarnedAdjustment',amount:1,description}),/200 characters/);}
});
