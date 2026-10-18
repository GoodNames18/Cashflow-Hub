import test from 'node:test';
import assert from 'node:assert/strict';
import {getTestFeeEarned_} from '../../supabase/legacy-rules.mjs';

test('Konek2Card cash-out accepts arbitrary amounts from ₱100 through ₱10,000',()=>{
  for(const amount of [100,124,1230,6573,8345,10000])
    assert.doesNotThrow(()=>getTestFeeEarned_(amount),String(amount));
});

test('Konek2Card cash-out rejects values outside the allowed range',()=>{
  assert.throws(()=>getTestFeeEarned_(99),/Minimum cash-out is ₱100/);
  assert.throws(()=>getTestFeeEarned_(10001),/Maximum cash-out is ₱10,000/);
});
