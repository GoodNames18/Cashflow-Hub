import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureChecklistOrder,setChecklistText} from '../../supabase/cfh-notes-model.mjs';
import {nameTotals,noteShareText} from '../../supabase/cfh-notes-tools.mjs';
import {createNoteHistory} from '../../supabase/cfh-notes-history.mjs';

test('totals follow addition order rather than position or the clock',()=>{
 const items=[{id:'a',text:'510 Alex',createdAt:100},{id:'b',text:'2k ALEX',createdAt:100}];ensureChecklistOrder(items);
 assert.deepEqual([...nameTotals(items)],[['b','Total ₱2,510']]);
 items.reverse();assert.deepEqual([...nameTotals(items)],[['b','Total ₱2,510']]);
 setChecklistText(items[1],'610 Alex',999,items);assert.deepEqual([...nameTotals(items)],[['b','Total ₱2,610']]);
 const fresh={id:'c',text:''};setChecklistText(fresh,'300 Alex',1,items);items.unshift(fresh);
 assert.deepEqual([...nameTotals(items)],[['c','Total ₱2,910']]);
 assert.equal(items.find(i=>i.id==='a').createdAt,100);
});
test('checking, deleting or clearing the latest entry falls back to the next latest eligible entry',()=>{
 const make=()=>[{id:'a',text:'100 Alex',addedOrder:1},{id:'b',text:'200 Alex',addedOrder:2},{id:'c',text:'300 Alex',addedOrder:3}];
 for(const action of ['check','delete','clear']){
  let items=make();
  if(action==='check')items[2].checked=true;
  if(action==='delete')items.pop();
  if(action==='clear')setChecklistText(items[2],'',400,items);
  assert.deepEqual([...nameTotals(items)],[['b','Total ₱300']],action);
 }
});
test('legacy rows receive order once without generating unknown dates or changing after drag',()=>{
 const items=[{id:'a',text:'100 Alex'},{id:'b',text:'200 Alex'},{id:'blank',text:''}];ensureChecklistOrder(items);
 const orders=Object.fromEntries(items.map(i=>[i.id,i.addedOrder]));items.reverse();ensureChecklistOrder(items);
 assert.deepEqual(Object.fromEntries(items.map(i=>[i.id,i.addedOrder])),orders);
 assert.ok(items.every(i=>i.createdAt===undefined));assert.equal(items[0].addedOrder,undefined);
 assert.deepEqual([...nameTotals(items)],[['b','Total ₱300']]);
});
test('undo and redo restore text, original timestamp, addition order and the matching total together',()=>{
 let items=[{id:'a',text:'100 Alex',createdAt:100,addedOrder:1},{id:'b',text:'200 Alex',createdAt:200,addedOrder:2},{id:'c',text:'300 Alex',createdAt:300,addedOrder:3}];
 const h=createNoteHistory();h.select('cash',JSON.stringify(items));
 setChecklistText(items[2],'',400,items);h.record(JSON.stringify(items));
 items=JSON.parse(h.move('undo'));assert.equal(items[2].createdAt,300);assert.equal(items[2].addedOrder,3);assert.equal(nameTotals(items).get('c'),'Total ₱600');
 items=JSON.parse(h.move('redo'));assert.equal(items[2].createdAt,undefined);assert.equal(items[2].addedOrder,undefined);assert.equal(nameTotals(items).get('b'),'Total ₱300');
 setChecklistText(items[2],'400 Alex',500,items);h.record(JSON.stringify(items));
 h.select('other','{}');h.select('cash',JSON.stringify(items));
 items=JSON.parse(h.move('undo'));assert.equal(items[2].createdAt,undefined);
 items=JSON.parse(h.move('redo'));assert.equal(items[2].createdAt,500);assert.equal(nameTotals(items).get('c'),'Total ₱700');
});
test('Load remains excluded and shared totals use the same latest entry without mutating rows',()=>{
 const items=[{id:'b',text:'200 Alex',addedOrder:2},{id:'a',text:'100 Alex',addedOrder:1},{id:'l1',text:'105 Load'},{id:'l2',text:'200 LOAD'}],before=JSON.stringify(items);
 assert.deepEqual([...nameTotals(items)],[['b','Total ₱300']]);
 assert.ok(noteShareText({kind:'list',items}).includes('200 Alex (Total ₱300)'));
 assert.equal(JSON.stringify(items),before);
});

test('concurrent additions with the same order keep a deterministic total after reordering',()=>{
 const items=[{id:'a',text:'100 Alex',addedOrder:2,createdAt:100},{id:'b',text:'200 Alex',addedOrder:2,createdAt:200}];
 assert.equal(nameTotals(items).get('b'),'Total ₱300');items.reverse();assert.equal(nameTotals(items).get('b'),'Total ₱300');
 items[0].createdAt=100;assert.equal(nameTotals(items).get('b'),'Total ₱300');items.reverse();assert.equal(nameTotals(items).get('b'),'Total ₱300');
});
