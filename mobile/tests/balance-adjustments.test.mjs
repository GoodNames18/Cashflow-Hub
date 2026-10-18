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
