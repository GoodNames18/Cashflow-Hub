import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../Cashflow-Sheets-Sync.gs',import.meta.url),'utf8');
function context(){const c={Date,JSON,Number,String,Object,Array,isFinite,isNaN,Error};vm.createContext(c);vm.runInContext(source,c);return c;}
test('sync metadata preserves existing cell notes and revisions',()=>{
 const c=context();let note='Original note';
 const cell={getNote:()=>note,setNote:value=>{note=value;}};
 c.cfhNote_(cell,{id:'test-id',revision:3},'hash');
 assert.equal(c.cfhMarker_(note).revision,3);
 c.cfhNote_(cell,{id:'test-id',revision:4},'next');
 assert.equal(c.cfhMarker_(note).revision,4);
 assert.equal(note.match(/CFH_SYNC/g).length,1);
 assert.ok(note.startsWith('Original note'));
});
test('worker refuses to overwrite a direct sheet edit',()=>{
 const c=context();let writes=0;
 c.cfhRows_=()=>[{row:5,values:['edited'],marker:{id:'id',revision:1,hash:'["before"]'}}];
 const book={getSheetByName:()=>({getRange:()=>{writes++;}})};
 assert.throws(()=>c.cfhProjectRecord_(book,{id:'id',tab_key:'life_log',revision:2}),/Unsynced sheet edit/);
 assert.equal(writes,0);
});
test('a newer sheet revision is never replaced by an older job',()=>{
 const c=context();let writes=0;
 c.cfhRows_=()=>[{row:5,values:[],marker:{id:'id',revision:5,hash:'[]'}}];
 const book={getSheetByName:()=>({getRange:()=>{writes++;}})};
 c.cfhProjectRecord_(book,{id:'id',tab_key:'life_log',revision:4});
 assert.equal(writes,0);
});
test('imported Manila dates and time-only cells match Sheets Date values',()=>{
 const c=context();
 c.Utilities={formatDate(date,zone,format){
   const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
   return format==='yyyy-MM-dd'?`${parts.year}-${parts.month}-${parts.day}`:`${parts.hour}:${parts.minute}`;
 }};
 assert.equal(c.cfhHash_(['2026-10-03T23:01:38.288000','08:00:00','Health',null]),
   c.cfhHash_([new Date('2026-10-03T23:01:38.288+08:00'),new Date('1899-12-30T08:00:00+08:00'),'Health','']));
 assert.equal(c.cfhCellDate_('2026-10-03T23:01:38.288000').toISOString(),'2026-10-03T15:01:38.288Z');
});
