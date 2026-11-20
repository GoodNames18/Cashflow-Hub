import test from 'node:test';
import assert from 'node:assert/strict';
import {noteForVisibleSearch} from '../../supabase/cfh-notes-find.mjs';
import {findNoteMatches} from '../../supabase/cfh-notes-tools.mjs';

test('collapsed checked entries are excluded from search counts without changing saved data',()=>{
 const note={kind:'list',title:'Alex',checkedExpanded:false,items:[{id:'open',text:'100 Alex'},{id:'paid',text:'200 Alex',checked:true}]},before=JSON.stringify(note);
 assert.deepEqual(findNoteMatches(noteForVisibleSearch(note),'alex').map(m=>m.id||m.type),['title','open']);
 assert.equal(JSON.stringify(note),before);
});
test('expanded checked entries remain searchable and can be collapsed again',()=>{
 const note={kind:'list',checkedExpanded:true,items:[{id:'paid',text:'200 Alex',checked:true}]};
 assert.equal(findNoteMatches(noteForVisibleSearch(note),'alex').length,1);
 note.checkedExpanded=false;assert.equal(findNoteMatches(noteForVisibleSearch(note),'alex').length,0);
 note.checkedExpanded=true;assert.equal(findNoteMatches(noteForVisibleSearch(note),'alex').length,1);
});
test('checked entries that remain visibly pinned outside the collapsed group are still searchable',()=>{
 const note={kind:'list',checkedExpanded:false,items:[{id:'pin',text:'100 Alex',checked:true,pinned:true},{id:'hiddenpin',text:'200 Alex',checked:true,pinned:true,pinInCompleted:true},{id:'divider',text:'Alex divider',checked:true,divider:true}]};
 assert.deepEqual(findNoteMatches(noteForVisibleSearch(note),'alex').map(m=>m.id),['pin','divider']);
});
