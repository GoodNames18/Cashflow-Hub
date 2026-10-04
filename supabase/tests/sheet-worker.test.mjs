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
