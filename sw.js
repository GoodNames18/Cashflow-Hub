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
