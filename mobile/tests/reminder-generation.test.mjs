import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {reminderJobs} from '../reminders.mjs';
process.env.TZ="Asia/Manila";
export function fixture(){const prefs={metrobank:{start:'2000-01-01',end:'2000-01-02'},eastwest:{start:'2000-01-01',end:'2000-01-02'}};
for(let i=0;i<12;i++)prefs['duplicate-fixture-'+i]={sourceBank:i%2?'eastwest':'metrobank',bankName:i===0?'Atome':'Bank '+i,cardName:'Fixture card',statementDay:9+i,dueDays:17,start:'2026-01-01',end:'2031-12-31',notificationTime:i%2?'09:00':'21:00',reminderDays:[7,5,3,2,1,0],scopedEdits:[{id:'fixture',cycle:'2027-01',scope:'future',patch:{notificationTime:'10:30'}}]};
return {cfh_card_panel_preferences_v1:JSON.stringify(prefs),cfh_calendar_entries_v1:JSON.stringify([{id:'repeat',type:'event',title:'Repeating event',date:'2026-10-15',repeat:'custom',repeatUnit:'weekly',repeatInterval:2,time:'14:00',reminderDays:[1,0]},{id:'leap',type:'task',title:'Month end',date:'2026-01-31',repeat:'monthly',time:'15:30',reminderDays:[3,0]}]),cfh_calendar_event_deletions_v1:JSON.stringify({occurrences:['repeat:event|2026-10-29']})};}
const now=()=>new Date(2026,9,15,8,0);
const digest=jobs=>createHash('sha256').update(JSON.stringify(jobs)).digest('hex');
test('separate cards preserve baseline wake-up IDs, times, and content',()=>{assert.equal(digest(reminderJobs(fixture(),now()).map(job=>({...job,extra:{page:'calendar'}}))),'3b6322d4fe17c75bcc1abd2633bc95d60788ab99f55da224487dcc88691690f9');});
test('settings are parsed once during generation and a later edit is read fresh',()=>{const snapshot=fixture(),parse=JSON.parse;let count=0;try{JSON.parse=(...args)=>{count++;return parse(...args);};reminderJobs(snapshot,now());}finally{JSON.parse=parse;}assert.ok(count<=6,'snapshot should be parsed once per storage key');const before=reminderJobs(snapshot,now());const prefs=JSON.parse(snapshot.cfh_card_panel_preferences_v1);prefs['duplicate-fixture-0'].notificationTime='18:15';snapshot.cfh_card_panel_preferences_v1=JSON.stringify(prefs);assert.notEqual(digest(reminderJobs(snapshot,now())),digest(before));});

test('simultaneous reminders have independent stable cards inside one wake-up',()=>{
 const snapshot=fixture(),jobs=reminderJobs(snapshot,now()),multi=jobs.filter(job=>job.extra.cfhItems);
 assert.ok(multi.length>0);
 const ids=new Set();
 for(const job of multi){
  assert.ok(job.extra.cfhItems.length>1);
  for(const item of job.extra.cfhItems){
   assert.ok(item.id<0);
   assert.ok(!ids.has(item.id),'each visible notification needs its own ID');ids.add(item.id);
   assert.ok(item.title);assert.ok(item.body.startsWith(item.title+' · '));
   assert.ok(!item.body.includes('\n'));
  }
 }
 assert.deepEqual(reminderJobs(snapshot,now()),jobs);
 assert.equal(new Set(jobs.map(job=>job.schedule.at.getTime())).size,jobs.length);
 assert.ok(jobs.length<=400);
});
