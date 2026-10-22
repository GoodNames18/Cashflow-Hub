const CACHE_NAME = "cashflow-hub-v58-compact-breakdown";

const OFFLINE_ASSETS=[
  "./",
  "index.html",
  "supabase/cfh-browser.mjs?v=stock-live1",
  "supabase/vendor/supabase-js.mjs",
  "supabase/cfh-store.mjs?v=offline-home1",
  "supabase/cfh-store.mjs?v=transaction-edit1",
  "supabase/cfh-store.mjs?v=live2",
  "supabase/cfh-snapshot.mjs?v=offline-home1",
  "supabase/cfh-read-api.mjs?v=offline-home1",
  "supabase/cfh-write-api.mjs?v=transaction-edit1",
  "supabase/cfh-settings.mjs?v=offline-home1",
  "supabase/cfh-offline-queue.mjs?v=offline-home1",
  "supabase/cfh-financial-checks.mjs?v=live2",
  "supabase/cfh-entry-plan.mjs?v=moneyflow-digits1",
  "supabase/legacy-rules.mjs?v=moneyflow-digits1",
  "supabase/legacy-rules.mjs?v=rental-all1",
  "supabase/manila-date.mjs?v=calendar3",
  "supabase/rules-environment.mjs?v=transaction-order4",
  "supabase/cfh-calendar-sync.mjs?v=events1",
  "supabase/cfh-portfolio.mjs?v=portfolio3",
  "supabase/cfh-stock-prices.mjs",
  "supabase/cfh-portfolio-model.mjs",
  "supabase/cfh-portfolio-fees.mjs",
  "supabase/cfh-portfolio-sort.mjs",
  "supabase/cfh-crypto-nav.mjs",
  "supabase/cfh-portfolio-catalog.mjs",
  "supabase/cfh-stock-logos.mjs",
  "supabase/cfh-transaction-edit.mjs?v=transaction-edit1",
  "icon-192.png",
  "icon-512.png",
  "cashflow-hub-logo.png"
];
self.addEventListener("install", function(event) {
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(OFFLINE_ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(key) {
            return key !== CACHE_NAME;
          })
          .map(function(key) {
            return caches.delete(key);
          })
      );
    })
  );

  self.clients.claim();
});

self.addEventListener("fetch", function(event) {
  var request = event.request;

  if (request.method !== "GET") return;

  var url = new URL(request.url);

  // Do not touch Apps Script or other external requests.
  if (url.origin !== self.location.origin) return;

  var fetchOptions =
    request.destination === "image"
      ? { cache: "no-store" }
      : undefined;

  event.respondWith(
    fetch(request, fetchOptions)
      .then(function(response) {
        if (response && response.ok) {
          var copy = response.clone();

          event.waitUntil(caches.open(CACHE_NAME).then(function(cache) {
            return Promise.all([cache.put(request, copy),...(request.mode==='navigate'?[cache.put('/Cashflow-Hub/index.html',response.clone())]:[])]);
          }));
        }

        return response;
      })
      .catch(function() {
        return caches.match(request).then(function(cached) {
          if (cached) return cached;

          if (request.mode === "navigate") {
            return caches.match("/Cashflow-Hub/index.html").then(shell=>shell||caches.match("/Cashflow-Hub/")).then(shell=>shell||Response.error());
          }

          return Response.error();
        });
      })
  );
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
