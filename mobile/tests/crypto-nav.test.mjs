import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavReveal} from '../../supabase/cfh-crypto-nav.mjs';
test('Crypto main navigation reveals for 15 seconds, resets on interaction, and restores on leaving',()=>{
 let next=0;const timers=new Map(),changes=[];
 const c=createNavReveal({onChange:(...v)=>changes.push(v),setTimer:(fn,ms)=>{assert.equal(ms,15000);timers.set(++next,fn);return next;},clearTimer:id=>timers.delete(id)});
 c.reveal();assert.equal(timers.size,0);
 c.setActive(true);assert.deepEqual(changes.at(-1),[false,true]);
 c.reveal();assert.deepEqual(changes.at(-1),[true,true]);const first=next;
 c.reveal();assert.equal(timers.has(first),false);assert.equal(timers.size,1);
 timers.get(next)();assert.deepEqual(changes.at(-1),[false,true]);assert.equal(timers.size,0);
 c.reveal();c.hide();assert.deepEqual(changes.at(-1),[false,true]);assert.equal(timers.size,0);
 c.reveal();c.setActive(false);assert.deepEqual(changes.at(-1),[false,false]);assert.equal(timers.size,0);
 c.setActive(true);assert.deepEqual(changes.at(-1),[false,true]);
});
