import test from 'node:test';
import assert from 'node:assert/strict';
import {CashflowReadApi} from '../../supabase/cfh-read-api.mjs';

test('a cash exception changes only its cash deduction; the other identical cash-out and fees remain',async()=>{
 const entry=(id,stamp,exclude=false)=>({id,tab_key:'konek2card',occurred_at:stamp,revision:1,payload:{customer:'Annie',fee_earned:32,exclude_cash_on_hand:exclude},source_values:[stamp,stamp,'Annie',5000,32,'Income','Cash-out']});
 const earlier=entry('earlier','2026-10-13T02:59:35.340Z');
 const later=entry('later','2026-10-13T02:59:40.207Z');
 const records=[earlier,later];
 const seed={reset_at:'2026-10-01T00:00:00Z',bank_card:10000,gcash:100,cash_on_hand:20000,held_money:0,loan_remaining:0,others_loan:0,savings_included_in_total:0};
 const api=new CashflowReadApi({load:async()=>records},{},seed);
 const before=await api.request({action:'testDashboard'});
 later.payload.exclude_cash_on_hand=true;
 const note='Cash-out · Modified: ₱5,000 not deducted from Money on Hand';
 later.source_values[6]=note;
 const after=await api.request({action:'testDashboard'});
 assert.equal(after.cashOnHand-before.cashOnHand,5000);
 assert.equal(after.cashOnHand,15000);
 assert.equal(after.card,before.card);
 assert.equal(after.recentTransactions.find(row=>row.rowNumber==='later').description,note);
 assert.equal(after.totalEarned,before.totalEarned);
 assert.equal(after.totalMoney-before.totalMoney,5000);
 assert.equal(earlier.payload.exclude_cash_on_hand,false);
 later.payload.exclude_cash_on_hand=false;
 later.source_values[6]='Cash-out';
 assert.deepEqual(await api.request({action:'testDashboard'}),before);
});
