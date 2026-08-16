/* سرویس‌ورکر دفتر قرض.
   همه‌ی فایل‌های اپ را کش می‌کند تا بعد از نصب، اپ کاملاً بدون اینترنت باز شود و کار کند.
   با هر تغییر در فایل‌های اپ، عدد نسخه را یکی زیاد کنید تا کش تازه شود. */

var CACHE_NAME = 'daftar-qarz-v1';

var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/jalali.js',
  './js/store.js',
  './js/xlsx.js',
  './js/backup.js',
  './js/ui.js',
  './js/app.js',
  './assets/fonts/Vazirmatn-Regular.woff2',
  './assets/fonts/Vazirmatn-Medium.woff2',
  './assets/fonts/Vazirmatn-Bold.woff2',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.map(function (name) {
          if (name !== CACHE_NAME) return caches.delete(name);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  // فقط درخواست‌های خواندنیِ خودِ اپ کش می‌شوند؛ درخواست تلگرام دست‌نخورده رد می‌شود.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;

      return fetch(request)
        .then(function (response) {
          if (response && response.status === 200 && response.type === 'basic') {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        })
        .catch(function () {
          // آفلاین و بدون کش: برای هر مسیر ناوبری، صفحه‌ی اصلی اپ را برمی‌گردانیم.
          if (request.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'آفلاین' });
        });
    })
  );
});
