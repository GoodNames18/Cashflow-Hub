import test from 'node:test';
import assert from 'node:assert/strict';
import {createChecklist} from '../../supabase/cfh-notes-checklist.mjs';

// Exercise the actual gesture listeners without loading an account or real notes.
function fixture(){
 class Surface{
  handlers=new Map();properties=new Map();classes=new Set();
  style={setProperty:(k,v)=>this.properties.set(k,v),removeProperty:k=>this.properties.delete(k)};
  classList={add:k=>this.classes.add(k),remove:k=>this.classes.delete(k)};
  addEventListener(type,fn){const handlers=this.handlers.get(type)||[];handlers.push(fn);this.handlers.set(type,handlers);}
  emit(type,values){const e={button:0,isPrimary:true,pointerType:'touch',pointerId:1,clientX:300,clientY:100,preventDefault(){},...values};for(const fn of this.handlers.get(type)||[])fn(e);}
  replaceChildren(){} append(){} setAttribute(){}
  querySelectorAll(){return [{getBoundingClientRect:()=>({width:240})}];}
 }
 const host=new Surface(),window=new Surface(),document=new Surface();
 document.createElement=()=>new Surface();document.head=new Surface();
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=window;globalThis.document=document;
 const controller=createChecklist(host,new Surface(),{changed(){},id:()=> 'unused'});
 const target={tagName:'DIV',closest:selector=>selector==='[data-check-id]'?{}:null};
 return {host,window,controller,down:x=>host.emit('pointerdown',{clientX:x,target}),move:x=>window.emit('pointermove',{clientX:x,target}),up:()=>window.emit('pointerup',{target}),restore(){globalThis.window=oldWindow;globalThis.document=oldDocument;}};
}
test('note date overlay follows both directions and retains its exact position on release',()=>{
 const f=fixture();try{
  f.down(300);f.move(250);assert.equal(f.host.properties.get('--cfh-check-swipe'),'50px');
  f.move(210);assert.equal(f.host.properties.get('--cfh-check-swipe'),'90px');
  f.move(270);assert.equal(f.host.properties.get('--cfh-check-swipe'),'30px');
  f.up();assert.equal(f.host.properties.get('--cfh-check-swipe'),'30px');
  f.down(270);f.move(300);assert.equal(f.host.properties.get('--cfh-check-swipe'),'0px');f.up();
  f.down(300);f.move(0);assert.equal(f.host.properties.get('--cfh-check-swipe'),'240px');
  f.move(200);assert.equal(f.host.properties.get('--cfh-check-swipe'),'100px');
 }finally{f.restore();}
});
test('vertical scrolling does not reveal note dates and back dismisses a partially revealed overlay',()=>{
 const f=fixture();try{
  f.down(300);f.window.emit('pointermove',{clientX:296,clientY:150});assert.equal(f.host.properties.has('--cfh-check-swipe'),false);
  f.down(300);f.move(250);f.up();assert.equal(f.controller.cancelMove(),true);
  assert.equal(f.host.properties.has('--cfh-check-swipe'),false);assert.equal(f.host.classes.has('is-revealing-timestamps'),false);
 }finally{f.restore();}
});
