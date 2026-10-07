import test from 'node:test';
import assert from 'node:assert/strict';
import { CashflowReadApi } from '../cfh-read-api.mjs';

const record = (id,date,time,extra={}) => ({id,revision:1,tab_key:'money_flow',source_values:[date,time,'',id,'Other',10,'',''],...extra});
const installment = record('installment','2026-10-02T16:14:00+08:00','16:14',{created_at:'2026-10-07T16:14:00+08:00',payload:{installment_plan:'plan'},source_values:['2026-10-02T16:14:00+08:00','16:14','','Phone — Installment 1/36','Installment',3194.16,'','']});

test('backdated installment stays between transactions before and after its actual time',async()=>{
 const records=[installment,record('before','2026-10-02','15:00'),record('after','2026-10-02','17:00'),record('newer','2026-10-06','10:00')];
 const api=new CashflowReadApi({load:async()=>records});
 const dashboard=await api.request({action:'expenseDashboard',year:2026,month:10});
 assert.deepEqual(dashboard.recentTransactions.map(r=>r.rowNumber),['newer','after','installment','before']);
 assert.equal(dashboard.recentTransactions[2].date,'Oct 2');
 assert.equal(dashboard.monthlyExpenses,3224.16);
});

test('installments do not displace the ten newest transactions based on creation time',async()=>{
 const ordinary=Array.from({length:12},(_,i)=>record('ordinary-'+i,'2026-10-06','10:00'));
 const api=new CashflowReadApi({load:async()=>[...ordinary,installment]});
 const dashboard=await api.request({action:'expenseDashboard',year:2026,month:10});
 assert.equal(dashboard.recentTransactions.length,10);
 assert.ok(dashboard.recentTransactions.every(r=>r.rowNumber!=='installment'));
 assert.equal(dashboard.monthlyExpenses,3314.16);
});
