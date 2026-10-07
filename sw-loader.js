const CACHE_NAME = 'chef-pwa-loader-v1';
const ASSETS = [
  '/central-pwa.html',
  '/pwa-loader.html',
  '/manifest-central.json',
  '/vendor/phosphor/src/bold/style.css'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
    }).catch(err => console.log('SW Install Error:', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Apenas intercepta as rotas do Loader PWA
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then(response => {
        // Retorna do cache se tiver, caso contrário busca da rede e atualiza
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse.ok) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cacheCopy));
          }
          return networkResponse;
        }).catch(() => {});
        
        return response || fetchPromise;
      })
    );
  }
});
