import test from 'node:test';
import assert from 'node:assert/strict';
import {apple,appleURL,google,plan,stableId} from '../../supabase/functions/cfh-external-calendar/providers.mjs';
import {createNotificationReader} from '../../supabase/functions/cfh-push/kernel.ts';

test('managed events keep the same ID when the amount changes and disappear when paid',async()=>{
 const id=await stableId('issuer|2026-11'), event={id,date:'2026-11-25',title:'Card — Due date',description:'Amount due: ₱100'};
 const remote=new Map([[id,JSON.stringify(event)]]);
 assert.deepEqual(plan([event],remote),{write:[],remove:[]});
 assert.equal(plan([{...event,description:'Amount due: ₱80'}],remote).write[0].id,id);
 assert.deepEqual(plan([],remote).remove,[id]);
 assert.throws(()=>appleURL('https://caldav.icloud.com.evil.test/user/cal/'));
});

test('card export ignores reminder toggles and excludes paid cycles',()=>{
 const prefs={metrobank:{start:'2000-01-01',end:'2000-01-02'},eastwest:{start:'2000-01-01',end:'2000-01-02'},'duplicate-fixture':{sourceBank:'metrobank',bankName:'Test',cardName:'Card',statementDay:5,dueDays:17,start:'2026-01-01',end:'2027-01-01',notificationTime:'09:00',remindersEnabled:false,bills:{'2026-11':{amount:125}}}};
 const read=()=>createNotificationReader({cfh_card_panel_preferences_v1:JSON.stringify(prefs)})('2026-11-23','export');
 assert.equal(read()[0]?.amount,125);
 prefs['duplicate-fixture'].bills['2026-11'].paid=true;
 assert.deepEqual(read(),[]);
});

test('iCloud skips foreign events and updates an owned event with its ETag',async()=>{
 const id=await stableId('issuer|2026-11'), calls=[];
 const old=globalThis.fetch;
 globalThis.fetch=async (url,opts)=>{
  calls.push([String(url),opts]);
  if(opts.method==='REPORT')return new Response(`<d:multistatus><d:response><d:href>/a/cal/${id}.ics</d:href><d:getetag>&quot;old&quot;</d:getetag><c:calendar-data>UID:${id}@cashflowhub\nDESCRIPTION:Old</c:calendar-data></d:response><d:response><d:href>/a/cal/personal.ics</d:href></d:response></d:multistatus>`,{status:207});
  return new Response(null,{status:204});
 };
 try{
  await apple({calendar:'https://p01-caldav.icloud.com/a/cal/',email:'test@example.com',password:'test'},[{id,date:'2026-11-25',title:'Card',description:'Amount due: ₱80'}],'20261114T000000Z');
  assert.deepEqual(calls.map(([,o])=>o.method),['REPORT','PUT']);
  assert.equal(calls[1][1].headers['If-Match'],'"old"');
  assert.match(calls[1][1].body,/Amount due: ₱80/);
 }finally{globalThis.fetch=old;}
});

test('Google only deletes events marked as managed by Cashflow Hub',async()=>{
 const id=await stableId('issuer|2026-11'), calls=[],old=globalThis.fetch;
 globalThis.fetch=async (url,opts)=>{
  calls.push([String(url),opts.method]);
  if(calls.length===1)return Response.json({access_token:'test'});
  if(calls.length===2)return Response.json({items:[{id},{id:'some-personal-event'}]});
  return new Response(null,{status:204});
 };
 try{
  await google({calendar:'test',clientId:'test',clientSecret:'test',refresh:'test'},[]);
  assert.match(calls[1][0],/privateExtendedProperty=managedBy%3Dcashflowhub-card-due/);
  assert.deepEqual(calls[2],['https://www.googleapis.com/calendar/v3/calendars/test/events/'+id,'DELETE']);
  assert.equal(calls.length,3);
 }finally{globalThis.fetch=old;}
});
