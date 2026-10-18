import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTransactionEdit,editableTransactionFields} from '../../supabase/cfh-transaction-edit.mjs';

test('edit fields are sourced from the matching Konek2Card record',()=>{
  const record={
    id:'00000000-0000-4000-8000-000000000001',revision:2,tab_key:'konek2card',
    occurred_at:'2026-10-16T10:30:00.000Z',amount:100,category:'Income',description:'Cash-out',
    payload:{sheet:'Konek2Card',customer:'Annie',fee_earned:5},
    source_values:['2026-10-16T10:30:00.000Z','2026-10-16T10:30:00.000Z','Annie',100,5,'Income','Cash-out','preserve']
  };
  const fields=editableTransactionFields(record);
  assert.deepEqual(fields.map(field=>field.key),['date','time','customer','amount','feeEarned','category','description']);
  assert.equal(fields.find(field=>field.key==='customer').value,'Annie');
});

test('edit updates mapped source columns and keeps unrelated Konek2Card columns',()=>{
  const record={
    tab_key:'konek2card',occurred_at:'2026-10-16T10:30:00.000Z',amount:100,
    category:'Income',description:'Cash-out',payload:{sheet:'Konek2Card',customer:'Annie',fee_earned:5},
    source_values:['old-date','old-time','Annie',100,5,'Income','Cash-out','original-note']
  };
  const edit=buildTransactionEdit(record,{
    date:'2026-10-17',time:'09:15',customer:'Annie D',amount:'160',feeEarned:'6',
    category:'Income',description:'Cash-out corrected'
  });
  assert.equal(edit.amount,160);
  assert.equal(edit.category,'Income');
  assert.equal(edit.description,'Cash-out corrected');
  assert.equal(edit.payload.customer,'Annie D');
  assert.equal(edit.payload.fee_earned,6);
  assert.equal(edit.source_values[2],'Annie D');
  assert.equal(edit.source_values[3],160);
  assert.equal(edit.source_values[4],6);
  assert.equal(edit.source_values[6],'Cash-out corrected');
  assert.equal(edit.source_values[7],'original-note');
  assert.equal(edit.occurred_at,'2026-10-17T01:15:00.000Z');
  assert.equal(edit.source_values[0],edit.occurred_at);
  assert.equal(edit.source_values[1],edit.occurred_at);
});

test('Money Flow edit keeps merchant, description, category, amount, and payment aligned',()=>{
  const record={
    tab_key:'money_flow',occurred_at:'2026-10-16T10:30:00.000Z',amount:40,category:'Expense',
    description:'Lunch',payload:{sheet:'Money Flow',merchant:'Cafe',payment_method:'Cash',entry:'original'},
    source_values:['date','time','Cafe','Lunch','Expense',40,'Cash','original']
  };
  const edit=buildTransactionEdit(record,{
    date:'2026-10-16',time:'18:30',merchant:'New Cafe',description:'Dinner',
    category:'Expense',amount:'125.50',payment:'GCash'
  });
  assert.equal(edit.amount,125.5);
  assert.equal(edit.payload.merchant,'New Cafe');
  assert.equal(edit.payload.payment_method,'GCash');
  assert.equal(edit.source_values[2],'New Cafe');
  assert.equal(edit.source_values[3],'Dinner');
  assert.equal(edit.source_values[4],'Expense');
  assert.equal(edit.source_values[6],'GCash');
});

test('edit rejects invalid values and unrecognized transaction tabs',()=>{
  const record={tab_key:'konek2card',occurred_at:'2026-10-16T10:30:00.000Z',amount:100,
    category:'Income',description:'Cash-out',payload:{},source_values:[]};
  assert.throws(()=>buildTransactionEdit(record,{amount:'0'}),/valid amount/);
  assert.throws(()=>buildTransactionEdit(record,{amount:'2.345'}),/valid amount/);
  assert.throws(()=>buildTransactionEdit(record,{date:'2026-02-30'}),/valid date/);
  assert.throws(()=>editableTransactionFields({tab_key:'unknown'}),/cannot be edited/);
});

test('editing another field preserves original source date, time, and formatted category',()=>{
  const record={
    tab_key:'cash_in_out',occurred_at:'2026-10-16T04:00:00.000Z',amount:80,
    category:'Maya',description:'Income',payload:{sheet:'Cash In/Out'},
    source_values:['2026-10-15T16:00:00.000Z','2026-10-16T04:00:00.000Z',80,'     Maya','Income']
  };
  const fields=editableTransactionFields(record);
  const values=Object.fromEntries(fields.map(field=>[field.key,String(field.value)]));
  values.description='Corrected note';
  const edit=buildTransactionEdit(record,values);
  assert.equal(edit.source_values[0],record.source_values[0]);
  assert.equal(edit.source_values[1],record.source_values[1]);
  assert.equal(edit.source_values[3],'     Maya');
  assert.equal(edit.description,'Corrected note');
});
