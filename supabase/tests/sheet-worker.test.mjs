import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../Cashflow-Sheets-Sync.gs',import.meta.url),'utf8');
function context(){const c={Date,JSON,Number,String,Object,Array,isFinite,isNaN,Error};vm.createContext(c);vm.runInContext(source,c);return c;}
test('bootstrap resumes partial notes without remapping identical transactions',()=>{
 const c=context();c.cfhHash_=JSON.stringify;
 const records=[{id:'a',revision:1,source_values:['same']},{id:'b',revision:1,source_values:['same']}];
 const rows=[{row:5,values:['same'],note:'Keep this',marker:null},
 {row:6,values:['same'],note:'Prior note',marker:{id:'a'}}];
 const plan=c.cfhBootstrapAssignments_(rows,records,1);
 assert.equal(c.cfhMarker_(plan[0].note).id,'b');
 assert.equal(c.cfhMarker_(plan[1].note).id,'a');
 assert.ok(plan[0].note.startsWith('Keep this'));
 assert.throws(()=>c.cfhBootstrapAssignments_([{row:5,values:['changed'],marker:{id:'a'}}],[records[0]],1),/conflicts/);
});
test('migration repair counts duplicate rows and becomes empty after acknowledgement',()=>{
 const c=context();c.cfhHash_=JSON.stringify;
 const rows=[{values:['a']},{values:['a']},{values:['b']}];
 const records=[{source_values:['a']}];
 const missing=c.cfhMissingRows_(rows,records,1);
 assert.equal(missing.length,2);assert.equal(missing[0].ordinal,2);
 records.push({source_values:['a']},{source_values:['b']});
 assert.equal(c.cfhMissingRows_(rows,records,1).length,0);
});
test('migration repair rejects changed or deleted records before importing',()=>{
 const c=context();c.cfhHash_=JSON.stringify;
 assert.throws(()=>c.cfhMissingRows_([{values:['new']}],[{source_values:['old']}],1),/differ/);
 assert.throws(()=>c.cfhMissingRows_([{values:['old']}],[{source_values:['old'],deleted_at:'today'}],1),/deleted/);
 assert.throws(()=>c.cfhMissingRows_([{values:['new'],marker:{id:'id'}}],[],1),/metadata/);
});
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
test('archive recovery matches source tab and all transaction values',()=>{
 const c=context();c.cfhHash_=JSON.stringify;
 const values=['2026-10-04T08:06:00Z','Cash In/Out',5,'2026-10-04','16:03',100,'Gcash','Income','','','','Deleted','',false];
 const record={id:'correct',tab_key:'cash_in_out',deleted_at:values[0],source_values:values.slice(3,8)};
 assert.equal(c.cfhArchiveCandidate_(values,[record,{...record,id:'other',tab_key:'printing'}]).id,'correct');
 assert.throws(()=>c.cfhArchiveCandidate_(values,[{...record,source_values:['2026-10-04','15:56',100,'Gcash','Income']}]),/No matching/);
});
test('archive recovery uses exact deletion timestamp and refuses ambiguous duplicates',()=>{
 const c=context();c.cfhHash_=JSON.stringify;
 const values=['2026-10-04T08:06:00Z','Cash In/Out',5,'2026-10-04','16:03',100,'Gcash','Income','','','','Deleted','',false];
 const record={id:'correct',tab_key:'cash_in_out',deleted_at:values[0],source_values:values.slice(3,8)};
 const other={...record,id:'other',deleted_at:'2026-10-04T08:05:00Z'};
 assert.equal(c.cfhArchiveCandidate_(values,[record,other]).id,'correct');
 assert.throws(()=>c.cfhArchiveCandidate_(values,[record,{...record,id:'duplicate'}]),/Multiple/);
 assert.throws(()=>c.cfhArchiveCandidate_([...values.slice(0,11),'Restored'],[record]),/Select a deleted/);
});
