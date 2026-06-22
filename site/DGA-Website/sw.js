/* sw.js — WebX service worker. Offline-capable public site:
   - same-origin assets: cache-first (fast, works offline)
   - navigations (HTML): network-first, fall back to cache then "/"
   - cross-origin (Strapi API): never cached (always live, tenant-correct) */
var CACHE = "webx-v1";
var SHELL = ["/", "/assets/design-system.css", "/assets/templates.css"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL).catch(function () {}); }));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave Strapi/API calls live
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (r) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); return r; })
        .catch(function () { return caches.match(req).then(function (m) { return m || caches.match("/"); }); })
    );
  } else {
    e.respondWith(
      caches.match(req).then(function (m) {
        return m || fetch(req).then(function (r) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); return r; });
      })
    );
  }
});
