import test from 'node:test';import assert from 'node:assert/strict';
import {createSheetDismissal} from '../../supabase/cfh-sheet-dismiss.mjs';
function fixture(reduce=false){
 const timers=new Map(),classes=new Set();let next=0;
 const sheet=new EventTarget();sheet.open=true;sheet.closed=0;sheet.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)};
 sheet.ownerDocument={defaultView:{matchMedia:()=>({matches:reduce}),setTimeout:fn=>{timers.set(++next,fn);return next},clearTimeout:id=>timers.delete(id)}};
 sheet.close=()=>{sheet.open=false;sheet.closed++;sheet.dispatchEvent(new Event('close'))};
 const controller=createSheetDismissal(sheet);
 const end=()=>{const event=new Event('animationend');event.animationName='cfhNoteSheetOut';sheet.dispatchEvent(event)};
 return {sheet,controller,timers,end};
}
test('sheet closes only after its animation and duplicate dismissals do not close twice',()=>{
 const f=fixture();f.controller.dismiss();f.controller.dismiss();assert.equal(f.sheet.open,true);assert.equal(f.sheet.classList.contains('is-closing'),true);assert.equal(f.timers.size,1);f.end();assert.equal(f.sheet.open,false);assert.equal(f.sheet.closed,1);assert.equal(f.sheet.classList.contains('is-closing'),false);assert.equal(f.timers.size,0);f.end();assert.equal(f.sheet.closed,1);
});
test('fallback completes dismissal; canceling or reopening cannot close a new sheet page',()=>{
 const f=fixture();f.controller.dismiss();const stale=[...f.timers.values()][0];f.controller.cancel();stale();assert.equal(f.sheet.open,true);f.controller.dismiss();[...f.timers.values()][0]();assert.equal(f.sheet.open,false);f.sheet.open=true;stale();assert.equal(f.sheet.open,true);
});
test('reduced motion closes immediately without waiting for animation',()=>{
 const f=fixture(true);f.controller.dismiss();assert.equal(f.sheet.open,false);assert.equal(f.timers.size,0);
});
