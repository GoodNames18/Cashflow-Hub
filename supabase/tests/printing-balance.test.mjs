import test from 'node:test';
import assert from 'node:assert/strict';
import { CashflowReadApi } from '../cfh-read-api.mjs';

test('Printing balance follows income, expenses, edits, deletes and restores across months', async () => {
  const make = (id, date, amount, category) => ({id, revision:1, tab_key:'printing', source_values:[date+'T00:00:00+08:00','08:00',amount,category,'Test']});
  let rows = [make('old-income','2026-09-01',100,'Income'),make('old-expense','2026-09-02',150,'Expense')];
  const api = new CashflowReadApi({load:async()=>rows},{'Printing Business':{H4:-999}});
  const read = () => api.request({action:'printingDashboard',year:2026,month:10});
  assert.equal((await read()).totalMoney,-50);
  rows.push(make('new-income','2026-10-07',10,'Income'));
  assert.equal((await read()).totalMoney,-40);
  assert.equal((await read()).income,10);
  rows.push(make('new-expense','2026-10-07',5,'Expense'));
  assert.equal((await read()).totalMoney,-45);
  rows[2].source_values[2]=20;
  assert.equal((await read()).totalMoney,-35);
  rows[2].deleted_at='2026-10-07';
  assert.equal((await read()).totalMoney,-55);
  rows[2].deleted_at=null;
  assert.equal((await read()).totalMoney,-35);
});
