import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('calendar sync responds to changes, pauses hidden, and catches up without polling',async()=>{
 let reads=0,removed=0,handler,subscribed;const timers=new Map(),listeners={};let id=0;
 class Storage {constructor(){this.data=new Map()}getItem(k){return this.data.get(k)??null}setItem(k,v){this.data.set(k,v)}removeItem(k){this.data.delete(k)}}
 const localStorage=new Storage();const paragraph={textContent:''};const panel={querySelector:s=>s==='button'?{}:paragraph};
 const document={hidden:false,createElement:()=>panel,getElementById:()=>null,addEventListener:(n,f)=>listeners[n]=f};
 const window={addEventListener:(n,f)=>listeners[n]=f,dispatchEvent(){}};
 const client={from:()=>({select:()=>({eq:async()=>{reads++;return {data:[]}}})}),channel:()=>({on(type,filter,f){assert.equal(filter.filter,'owner_id=eq.owner');handler=f;return this},subscribe(f){subscribed=f;return this}}),removeChannel:()=>{removed++}};
 const context=vm.createContext({Storage,localStorage,document,window,navigator:{onLine:true},Event:class{},MutationObserver:class{observe(){}},console,setTimeout:f=>{timers.set(++id,f);return id},clearTimeout:i=>timers.delete(i)});
 const source=(await readFile(new URL('../../supabase/cfh-calendar-sync.mjs',import.meta.url),'utf8')).replace('export const KEYS','const KEYS').replace('export async function startCalendarSync','async function startCalendarSync');
 vm.runInContext(source,context);await context.startCalendarSync(client,'owner');assert.equal(reads,1);assert.equal(timers.size,0);
 async function flush(){const callbacks=[...timers.values()];timers.clear();for(const f of callbacks)await f()}
 subscribed('SUBSCRIBED');await flush();assert.equal(reads,2);assert.equal(timers.size,0);
 handler({new:{storage_key:'cfh_calendar_entries_v1',revision:1}});await flush();assert.equal(reads,3);
 document.hidden=true;listeners.visibilitychange();assert.equal(removed,1);assert.equal(timers.size,0);
 document.hidden=false;listeners.visibilitychange();await flush();assert.equal(reads,4);
});
