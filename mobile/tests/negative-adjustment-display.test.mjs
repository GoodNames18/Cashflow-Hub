import test from 'node:test';import assert from 'node:assert/strict';
import {planEntry} from '../../supabase/cfh-entry-plan.mjs';import {ManilaDate} from '../../supabase/manila-date.mjs';import {filterTestTransactionsFromRows_,configureKonekSeed,computeTestDashboardFromRows_} from '../../supabase/legacy-rules.mjs';
const seed={reset_at:'2026-09-20T16:00:00Z',bank_card:1000,gcash:1000,cash_on_hand:1000,held_money:0,loan_remaining:0,others_loan:0,savings_included_in_total:0};
test('negative and positive balance adjustments have correct list signs in transaction histories without changing totals',()=>{
 for(const balance of ['card','cash','gcash'])for(const amount of [-430,430]){
  configureKonekSeed(seed);const {records}=planEntry({action:'testBalanceAdjustment',adjustments:[{balance,amount,description:'Count correction'}]},new ManilaDate('2026-11-19T10:05:00+08:00'));
  const rows=records.map(r=>r.source_values.map((v,i)=>i<2?new ManilaDate(v):v));
  for(const filter of (balance==='cash'?['total-money']:[balance,'total-money'])){const items=filterTestTransactionsFromRows_(rows,filter);assert.equal(items.length,1);assert.equal(items[0].amount,430);assert.equal(items[0].isExpense,amount<0);assert.equal(items[0].category,'Balance Adjustment');}
  assert.equal(records[0].amount,amount);const totals=computeTestDashboardFromRows_(rows);assert.equal(totals[balance==='cash'?'cashOnHand':balance],1000+amount);assert.equal(totals.totalMoney,3000+amount);
 }
});
