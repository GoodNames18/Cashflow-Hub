const CACHE_NAME = "expenses-tracker-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    })
  );

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

  // Do not cache Apps Script or other external requests
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(function(response) {
        var copy = response.clone();

        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(request, copy);
        });

        return response;
      })
      .catch(function() {
        return caches.match(request);
      })
  );
});
