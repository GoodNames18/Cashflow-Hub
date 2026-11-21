import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cashTotal,normalizeCounts} from '../../supabase/cfh-cash-counter.mjs';
test('cash counter totals the reference denominations without a finance transaction',()=>{
 assert.equal(cashTotal({1000:7,500:25,100:33,50:26}),24100);
 assert.equal(cashTotal({1000:1,500:2,200:3,100:4,50:5,20:6,10:7,5:8,1:9}),3489);
});
test('cash quantities reject corrupt storage, negative counts and fractions',()=>{
 assert.equal(cashTotal(null),0);
 assert.deepEqual(normalizeCounts({1000:-2,500:1.5,200:'4',100:Infinity,50:1000000}),normalizeCounts(null));
 assert.equal(cashTotal({1:999999}),999999);
});
