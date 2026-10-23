import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppBackHandler} from '../../supabase/cfh-back-navigation.mjs';
function setup(page='gcash'){
 const nodes=new Map();let current=page,homes=0;
 const document={getElementById:id=>nodes.get(id),querySelectorAll:selector=>[...nodes.values()].filter(n=>selector==='dialog[open]'?n.dialog&&n.open:selector==='[aria-modal="true"]'?n.modal:false),dispatchEvent(){}};
 const window={getComputedStyle:n=>({zIndex:n.z||0}),Event:class{constructor(type,options){Object.assign(this,{type,...options});}},KeyboardEvent:class{}};
 const add=(id,extra={})=>{const n={hidden:false,closest(){return this.hidden?this:null;},getClientRects(){return this.hidden?[]:[{}];},setAttribute(){},...extra};nodes.set(id,n);return n;};
 return {document,window,add,getPage:()=>current,goHome:()=>{current='gcash';homes++;},get homes(){return homes;}};
}
test('every non-root section returns to Cash In/Out before permitting minimize',()=>{
 for(const page of ['lifeLog','twice','printing','expenses','test','rental','calendar','crypto','notes','money','more']){const env=setup(page),back=createAppBackHandler(env);assert.equal(back(),true,page);assert.equal(env.getPage(),'gcash');assert.equal(env.homes,1);assert.equal(back(),false);}
});
test('Watchlist, Notes and Portfolio layers consume Back before page navigation',()=>{
 for(const name of ['cfhHandleWatchlistBack','cfhHandleNotesBack','cfhHandlePortfolioBack']){const env=setup('crypto');let open=true;env.window[name]=()=>{if(!open)return false;open=false;return true;};const back=createAppBackHandler(env);assert.equal(back(),true);assert.equal(env.homes,0);assert.equal(back(),true);assert.equal(env.getPage(),'gcash');assert.equal(back(),false);}
});
test('legacy popup uses its own close callback and highest layer closes first',()=>{
 const env=setup();const lower=env.add('lower',{z:10}),upper=env.add('upper',{z:20});let calls=[];env.legacy=[['lower',()=>{calls.push('lower');lower.hidden=true;}],['upper',()=>{calls.push('upper');upper.hidden=true;}]];const back=createAppBackHandler(env);assert.equal(back(),true);assert.deepEqual(calls,['upper']);assert.equal(back(),true);assert.deepEqual(calls,['upper','lower']);assert.equal(back(),false);
});
test('native dialogs honor cancellation guards instead of allowing exit',()=>{
 const env=setup(),dialog=env.add('guarded',{dialog:true,open:true,dispatchEvent(){return false;},close(){throw Error('Guard was bypassed');}});assert.equal(createAppBackHandler(env)(),true);assert.equal(dialog.open,true);
});
test('sort menu dismisses before navigating Home and unknown modal prevents exit',()=>{
 const env=setup('notes'),menu=env.add('cfhNotesSortMenu');const back=createAppBackHandler(env);assert.equal(back(),true);assert.equal(menu.hidden,true);assert.equal(env.homes,0);assert.equal(back(),true);env.add('newModal',{modal:true});assert.equal(back(),true);assert.equal(env.getPage(),'gcash');
});
