import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cashTotal,normalizeCounts,manilaDay,nextMidnightDelay,restoreDailyCount} from '../../supabase/cfh-cash-counter.mjs';
test('cash counter totals the reference denominations without a finance transaction',()=>{
 assert.equal(cashTotal({1000:7,500:25,100:33,50:26}),24100);
 assert.equal(cashTotal({1000:1,500:2,200:3,100:4,50:5,20:6,10:7,5:8,1:9}),3489);
});
test('cash quantities reject corrupt storage, negative counts and fractions',()=>{
 assert.equal(cashTotal(null),0);
 assert.deepEqual(normalizeCounts({1000:-2,500:1.5,200:'4',100:Infinity,50:1000000}),normalizeCounts(null));
 assert.equal(cashTotal({1:999999}),999999);
});

test('cash counter resets at Philippine midnight regardless of device timezone',()=>{
 const before=Date.parse('2026-11-21T15:59:59Z'),after=before+1000;
 assert.equal(manilaDay(before),'2026-11-21');assert.equal(manilaDay(after),'2026-11-22');
 assert.equal(nextMidnightDelay(before),1000);assert.equal(nextMidnightDelay(after),86400000);
 const saved={date:manilaDay(before),counts:{1000:7,500:25}};
 assert.equal(cashTotal(restoreDailyCount(saved,before).counts),19500);
 assert.equal(cashTotal(restoreDailyCount(saved,after).counts),0);
 assert.equal(cashTotal(restoreDailyCount(saved,after+86400000*3).counts),0);
 assert.equal(cashTotal(restoreDailyCount({1000:7},before).counts),7000);
});
