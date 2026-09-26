/* Chef Cozinha — Fila Offline (IndexedDB) — RECURSO UPSELL
   Habilitado apenas para restaurantes com chave de ativação (cc_offline_habilitado).
   Pedidos lançados sem internet ficam gravados no dispositivo e sobem sozinhos
   quando a conexão volta (evento online + Background Sync + retry periódico). */
(function () {
  const DB_NAME = 'chef-offline';
  const STORE = 'pedidos';
  let _dbPromise = null;
  let _onChange = null;
  let _flushing = false;

  function db() {
    if (!_dbPromise) {
      _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'uuid_offline' }); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return _dbPromise;
  }

  function tx(mode) {
    return db().then(d => d.transaction(STORE, mode).objectStore(STORE));
  }

  async function add(pedido) {
    if (!pedido.uuid_offline) {
      pedido.uuid_offline = (self.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'off-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }
    const store = await tx('readwrite');
    return new Promise((res, rej) => {
      const r = store.put(JSON.parse(JSON.stringify(pedido)));
      r.onsuccess = async () => { notify(await count()); res(pedido.uuid_offline); };
      r.onerror = () => rej(r.error);
    });
  }

  async function list() {
    const store = await tx('readonly');
    return new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => rej(r.error);
    });
  }

  async function count() {
    const store = await tx('readonly');
    return new Promise((res, rej) => {
      const r = store.count();
      r.onsuccess = () => res(r.result || 0);
      r.onerror = () => rej(r.error);
    });
  }

  async function remove(uuid) {
    const store = await tx('readwrite');
    return new Promise((res) => {
      const r = store.delete(uuid);
      r.onsuccess = () => res();
      r.onerror = () => res();
    });
  }

  function notify(c) {
    if (_onChange) try { _onChange(c); } catch (e) {}
    atualizarBadgeOffline(c);
  }

  function habilitado() {
    // Modo de segurança incondicional: Se estiver offline ou se a flag estiver ativa, opera offline sem perder pedidos
    try {
      if (!navigator.onLine) return true;
      return localStorage.getItem('cc_offline_habilitado') === '1' || localStorage.getItem('cc_modo_offline') === '1';
    } catch (e) { return true; }
  }

  function atualizarBadgeOffline(qtd) {
    try {
      let badge = document.getElementById('cc-offline-emergency-badge');
      if (qtd > 0) {
        if (!badge) {
          badge = document.createElement('div');
          badge.id = 'cc-offline-emergency-badge';
          badge.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:99999;background:#1e293b;border:1.5px solid #f59e0b;color:#f8fafc;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:700;display:flex;align-items:center;gap:8px;box-shadow:0 4px 15px rgba(0,0,0,0.3);';
          document.body.appendChild(badge);
        }
        badge.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;animation:pulse 1.5s infinite;"></span>
          <span>${qtd} pedido(s) gravado(s) offline</span>
          <button onclick="window.ChefOfflineQueue.exportarEmergencia()" style="background:#f59e0b;color:#000;border:none;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:800;cursor:pointer;margin-left:6px;">Exportar</button>`;
        badge.style.display = 'flex';
      } else if (badge) {
        badge.style.display = 'none';
      }
    } catch (_) {}
  }

  /* Registra o Background Sync do Service Worker (quando suportado) */
  function agendarSyncNativo() {
    try {
      if (navigator.serviceWorker && 'SyncManager' in window) {
        navigator.serviceWorker.ready
          .then(reg => reg.sync.register('sync-pedidos'))
          .catch(() => {});
      }
    } catch (e) {}
  }

  async function flush() {
    if (_flushing || !navigator.onLine) return;
    const itens = await list();
    if (!itens.length) return;
    _flushing = true;
    try {
      const resp = await fetch('/api/pedidos/offline-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('chef_token') || '') },
        body: JSON.stringify({ pedidos: itens })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) throw new Error((data && data.error) || ('HTTP ' + resp.status));
      for (const r of (data.resultados || [])) {
        // gravado OU duplicado = item resolvido na fila; erro permanece p/ retry
        if (r.uuid_offline && r.status !== 'erro') await remove(r.uuid_offline);
      }
    } catch (e) { /* fila mantida; nova tentativa no próximo gatilho */ }
    finally {
      _flushing = false;
      notify(await count());
    }
  }

  // Exportação de emergência em arquivo JSON caso o servidor local esteja inacessível
  async function exportarEmergencia() {
    const itens = await list();
    if (!itens.length) {
      alert('Nenhum pedido pendente na fila offline.');
      return;
    }
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(itens, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `pedidos-offline-emergencia-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`);
    dlAnchor.click();
  }

  window.ChefOfflineQueue = {
    add,
    count,
    list,
    flush,
    habilitado,
    agendarSyncNativo,
    exportarEmergencia,
    onChange: (cb) => { _onChange = cb; }
  };

  /* Gatilhos de envio automático */
  window.addEventListener('online', () => {
    setTimeout(flush, 800);
  });
  window.addEventListener('offline', () => {
    count().then(notify).catch(() => {});
  });
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (ev) => {
      if (ev.data && ev.data.tipo === 'flush-offline') flush();
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    count().then(notify).catch(() => {});
    setInterval(flush, 30000);
  });
})();
