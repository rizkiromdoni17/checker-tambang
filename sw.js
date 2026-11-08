/* Service worker: simpan semua berkas agar aplikasi jalan tanpa internet. */
var CACHE = 'checker-tambang-v12';
var BERKAS = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './logo.png', './ikon-192.png', './ikon-512.png', './favicon.png', './apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(BERKAS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // Hanya file aplikasi sendiri yang disimpan untuk offline; permintaan ke server lain (Google Sheets) selalu langsung ke internet.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (r) {
    return r || fetch(e.request).then(function (res) {
      var salin = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, salin); });
      return res;
    });
  }).catch(function () { return caches.match('./index.html'); }));
});
