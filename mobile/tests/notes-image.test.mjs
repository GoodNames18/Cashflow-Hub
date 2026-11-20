import test from 'node:test';
import assert from 'node:assert/strict';
import {createNoteImage} from '../../supabase/cfh-notes-image.mjs';
test('full note image omits checked and empty rows while including offscreen content',async()=>{
 const painted=[];let output;
 const ctx={font:'',measureText:s=>({width:s.length*9}),scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText:s=>painted.push(s)};
 const old=globalThis.document;
 globalThis.document={createElement:()=>{const c={width:0,height:0,getContext:()=>ctx,toBlob:callback=>{output=c;callback(new Blob(['png'],{type:'image/png'}));}};return c;}};
 try{
  const items=Array.from({length:100},(_,i)=>({text:'Entry '+i}));
  items.push({text:'PRIVATE CHECKED',checked:true},{text:''});
  const blob=await createNoteImage({title:'My note',kind:'list',items},'#e9e6fa',()=>{});
  assert.equal(blob.type,'image/png');assert.ok(painted.includes('Entry 99'));
  assert.ok(!painted.some(s=>s.includes('PRIVATE CHECKED')||s.includes('List item')));
  assert.ok(output.height>5000);
 }finally{globalThis.document=old;}
});
