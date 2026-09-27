const CACHE_NAME = 'judetex-v3-internal';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/styles.css',
    './css/responsive.css',
    './js/utils.js',
    './js/shop-app.js',
    './js/shop-db.js',
    './pages/admin-login.html',
    './pages/shop-dashboard.html'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        }).catch(() => {
            // Fallback if offline
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});
