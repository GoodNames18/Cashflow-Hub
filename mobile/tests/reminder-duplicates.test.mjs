import test from 'node:test';
import assert from 'node:assert/strict';
import {reminderJobs} from '../reminders.mjs';
test('duplicate reminder days create one item while different reminders stay separate',()=>{
 const snapshot={cfh_calendar_entries_v1:JSON.stringify([
 {id:'a',title:'Chinabank Freedom Mastercard',date:'2026-10-22',time:'10:00',reminderDays:[0,0,0]},
 {id:'b',title:'RCBC JCB Platinum',date:'2026-10-22',time:'10:00',reminderDays:[0]}
 ]),cfh_calendar_bells_v1:JSON.stringify({eastwest:false,metrobank:false})};
 const jobs=reminderJobs(snapshot,new Date(2026,9,21));
 const job=jobs.find(j=>j.body.includes('Chinabank'));
 assert.equal(job.extra.cfhItems.length,2);
 assert.deepEqual(job.extra.cfhItems.map(n=>n.title),['Chinabank Freedom Mastercard','RCBC JCB Platinum']);
 assert.equal(job.body.split('Chinabank').length-1,1);
});
