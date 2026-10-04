window.activeComandas = [];
window.pendingShowBill = false;
window.newComandasMap = new Map();
// Parse timestamps stored as UTC in DB
function parseUtc(s) { if (!s) return Date.now(); const t = s.includes('T') ? s : s + 'Z'; const d = new Date(t); return isNaN(d.getTime()) ? Date.now() : d.getTime(); }
const HOST = window.location.hostname;
const socket = io({ query: { token: localStorage.getItem('chef_token'), restaurante_id: localStorage.getItem('restaurante_id') || '1' } });
window.socket = socket;
if (typeof initChefTz === 'function') initChefTz(socket);

socket.on('tenant_atualizado', (data) => {
  if (data && data.restaurante_id) {
    localStorage.setItem('restaurante_id', data.restaurante_id);
  }
  if (data && data.token) {
    localStorage.setItem('chef_token', data.token);
  }
  socket.disconnect();
  socket.io.opts.query = { token: data.token, restaurante_id: String(data.restaurante_id) };
  socket.connect();
});

socket.on('connect', () => {
  if (loggedUser) {
    socket.emit('get_mesas');
    socket.emit('get_produtos');
    socket.emit('get_esteira', loggedUser.nome);
  }
});

function escHtml(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function escJs(t){try{return JSON.stringify(String(t==null?'':t)).replace(/</g,'\\x3C').replace(/>/g,'\\x3E').replace(/"/g,'&quot;').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}catch(e){return '""';}}


let allMesas = [];
let allPedidos = [];
let cart = [];
let tableGroupCache = {};
let longPressTimer = null; // Used in UI for tables
let isHomePressFired = false;
let homePressTimeout = null;
/* Restaura mesa ativa e carrinho da última sessão */
try {
  const lastMesa = localStorage.getItem('chef_last_mesa');
  if (lastMesa) { currentTable = lastMesa; cart = JSON.parse(localStorage.getItem('chef_cart_' + lastMesa) || '[]'); if (!Array.isArray(cart)) cart = []; }
} catch(e) { cart = []; }

document.addEventListener('DOMContentLoaded', () => {
  // Sincronização do status de conexão e fila offline no cabeçalho
  function atualizarStatusOfflineHeader(count) {
    const badge = document.getElementById('garcom-offline-badge');
    if (!badge) return;
    const isOffline = !navigator.onLine;
    const pendingCount = (typeof count === 'number') ? count : (window.ChefOfflineQueue ? null : 0);

    if (pendingCount && pendingCount > 0) {
      badge.style.display = 'inline-flex';
      badge.style.background = '#f59e0b';
      badge.innerHTML = `<i class="ph-bold ph-cloud-arrow-up"></i> ${pendingCount} pendente${pendingCount > 1 ? 's' : ''}`;
    } else if (isOffline) {
      badge.style.display = 'inline-flex';
      badge.style.background = '#ef4444';
      badge.innerHTML = `<i class="ph-bold ph-wifi-slash"></i> Offline`;
    } else {
      badge.style.display = 'none';
    }
  }

  window.addEventListener('online', () => {
    atualizarStatusOfflineHeader();
    if (typeof showToast === 'function') showToast('Conexão restabelecida! Sincronizando...', '#10b981');
    if (window.ChefOfflineQueue && typeof window.ChefOfflineQueue.flush === 'function') {
      window.ChefOfflineQueue.flush();
    }
  });

  window.addEventListener('offline', () => {
    atualizarStatusOfflineHeader();
    if (typeof showToast === 'function') showToast('Você está offline. Os pedidos serão guardados no aparelho.', '#f59e0b');
  });

  if (window.ChefOfflineQueue && typeof window.ChefOfflineQueue.onChange === 'function') {
    window.ChefOfflineQueue.onChange(atualizarStatusOfflineHeader);
    if (typeof window.ChefOfflineQueue.count === 'function') {
      window.ChefOfflineQueue.count().then(atualizarStatusOfflineHeader).catch(() => {});
    }
  } else {
    atualizarStatusOfflineHeader();
  }

  const btnHome = document.getElementById('btn-home');
  if (btnHome) {
    const handleHomeStart = (e) => {
      isHomePressFired = false;
      homePressTimeout = setTimeout(() => {
        isHomePressFired = true;
        window.location.href = '/index.html';
      }, 2000);
    };
    
    const handleHomeEnd = (e) => {
      if (homePressTimeout) {
        clearTimeout(homePressTimeout);
        homePressTimeout = null;
      }
      if (!isHomePressFired) {
        if (typeof showView === 'function') {
          showView('tables', 'Comanda Mobile');
        }
      }
      if (e && e.cancelable) e.preventDefault();
    };

    btnHome.addEventListener('mousedown', handleHomeStart);
    btnHome.addEventListener('touchstart', handleHomeStart, { passive: true });
    btnHome.addEventListener('mouseup', handleHomeEnd);
    btnHome.addEventListener('touchend', handleHomeEnd);
  }
});
let TABS = [];
let MENU = [];
let MESAS = [];
let CONFIGS = {};
let currentTable = '';
let currentTab = '';

const contasSolicitadas = new Set();
let selectedProduct = null;
let selectedQty = 1;
let selectedAddons = new Set();
let loggedUser = null;

// --- Bill Logic Variables ---
let billItems = [];
let billSplitCount = 1;
let billSelectedItems = new Map(); // id -> fraction (0 to 1)
let billCurrentMode = 'pessoas'; // 'pessoas' or 'itens'
let billActionValue = 0;
let billSelectedIdsForFinalize = []; // FULL items selected

