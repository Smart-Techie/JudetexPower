const CACHE_NAME = 'judetex-v4-internal';
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
    // Exclude API/Supabase calls
    if (event.request.url.includes('supabase.co')) return;

    // Use Network-First strategy for application assets to ensure admin always has latest code
    event.respondWith(
        fetch(event.request).then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
            });
            return response;
        }).catch(() => {
            return caches.match(event.request);
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
