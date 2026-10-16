import test from 'node:test';
import assert from 'node:assert/strict';
import {mountHomeSyncStatus} from '../../supabase/cfh-offline-queue.mjs';

test('Home sync stays invisible, preserves transaction notes, and retries on reconnect',t=>{
 const originals=new Map();
 const replace=(name,value)=>{originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});};
 t.after(()=>{for(const [name,descriptor] of originals)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
 const win=new EventTarget(),doc=new EventTarget();doc.hidden=false;
 doc.createElement=()=>{throw Error('Home sync must not mount a panel');};
 doc.querySelectorAll=()=>{throw Error('Home sync must not overwrite transaction notes');};
 replace('window',win);replace('document',doc);replace('navigator',{onLine:false});
 const timers=new Map();let timerId=0;
 replace('setTimeout',(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;});replace('clearTimeout',id=>timers.delete(id));
 let renders,flushes=0;const queue={items:[{}],busy:false,onChange:fn=>{renders=fn;},flush:async()=>{flushes++;}};
 mountHomeSyncStatus(queue);assert.equal(flushes,1);assert.equal(timers.size,0);
 navigator.onLine=true;win.dispatchEvent(new Event('online'));assert.equal(flushes,2);assert.equal(timers.size,1);
 const retry=[...timers.values()][0];retry.fn();assert.equal(flushes,3);
 queue.items=[];renders();assert.equal(timers.size,0);
 win.dispatchEvent(new Event('pageshow'));assert.equal(flushes,4);
});
