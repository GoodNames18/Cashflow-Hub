import test from 'node:test';
import assert from 'node:assert/strict';
import {createNoteImage} from '../../supabase/cfh-notes-image.mjs';
test('full note image omits checked and empty rows while including offscreen content',async()=>{
 const painted=[];let output;let dimensions;
 const ctx={font:'',measureText:s=>({width:s.length*9}),scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText:s=>painted.push(s)};
 const old=globalThis.document;
 globalThis.document={createElement:()=>{const c={width:0,height:0,getContext:()=>ctx,toBlob:callback=>{output=c;dimensions={width:c.width,height:c.height};callback(new Blob(['valid-png-content'],{type:'image/png'}));}};return c;}};
 try{
  const items=Array.from({length:100},(_,i)=>({text:'Entry '+i}));
  items.push({text:'PRIVATE CHECKED',checked:true},{text:''});
  const blob=await createNoteImage({title:'My note',kind:'list',items},'#e9e6fa',()=>{});
  assert.equal(blob.type,'image/png');assert.ok(painted.includes('Entry 99'));
  assert.ok(!painted.some(s=>s.includes('PRIVATE CHECKED')||s.includes('List item')));
  assert.ok(dimensions.height>3000);assert.ok(dimensions.width*dimensions.height<=4000000);
  assert.ok(dimensions.height<=8192);assert.equal(output.width,1);assert.equal(output.height,1);
 }finally{globalThis.document=old;}
});

test('empty image encoding fails before any file is saved and releases canvas memory',async()=>{
 const old=globalThis.document;let output;
 const ctx={font:'',measureText:s=>({width:s.length*9}),scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};
 globalThis.document={createElement:()=>{const c={width:0,height:0,getContext:()=>ctx,toBlob:callback=>{output=c;callback(new Blob([]));}};return c;}};
 try{await assert.rejects(createNoteImage({kind:'list',items:[]},'#fff',()=>{}),/empty/);assert.equal(output.height,1);}
 finally{globalThis.document=old;}
});
