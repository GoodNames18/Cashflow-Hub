import test from 'node:test';import assert from 'node:assert/strict';
import {selectionMenuPosition} from '../../supabase/cfh-notes-menu.mjs';
import {copyNoteBatch} from '../../supabase/cfh-notes-tools.mjs';
test('selected note menu stays aligned beneath its trigger and inside narrow viewports',()=>{
 assert.deepEqual(selectionMenuPosition({right:390,top:20,bottom:60},224,144,400,800),{left:166,top:66});
 assert.deepEqual(selectionMenuPosition({right:40,top:650,bottom:690},224,144,240,720),{left:8,top:500});
});
test('batch copy keeps originals and row dates, makes independent attachments and commits once',async()=>{
 const sources=[{id:'a',title:'Cash',kind:'list',pinned:true,reminder:'2026-11-22T09:00',items:[{id:'r',text:'100 Alex',checked:true,createdAt:4}],attachments:[{id:'audio',type:'audio'}],content:[{type:'audio',id:'audio'}]},{id:'b',title:'Other',body:'Keep'}];
 const original=JSON.stringify(sources),saved=[],removed=[];let seq=0,commits=0;
 const copies=await copyNoteBatch(sources,{id:()=>String(++seq),now:100,loadMedia:async()=>new Blob(['test']),saveMedia:async(id)=>saved.push(id),removeMedia:async(id)=>removed.push(id),commit:items=>{commits++;assert.equal(items.length,2);return true}});
 assert.equal(commits,1);assert.equal(JSON.stringify(sources),original);assert.equal(copies[0].title,'Cash (copy)');assert.notEqual(copies[0].id,'a');assert.notEqual(copies[0].items[0].id,'r');assert.equal(copies[0].items[0].createdAt,4);assert.equal(copies[0].items[0].checked,true);assert.equal(copies[0].content[0].id,copies[0].attachments[0].id);assert.equal(copies[0].reminder,undefined);assert.equal(copies[0].pinned,false);assert.equal(saved.length,1);assert.equal(removed.length,0);
});
test('batch copying cleans new attachments and commits nothing if any copy fails',async()=>{
 let seq=0,commits=0;const removed=[];
 await assert.rejects(copyNoteBatch([{id:'a',attachments:[{id:'good'}]},{id:'b',attachments:[{id:'missing'}]}],{id:()=>String(++seq),loadMedia:async id=>id==='good'?new Blob(['ok']):null,saveMedia:async()=>{},removeMedia:async id=>removed.push(id),commit:()=>{commits++;return true}}),/unavailable/);
 assert.equal(commits,0);assert.deepEqual(removed,['1']);
});
test('failed batch save removes every new attachment without touching original media',async()=>{
 let seq=0;const removed=[];
 await assert.rejects(copyNoteBatch([{id:'a',attachments:[{id:'original'}]}],{id:()=>String(++seq),loadMedia:async()=>new Blob(['ok']),saveMedia:async()=>{},removeMedia:async id=>removed.push(id),commit:()=>false}),/save/);
 assert.deepEqual(removed,['1']);
});
