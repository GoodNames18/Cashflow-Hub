import test from 'node:test';
import assert from 'node:assert/strict';
import {repairLegacyChecklist,unwrapCheckboxText} from '../../supabase/cfh-notes-repair.mjs';
test('repeated conversions restore the deepest checked state and remove only leading box symbols',()=>{
 const note={id:'n',kind:'list',checkedExpanded:true,items:[{id:'a',text:'☐ ☐ ☑ 125 Alex',checked:false,createdAt:100},{id:'b',text:'☐ ☐ ☐ 240 Blake',checked:false,createdAt:101},{id:'c',text:'New entry',checked:true,createdAt:50}]};
 const result=repairLegacyChecklist(note);
 assert.equal(result.changed,true);assert.equal(result.note.items[0].text,'125 Alex');assert.equal(result.note.items[0].checked,true);assert.equal(result.note.items[1].checked,false);assert.equal(result.note.items[0].createdAt,undefined);assert.equal(result.note.items[0].conversionCreatedAt,100);assert.equal(result.note.checkedExpanded,false);
 assert.equal(result.note.items[2],note.items[2]);assert.equal(note.items[0].text,'☐ ☐ ☑ 125 Alex');assert.equal(repairLegacyChecklist(result.note).changed,false);
 assert.equal(unwrapCheckboxText('Note with ☑ inside').markers,0);
});
test('original dates are recovered from an unambiguous saved snapshot without resetting them',()=>{
 const source={id:'n',kind:'list',items:[{id:'old-a',text:'125 Alex',createdAt:10},{id:'old-b',text:'240 Blake',createdAt:20}]};
 const note={id:'n',kind:'list',items:[{id:'new-a',text:'☐ ☑ 125 Alex',createdAt:100},{id:'new-b',text:'☐ ☐ 240 Blake',createdAt:100}]};
 const result=repairLegacyChecklist(note,[source]);assert.equal(result.note.items[0].createdAt,10);assert.equal(result.note.items[1].createdAt,20);assert.equal(result.stats.datesRecovered,2);
 const unknown=repairLegacyChecklist(note).note;assert.equal(repairLegacyChecklist(unknown,[source]).note.items[0].createdAt,10);
});
test('ambiguous duplicate amounts do not receive guessed dates, and unrelated snapshots are ignored',()=>{
 const note={id:'n',kind:'list',items:[{id:'new',text:'☐ ☐ 240 Blake',createdAt:100}]};
 const source={id:'n',kind:'list',items:[{id:'old1',text:'240 Blake',createdAt:10},{id:'old2',text:'240 Blake',createdAt:20}]};
 assert.equal(repairLegacyChecklist(note,[source]).note.items[0].createdAt,undefined);
 assert.equal(repairLegacyChecklist(note,[{...source,id:'different'}]).note.items[0].createdAt,undefined);
 const ordinary={id:'n',kind:'list',items:[{id:'a',text:'240 Blake',createdAt:10}]};assert.equal(repairLegacyChecklist(ordinary).note,ordinary);
});

test('startup repair preserves the damaged snapshot and syncs dates recovered from the legacy cache',async()=>{
 const {createNotesSync}=await import('../../supabase/cfh-notes-sync.mjs');
 const keys=['localStorage','setTimeout','clearTimeout'],old=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),data=new Map();
 const original={id:'n',kind:'list',items:[{id:'o1',text:'240 Blake',createdAt:10},{id:'o2',text:'75 Casey',createdAt:20}]};
 const damaged={id:'n',kind:'list',items:[{id:'n1',text:'☐ ☑ 240 Blake',checked:false,createdAt:100},{id:'n2',text:'☐ ☐ 75 Casey',checked:false,createdAt:100}]};
 data.set('notes',JSON.stringify([original]));data.set('notes:sync',JSON.stringify({notes:[damaged],prefs:{},pending:{}}));
 try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)}});
  Object.defineProperty(globalThis,'setTimeout',{configurable:true,value:()=>1});Object.defineProperty(globalThis,'clearTimeout',{configurable:true,value:()=>{}});
  const sync=createNotesSync('notes',{status(){},changed(){},localMedia(){}}),note=sync.read()[0];
  assert.equal(note.items[0].createdAt,10);assert.equal(note.items[0].checked,true);assert.equal(note.items[1].createdAt,20);
  const state=JSON.parse(data.get('notes:sync'));assert.equal(state.pending.n.payload.items[0].text,'240 Blake');
  assert.deepEqual(JSON.parse(data.get('notes:checklist-repair-backups-v1')).n,damaged);assert.deepEqual(JSON.parse(data.get('notes')),[original]);
 }finally{for(const [key,descriptor] of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
