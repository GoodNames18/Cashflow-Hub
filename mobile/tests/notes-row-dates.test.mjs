import test from 'node:test';
import assert from 'node:assert/strict';
import {setChecklistText} from '../../supabase/cfh-notes-model.mjs';
import {repairLegacyChecklist} from '../../supabase/cfh-notes-repair.mjs';
import {createNoteHistory} from '../../supabase/cfh-notes-history.mjs';

test('amount and name edits preserve the original row date and other row properties',()=>{
 const row={id:'a',text:'510 Alex',createdAt:100,checked:true,pinned:true,format:{b:true}};
 setChecklistText(row,'610 Alex',200);assert.equal(row.createdAt,100);
 setChecklistText(row,'610 Blake',300);assert.equal(row.createdAt,100);
 assert.equal(row.checked,true);assert.equal(row.pinned,true);assert.deepEqual(row.format,{b:true});
});
test('clearing or leaving only whitespace removes the old date, while new data gets a fresh date',()=>{
 const row={id:'a',text:'510 Alex',createdAt:100};
 setChecklistText(row,'  \n ',200);assert.equal(row.createdAt,undefined);
 setChecklistText(row,'',300);assert.equal(row.createdAt,undefined);
 setChecklistText(row,'200 Blake',400);assert.equal(row.createdAt,400);
 setChecklistText(row,'210 Blake',500);assert.equal(row.createdAt,400);
 setChecklistText(row,'',600);assert.equal(row.createdAt,undefined);
 setChecklistText(row,'0',700);assert.equal(row.createdAt,700);
});
test('editing legacy rows with unknown dates does not fabricate their original date',()=>{
 const row={id:'a',text:'510 Alex',originalDateUnavailable:true,conversionCreatedAt:100};
 setChecklistText(row,'610 Alex',200);assert.equal(row.createdAt,undefined);assert.equal(row.originalDateUnavailable,true);
 setChecklistText(row,'',300);assert.equal(row.originalDateUnavailable,undefined);assert.equal(row.conversionCreatedAt,undefined);
 setChecklistText(row,'510 Alex',400);assert.equal(row.createdAt,400);
 const repaired=repairLegacyChecklist({id:'n',kind:'list',items:[row]},[{id:'n',kind:'list',items:[{id:'a',text:'510 Alex',createdAt:50}]}]);
 assert.equal(repaired.note.items[0].createdAt,400);
});
test('existing undo snapshots retain the exact original date through clear and reuse',()=>{
 let row={id:'a',text:'510 Alex',createdAt:100};const h=createNoteHistory();h.select('n',JSON.stringify(row));
 setChecklistText(row,'',200);h.record(JSON.stringify(row));
 row=JSON.parse(h.move('undo'));assert.equal(row.createdAt,100);assert.equal(row.text,'510 Alex');
 row=JSON.parse(h.move('redo'));assert.equal(row.createdAt,undefined);assert.equal(row.text,'');
 setChecklistText(row,'200 Blake',300);h.record(JSON.stringify(row));
 row=JSON.parse(h.move('undo'));assert.equal(row.createdAt,undefined);
 row=JSON.parse(h.move('redo'));assert.equal(row.createdAt,300);
});
