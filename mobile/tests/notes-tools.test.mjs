import {checklistNameCompletion} from '../../supabase/cfh-notes-checklist.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNameAmount,nameTotals,findNoteMatches,copyNoteData,noteShareText} from '../../supabase/cfh-notes-tools.mjs';
test('amount totals match whole names across dividers, parse k, and exclude completed rows',()=>{
 const items=[{id:'old',text:'510 cecil'},{id:'divider',text:'line',divider:true},{id:'new',text:'2k Cecil',createdAt:3},{id:'other',text:'20 Cecilia'},{id:'paid',text:'9k CECIL',checked:true}];
 assert.deepEqual([...nameTotals(items)],[['new','Total ₱2,510']]);
 items[2].text='3k Cecil';assert.equal(nameTotals(items).get('new'),'Total ₱3,510');
 items[0].checked=true;assert.equal(nameTotals(items).size,0);
 assert.equal(parseNameAmount('1.25k Cecil').amount,125000);assert.equal(parseNameAmount('1,250 Cecil').amount,125000);
 assert.equal(parseNameAmount('Realme 9k | Monthly'),null);
 assert.equal(parseNameAmount('200 Cecil (Total 300)'),null);
 assert.equal(nameTotals([{id:'1',text:'0.10 Vi'},{id:'2',text:'0.20 vi'}]).get('2'),'Total ₱0.3');
});
test('search includes title and checked entries and treats punctuation as literal text',()=>{
 const matches=findNoteMatches({kind:'list',title:'Cecil',items:[{id:'a',text:'510 CECIL',checked:true},{id:'b',text:'[a] [a]'}]},'cecil');
 assert.deepEqual(matches.map(m=>m.type),['title','item']);assert.equal(matches[1].id,'a');
 assert.equal(findNoteMatches({kind:'text',body:'[a] [a]'},'[a]').length,2);
});
test('copies have independent note, row and media identities while preserving formatting',async()=>{
 let serial=0;const saved=[],removed=[];
 const source={id:'note',title:'Cash',kind:'list',pinned:true,archived:true,deletedAt:4,reminder:'later',items:[{id:'row',text:'200 Cecil',format:{b:true}}],attachments:[{id:'audio',type:'audio'},{id:'image',type:'image'}],content:[{type:'audio',id:'audio'}]};
 const copy=await copyNoteData(source,{id:()=>String(++serial),loadMedia:async()=>new Blob(['data']),saveMedia:async(id)=>saved.push(id),removeMedia:async id=>removed.push(id),now:20});
 assert.notEqual(copy.id,source.id);assert.notEqual(copy.items[0].id,'row');assert.equal(copy.content[0].id,copy.attachments[0].id);assert.deepEqual(copy.items[0].format,{b:true});assert.equal(copy.reminder,undefined);assert.equal(copy.deletedAt,undefined);assert.equal(copy.pinned,false);assert.equal(source.attachments[0].id,'audio');assert.equal(saved.length,2);assert.equal(removed.length,0);
});
test('failed copies remove partial media without changing the original',async()=>{
 const removed=[];let n=0;
 await assert.rejects(copyNoteData({attachments:[{id:'1'},{id:'2'}]},{id:()=>String(++n),loadMedia:async id=>id==='1'?new Blob(['x']):null,saveMedia:async()=>{},removeMedia:async id=>removed.push(id)}),/unavailable/);assert.deepEqual(removed,['1']);
});
test('shared text omits checked rows and includes derived totals without mutating entries',()=>{
 const note={title:'Cash',kind:'list',items:[{id:'a',text:'510 Cecil'},{id:'b',text:'2k Cecil'},{id:'c',text:'99 Cecil',checked:true}]};
 assert.equal(noteShareText(note),'Cash\n510 Cecil\n2k Cecil (Total ₱2,510)');assert.equal(note.items[1].text,'2k Cecil');
});

test('names still autocomplete with shorthand k amounts',()=>{
 assert.equal(checklistNameCompletion('2k Ce',[{id:'old',text:'510 Cecil'}],'new').value,'2k Cecil');
 assert.equal(checklistNameCompletion('510 Ce',[{id:'old',text:'2k Cecil'}],'new').value,'510 Cecil');
});
