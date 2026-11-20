import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotesSync} from '../../supabase/cfh-notes-sync.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('sync status waits for database confirmation and stays pending offline or on failure',async()=>{
 const old=Object.fromEntries(['localStorage','navigator','window','document','setTimeout','clearTimeout','setInterval'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const data=new Map(),events={},timers=[],statuses=[];let finish,fail=false;
 try{
  const define=(key,value)=>Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  define('localStorage',{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)});
  define('navigator',{onLine:true});define('window',{addEventListener:(k,fn)=>events[k]=fn});define('document',{hidden:false,addEventListener(){}});
  define('setTimeout',fn=>{timers.push(fn);return timers.length;});define('clearTimeout',()=>{});define('setInterval',()=>{});
  const rows=[];
  const client={channel(){return {on(){return this;},subscribe(){}};},from(){return {
   upsert(row){return new Promise(resolve=>{finish=()=>{if(!fail)rows.push({id:row.id,payload:row.payload});resolve({error:fail?Error('upload failed'):null});};});},
   select(){return {eq(){return this;},order(){return this;},range:async()=>({data:rows,error:null})};}
  };}};
  const sync=createNotesSync('test-notes',{status:s=>statuses.push(s),changed(){},localMedia(){}});
  sync.start(client,'owner');sync.saveNotes([{id:'a',title:'first'}]);assert.equal(sync.getStatus(),'Sync pending');
  timers.at(-1)();assert.equal(sync.getStatus(),'Syncing…');assert.ok(!statuses.includes('Synced'));
  finish();await tick();assert.equal(sync.getStatus(),'Synced');
  navigator.onLine=false;events.offline();assert.equal(sync.getStatus(),'Sync pending');
  sync.saveNotes([{id:'a',title:'second'}]);timers.at(-1)();await tick();assert.equal(sync.getStatus(),'Sync pending');
  navigator.onLine=true;fail=true;events.online();timers.at(-1)();assert.equal(sync.getStatus(),'Syncing…');finish();await tick();assert.equal(sync.getStatus(),'Sync pending');
  fail=false;events.online();timers.at(-1)();finish();await tick();assert.equal(sync.getStatus(),'Synced');
 }finally{for(const [key,descriptor]of Object.entries(old)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
