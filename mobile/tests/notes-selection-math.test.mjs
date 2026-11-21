import test from 'node:test';import assert from 'node:assert/strict';
import {updateSelectedNotes} from '../../supabase/cfh-notes-selection.mjs';
import {checklistMathResults,displayMathResults} from '../../supabase/cfh-notes-math.mjs';
test('batch actions change selected note metadata and preserve row content, dates and unrelated notes',()=>{
 const rows=[{id:'r',text:'100 Alex',checked:true,createdAt:123}],notes=[{id:'a',createdAt:10,items:rows,color:'white'},{id:'b',createdAt:20,body:'Keep'}];
 const changed=updateSelectedNotes(notes,['a'],{pinned:true,color:'mint'},500);assert.equal(changed[0].pinned,true);assert.equal(changed[0].createdAt,10);assert.equal(changed[0].items,rows);assert.equal(changed[1],notes[1]);assert.equal(notes[0].color,'white');assert.equal(changed[0].updatedAt,500);
 assert.deepEqual(updateSelectedNotes(notes,[],{color:'blue'}),notes);
});
test('checklist math uses previous variables, recalculates dependencies and never modifies row data',()=>{
 const items=[{id:'x',text:'x = 3 + 3',createdAt:1},{id:'y',text:'y = 2',checked:true},{id:'a',text:'x × y ='},{id:'b',text:'(45+78)*97 ='},{id:'c',text:'400/4*3 = g'},{id:'d',text:'₱0.10 + ₱0.20 ='},{id:'e',text:'1/0 ='},{id:'empty',text:''}];
 const before=JSON.stringify(items),result=checklistMathResults(items);assert.equal(result.get('a')[0].text,'12');assert.equal(result.get('b')[0].text,'11,931');assert.equal(displayMathResults(items[4].text,result.get('c')),'400/4*3 = 300 g');assert.equal(result.get('d')[0].text,'₱0.30');assert.equal(result.has('e'),false);assert.equal(result.has('empty'),false);assert.equal(JSON.stringify(items),before);
 items[0].text='x = 4';assert.equal(checklistMathResults(items).get('a')[0].text,'8');items[0].text='';assert.equal(checklistMathResults(items).has('a'),false);
});
