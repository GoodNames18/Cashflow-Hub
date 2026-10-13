import test from 'node:test';
import assert from 'node:assert/strict';
import {startCalendarSync,KEYS} from '../../supabase/cfh-calendar-sync.mjs';
test('migration, offline edits, remote changes and concurrent-edit protection',async()=>{
 const intervals=globalThis.setInterval,timeouts=globalThis.setTimeout;
 globalThis.setInterval=()=>0;globalThis.setTimeout=()=>0;
 class Storage {data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
 class Element {children=[];status={textContent:''};button={};querySelector(q){if(q==='[role=status]')return this.status;if(q==='button')return this.button;if(q==='[data-conflict]')return this.children.find(c=>c.dataset?.conflict);}append(c){this.children.push(c);}prepend(c){this.append(c);}replaceChildren(){this.children=[];}remove(){}dataset={};}
 globalThis.Storage=Storage;globalThis.localStorage=new Storage();
 globalThis.MutationObserver=class {observe(){}};
 const target=new Element();globalThis.document={createElement:()=>new Element(),getElementById:id=>id==='cfhCalendarSchedule'?target:null,addEventListener(){},hidden:false};
 globalThis.window={addEventListener(){},dispatchEvent(){},cfhReloadCalendarFromStorage(){}};
 Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
 const key=KEYS.at(-1),initial='[{"id":"first","date":"2026-10-13"}]';localStorage.setItem(key,initial);
 const rows=new Map();let hold;
 const client={channel(){return {on(){return this},subscribe(){return this}}},removeChannel(){},from(){return {select(){return {eq:async()=>({data:[...rows.values()]})};}};},rpc:async(name,args)=>{
  if(hold){const fn=hold;hold=null;await fn();}
  const row=rows.get(args.p_key);if((row?.revision||0)!==args.p_revision)return {data:[]};
  const saved={storage_key:args.p_key,value:args.p_value,revision:(row?.revision||0)+1};rows.set(args.p_key,saved);return {data:[saved]};
 }};
 try{
  await startCalendarSync(client,'owner');const sync=target.children[0].button.onclick;
  assert.equal(rows.get(key).value,initial);assert.equal(JSON.parse(localStorage.getItem('cfh-calendar-before-cloud-v1'))[key],initial);
  navigator.onLine=false;localStorage.setItem(key,'offline');await sync();assert.equal(rows.get(key).value,initial);
  navigator.onLine=true;await sync();assert.equal(rows.get(key).value,'offline');
  rows.set(key,{storage_key:key,value:'remote',revision:3});await sync();assert.equal(localStorage.getItem(key),'remote');
  localStorage.setItem(key,'local');rows.set(key,{storage_key:key,value:'another device',revision:4});await sync();assert.equal(rows.get(key).value,'another device');
  const conflict=target.children[0].querySelector('[data-conflict]');assert.ok(conflict);conflict.children[0].onclick();await sync();assert.equal(rows.get(key).value,'local');
  localStorage.setItem(key,'request');hold=async()=>localStorage.setItem(key,'typed while saving');await sync();await sync();assert.equal(rows.get(key).value,'typed while saving');
 }finally{globalThis.setInterval=intervals;globalThis.setTimeout=timeouts;}
});
