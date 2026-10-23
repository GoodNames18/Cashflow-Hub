const CACHE_NAME = 'cashflow-hub-v97-inline-audio-and-text';
const BASE=new URL('./',self.location.href);
const assetURL=path=>new URL(path,BASE).href;
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const response=await fetch(assetURL('offline-assets.json'),{cache:'no-store'});
  if(!response.ok)throw Error('Offline asset list unavailable');
  const paths=await response.json(),cache=await caches.open(CACHE_NAME);
  // Do not activate a partial release. The previous complete cache remains usable.
  await cache.addAll(paths.map(assetURL));await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('cashflow-hub-')&&key!==CACHE_NAME)await caches.delete(key);
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
 const staticAsset=/\.(?:html|mjs|js|css|png|jpe?g|svg|webp|ico|woff2?)(?:$)/i.test(url.pathname);
 if(request.mode!=='navigate'&&!staticAsset)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE_NAME);
  // One versioned shell and its matching modules work immediately in airplane mode.
  const cached=request.mode==='navigate'?await cache.match(assetURL('index.html')):await cache.match(request,{ignoreSearch:true});
  if(cached)return cached;
  try{
   const response=await fetch(request,{signal:AbortSignal.timeout(8000)});
   if(response.ok)await cache.put(request,response.clone());
   return response;
  }catch{return Response.error();}
 })());
});

self.addEventListener("push",function(event){
 let data={};try{data=event.data?event.data.json():{};}catch(e){data={body:event.data?event.data.text():""};}
 event.waitUntil((async function(){
  let error='';
  try{await self.registration.showNotification(data.title||"Cashflow Hub",{
   body:data.body||"You have a scheduled reminder.",icon:"/Cashflow-Hub/icon-192.png",badge:"/Cashflow-Hub/icon-192.png",
   tag:data.tag||"cfh-reminder",data:{url:data.url||"/Cashflow-Hub/?page=calendar"},vibrate:[150,80,150]
  });}catch(e){error=e.message||String(e);}
  if(data.receipt&&data.device)try{
   await fetch("https://mssrsogwxvxyyjnavdiu.supabase.co/functions/v1/cfh-push?action=receipt",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({device:data.device,key:data.tag,receipt:data.receipt,error:error})
   });
  }catch(e){}
 })());
});
self.addEventListener("notificationclick",function(event){
 event.notification.close();
 const target=new URL(event.notification.data?.url||"/Cashflow-Hub/?page=calendar",self.location.origin);
 if(target.origin!==self.location.origin)return;
 event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async clients=>{
 for(const client of clients)if(client.url.startsWith(self.location.origin+"/Cashflow-Hub/")){await client.navigate(target.href);return client.focus();}
 return self.clients.openWindow(target.href);
 }));
});
