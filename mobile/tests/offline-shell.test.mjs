import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url),manifest=JSON.parse(readFileSync(new URL('offline-assets.json',root),'utf8'));
const source=readFileSync(new URL('sw.js',root),'utf8');
function setup({base='https://example.test/Cashflow-Hub/',broken=false}={}){
 const handlers={},stores=new Map(),deleted=[];let online=true,requests=0;
 const key=request=>typeof request==='string'?request:request.url;
 const cache=name=>{if(!stores.has(name))stores.set(name,new Map());const rows=stores.get(name);return{
  async addAll(urls){if(broken)throw Error('Interrupted installation');for(const url of urls){const relative=decodeURIComponent(new URL(url).pathname.slice(new URL(base).pathname.length));rows.set(url,new Response(readFileSync(new URL(relative||'index.html',root))));}},
  async match(request,{ignoreSearch=false}={}){const wanted=new URL(key(request));for(const [url,response]of rows){const current=new URL(url);if(url===wanted.href||ignoreSearch&&current.origin===wanted.origin&&current.pathname===wanted.pathname)return response.clone();}},
  async put(request,response){rows.set(key(request),response.clone());}
 };};
 const caches={open:async name=>cache(name),keys:async()=>[...stores.keys()],delete:async name=>{deleted.push(name);return stores.delete(name);}};
 const c=vm.createContext({self:{location:{href:base+'sw.js',origin:new URL(base).origin},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches,URL,Response,AbortSignal,fetch:async url=>{requests++;if(!online)throw Error('Offline');return new Response(JSON.stringify(manifest));}});vm.runInContext(source,c);
 async function lifecycle(name){let promise;handlers[name]({waitUntil:p=>promise=p});await promise;}
 async function request(url,options={}){let promise;handlers.fetch({request:{url:new URL(url,base).href,method:'GET',mode:'cors',...options},respondWith:p=>promise=p});return promise&&await promise;}
 return{lifecycle,request,stores,deleted,offline:()=>online=false,requests:()=>requests,cache};
}
test('offline manifest contains every module dependency and every referenced stock logo',()=>{
 for(const path of manifest)assert.ok(existsSync(new URL(path,root)),path);
 for(const path of manifest.filter(path=>path.endsWith('.mjs')&&!path.includes('/vendor/'))){const source=readFileSync(new URL(path,root),'utf8');for(const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)){const url=new URL(match[1],new URL(path,root));url.search='';const dependency=decodeURIComponent(url.href.slice(root.href.length));assert.ok(manifest.includes(dependency),path+' imports uncached '+dependency);}}
 const logos=readFileSync(new URL('supabase/cfh-stock-logos.mjs',root),'utf8');for(const [,path]of logos.matchAll(/"(images\/[^" ]+)"/g))assert.ok(manifest.includes(path),path);
});
test('installed website boots offline at either hosting path and serves queried modules and images without network',async()=>{
 for(const base of ['https://example.test/Cashflow-Hub/','https://example.test/']){const s=setup({base});await s.lifecycle('install');s.offline();const before=s.requests();const page=await s.request('?page=calendar',{mode:'navigate'});assert.match(await page.text(),/Cashflow Hub/);
 for(const path of ['supabase/cfh-browser.mjs?v=stock-live1','supabase/cfh-notes.mjs?v=notes2','supabase/cfh-offline-queue.mjs?v=offline-home1','images/stocks/AREIT.jpg','gcash-logo.png'])assert.equal((await s.request(path)).status,200,path);assert.equal(s.requests(),before);}
});
test('activation keeps unrelated caches and removes only earlier Cashflow releases',async()=>{
 const s=setup();await s.cache('another-app-cache').put('https://example.test/other',new Response('other'));await s.cache('cashflow-hub-old').put('https://example.test/old',new Response('old'));await s.lifecycle('install');await s.lifecycle('activate');assert.deepEqual(s.deleted,['cashflow-hub-old']);assert.ok(s.stores.has('another-app-cache'));
});
test('interrupted installation rejects without deleting the previous offline version',async()=>{
 const s=setup({broken:true});await s.cache('cashflow-hub-old').put('https://example.test/old',new Response('old'));await assert.rejects(s.lifecycle('install'),/Interrupted/);assert.ok(s.stores.has('cashflow-hub-old'));
});
test('service worker never caches remote private data or write requests',async()=>{
 const s=setup();assert.equal(await s.request('https://private.test/rest/v1/records'),undefined);assert.equal(await s.request('index.html',{method:'POST'}),undefined);assert.equal(await s.request('api/records'),undefined);
});
