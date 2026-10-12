import test from 'node:test';
import assert from 'node:assert/strict';
import {reminderJobs} from '../reminders.mjs';
test('PM timing, same-time grouping, reminder days, bell disabled and horizon',()=>{
 const date='2026-10-14',now=new Date(2026,9,13,12,0);
 const snapshot={cfh_calendar_entries_v1:JSON.stringify([
  {id:'a',title:'Appointment',date,time:'21:00',repeat:'none',reminderDays:[0,1]},
  {id:'b',title:'Task',date,time:'21:00',repeat:'none',reminderDays:[0]},
  {id:'c',title:'Muted',date,time:'22:00',repeat:'daily',reminderDays:[0]}
 ]),cfh_calendar_bells_v1:JSON.stringify({c:false,eastwest:false,metrobank:false})};
 const jobs=reminderJobs(snapshot,now).filter(j=>j.body.includes('Appointment')||j.body.includes('Task'));
 assert.equal(jobs.length,2);assert.equal(jobs[0].schedule.at.getHours(),21);assert.equal(jobs[0].schedule.at.getDate(),13);
 assert.match(jobs[1].body,/Appointment/);assert.match(jobs[1].body,/Task/);assert.equal(jobs[1].schedule.allowWhileIdle,true);
 assert.ok(!reminderJobs(snapshot,now).some(j=>j.body.includes('Muted')));
 assert.equal(new Set(jobs.map(j=>j.id)).size,jobs.length);
});
