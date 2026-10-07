import test from 'node:test';
import assert from 'node:assert/strict';
import { CashflowReadApi } from '../cfh-read-api.mjs';

test('new backdated installment appears among the first ten without changing its due date', async () => {
  const ordinary = Array.from({length:12}, (_,i) => ({id:`ordinary-${i}`,revision:1,tab_key:'money_flow',source_values:['2026-10-06T10:00:00+08:00','10:00','',`Expense ${i}`,'Other',10,'','']}));
  const installment = {id:'installment',revision:1,tab_key:'money_flow',created_at:'2026-10-07T16:14:00+08:00',payload:{installment_plan:'plan'},source_values:['2026-10-02T16:14:00+08:00','16:14','','Phone — Installment 1/36','Installment',3194.16,'','']};
  const api = new CashflowReadApi({load:async()=>[...ordinary,installment]});
  const dashboard=await api.request({action:'expenseDashboard',year:2026,month:10});
  assert.equal(dashboard.recentTransactions.length,10);
  assert.equal(dashboard.recentTransactions[0].rowNumber,'installment');
  assert.equal(dashboard.recentTransactions[0].date,'Oct 2');
  assert.equal(dashboard.monthlyExpenses,3314.16);
});
