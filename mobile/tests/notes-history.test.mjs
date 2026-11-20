import test from 'node:test';
import assert from 'node:assert/strict';
import {createNoteHistory} from '../../supabase/cfh-notes-history.mjs';
test('notes retain independent undo and redo when closed and reopened',()=>{
 const h=createNoteHistory();h.select('cash','original');h.record('edited');
 assert.equal(h.move('undo'),'original');assert.equal(h.canRedo(),true);
 h.select('shopping','milk');assert.equal(h.canUndo(),false);assert.equal(h.canRedo(),false);h.record('bread');
 h.select('cash','original');assert.equal(h.canRedo(),true);assert.equal(h.move('redo'),'edited');
 h.select('shopping','bread');assert.equal(h.move('undo'),'milk');
 h.select('cash','edited');assert.equal(h.move('undo'),'original');
});
test('new edits clear redo only for that note and history stays bounded',()=>{
 const h=createNoteHistory(2);h.select('a','0');h.record('1');h.record('2');h.record('3');
 assert.equal(h.move('undo'),'2');assert.equal(h.move('undo'),'1');assert.equal(h.move('undo'),null);
 h.select('b','b0');h.record('b1');h.move('undo');
 h.select('a','1');h.record('new');assert.equal(h.canRedo(),false);
 h.select('b','b0');assert.equal(h.move('redo'),'b1');
});
