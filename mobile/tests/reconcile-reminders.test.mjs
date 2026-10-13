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
