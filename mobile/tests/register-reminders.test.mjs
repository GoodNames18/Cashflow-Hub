import {test} from 'node:test';import assert from 'node:assert/strict';import {registerReminderDelta} from '../register-reminders.mjs';
test('only changed reminders cross the bridge and failed confirmation prevents success',async()=>{
 let scheduled,request;const notifications={schedule:async p=>scheduled=p.notifications,cancel:async()=>{}};
 const diagnostics={confirmScheduled:async p=>{request=p;return {confirmed:false}}};
 const delta={cancel:[],schedule:[{id:7,schedule:{at:new Date(2000)}}]};
 await assert.rejects(registerReminderDelta(delta,notifications,diagnostics),/did not confirm/);
 assert.equal(scheduled.length,1);assert.deepEqual(request,{alarms:[{id:7,target:2000}]});
 diagnostics.confirmScheduled=async()=>({confirmed:true});await registerReminderDelta(delta,notifications,diagnostics);
});
test('unchanged schedules do not fetch logs or call native registration',async()=>{
 await registerReminderDelta({cancel:[],schedule:[]},{schedule:()=>assert.fail(),cancel:()=>assert.fail()},{confirmScheduled:()=>assert.fail()});
});
