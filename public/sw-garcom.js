/* ═══════════════════════════════════════════════════════════════════════
   CHEF COZINHA — SERVICE WORKER DEDICADO DO GARÇOM PWA
   Otimizado para:
   - Inicialização ultrarrápida no salão (precache da casca do app)
   - Resiliência offline em áreas de sombra de Wi-Fi
   - Network-First para APIs de pedidos e bypass para WebSockets
   - Notificações Push nativas para avisos de prato pronto / mesa
   ═══════════════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'chef-garcom-pwa-v1';

const PRECACHE_ASSETS = [
  '/garcom.html',
  '/garcom-manifest.json',
  '/garcom-modules/garcom-globals.js',
  '/garcom-modules/garcom-routing.js',
  '/garcom-modules/garcom-login.js',
  '/garcom-modules/garcom-ia.js',
  '/garcom-modules/garcom-data.js',
  '/garcom-modules/garcom-tables.js',
  '/garcom-modules/garcom-bill.js',
  '/garcom-modules/garcom-menu.js',
  '/garcom-modules/garcom-esteira.js',
  '/garcom-modules/garcom-qrcode.js',
  '/garcom-modules/garcom-ui-ux.js',
  '/garcom-modules/garcom-comandas.js',
  '/garcom-modules/garcom-theme.js',
  '/socket.io.min.js',
  '/fuzzy-search.js',
  '/apple-transitions.js',
  '/apple-transitions.css',
  '/device-adapters.css',
  '/vendor/phosphor/src/regular/style.css',
  '/vendor/phosphor/src/bold/style.css',
  '/vendor/phosphor/src/fill/style.css',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.ico'
];

// Instalação: baixa e armazena os recursos essenciais da interface
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW-Garçom] Falha parcial no precache (prosseguindo normalmente):', err);
      });
    })
  );
});

// Ativação: remove versões antigas de caches do garçom
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k.startsWith('chef-garcom-pwa-') && k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // 1. WebSockets / Socket.io: sempre direto pela rede, sem interceptar
  if (url.pathname.startsWith('/socket.io/')) {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // 2. APIs do Sistema: Network-First com fallback para cache se offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Navegação (HTML garcom): Network-First para garantir atualizações, com fallback para garcom.html em cache
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((hit) => hit || caches.match('/garcom.html'));
        })
    );
    return;
  }

  // 4. Arquivos estáticos (CSS, JS, Fontes, Ícones): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});

// ── NOTIFICAÇÕES PUSH PARA O GARÇOM ──
self.addEventListener('push', (event) => {
  let data = {
    title: 'Comanda Garçom',
    body: 'Novo aviso de mesa ou pedido pronto.',
    tag: 'comanda-aviso',
    url: '/garcom.html'
  };

  try {
    if (event.data) {
      data = Object.assign(data, event.data.json());
    }
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      vibrate: [250, 100, 250, 100, 250],
      data: { url: data.url }
    })
  );
});

// Toque na notificação: foca na janela da comanda do garçom
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/garcom.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).pathname === new URL(targetUrl, self.location.origin).pathname) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
