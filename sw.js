const CACHE_NAME = "cashflow-hub-v13";

self.addEventListener("install", function() {
  self.skipWaiting();
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

          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(request, copy);
          });
        }

        return response;
      })
      .catch(function() {
        return caches.match(request).then(function(cached) {
          if (cached) return cached;

          if (request.mode === "navigate") {
            return fetch("/Cashflow-Hub/index.html?pwa=13");
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
