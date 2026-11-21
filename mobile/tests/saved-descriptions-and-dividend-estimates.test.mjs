import test from 'node:test';import assert from 'node:assert/strict';
import {planEntry} from '../../supabase/cfh-entry-plan.mjs';
import {ManilaDate} from '../../supabase/manila-date.mjs';
import {buildTransactionEdit,editableTransactionFields} from '../../supabase/cfh-transaction-edit.mjs';
import {computeTestDashboardFromRows_,configureKonekSeed,filterTestTransactionsFromRows_} from '../../supabase/legacy-rules.mjs';
import {dividendBreakdown,expectedDividendNet,dividendNet,confirmDividendReceipt} from '../../supabase/cfh-dividend-receipts.mjs';
const when=new ManilaDate('2026-10-18T12:00:17+08:00');
const seed={reset_at:'2026-09-20T16:00:00Z',bank_card:10000,gcash:10000,cash_on_hand:10000,held_money:850,loan_remaining:5000,others_loan:2000,savings_included_in_total:0};
const row=r=>r.source_values.map((v,i)=>i<2?new ManilaDate(v):v);
test('adding, editing and clearing descriptions on saved transactions preserves every balance and original time',()=>{
 const cases=[{action:'testBalanceAdjustment',adjustments:[{balance:'cash',amount:-10,description:'old detail'}]},{action:'testEarnedAdjustment',amount:25.5,description:'old fee correction'},{action:'testCashOut',text:'100 Annie'},{action:'testTransfer',amount:100,direction:'cardToGcash'},{action:'testMonthlyInterest',text:'100 23'},{action:'testHoldMoney',amount:100,holdAction:'hold'},{action:'testOthersLoan',loanAction:'add',principal:500,fee:20,lender:'Annie'},{action:'testLoan',amount:100}];
 for(const params of cases){
  const {records}=planEntry(params,when);configureKonekSeed(seed);const baseline=computeTestDashboardFromRows_(records.map(row),undefined,new ManilaDate('2026-10-20T12:00:00+08:00'));
  let edited=records.map(record=>{const edit=buildTransactionEdit(record,{details:'GCash supply receipt'});assert.equal(edit.occurred_at,record.occurred_at);assert.equal(edit.amount,record.amount);assert.deepEqual(edit.source_values.slice(0,6),record.source_values.slice(0,6));assert.match(edit.source_values[6],/Details: GCash supply receipt/);return {...record,...edit};});
  const computed=computeTestDashboardFromRows_(edited.map(row),undefined,new ManilaDate('2026-10-20T12:00:00+08:00'));assert.deepEqual(computed,baseline,params.action);
  const field=editableTransactionFields(edited[0]).find(f=>f.key==='details');assert.equal(field.value,'GCash supply receipt');
  const again=buildTransactionEdit(edited[0],{details:'Updated receipt'});assert.equal(again.description.split('Details:').length,2);
  const cleared=buildTransactionEdit({...edited[0],...again},{details:''});assert(!cleared.description.includes('Details:'));assert.equal(cleared.occurred_at,edited[0].occurred_at);
 }
});
test('saved description validation and existing adjustment detail loading',()=>{
 const record=planEntry({action:'testBalanceAdjustment',adjustments:[{balance:'cash',amount:-5,description:'Counted cash'}]},when).records[0];
 assert.equal(editableTransactionFields(record).find(f=>f.key==='details').value,'Counted cash');
 assert.deepEqual(buildTransactionEdit(record,{details:'Counted cash'}).source_values,record.source_values);
 for(const details of ['x'.repeat(201),'one\ntwo'])assert.throws(()=>buildTransactionEdit(record,{details}),/Description/);
});
test('upcoming MREIT and other automatic dividends show tax and net before confirmation',()=>{
 const upcoming={id:'pse:mreit',kind:'dividend',asset:'stock',status:'upcoming',symbol:'MREIT',broker:'COL Financial',shares:100,perShare:.2762,tax:0,paymentDate:'2026-11-20',grossEstimate:true};
 assert.deepEqual(dividendBreakdown(upcoming),{gross:27.62,tax:2.76,net:24.86});assert.equal(expectedDividendNet(upcoming),24.86);assert.equal(dividendNet(upcoming),24.86);assert.equal(upcoming.tax,0);
 const other={...upcoming,symbol:'AREIT',perShare:1};assert.deepEqual(dividendBreakdown(other),{gross:100,tax:10,net:90});
 const custom={...upcoming,tax:3};assert.equal(dividendBreakdown(custom).net,24.62);
 const noTaxManual={...upcoming,grossEstimate:false};assert.equal(dividendBreakdown(noTaxManual).tax,0);
 const paid=confirmDividendReceipt(upcoming,{amount:'24.86',paidDate:'2026-11-20'},new Date('2026-11-21T10:00:00Z'));assert.equal(paid.tax,2.76);assert.equal(paid.varianceAmount,0);assert.equal(paid.receivedNetAmount,24.86);
 const overridden=confirmDividendReceipt(upcoming,{amount:'27.62',tax:'0',paidDate:'2026-11-20'},new Date('2026-11-21T10:00:00Z'));assert.equal(dividendBreakdown(overridden).tax,0);assert.equal(dividendNet(overridden),27.62);
});
