import {test} from 'node:test';import assert from 'node:assert/strict';
import {reminderDelta} from '../reconcile-reminders.mjs';
const job=(id,at,body='Reminder')=>({id,title:'Task',body,schedule:{at:new Date(at)}});
test('unchanged reminders stay registered, edits replace only the affected alarm',()=>{
 const jobs=[job(1,2000),job(2,3000)];const initial=reminderDelta(jobs,[],{},false,1000);
 assert.equal(initial.schedule.length,2);
 const same=reminderDelta(jobs,jobs,initial.next,false,1000);assert.equal(same.schedule.length,0);assert.equal(same.cancel.length,0);
 const edited=reminderDelta([job(1,2000,'Edited'),job(2,3000)],jobs,initial.next,false,1000);assert.deepEqual(edited.schedule.map(j=>j.id),[1]);
 const mode=reminderDelta(jobs,jobs,initial.next,true,1000);assert.equal(mode.schedule.length,2);
});
test('deleted future reminders cancel; delayed past alarms and test reminders survive refresh',()=>{
 const jobs=[job(1,500),job(2,3000),job(2147483647,4000)];const previous=reminderDelta(jobs,[],{},false,0).next;
 const delta=reminderDelta([],jobs,previous,false,1000);assert.deepEqual(delta.cancel.map(j=>j.id),[2]);
});

test('an existing combined alarm is refreshed for separate cards and later item edits',()=>{
 const now=Date.now(),at=new Date(now+60000),old={id:1,title:'Cashflow Hub · 2 reminders',body:'A\nB',schedule:{at}};
 const legacy={1:{at:at.getTime(),signature:JSON.stringify([old.title,old.body,at.toISOString(),'alarm-clock'])}};
 const next={...old,extra:{page:'calendar',cfhItems:[{id:-1,title:'A',body:'A'},{id:-2,title:'B',body:'B'}]}};
 const delta=reminderDelta([next],[{id:1}],legacy,'alarm-clock',now);
 assert.equal(delta.schedule.length,1);
 assert.equal(reminderDelta([next],[{id:1}],delta.next,'alarm-clock',now).schedule.length,0);
 const edited={...next,extra:{...next.extra,cfhItems:next.extra.cfhItems.map(item=>({...item,title:item.title+' edited'}))}};
 assert.equal(reminderDelta([edited],[{id:1}],delta.next,'alarm-clock',now).schedule.length,1);
});
