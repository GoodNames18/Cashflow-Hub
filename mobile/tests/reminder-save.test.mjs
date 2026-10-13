import {test} from 'node:test';import assert from 'node:assert/strict';import {createReminderScheduler} from '../reminder-scheduler.mjs';
import {readFile} from 'node:fs/promises';import vm from 'node:vm';
test('a save arriving during registration waits for the next pass',async()=>{
 let release;const held=new Promise(r=>release=r);let calls=0;
 const schedule=createReminderScheduler(async()=>{calls++;if(calls===1)await held;return calls});
 const first=schedule();let done=false;const second=schedule().then(()=>done=true);
 await Promise.resolve();assert.equal(done,false);release();assert.equal(await first,2);await second;assert.equal(calls,2);
});
test('calendar Save waits for acknowledgement and keeps editor open on failure',async()=>{
 const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('    let cfhCalendarRegistering=false;'),html.indexOf('    async function cfhSaveNewCard(){'));
 let release,closed=0,warning='';const button={textContent:'Save',disabled:false};
 const context=vm.createContext({document:{querySelector:()=>button},window:{CFH_NATIVE:true,cfhRegisterReminders:()=>new Promise(r=>release=r)},cfhEditorClose:()=>closed++,cfhCalendarRender(){},alert:m=>warning=m});
 vm.runInContext(source,context);const saving=context.cfhFinishCalendarSave();assert.equal(closed,0);assert.equal(button.disabled,true);release();await saving;assert.equal(closed,1);assert.equal(button.disabled,false);
 context.window.cfhRegisterReminders=async()=>{throw Error('Not registered')};await context.cfhFinishCalendarSave();assert.equal(closed,1);assert.match(warning,/saved, but its reminder was not confirmed/);assert.equal(button.textContent,'Save');
});
