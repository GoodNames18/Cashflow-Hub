import test from 'node:test';import assert from 'node:assert/strict';
import {expectedDividendNet,dividendNet,latestDividends,dividendReceiptState,confirmDividendReceipt} from '../../supabase/cfh-dividend-receipts.mjs';
import {validateRecord} from '../../supabase/cfh-portfolio-model.mjs';
const now=new Date('2026-10-22T09:00:00Z');
const pending={id:'col-payment',kind:'dividend',asset:'stock',broker:'COL Financial',symbol:'AREIT',shares:100,perShare:1,tax:0,paymentDate:'2026-10-20',status:'upcoming',at:'2026-10-19T01:00:00Z'};
test('matching receipt preserves the schedule and estimate without mutating the pending record',()=>{
 const paid=confirmDividendReceipt(pending,{amount:'100.00',paidDate:'2026-10-20'},now);
 assert.equal(paid.expectedNetAmount,100);assert.equal(paid.receivedNetAmount,100);assert.equal(paid.varianceAmount,0);assert.equal(paid.paymentDate,'2026-10-20');assert.equal(paid.paidDate,'2026-10-20');assert.equal(paid.recordId,pending.id);assert.equal(pending.status,'upcoming');assert.equal(paid.verification,'user_confirmed');
 assert.deepEqual(validateRecord(JSON.parse(JSON.stringify(paid))),paid);
});
test('incorrect estimate keeps the actual amount separate and paid totals count it once',()=>{
 const paid={...confirmDividendReceipt(pending,{amount:'90.00',paidDate:'2026-10-21',reference:'  CREDIT-123  '},now),id:'receipt',at:now.toISOString()};
 assert.equal(expectedDividendNet(paid),100);assert.equal(dividendNet(paid),90);assert.equal(paid.varianceAmount,-10);assert.equal(paid.reference,'CREDIT-123');
 const other={...pending,id:'dragon-payment',broker:'DragonFi',shares:200};
 const all=latestDividends([pending,other,paid,paid]);assert.equal(all.length,2);
 assert.equal(all.filter(r=>r.status==='paid').reduce((n,r)=>n+dividendNet(r),0),90);
 assert.equal(all.find(r=>r.broker==='DragonFi').status,'upcoming');
});
test('larger receipts are retained and confirming an already paid record is rejected',()=>{
 const paid=confirmDividendReceipt(pending,{amount:'105.25',paidDate:'2026-10-22'},now);assert.equal(paid.varianceAmount,5.25);
 assert.throws(()=>confirmDividendReceipt(paid,{amount:'105.25',paidDate:'2026-10-22'},now),/already been confirmed/);
});
test('unconfirmed dividends remain pending after their payment date and dates use Manila',()=>{
 assert.equal(dividendReceiptState(pending,'2026-10-19'),'expected');assert.equal(dividendReceiptState(pending,'2026-10-20'),'due');assert.equal(dividendReceiptState(pending,'2026-10-22'),'overdue');assert.equal(pending.status,'upcoming');
 assert.doesNotThrow(()=>confirmDividendReceipt(pending,{amount:'100',paidDate:'2026-10-23'},new Date('2026-10-22T16:01:00Z')));
});
test('blank, zero, negative, imprecise and nonnumeric receipts and invalid/future dates are rejected',()=>{
 for(const amount of ['', ' ', '0', '-1', '90.001', 'NaN', '1e3', '1000000000001'])assert.throws(()=>confirmDividendReceipt(pending,{amount,paidDate:'2026-10-20'},now));
 for(const paidDate of ['2026-02-30','2026-10-23','invalid'])assert.throws(()=>confirmDividendReceipt(pending,{amount:'90',paidDate},now));
 assert.throws(()=>confirmDividendReceipt(pending,{amount:'90',paidDate:'2026-10-20',reference:'x'.repeat(121)},now));
});
test('equal timestamp updates converge on the confirmed receipt and old paid entries still work',()=>{
 const paid={...confirmDividendReceipt(pending,{amount:'90',paidDate:'2026-10-21'},now),id:'receipt',at:pending.at};
 for(const records of [[pending,paid],[paid,pending]])assert.equal(latestDividends(records)[0].receivedNetAmount,90);
 const legacy={...pending,status:'paid',tax:10};assert.equal(dividendNet(legacy),90);assert.equal(validateRecord(legacy),legacy);
 assert.throws(()=>validateRecord({...paid,varianceAmount:0}),/difference/);
 assert.throws(()=>validateRecord({...paid,status:'upcoming'}),/confirmed/);
});
