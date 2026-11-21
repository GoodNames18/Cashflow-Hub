import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createNotificationReader} from '../../supabase/functions/cfh-push/kernel.ts';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function fixture(){let prefs={},seq=0;const ctx=vm.createContext({Date,Number,Math,JSON,Array,Error,crypto:{randomUUID:()=> 'payment-'+ ++seq},Event:class{},window:{dispatchEvent(){}},localStorage:{setItem:(k,v)=>{prefs=JSON.parse(v)}},alert:message=>{throw Error(message)},CFH_CARD_PANEL_KEY:'prefs',cfhCardPanelPreferences:()=>structuredClone(prefs),cfhScopedPrefs:bank=>prefs[bank]||{},cfhCardKey:e=>e.bank,cfhEntryCycle:e=>e.cycle,cfhCalendarRender(){},cfhCalendarTodayKey:()=> '2026-11-21',cfhEastwestValidDate:key=>/^\d{4}-\d{2}-\d{2}$/.test(key)&&new Date(key+'T12:00Z').toISOString().slice(0,10)===key});
 vm.runInContext(html.slice(html.indexOf('function cfhFixedDueDate('),html.indexOf('function cfhCardStatementDate(')),ctx);
 vm.runInContext(html.slice(html.indexOf('function cfhCardBill('),html.indexOf('function cfhCalendarForDate(')),ctx);
 return {ctx,get prefs(){return prefs},set prefs(v){prefs=v}};}
test('fixed due day follows the statement, clamps short months and supports clearing',()=>{
 const {ctx}=fixture();const key=date=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
 assert.equal(key(ctx.cfhFixedDueDate('2026-11-18',8)),'2026-12-08');assert.equal(key(ctx.cfhFixedDueDate('2026-11-05',20)),'2026-11-20');assert.equal(key(ctx.cfhFixedDueDate('2026-12-31',8)),'2027-01-08');assert.equal(key(ctx.cfhFixedDueDate('2027-02-15',31)),'2027-02-28');assert.equal(key(ctx.cfhFixedDueDate('2028-02-15',31)),'2028-02-29');
});
test('payments preserve the original amount, isolate cycles, and resume reminders when removed',()=>{
 const f=fixture(),c=f.ctx,entry={bank:'a',cycle:'2026-11',id:'a|2026-11|due',type:'due'},other={...entry,cycle:'2026-12'};c.cfhSaveCardBill(entry,{amount:5000});c.cfhSaveCardBill(other,{amount:8000});c.cfhAddBillPayment(entry,'2,000','2026-11-20');assert.equal(c.cfhCardBill(entry).amount,5000);assert.equal(c.cfhBillPaymentSummary(c.cfhCardBill(entry)).remaining,3000);assert.equal(c.cfhIsPaidDue(entry),false);assert.equal(c.cfhCardBill(other).amount,8000);assert.equal(c.cfhCardBill(other).payments,undefined);
 c.cfhAddBillPayment(entry,'3000','2026-11-21');assert.equal(c.cfhBillPaymentSummary(c.cfhCardBill(entry)).remaining,0);assert.equal(c.cfhIsPaidDue(entry),true);const id=c.cfhCardBill(entry).payments[1].id;c.cfhRemoveBillPayment(entry,id);assert.equal(c.cfhIsPaidDue(entry),false);assert.equal(c.cfhBillPaymentSummary(c.cfhCardBill(entry)).remaining,3000);assert.equal(c.cfhCardBill(entry).amount,5000);
 const restored=fixture();restored.prefs=JSON.parse(JSON.stringify(f.prefs));assert.equal(restored.ctx.cfhBillPaymentSummary(restored.ctx.cfhCardBill(entry)).remaining,3000);
});
test('payment validation, cents and overpayment do not alter Total Due',()=>{
 const {ctx:c}=fixture(),entry={bank:'a',cycle:'2026-11',id:'a|due',type:'due'};assert.throws(()=>c.cfhAddBillPayment(entry,'1','2026-11-20'),/Total Due/);c.cfhSaveCardBill(entry,{amount:1});for(const value of ['0','-1','1.001','NaN'])assert.throws(()=>c.cfhAddBillPayment(entry,value,'2026-11-20'),/positive/);assert.throws(()=>c.cfhAddBillPayment(entry,'1','2026-11-22'),/date/);assert.throws(()=>c.cfhAddBillPayment(entry,'1','2026-02-30'),/date/);
 c.cfhAddBillPayment(entry,'.10','2026-11-20');c.cfhAddBillPayment(entry,'0.20','2026-11-20');assert.equal(c.cfhBillPaymentSummary(c.cfhCardBill(entry)).paid,.3);c.cfhAddBillPayment(entry,'1','2026-11-21');const totals=c.cfhBillPaymentSummary(c.cfhCardBill(entry));assert.equal(totals.remaining,0);assert.equal(totals.credit,.3);assert.equal(c.cfhCardBill(entry).amount,1);
});
test('notification and external-calendar reader use fixed days and remaining balance',()=>{
 const card={sourceBank:'metrobank',bankName:'Test',cardName:'Card',statementDay:18,dueDays:21,fixedDueDay:8,start:'2026-01-01',end:'2028-12-31',notificationTime:'09:00',remindersEnabled:true,bills:{'2026-11':{amount:5000,paid:false,payments:[{id:'p',date:'2026-11-20',amount:2000}]}}};
 const prefs={metrobank:{start:'2000-01-01',end:'2000-01-02'},eastwest:{start:'2000-01-01',end:'2000-01-02'},'duplicate-card':card};const read=()=>createNotificationReader({cfh_card_panel_preferences_v1:JSON.stringify(prefs)});
 assert.equal(read()('2026-12-08','export')[0].amount,3000);assert.equal(read()('2026-12-09','export').length,0);card.bills['2026-11'].payments.push({id:'p2',date:'2026-11-21',amount:3000});assert.equal(read()('2026-12-08','export').length,0);assert.equal(read()('2026-12-08').length,0);
});

test('fixed due day respects weekend shifts, edit scope, explicit overrides and Atome',()=>{
 const card={sourceBank:'metrobank',bankName:'Test',cardName:'Card',statementDay:18,dueDays:21,fixedDueDay:6,start:'2026-01-01',end:'2028-12-31',notificationTime:'09:00'};
 const prefs={metrobank:{start:'2000-01-01',end:'2000-01-02'},eastwest:{start:'2000-01-01',end:'2000-01-02'},'duplicate-card':card};const read=()=>createNotificationReader({cfh_card_panel_preferences_v1:JSON.stringify(prefs)});
 assert.equal(read()('2026-12-06','export').length,0);assert.equal(read()('2026-12-07','export').length,1);
 card.fixedDueDay=null;card.scopedEdits=[{scope:'future',cycle:'2026-12',patch:{fixedDueDay:8}}];assert.equal(read()('2026-12-09','export').length,1);assert.equal(read()('2027-01-08','export').length,1);
 card.fixedDueDay=8;card.scopedEdits=[];card.confirmedCycles={'2026-11':{due:'2026-12-15'}};assert.equal(read()('2026-12-15','export').length,1);assert.equal(read()('2026-12-08','export').length,0);
 card.bankName='Atome';card.confirmedCycles={};assert.equal(read()('2026-12-03','export').length,1);assert.equal(read()('2026-12-08','export').length,0);
});
