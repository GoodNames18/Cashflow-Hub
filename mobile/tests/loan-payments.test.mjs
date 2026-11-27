import test from 'node:test';import assert from 'node:assert/strict';
import {planEntry} from '../../supabase/cfh-entry-plan.mjs';
import {validateLoanPayment,loanPaymentParts} from '../../supabase/cfh-loan.mjs';
import {checkKonekEntry} from '../../supabase/cfh-financial-checks.mjs';
import {computeTestDashboardFromRows_,configureKonekSeed,filterTestTransactionsFromRows_} from '../../supabase/legacy-rules.mjs';
import {buildTransactionEdit,editableTransactionFields} from '../../supabase/cfh-transaction-edit.mjs';
import {CashflowReadApi} from '../../supabase/cfh-read-api.mjs';
import {CashflowWriteApi} from '../../supabase/cfh-write-api.mjs';
import {ManilaDate} from '../../supabase/manila-date.mjs?v=calendar3';
const date=new ManilaDate('2026-11-27T12:29:00+08:00');
const seed={reset_at:'2026-09-20T16:00:00Z',bank_card:1227.71,gcash:0,cash_on_hand:0,held_money:750,loan_remaining:3906.93,others_loan:0,savings_included_in_total:0};
const payment=params=>planEntry({action:'testLoan',loanVersion:2,amount:415,rebate:50,...params},date);
const rows=records=>records.map(r=>r.source_values.map((v,i)=>i<2?new ManilaDate(v):v));
const calculate=records=>{configureKonekSeed(seed);return computeTestDashboardFromRows_(rows(records),undefined,date);};
test('415 payment and 50 pledge credit match current and available bank balances without guessing principal',()=>{
 const {records,receipt}=payment();assert.equal(records.length,1);assert.equal(records[0].amount,365);assert.equal(records[0].source_values[3],365);assert.equal(receipt.payment,415);assert.equal(receipt.netDeduction,365);assert.equal(receipt.principal,0);assert.equal(loanPaymentParts(records[0].description).rebate,50);
 const result=calculate(records);assert.equal(result.card,112.71);assert.equal(result.card+result.heldMoney,862.71);assert.equal(result.heldMoney,750);assert.equal(result.loanRemaining,3906.93);assert.equal(result.totalEarned,0);assert.equal(result.thisWeekEarned,0);
});
test('zero and blank credits support payments without a rebate and exact centavos',()=>{
 for(const rebate of [0,'0','',undefined]){const plan=payment({amount:'597',rebate});assert.equal(plan.records.length,1);assert.equal(plan.receipt.rebate,0);assert.equal(plan.records[0].amount,597);assert.equal(calculate(plan.records).card,-119.29);}
 const plan=payment({amount:'1,032.29',rebate:'50.10'});assert.equal(plan.records[0].amount,982.19);
});
test('confirmed remaining balance and principal are separate from the card debit',()=>{
 const p=payment({remainingAfter:'3,506.93',loanBefore:'3,906.93'});assert.equal(p.receipt.principal,400);assert.equal(calculate(p.records).loanRemaining,3506.93);assert.equal(calculate(p.records).card,112.71);checkKonekEntry(p,{action:'testLoan'},{loanRemaining:3906.93});assert.throws(()=>checkKonekEntry(p,{action:'testLoan'},{loanRemaining:3800}),/changed/);
 assert.equal(calculate(payment({principal:400}).records).loanRemaining,3506.93);assert.equal(calculate(payment({principal:0}).records).loanRemaining,3906.93);
});
test('invalid, excessive, conflicting and stale loan reductions are rejected',()=>{
 for(const amount of [0,-1,Infinity,'abc','1.001'])assert.throws(()=>payment({amount}));for(const rebate of [-1,415,416,'1.001'])assert.throws(()=>payment({rebate}));
 assert.throws(()=>payment({principal:416}),/exceed/);assert.throws(()=>payment({remainingAfter:3506.93,loanBefore:3906.93,principal:400}),/either/);assert.throws(()=>payment({remainingAfter:4000,loanBefore:3906.93}),/higher/);assert.throws(()=>payment({remainingAfter:0}),/current loan/);assert.throws(()=>payment({remainingAfter:3000,loanBefore:3906.93}),/exceed/);
});
test('editing gross payment, pledge credit and principal keeps one net debit and complete source details',()=>{
 const original=payment({principal:400}).records[0];const fields=editableTransactionFields(original);assert.equal(fields.find(f=>f.key==='amount').value,415);assert.equal(fields.find(f=>f.key==='pledgeCredit').value,50);assert.equal(fields.find(f=>f.key==='details').value,'');
 const edit=buildTransactionEdit(original,{amount:'600',pledgeCredit:'0',principalPaid:'300',details:'November payment'});assert.equal(edit.amount,600);assert.equal(edit.source_values[3],600);assert.equal(edit.source_values[6],edit.description);assert.match(edit.description,/Payment 600.00; Pledge credit 0.00/);assert.match(edit.description,/November payment/);const result=calculate([{...original,...edit}]);assert.equal(result.card,-122.29);assert.equal(result.loanRemaining,3606.93);
 assert.throws(()=>buildTransactionEdit(original,{amount:'300'}),/exceed/);assert.throws(()=>buildTransactionEdit(original,{pledgeCredit:'500'}),/less/);assert.throws(()=>buildTransactionEdit(original,{feeEarned:'10'}),/fee/);assert.throws(()=>buildTransactionEdit(original,{category:'Income'}),/expenses/);
 const cleared=buildTransactionEdit(original,{principalPaid:''});assert.equal(calculate([{...original,...cleared}]).loanRemaining,3906.93);assert.equal(calculate([{...original,...cleared}]).card,112.71);
});
test('deleting and restoring a single loan entry removes and restores payment plus credit together',async()=>{
 const record={...payment({principal:400}).records[0],id:'loan-1',revision:1};let records=[record];const api=new CashflowReadApi({load:async()=>records},{},seed);
 const read=()=>api.request({action:'testDashboard',year:2026,month:11});let result=await read();assert.equal(result.card,112.71);assert.equal(result.loanRemaining,3506.93);records=[{...record,deleted_at:'2026-11-27T05:00Z'}];result=await read();assert.equal(result.card,477.71);assert.equal(result.loanRemaining,3906.93);records=[record];result=await read();assert.equal(result.card,112.71);assert.equal(result.loanRemaining,3506.93);
});
test('existing two-row payments still calculate once; Loan Remaining history includes added loans',()=>{
 const old=planEntry({action:'testLoan',amount:415,rebate:50,principal:400},date);assert.equal(old.records.length,2);assert.equal(calculate(old.records).card,112.71);assert.equal(calculate(old.records).loanRemaining,3506.93);
 const loan=planEntry({action:'testKonekLoanAdd',principal:1000,netToCard:900},date);const all=rows([...old.records,...loan.records]);configureKonekSeed(seed);const history=filterTestTransactionsFromRows_(all,'loan-remaining');assert(history.some(r=>r.description.startsWith('Konek2Card Loan Add')));
});
test('an uncertain save retry reuses one prepared loan entry instead of duplicating payment or credit',async()=>{
 const saved=new Map();let first=true,prepared=0;const store={prepare:r=>({id:'loan-request-'+ ++prepared,record:r}),save:async p=>{saved.set(p.id,p.record);if(first){first=false;throw Error('Acknowledgement lost');}return p.record;}};
 const reads={snapshot:{load:async()=>[]},request:async()=>({loanRemaining:3906.93})};const api=new CashflowWriteApi(store,reads);const params={action:'testLoan',loanVersion:2,amount:415,rebate:50,principal:400};await assert.rejects(()=>api.request(params),/Acknowledgement/);await api.request(params);assert.equal(prepared,1);assert.equal(saved.size,1);assert.equal(calculate([...saved.values()]).card,112.71);
});
