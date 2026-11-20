import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureChecklistOrder,updateChecklistText} from '../../supabase/cfh-notes-model.mjs';
import {nameTotals} from '../../supabase/cfh-notes-tools.mjs';
import {createNoteHistory} from '../../supabase/cfh-notes-history.mjs';
import {noteMathResults} from '../../supabase/cfh-notes-math.mjs';

test('blank, first input, editing, clear and reuse follow the original-date lifecycle',()=>{
 const item={id:'a',text:''},items=[item];
 updateChecklistText(items,item,'  ',10);assert.equal(item.createdAt,undefined);
 updateChecklistText(items,item,'510 Alex',20);assert.equal(item.createdAt,20);
 const order=item.addedOrder;updateChecklistText(items,item,'610 Alex',30);
 assert.equal(item.createdAt,20);assert.equal(item.addedOrder,order);
 item.originalDateUnavailable=true;item.conversionCreatedAt=5;
 updateChecklistText(items,item,'',40);assert.equal(item.createdAt,undefined);assert.equal(item.addedOrder,undefined);assert.equal(item.originalDateUnavailable,undefined);
 updateChecklistText(items,item,'200 Blake',50);assert.equal(item.createdAt,50);
});
test('legacy unknown dates stay unknown on edit and order seeding never fabricates dates',()=>{
 const items=[{id:'a',text:'100 Alex'},{id:'b',text:'200 Alex'}];ensureChecklistOrder(items);
 updateChecklistText(items,items[0],'150 Alex',500);assert.equal(items[0].createdAt,undefined);
 assert.equal(items[1].createdAt,undefined);assert.ok(items[1].addedOrder>items[0].addedOrder);
});
test('undo and redo restore exact row dates and addition order across clear and reuse',()=>{
 let items=[{id:'a',text:'510 Alex',createdAt:100,addedOrder:1}];const history=createNoteHistory();history.select('n',JSON.stringify(items));
 updateChecklistText(items,items[0],'',200);history.record(JSON.stringify(items));
 items=JSON.parse(history.move('undo'));assert.equal(items[0].createdAt,100);assert.equal(items[0].text,'510 Alex');assert.equal(items[0].addedOrder,1);
 items=JSON.parse(history.move('redo'));assert.equal(items[0].createdAt,undefined);assert.equal(items[0].text,'');
 updateChecklistText(items,items[0],'300 Alex',300);history.record(JSON.stringify(items));
 items=JSON.parse(history.move('undo'));assert.equal(items[0].createdAt,undefined);
 items=JSON.parse(history.move('redo'));assert.equal(items[0].createdAt,300);
});
test('totals stay on latest addition through editing and dragging, falling back when cleared or checked',()=>{
 const a={id:'a',text:'510 Alex',createdAt:10,addedOrder:1},b={id:'b',text:'2k ALEX',createdAt:20,addedOrder:2},items=[a,b,{id:'l1',text:'100 Load'},{id:'l2',text:'200 load'}];
 items.reverse();assert.deepEqual([...nameTotals(items)],[['b','Total ₱2,510']]);
 updateChecklistText(items,a,'610 Alex',1000);assert.deepEqual([...nameTotals(items)],[['b','Total ₱2,610']]);
 const c={id:'c',text:''};items.unshift(c);updateChecklistText(items,c,'300 Alex',30);assert.deepEqual([...nameTotals(items)],[['c','Total ₱2,910']]);
 c.checked=true;assert.deepEqual([...nameTotals(items)],[['b','Total ₱2,610']]);
 c.checked=false;updateChecklistText(items,c,'',40);assert.deepEqual([...nameTotals(items)],[['b','Total ₱2,610']]);
});
test('shared math engine evaluates cross-row variables and updates dependent results safely',()=>{
 assert.deepEqual(noteMathResults('x = 6\ny = 2\nx × y =').map(r=>r.text),['12']);
 assert.deepEqual(noteMathResults('x = 8\ny = 2\nx × y =').map(r=>r.text),['16']);
 assert.deepEqual(noteMathResults('495 + 99 + 100 + 99 + 59 + 59 =').map(r=>r.text),['911']);
 assert.deepEqual(noteMathResults('1/0=\nunknown+2=\nwindow.alert(1)='),[]);
});
