/**
 * ══════════════════════════════════════════════════════════════════
 * 📱 CHEF SYNC — SERVICE WORKER UNIFICADO DE SHELL PWA (v2.0)
 * ══════════════════════════════════════════════════════════════════
 * - Padrão W3C PWA & Google Chrome PWA Checklist
 * - Stale-While-Revalidate para cascas de tela (Carregamento instantâneo)
 * - Cache-First para fontes, ícones e bibliotecas estáticas
 * - Bypass total para WebSockets (Socket.IO) e chamadas dinâmicas (/api)
 * - Resiliência e feedback offline automático
 */

const CACHE_NAME = 'chef-pwa-shell-v2';

const PRECACHE_ASSETS = [
  '/central-pwa.html',
  '/pwa-garcom.html',
  '/pwa-cozinha.html',
  '/pwa-motoboy.html',
  '/pwa-pdv.html',
  '/pwa-gerente.html',
  '/pwa-loader.html',
  '/pwa-colaborador.html',
  '/manifest-central.json',
  '/manifest-garcom.json',
  '/manifest-cozinha.json',
  '/manifest-motoboy.json',
  '/manifest-pdv.json',
  '/manifest-gerente.json',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-256.png',
  '/icons/icon-512.png',
  '/icon.ico',
  '/vendor/phosphor/src/bold/style.css',
  '/vendor/phosphor/src/regular/style.css',
  '/vendor/phosphor/src/fill/style.css',
  '/vendor/html5-qrcode/html5-qrcode.min.js'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(
        PRECACHE_ASSETS.map((url) => new Request(url, { cache: 'reload' }))
      ).catch((err) => {
        console.warn('[SW-Chef] Precache parcial concluído:', err);
      });
    })
  );
});

// Ativação e limpeza de versões antigas do cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => {
            console.log('[SW-Chef] Removendo cache legado:', k);
            return caches.delete(k);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia de Fetch inteligente
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Ignora WebSockets e APIs dinâmicas
  if (url.pathname.startsWith('/socket.io/') || url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. Recursos Estáticos de Terceiros e Fontes Google: Cache-First
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.ttf')
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return networkRes;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 3. Páginas Shell do PWA: Stale-While-Revalidate
  const isPwaShell = PRECACHE_ASSETS.some((asset) => url.pathname.endsWith(asset) || url.pathname === asset);
  if (isPwaShell || url.pathname.startsWith('/pwa-')) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => {
        const fetchPromise = fetch(req).then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return networkRes;
        }).catch((err) => {
          console.warn('[SW-Chef] Falha na rede para shell PWA:', err);
          return null;
        });

        // Retorna o cache de imediato se disponível, ou aguarda a rede
        return cached || fetchPromise;
      })
    );
    return;
  }
});

// Suporte para mensagem de SkipWaiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
