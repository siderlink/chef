const HOST = window.location.hostname;
// Parse timestamps stored as UTC in DB (SQLite datetime('now') = UTC)
function parseUtc(s) { if (!s) return Date.now(); const t = s.includes('T') ? s : s + 'Z'; const d = new Date(t); return isNaN(d.getTime()) ? Date.now() : d.getTime(); }
// (Seguran├ºa) Escapa valor para string JS dentro de onclick.
function escJs(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  return JSON.stringify(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
// (Seguran├ºa) Escapa valor para conte├║do HTML.
function escHtml(v) {
  return (v === null || v === undefined) ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// (Seguran├ºa) Converte para id num├®rico seguro (evita inje├º├úo via onclick/data-id/querySelector).
function safeId(v) {
  const n = parseInt(v, 10);
  return (Number.isFinite(n) && n > 0) ? n : 0;
}
// (Seguran├ºa) Converte para quantidade num├®rica segura (m├¡nimo 1).
function safeQty(v) {
  const n = parseInt(v, 10);
  return (Number.isFinite(n) && n > 0) ? n : 1;
}
// Colaboradores usam a sess├úo de funcion├írio (chef_session); dono/gerente usam chef_token.
function obterTokenAtual() {
  const t = localStorage.getItem('chef_token');
  if (t) return t;
  try {
    const sess = JSON.parse(localStorage.getItem('chef_session') || 'null');
    if (sess && sess.token) return sess.token;
  } catch (e) {}
  return '';
}
function sessaoFuncionario() {
  return !localStorage.getItem('chef_token') && localStorage.getItem('chef_session');
}
function redirecionarSemSessao() {
  if (sessaoFuncionario()) window.location.href = '/painel-funcionario.html';
  else window.location.href = '/login.html';
}
const socket = io({ query: { token: obterTokenAtual(), restaurante_id: localStorage.getItem('restaurante_id') || '1' } });
window.socket = socket;
if (typeof initChefTz === 'function') initChefTz(socket);

// Reidratação automática da sessão de colaboradores
const savedSession = localStorage.getItem('chef_session');
if (savedSession) {
  try {
    const sess = JSON.parse(savedSession);
    if (sess.token) socket.emit('login_funcionario_token', sess.token);
  } catch (e) {}
}

socket.on('login_error', (msg) => {
  localStorage.removeItem('chef_credentials');
  localStorage.removeItem('chef_session');
  redirecionarSemSessao();
});

socket.on('tenant_atualizado', (data) => {
  if (data && data.restaurante_id) localStorage.setItem('restaurante_id', data.restaurante_id);
  if (data && data.token) localStorage.setItem('chef_token', data.token);
  socket.disconnect();
  socket.io.opts.query = { token: data.token, restaurante_id: String(data.restaurante_id) };
  socket.connect();
});

let queueData = [];
let currentFilter = localStorage.getItem('filaCurrentFilter') || 'Em espera';
let currentSector = localStorage.getItem('filaCurrentSector') || 'Todos';
let filaSearchText = localStorage.getItem('filaSearchText') || '';
let filaSortDelay = localStorage.getItem('filaSortDelay') === 'true';
let filaTipoFiltro = localStorage.getItem('filaTipoFiltro') || 'todos';
let produtoCategorias = new Map();
let iaConfig = { minutosAtencao: 50, segundosPulseNovoPedido: 8 };
const newOrderIds = new Set();
const attentionOrderIds = new Set();
let previousOrderIds = new Set();
const chamarTimestamps = {};
const garcomBuscando = new Map();

window.filaSearchInput = function() {
  const input = document.getElementById('fila-search-input');
  if (!input) return;
  filaSearchText = input.value.trim().toLowerCase();
  localStorage.setItem('filaSearchText', filaSearchText);
  renderQueue();
};

window.toggleSortDelay = function() {
  filaSortDelay = !filaSortDelay;
  localStorage.setItem('filaSortDelay', filaSortDelay);
  const btn = document.getElementById('btn-sort-delay');
  if (btn) {
    btn.classList.toggle('active', filaSortDelay);
    btn.querySelector('span').textContent = filaSortDelay ? 'Mais recentes' : 'Mais antigos';
  }
  renderQueue();
};

// --- FILTRO POR TIPO DE ITEM (Todos / Por├º├Áes / A La Carte) ---
// A categoria do produto vem do card├ípio (produtos.categoria); o pedido s├│ guarda o nome.
function categoriaDoProduto(nome) {
  let n = String(nome || '').trim().toLowerCase();
  while (n) {
    if (produtoCategorias.has(n)) return produtoCategorias.get(n);
    const m = n.match(/^(.+)\s*\([^)]*\)\s*$/);
    if (!m) break;
    n = m[1].trim();
  }
  return null;
}

function tipoDoItem(item) {
  const nome = item.productName || item.nome || '';
  const cat = categoriaDoProduto(nome);
  if (cat) {
    const c = String(cat).toLowerCase();
    if (c.indexOf('por├º') !== -1) return 'porcao';
    if (c.indexOf('a la carte') !== -1) return 'alacarte';
    return 'outro';
  }
  const n = String(nome).toLowerCase();
  if (n.indexOf('por├º') !== -1) return 'porcao';
  if (n.indexOf('a la carte') !== -1) return 'alacarte';
  return 'outro';
}

window.setFiltroTipo = function(tipo) {
  filaTipoFiltro = ['todos', 'porcao', 'alacarte'].indexOf(tipo) !== -1 ? tipo : 'todos';
  localStorage.setItem('filaTipoFiltro', filaTipoFiltro);
  document.querySelectorAll('.queue-tipo-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tipo === filaTipoFiltro);
  });
  renderQueue();
};

function carregarPedidos() {
  const token = obterTokenAtual();
  fetch('/api/pedidos', {
    headers: token ? { 'Authorization': 'Bearer ' + token } : {}
  })
    .then(r => {
      if (r.status === 401 || r.status === 403) {
        redirecionarSemSessao();
        throw new Error('N├úo autenticado');
      }
      return r.json();
    })
    .then(data => {
      if (Array.isArray(data)) {
        const oldIds = new Set(queueData.map(p => p.id));
        queueData = data;
        renderQueue();
        renderizarSecoesFila();
      }
    })
    .catch(() => {});
  
  if (socket && socket.emit) {
    socket.emit('get_pedidos');
    socket.emit('get_ia_config');
  }
}

function atualizarStatusConexao(online) {
  const badge = document.getElementById('kds-connection-badge');
  const text = document.getElementById('kds-conn-text');
  if (!badge || !text) return;
  if (online) {
    badge.className = 'kds-conn-badge online';
    badge.title = 'Conectado ao servidor (tempo real ativo)';
    text.textContent = 'Online';
  } else {
    badge.className = 'kds-conn-badge reconnecting';
    badge.title = 'Desconectado do servidor. Tentando reconectar...';
    text.textContent = 'Reconectando...';
  }
}

socket.on('connect', () => {
  atualizarStatusConexao(true);
  carregarPedidos();
  aplicarFiltrosSalvos();
  sincronizarSecoesFilaDoServidor();
  socket.emit('get_produtos');
});

socket.on('disconnect', () => {
  atualizarStatusConexao(false);
});

socket.on('connect_error', () => {
  atualizarStatusConexao(false);
});

socket.on('produtos_atualizados', (prods) => {
  produtoCategorias = new Map();
  (Array.isArray(prods) ? prods : []).forEach(p => {
    if (p && p.nome) produtoCategorias.set(String(p.nome).trim().toLowerCase(), p.categoria);
  });
  if (queueData.length > 0) renderQueue();
});

socket.on('admin_configs_updated', () => {
  sincronizarSecoesFilaDoServidor();
});

function aplicarFiltrosSalvos() {
  document.querySelectorAll('.sidebar-sectors .sector-btn, .sector-modal-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-sector') === currentSector) {
      btn.classList.add('active');
    }
  });
  const label = document.getElementById('current-sector-label');
  if (label) label.textContent = currentSector;
  const labelSidebar = document.getElementById('current-sector-label-sidebar');
  if (labelSidebar) labelSidebar.textContent = currentSector;
  document.querySelectorAll('.status-btn[data-status]').forEach(btn => {
    btn.classList.remove('active');
    const bStatus = btn.getAttribute('data-status');
    if (bStatus === currentFilter || (currentFilter === 'Pronto' && bStatus === 'Pronto')) {
      btn.classList.add('active');
    }
  });
  document.querySelectorAll('.queue-tipo-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tipo === filaTipoFiltro);
  });
  const searchInput = document.getElementById('fila-search-input');
  if (searchInput) searchInput.value = filaSearchText;
  const sortBtn = document.getElementById('btn-sort-delay');
  if (sortBtn) {
    sortBtn.classList.toggle('active', filaSortDelay);
    sortBtn.querySelector('span').textContent = filaSortDelay ? 'Mais recentes' : 'Mais antigos';
  }
}

// --- SE├ç├òES DA FILA DE PEDIDOS (configur├íveis em Sons & Notifica├º├Áes) ---
const SECOES_FILA_DEFAULT = ['Cozinha 1', 'Cozinha 2', 'Bar'];
let filaSecoes = [];

function normalizarSecoesFila(lista) {
  const arr = Array.isArray(lista) ? lista : [];
  const uniq = [];
  arr.forEach(s => {
    const nome = String(s == null ? '' : s).trim();
    if (nome && !uniq.some(u => u.toLowerCase() === nome.toLowerCase())) uniq.push(nome);
  });
  return uniq.length ? uniq : SECOES_FILA_DEFAULT.slice();
}

function obterSecoesFila() {
  let base = null;
  try {
    const raw = localStorage.getItem('fila_secoes');
    if (raw) base = normalizarSecoesFila(JSON.parse(raw));
  } catch (e) { base = null; }
  if (!base) base = SECOES_FILA_DEFAULT.slice();
  (Array.isArray(queueData) ? queueData : []).forEach(p => {
    const s = String(p.sector || '').trim();
    if (s && s.toLowerCase() !== 'chamada' && !base.some(u => u.toLowerCase() === s.toLowerCase())) {
      base.push(s);
    }
  });
  return base;
}

function iconeSecaoFila(nome) {
  const n = String(nome || '').toLowerCase();
  if (n.includes('bar')) return 'ph-martini';
  if (n.includes('copa')) return 'ph-coffee';
  return 'ph-cooking-pot';
}

function renderizarSecoesFila() {
  const nova = obterSecoesFila();
  const mudou = JSON.stringify(nova) !== JSON.stringify(filaSecoes);
  filaSecoes = nova;
  if (mudou) {
    const sidebar = document.getElementById('sidebar-sectors-dinamicos');
    if (sidebar) {
      sidebar.innerHTML = filaSecoes.map(nome =>
        `<div class="sector-btn" data-sector="${escHtml(nome)}" onclick="filtrarSetor(${escJs(nome)}); toggleSidebarSectors();">
          <div class="sector-icon bg-green"><i class="ph ${iconeSecaoFila(nome)}"></i></div>
          <span>${escHtml(nome)}</span>
        </div>`
      ).join('');
    }
    const modal = document.getElementById('modal-setor-dinamicos');
    if (modal) {
      modal.innerHTML = filaSecoes.map(nome =>
        `<button class="sector-modal-btn" data-sector="${escHtml(nome)}" onclick="window.selecionarSetorModal(${escJs(nome)})">
          <div class="sector-modal-icon bg-green"><i class="ph ${iconeSecaoFila(nome)}"></i></div>
          <div class="sector-modal-info"><span class="sector-modal-title">${escHtml(nome)}</span></div>
        </button>`
      ).join('');
    }
    const settingsModalSecoes = document.getElementById('modal-settings-setores-dinamicos');
    if (settingsModalSecoes) {
      settingsModalSecoes.innerHTML = filaSecoes.map(nome =>
        `<button class="fila-settings-btn sector-modal-btn" data-sector="${escHtml(nome)}" onclick="filtrarSetor(${escJs(nome)})">
          <i class="ph ${iconeSecaoFila(nome)}"></i><span>${escHtml(nome)}</span>
        </button>`
      ).join('');
    }
  }
  aplicarFiltrosSalvos();
}

function sincronizarSecoesFilaDoServidor() {
  fetch('/api/config?restaurante_id=' + encodeURIComponent(localStorage.getItem('restaurante_id') || '1'), { headers: { 'Accept': 'application/json' } })
    .then(r => r.json())
    .then(cfg => {
      let secoes = null;
      if (cfg && cfg.fila_secoes) {
        let lista = cfg.fila_secoes;
        if (typeof lista === 'string') {
          try { lista = JSON.parse(lista); } catch (e) { lista = []; }
        }
        secoes = normalizarSecoesFila(lista);
      }
      if (secoes && JSON.stringify(secoes) !== JSON.stringify(filaSecoes)) {
        try { localStorage.setItem('fila_secoes', JSON.stringify(secoes)); } catch (e) {}
        renderizarSecoesFila();
      }
      Object.keys(cfg).forEach(key => {
        if ((key.startsWith('sound-') || key === 'delay-alarm-sound' || key === 'delay-alarm-time' || key === 'delay-alarm-repeat') && cfg[key] != null) {
          try { localStorage.setItem(key, String(cfg[key])); } catch (e) {}
        }
      });
    })
    .catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {
  renderizarSecoesFila();
  sincronizarSecoesFilaDoServidor();
});

window.filtrarSetor = function(sectorName) {
  currentSector = sectorName;
  localStorage.setItem('filaCurrentSector', sectorName);
  document.querySelectorAll('.sidebar-sectors .sector-btn, .sector-modal-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-sector') === sectorName) {
      btn.classList.add('active');
    }
  });
  const label = document.getElementById('current-sector-label');
  if (label) label.textContent = sectorName;
  const labelSidebar = document.getElementById('current-sector-label-sidebar');
  if (labelSidebar) labelSidebar.textContent = sectorName;
  renderQueue();
};

window.abrirModalSetor = function() {
  const modal = document.getElementById('modal-setor');
  if (modal) modal.style.display = 'flex';
};

window.fecharModalSetor = function() {
  const modal = document.getElementById('modal-setor');
  if (modal) modal.style.display = 'none';
};

window.selecionarSetorModal = function(setor) {
  window.filtrarSetor(setor);
  window.fecharModalSetor();
};

// Alterna o seletor de fila/setor: dropdown no desktop.
// No mobile as pills de setor j├í ficam sempre vis├¡veis, ent├úo n├úo abre modal.
window.toggleSidebarSectors = function() {
  if (window.innerWidth <= 768) return;
  const dropdown = document.getElementById('sidebar-sectors-dropdown');
  if (!dropdown) return;
  const isOpen = dropdown.style.maxHeight && dropdown.style.maxHeight !== '0px';
  dropdown.style.maxHeight = isOpen ? '0px' : '400px';
};

socket.on('ia_config_atualizada', (config) => {
  if (config) iaConfig = { ...iaConfig, ...config };
});

// ÔöÇÔöÇ SOM E VIBRA├ç├âO PARA NOVOS PEDIDOS (MOBILE & DESKTOP) ÔöÇÔöÇ
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Desbloquear ├íudio no primeiro toque/clique do usu├írio
['click', 'touchstart', 'pointerdown', 'keydown'].forEach(evt => {
  window.addEventListener(evt, initAudio, { once: false, passive: true });
});

function slugSecao(nome) {
  return String(nome == null ? '' : nome)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'geral';
}

function playOrderSoundAndVibrate(status = 'Em espera', sector = '') {
  initAudio();

  // 1. Vibra├º├úo em dispositivos m├│veis
  if (navigator && typeof navigator.vibrate === 'function') {
    try {

      navigator.vibrate([300, 100, 300, 100, 400]);
    } catch (e) {}
  }

  // 2. Notifica├º├Áes de som conforme configura├º├Áes salvas (por se├º├úo e etapa)
  const isMobile = window.innerWidth <= 1024;
  const stage = (status || '').toLowerCase();
  const secao = slugSecao(sector);
  let toneKey = 'sound-' + secao + '-espera';
  if (isMobile) {
    toneKey = localStorage.getItem('sound-esteira-mobile') ? 'sound-esteira-mobile' : toneKey;
  } else if (stage === 'em preparo') {
    toneKey = 'sound-' + secao + '-preparo';
  } else if (stage === 'pronto' || stage === 'prontos') {
    toneKey = 'sound-' + secao + '-pronto';
  }

  const configuredTone = localStorage.getItem(toneKey)
    || localStorage.getItem(toneKey.replace(/-(\d+)-/, '-'))
    || localStorage.getItem('sound-geral-' + (stage === 'em preparo' ? 'preparo' : (stage === 'pronto' || stage === 'prontos' ? 'pronto' : 'espera')))
    || 'dingdong';

  if (configuredTone !== 'none') {
    if (typeof window.playAudioTone === 'function') {
      window.playAudioTone(configuredTone);
    } else if (audioCtx) {
      // Bipe de retorno caso playAudioTone n├úo esteja pronto
      try {
        const now = audioCtx.currentTime;
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, now);
        gain1.gain.setValueAtTime(0.5, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.25);

        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, now + 0.15);
        gain2.gain.setValueAtTime(0.7, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(now + 0.15);
        osc2.stop(now + 0.5);
      } catch (e) {}
    }
  }

  // 3. Notifica├º├úo do Navegador (Desktop / PWA)
  if ('Notification' in window && Notification.permission === 'granted') {
    if (!window._lastNewOrderNotifTime || Date.now() - window._lastNewOrderNotifTime > 60000) {
      try {
        new Notification('­ƒöö Novo Pedido na Cozinha!', {
          body: 'Chegou um novo pedido na fila de produ├º├úo.',
          icon: '/favicon.ico',
          requireInteraction: true
        });
        window._lastNewOrderNotifTime = Date.now();
      } catch (e) {}
    }
  }
}

socket.on('pedidos_atualizados', (data) => {
  if (!data || !Array.isArray(data)) {
    if (socket && socket.emit) socket.emit('get_pedidos');
    return;
  }
  const oldIds = new Set(queueData.map(p => p.id));
  queueData = data;
  let newestId = null;
  data.forEach(p => {
    if (!oldIds.has(p.id)) {
      newOrderIds.add(safeId(p.id));
      newestId = p.id;
      setTimeout(() => {
        newOrderIds.delete(safeId(p.id));
        renderQueue();
      }, (iaConfig.segundosPulseNovoPedido || 8) * 1000);
    }
  });
  renderQueue();
  renderizarSecoesFila();
  if (newestId) {
    autoScrollToNewOrders(newestId);
  }
});

socket.on('pedido_adicionado', (pedido) => {
  if (pedido) {
    const idx = queueData.findIndex(p => p.id === pedido.id);
    if (idx !== -1) queueData[idx] = pedido;
    else queueData.push(pedido);
    newOrderIds.add(safeId(pedido.id));
    setTimeout(() => {
      newOrderIds.delete(safeId(pedido.id));
      renderQueue();
    }, (iaConfig.segundosPulseNovoPedido || 8) * 1000);
    renderQueue();
    renderizarSecoesFila();
    autoScrollToNewOrders(pedido.id);
  }
});

window.setAutoscrollMode = function(enabled) {
  localStorage.setItem('chef_kds_autoscroll', enabled ? 'true' : 'false');
  atualizarBotoesAutoscroll();
};

function atualizarBotoesAutoscroll() {
  const enabled = localStorage.getItem('chef_kds_autoscroll') !== 'false';
  const btnOn = document.getElementById('btn-autoscroll-on');
  const btnOff = document.getElementById('btn-autoscroll-off');
  if (btnOn) btnOn.classList.toggle('active', enabled);
  if (btnOff) btnOff.classList.toggle('active', !enabled);
}

let scrollTimer = null;
function autoScrollToNewOrders(targetId) {
  requestAnimationFrame(() => {
    const queueSection = document.querySelector('.queue-section');
    if (!queueSection) return;

    let targetEl = targetId ? document.querySelector(`.queue-item[data-id="${safeId(targetId)}"]`) : null;
    if (!targetEl) targetEl = document.querySelector('.queue-item.is-new');

    const pulseSecs = parseInt(localStorage.getItem('chef_kds_pulse_seconds')) || 3;
    const isAutoscrollEnabled = localStorage.getItem('chef_kds_autoscroll') !== 'false';

    if (targetEl) {
      // 1. Rolar suavemente até o pedido se o autoscroll estiver ativado
      if (isAutoscrollEnabled) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      targetEl.classList.add('new-order-entry-pulse');

      // 2. Tocar som configurado (por seção e etapa) e vibrar o celular
      const novoPedido = queueData.find(x => x.id === targetId);
      playOrderSoundAndVibrate(novoPedido ? novoPedido.status : 'Em espera', novoPedido ? novoPedido.sector : '');

      // 3. Após o tempo configurado (ex: 3s), rolar de volta suavemente para o topo se autoscroll ligado
      if (isAutoscrollEnabled) {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          queueSection.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(() => {
            if (targetEl) targetEl.classList.remove('new-order-entry-pulse');
          }, 1000);
        }, pulseSecs * 1000);
      } else {
        setTimeout(() => {
          if (targetEl) targetEl.classList.remove('new-order-entry-pulse');
        }, pulseSecs * 1000);
      }
    }
  });
}

// ÔöÇÔöÇ IA COZINHA: Pedidos especiais/urgentes ÔöÇÔöÇ
const iaPedidosEspeciais = new Map();

socket.on('ia_pedido_especial', (data) => {
  const { pedidoId, tipo, cor, urgencia, mensagem } = data;
  iaPedidosEspeciais.set(pedidoId, { tipo, cor, urgencia, mensagem });
  renderQueue();
});

// ÔöÇÔöÇ Top Toast Notifications Queue System ÔöÇÔöÇ
const topNotifQueue = [];
let isTopNotifActive = false;

window.enqueueTopNotification = function(mensagem, cor = '#ff6b35', duracao = 4500) {
  topNotifQueue.push({ mensagem, cor, duracao });
  processTopNotifQueue();
};

function processTopNotifQueue() {
  if (isTopNotifActive || topNotifQueue.length === 0) return;
  isTopNotifActive = true;
  
  const item = topNotifQueue.shift();
  const toast = document.createElement('div');
  toast.className = 'top-banner-toast';
  toast.style.cssText = `position:fixed;top:16px;left:50%;transform:translateX(-50%);background:${item.cor};color:white;padding:12px 24px;border-radius:12px;font-size:13px;font-weight:700;z-index:99999;box-shadow:0 10px 25px rgba(0,0,0,0.25);display:flex;align-items:center;gap:12px;animation:slideToastDown 0.35s ease-out;max-width:90vw;word-break:break-word;cursor:pointer;`;
  
  toast.innerHTML = `<span style="flex:1;">${escHtml(item.mensagem)}</span><i class="ph ph-x" style="font-size:16px;opacity:0.85;" title="Fechar"></i>`;
  
  const dismiss = () => {
    toast.style.animation = 'slideToastUp 0.3s ease-in forwards';
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
      isTopNotifActive = false;
      processTopNotifQueue();
    }, 300);
  };
  
  toast.onclick = dismiss;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    if (isTopNotifActive && toast.parentNode) {
      dismiss();
    }
  }, item.duracao);
}

socket.on('ia_manobra_executada', (data) => {
  const { mensagem } = data;
  window.enqueueTopNotification(`­ƒöÑ ${mensagem}`, '#ff6b35', 4500);
});

socket.on('ia_pedido_atencao', (data) => {
  const { pedidoId, cor, minutos, mesa, produto, mensagem } = data;
  attentionOrderIds.add(pedidoId);
  iaPedidosEspeciais.set(pedidoId, { tipo: 'atencao', cor, urgencia: 'atencao', mensagem });
  renderQueue();

  window.enqueueTopNotification(`ÔÅ░ ${mensagem} - Mesa ${mesa} - ${produto}`, cor || '#dc2626', 5000);

  if ('Notification' in window && Notification.permission === 'granted') {
    if (!window._lastIaNotifTime || Date.now() - window._lastIaNotifTime > 60000) {
      new Notification(`ÔÅ░ Aten├º├úo - Mesa ${mesa}`, { body: `${produto} - ${minutos}min de espera`, icon: '/favicon.ico', requireInteraction: true });
      window._lastIaNotifTime = Date.now();
    }
  }
});

// ÔöÇÔöÇ Dicas R├ípidas Interativas (L├ómpada ­ƒÆí) ÔöÇÔöÇ
let iaPanelCollapseTimer = null;

window.minimizarDicasRapidas = function() {
  const painel = document.getElementById('ia-gerente-panel');
  const fab = document.getElementById('ia-gerente-fab');
  if (painel) {
    painel.style.transform = 'scale(0.05) translate(-300px, 300px)';
    painel.style.opacity = '0';
    setTimeout(() => {
      painel.style.display = 'none';
      if (fab) fab.style.display = 'flex';
    }, 350);
  }
};

window.fecharDicasRapidas = function() {
  window.minimizarDicasRapidas();
};

window.toggleDicasRapidas = function() {
  const painel = document.getElementById('ia-gerente-panel');
  const fab = document.getElementById('ia-gerente-fab');
  if (!painel) return;

  if (painel.style.display === 'none' || painel.style.opacity === '0') {
    painel.style.display = 'block';
    requestAnimationFrame(() => {
      painel.style.transform = 'scale(1) translate(0, 0)';
      painel.style.opacity = '1';
    });
    if (fab) fab.style.display = 'none';
    const badge = document.getElementById('ia-gerente-badge');
    if (badge) badge.style.display = 'none';

    clearTimeout(iaPanelCollapseTimer);
    iaPanelCollapseTimer = setTimeout(() => {
      window.minimizarDicasRapidas();
    }, 15000);
  } else {
    window.minimizarDicasRapidas();
  }
};

socket.on('ia_dica_gerente', (data) => {
  const { dicas } = data;
  const painel = document.getElementById('ia-gerente-panel');
  const content = document.getElementById('ia-gerente-content');
  const fab = document.getElementById('ia-gerente-fab');
  const badge = document.getElementById('ia-gerente-badge');

  if (dicas && dicas.length > 0) {
    const html = dicas.map(d => {
      const icone = d.tipo === 'alerta' ? 'ÔÜá´©Å' : d.tipo === 'acao' ? '­ƒÄ»' : d.tipo === 'dica' ? '­ƒÆí' : 'Ôä╣´©Å';
      return `<div style="padding:8px 10px;font-size:12px;color:#334155;background:#f8fafc;border-radius:8px;margin-bottom:6px;border-left:3px solid #f59e0b;">${icone} ${escHtml(d.texto)}</div>`;
    }).join('');

    if (content) content.innerHTML = html;

    painel.style.display = 'block';
    requestAnimationFrame(() => {
      painel.style.transform = 'scale(1) translate(0, 0)';
      painel.style.opacity = '1';
    });
    if (fab) fab.style.display = 'none';
    if (badge) badge.style.display = 'none';

    clearTimeout(iaPanelCollapseTimer);
    iaPanelCollapseTimer = setTimeout(() => {
      window.minimizarDicasRapidas();
      if (badge) badge.style.display = 'block';
    }, 15000);
  }
});

socket.on('pedido_status_alterado', ({ id, status }) => {
  const p = queueData.find(x => x.id === id);
  if (p) {
    p.status = status;
    renderQueue();
  }
});

socket.on('garcom_buscando', ({ pedidoId, garcomNome, localName, productName }) => {
  garcomBuscando.set(pedidoId, garcomNome);
  renderQueue();
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:80px;right:16px;background:#8b5cf6;color:white;padding:12px 18px;border-radius:10px;font-size:13px;font-weight:700;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);max-width:300px;';
  toast.innerHTML = `­ƒæ¿ÔÇì­ƒì│ <strong>${escHtml(garcomNome)}</strong> est├í indo buscar ${escHtml(productName || '')} - ${escHtml(localName || '')}`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; }, 4000);
  setTimeout(() => toast.remove(), 4500);
});

socket.on('validacao_pedido_necessaria', ({ id, mesa, mesa_origem, cliente_nome }) => {
  if (typeof initAudio === 'function') initAudio();
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:16px;right:16px;background:#f59e0b;color:#1e293b;padding:12px 18px;border-radius:10px;font-size:13px;font-weight:700;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);max-width:300px;';
  toast.innerHTML = `ÔÜá´©Å Valida├º├úo: <strong>${escHtml(cliente_nome || '?')}</strong> trocou de mesa (${escHtml(mesa_origem || '?')} ÔåÆ ${escHtml(mesa)}). Verifique!`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; }, 6000);
  setTimeout(() => toast.remove(), 6500);
});



window.filtrarFila = function(statusText) {
  currentFilter = statusText;
  localStorage.setItem('filaCurrentFilter', statusText);
  document.querySelectorAll('.right-panel-status .status-btn').forEach(btn => {
    btn.classList.remove('active');
    const bStatus = btn.getAttribute('data-status');
    if (bStatus === statusText || (statusText === 'Pronto' && bStatus === 'Pronto')) {
      btn.classList.add('active');
    }
  });
  renderQueue();
};

let undoToastTimeout = null;
function mostrarToastUndo(id, productName, localName, statusAnterior, novoStatus) {
  const container = document.getElementById('kds-undo-container');
  if (!container) return;

  container.innerHTML = '';
  if (undoToastTimeout) clearTimeout(undoToastTimeout);

  const toast = document.createElement('div');
  toast.className = 'kds-undo-toast';
  toast.innerHTML = `
    <div class="kds-undo-content">
      <i class="ph ph-check-circle" style="color: #10b981; font-size: 18px;"></i>
      <span><strong>${escHtml(productName || 'Item')}</strong> (${escHtml(localName || 'Mesa')}) → <em>${escHtml(novoStatus)}</em></span>
    </div>
    <button class="kds-undo-btn" id="btn-undo-action" title="Desfazer e voltar para ${escHtml(statusAnterior)}">
      <i class="ph ph-arrow-u-up-left"></i> Desfazer
    </button>
    <div class="kds-undo-progress"></div>
  `;

  const btnUndo = toast.querySelector('#btn-undo-action');
  if (btnUndo) {
    btnUndo.onclick = function() {
      if (undoToastTimeout) clearTimeout(undoToastTimeout);
      toast.remove();
      window.alterarStatusPedido(id, statusAnterior, true);
    };
  }

  container.appendChild(toast);
  undoToastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 350);
  }, 5000);
}

window.alterarStatusPedido = function(id, novoStatus, isUndo = false) {
  const p = queueData.find(x => x.id === id);
  if (!p) {
    socket.emit('atualizar_status', { id, status: novoStatus });
    return;
  }

  const statusAnterior = p.status;
  if (!isUndo && statusAnterior !== novoStatus) {
    mostrarToastUndo(id, p.productName, p.localName, statusAnterior, novoStatus);
  }

  const cardEl = document.querySelector(`.queue-item[data-id="${safeId(id)}"]`);
  if (cardEl && !isUndo) {
    cardEl.classList.add('item-exiting');
    setTimeout(() => {
      p.status = novoStatus;
      socket.emit('atualizar_status', { id, status: novoStatus });
      renderQueue();
    }, 220);
  } else {
    p.status = novoStatus;
    socket.emit('atualizar_status', { id, status: novoStatus });
    renderQueue();
  }
};

window.chamarGarcom = function(id, productName, quantity, localName, userName) {
  const now = Date.now();
  const lastCall = chamarTimestamps[id];
  const isReChamado = lastCall && (now - lastCall) < 10000;
  chamarTimestamps[id] = now;
  socket.emit('chamar_garcom', { id, productName, quantity, localName, userName });
  const p = queueData.find(x => x.id === id);
  if (p) {
    p._chamado = true;
    renderQueue();
    if (isReChamado) {
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;top:16px;right:16px;background:#f97316;color:white;padding:10px 16px;border-radius:10px;font-size:12px;font-weight:700;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);';
      toast.innerHTML = `­ƒöö Re-chamando: ${escHtml(productName)} - ${escHtml(localName)}`;
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; }, 3000);
      setTimeout(() => toast.remove(), 3500);
    }
  }
};

function getComandaColor(localName) {
  if (!localName) return 'hsl(0, 0%, 50%)';
  let hash = 0;
  for (let i = 0; i < localName.length; i++) {
    hash = localName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash * 137.5) % 360;
  return `hsl(${hue}, 85%, 45%)`;
}

function getBgColor(diffMins) {
  if (diffMins < 20) {
    const ratio = Math.min(diffMins / 20, 1);
    const lightness = 97 - ratio * 5;
    return `hsl(56, 95%, ${lightness}%)`;
  } else if (diffMins < 60) {
    const ratio = Math.min((diffMins - 20) / 40, 1);
    const hue = 56 - ratio * 24;
    const lightness = 92 - ratio * 4;
    return `hsl(${hue}, 95%, ${lightness}%)`;
  } else {
    const ratio = Math.min((diffMins - 60) / 30, 1);
    const hue = 32 - ratio * 32;
    const lightness = 88 - ratio * 15;
    return `hsl(${hue}, 95%, ${lightness}%)`;
  }
}

function renderQueue() {
  const queueList = document.getElementById('queue-list');
  if (!queueList) return;

  const filtered = queueData.filter(item => {
    if (item.status === 'Finalizado' || item.status === 'Cancelado' || item.status === 'Entregue' || item.status === 'Fracionado' || item.status === 'Pago') {
      return false;
    }
    const itemSector = (item.sector || '').trim().toLowerCase();
    if (itemSector === 'chamada') return false;

    if (currentSector !== 'Todos' && item.sector && itemSector !== currentSector.trim().toLowerCase()) {
      return false;
    }
    if (currentFilter === 'Em espera' && item.status !== 'Pendente' && item.status !== 'Em espera') {
      return false;
    }
    if (currentFilter === 'Em preparo' && item.status !== 'Em preparo' && item.status !== 'Em Preparo') {
      return false;
    }
    if (currentFilter === 'Pronto' && item.status !== 'Pronto' && item.status !== 'Prontos') {
      return false;
    }
    if (filaTipoFiltro !== 'todos' && tipoDoItem(item) !== filaTipoFiltro) {
      return false;
    }
    if (filaSearchText) {
      const productName = (item.productName || '').toLowerCase();
      const localName = (item.localName || '').toLowerCase();
      const mesaComanda = (item.mesa_comanda || '').toLowerCase();
      if (!productName.includes(filaSearchText) && !localName.includes(filaSearchText) && !mesaComanda.includes(filaSearchText)) {
        return false;
      }
    }
    return true;
  });

  filtered.sort((a, b) => {
    const aManobra = iaPedidosEspeciais.has(a.id) && iaPedidosEspeciais.get(a.id).tipo === 'manobra';
    const bManobra = iaPedidosEspeciais.has(b.id) && iaPedidosEspeciais.get(b.id).tipo === 'manobra';
    if (aManobra && !bManobra) return -1;
    if (!aManobra && bManobra) return 1;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return filaSortDelay ? (tb - ta) : (ta - tb);
  });

  const queueMode = localStorage.getItem('modo_disposicao_fila') || 'lista';
  const isModoTv = queueMode === 'tv';

  if (filtered.length === 0) {
    const emptyHtml = `
      <div class="queue-list${isModoTv ? ' modo-tv' : ''}" id="queue-list">
        <div style="text-align: center; padding: 40px; color: #94a3b8;">
          <i class="ph ph-check-circle" style="font-size: 44px; color: #cbd5e1; margin-bottom: 8px;"></i>
          <div style="font-size: 15px; font-weight: 600; color: #64748b;">Nenhum pedido pendente nesta fila</div>
        </div>
      </div>`;
    if (typeof window.morphdom === 'function') {
      window.morphdom(queueList, emptyHtml, {
        getNodeKey: function(node) {
          return node.getAttribute ? (node.getAttribute('data-id') || node.id || null) : null;
        }
      });
    } else {
      queueList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #94a3b8;">
          <i class="ph ph-check-circle" style="font-size: 44px; color: #cbd5e1; margin-bottom: 8px;"></i>
          <div style="font-size: 15px; font-weight: 600; color: #64748b;">Nenhum pedido pendente nesta fila</div>
        </div>`;
    }
    return;
  }

  queueList.innerHTML = filtered.map(item => {
    const timeCreated = parseUtc(item.createdAt);
    const diffMins = Math.floor((Date.now() - timeCreated) / 60000);
    const bgColor = getBgColor(diffMins);
    const localColor = getComandaColor(item.localName);

    const status = item.status;
    const id = safeId(item.id);
    const qty = safeQty(item.quantity);
    let btnIcon, btnColor, nextStatus, btnTitle;
    let prevStatus = null;
    let prevIcon = null;
    let prevTitle = null;
    let isPronto = false;

    if (status === 'Em espera' || status === 'Pendente') {
      btnIcon = 'ph-fire';
      btnColor = '#eb5757';
      nextStatus = 'Em preparo';
      btnTitle = 'Iniciar preparo';
    } else if (status === 'Em preparo') {
      btnIcon = 'ph-bowl-food';
      btnColor = '#f38f18';
      nextStatus = 'Pronto';
      btnTitle = 'Marcar como Pronto';
      prevStatus = 'Em espera';
      prevIcon = 'ph-arrow-u-up-left';
      prevTitle = 'Voltar para Em espera';
    } else {
      isPronto = true;
      btnIcon = 'ph-bell-ringing';
      btnColor = '#8b5cf6';
      prevStatus = 'Em preparo';
      prevIcon = 'ph-arrow-u-up-left';
      prevTitle = 'Voltar para Em preparo';
    }

    const revertBtn = prevStatus
      ? `<button class="btn-reverter" onclick="window.alterarStatusPedido(${id}, '${prevStatus}')" title="${prevTitle}"><i class="ph ${prevIcon}"></i></button>`
      : '';

    const chamadoClass = (isPronto && item._chamado) ? ' chamado' : '';
    const especial = iaPedidosEspeciais.get(item.id);
    const isManobra = especial && especial.tipo === 'manobra';
    // (Seguran├ºa) Cor validada para evitar inje├º├úo via style; mensagem escapada p/ HTML.
    const corSegura = especial && /^#[0-9a-fA-F]{3,8}$/.test(String(especial.cor || '')) ? especial.cor : '#ff6b35';
    const estiloEspecial = especial ? `border-left: 4px solid ${corSegura} !important; box-shadow: 0 0 12px ${corSegura}33;${isManobra ? 'animation: pulseManobra 1.5s infinite;' : ''}` : '';

    const badgeEspecial = especial
      ? `<span style="background:${corSegura};color:white;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;margin-left:8px;${isManobra ? 'animation: pulseBadge 1.5s infinite;' : ''}">${isManobra ? '­ƒöÑ ' : ''}${escHtml(especial.mensagem)}</span>`
      : '';

    const mainBtn = isPronto
      ? `<button class="btn-chamar${chamadoClass}" onclick="window.chamarGarcom(${id}, ${escJs(item.productName)}, ${qty}, ${escJs(item.localName)}, ${escJs(item.userName)})" title="Chamar gar├ºom para entregar"><i class="ph ${btnIcon}"></i></button>`
      : `<button class="btn-pronto" onclick="window.alterarStatusPedido(${id}, '${nextStatus}')" style="border-color: ${btnColor}; color: ${btnColor};" title="${btnTitle}"><i class="ph ${btnIcon}"></i></button>`;

    const isMultipleClass = qty > 1 ? ' is-multiple' : '';
    const isNewClass = newOrderIds.has(id) ? ' new-order-entry-pulse' : '';

    // (Seguran├ºa) Todos os campos do pedido s├úo escapados antes de entrar no HTML.
    const statusEsc = escHtml(status);
    const nomeEsc = escHtml(item.productName || item.nome || 'Produto');
    const emojiEsc = escHtml(item.productEmoji || '­ƒì¢´©Å');
    const localEsc = escHtml(item.localName || 'Mesa');
    const userEsc = escHtml(item.userName || '');
    const obsEsc = escHtml(item.observations || '');
    let compsHtml = '';
    try {
      const comps = typeof item.composicoes === 'string' ? JSON.parse(item.composicoes) : (item.composicoes || []);
      if (Array.isArray(comps) && comps.length > 0) {
        const byCat = {};
        comps.forEach(c => {
          if (typeof c === 'object' && c.categoria) {
            if (!byCat[c.categoria]) byCat[c.categoria] = [];
            byCat[c.categoria].push(c.opcao || c.nome || String(c));
          } else {
            if (!byCat['Composi├º├úo']) byCat['Composi├º├úo'] = [];
            byCat['Composi├º├úo'].push(typeof c === 'object' ? (c.nome || c.opcao || JSON.stringify(c)) : String(c));
          }
        });
        compsHtml = '<div class="item-composicoes">' + Object.keys(byCat).map(cat =>
          '<span style="font-weight:700;color:#1e3a5f;">' + escHtml(cat) + ':</span> ' +
          byCat[cat].map(o => '<span class="comp-item">' + escHtml(o) + '</span>').join(' ')
        ).join(' &nbsp; ') + '</div>';
      }
    } catch(e) {}

    return `
      <div class="queue-item${isNewClass}" data-id="${id}" data-status="${statusEsc}" style="background-color: ${bgColor}; border-left-color: ${localColor}; ${estiloEspecial}">
        <div class="item-quantidade">
          <span class="qtd-number${isMultipleClass}">${qty}x</span>
          <span class="qtd-time"><i class="ph ph-clock"></i> ${diffMins}m</span>
        </div>

        <div class="item-produto">
          <span style="font-size: 1.1em; margin-right: 4px;">${emojiEsc}</span>
          <span>${nomeEsc}</span>
          ${badgeEspecial}
          ${obsEsc ? `<div class="item-observacao">${obsEsc}</div>` : ''}
          ${compsHtml}
        </div>

        <div class="item-local">
          <i class="ph ph-table local-icon" style="color: ${localColor};"></i>
          <span class="local-name">${localEsc}</span>
          <span class="local-user">${userEsc ? '┬À ' + userEsc : ''}</span>
        </div>

        <div class="item-pronto">
          ${revertBtn}
          ${mainBtn}
        </div>


      </div>
    `;
  }).join('');

  if (typeof window.morphdom === 'function') {
    const targetWrapperHtml = `<div class="queue-list${isModoTv ? ' modo-tv' : ''}" id="queue-list">${itemsHtml}</div>`;
    window.morphdom(queueList, targetWrapperHtml, {
      getNodeKey: function(node) {
        return node.getAttribute ? (node.getAttribute('data-id') || node.id || null) : null;
      },
      onBeforeElChildrenUpdated: function(fromEl, toEl) {
        if (fromEl.classList && fromEl.classList.contains('item-exiting')) {
          return false;
        }
        return true;
      }
    });
  } else {
    queueList.innerHTML = itemsHtml;
  }

  // Re-aplicar larguras das colunas
  ['quantidade', 'produto', 'local', 'pronto'].forEach(col => {
    const savedCol = localStorage.getItem(`filaColWidth-${col}`);
    if (savedCol) applyColumnWidth(col, savedCol);
  });

  aplicarOrdemColunasNaFila();
}



// --- REDIMENSIONAMENTO E LARGURA DE COLUNAS ---
const COL_MINS = {
  quantidade: 90,
  produto: 140,
  local: 120,
  pronto: 105
};

const COL_DEFAULTS = { quantidade: 140, produto: 400, local: 240, pronto: 120 };

function getAvailableWidth() {
  const sidebar = document.querySelector('.sidebar-sectors');
  const rightPanel = document.querySelector('.right-panel-status');
  const leftW = sidebar ? sidebar.getBoundingClientRect().width : 120;
  const rightW = rightPanel ? rightPanel.getBoundingClientRect().width : 140;
  return window.innerWidth - leftW - rightW - 40;
}

function applyColumnWidth(col, widthVal) {
  if (window.innerWidth <= 1024) return;
  let wNum = typeof widthVal === 'number' ? widthVal : parseFloat(widthVal);
  const min = COL_MINS[col] || 90;
  wNum = Math.max(min, wNum);
  const avail = getAvailableWidth();
  const maxForCol = avail * 0.55;
  wNum = Math.min(wNum, maxForCol);

  const wStr = `${wNum}px`;
  document.documentElement.style.setProperty(`--col-width-${col}`, wStr);

  const elements = document.querySelectorAll(`.col-${col}, .item-${col}`);
  elements.forEach(el => {
    if (col === 'produto') {
      el.style.setProperty('flex', `1 1 ${wStr}`, 'important');
    } else {
      el.style.setProperty('flex', `0 0 ${wStr}`, 'important');
    }
    el.style.setProperty('width', wStr, 'important');
  });
}

function resetColumnWidths() {
  ['quantidade', 'produto', 'local', 'pronto'].forEach(col => {
    localStorage.removeItem(`filaColWidth-${col}`);
    applyColumnWidth(col, COL_DEFAULTS[col]);
  });
  localStorage.removeItem('filaColOrder');
  localStorage.removeItem('filaLeftSidebarWidth');
  localStorage.removeItem('filaRightSidebarWidth');
  const leftSidebar = document.querySelector('.sidebar-sectors');
  const rightSidebar = document.querySelector('.right-panel-status');
  if (leftSidebar) leftSidebar.style.width = '110px';
  if (rightSidebar) rightSidebar.style.width = '85px';
  aplicarOrdemColunasNaFila();
}
window.resetColumnWidths = resetColumnWidths;

// --- REORDENA├ç├âO DE COLUNAS (POSI├ç├âO) ---
const DEFAULT_COL_ORDER = ['quantidade', 'produto', 'local', 'pronto'];

function getColOrder() {
  try {
    const saved = localStorage.getItem('filaColOrder');
    if (saved) {
      const arr = JSON.parse(saved);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    }
  } catch (e) {}
  return DEFAULT_COL_ORDER.slice();
}

function aplicarOrdemColunasNaFila() {
  const order = getColOrder();
  
  // Reordenar colunas do cabe├ºalho
  const header = document.getElementById('queue-header-sortable');
  if (header) {
    order.forEach((col, idx) => {
      const el = header.querySelector('.col-' + col);
      if (el) el.style.setProperty('order', (idx + 1).toString());
    });
  }

  // Reordenar colunas dos itens da fila
  document.querySelectorAll('#queue-list .queue-item').forEach(item => {
    order.forEach((col, idx) => {
      const el = item.querySelector('.item-' + col);
      if (el) el.style.setProperty('order', (idx + 1).toString());
    });
  });
}

function iniciarSortableColunas() {
  const header = document.getElementById('queue-header-sortable');
  if (!header || typeof Sortable === 'undefined') return;
  if (header._sortableInited) return;
  header._sortableInited = true;

  const order = getColOrder();
  order.forEach(col => {
    const el = header.querySelector('.col-' + col);
    if (el) header.appendChild(el);
  });

  Sortable.create(header, {
    animation: 150,
    ghostClass: 'sortable-ghost',
    filter: '.col-resize-handle',
    preventOnFilter: false,
    onEnd: () => {
      const novo = Array.from(header.children)
        .map(el => el.getAttribute('data-col'))
        .filter(Boolean);
      if (novo.length === DEFAULT_COL_ORDER.length) {
        localStorage.setItem('filaColOrder', JSON.stringify(novo));
        aplicarOrdemColunasNaFila();
        novo.forEach(col => {
          const saved = localStorage.getItem('filaColWidth-' + col);
          applyColumnWidth(col, saved || (COL_DEFAULTS[col] || 140));
        });
      }
    }
  });
}

window.setSidebarDisplayMode = function(mode) {
  const validMode = ['fixa', 'hover', 'oculta'].includes(mode) ? mode : 'oculta';
  localStorage.setItem('chef_kds_sidebar_mode', validMode);
  
  const appContainer = document.querySelector('.app-container');
  if (appContainer) {
    appContainer.classList.remove('sidebar-mode-fixa', 'sidebar-mode-hover', 'sidebar-mode-oculta');
    appContainer.classList.add('sidebar-mode-' + validMode);
  }

  document.querySelectorAll('.sidebar-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-sidebar-mode') === validMode);
  });
};

document.addEventListener('mousemove', (e) => {
  const mode = localStorage.getItem('chef_kds_sidebar_mode') || 'fixa';
  if (mode !== 'hover') return;

  const leftSidebar = document.querySelector('.sidebar-sectors');
  const rightSidebar = document.querySelector('.right-panel-status');

  if (leftSidebar) {
    if (e.clientX <= 25) {
      leftSidebar.classList.add('is-active-hover');
    } else if (e.clientX > 130) {
      leftSidebar.classList.remove('is-active-hover');
    }
  }

  if (rightSidebar) {
    if (e.clientX >= window.innerWidth - 25) {
      rightSidebar.classList.add('is-active-hover');
    } else if (e.clientX < window.innerWidth - 110) {
      rightSidebar.classList.remove('is-active-hover');
    }
  }
});

// L├ôGICA COMPLETA DE REDIMENSIONAMENTO DE BARRAS LATERAIS E COLUNAS
document.addEventListener('DOMContentLoaded', () => {
  carregarPedidos();
  window.setSidebarDisplayMode(localStorage.getItem('chef_kds_sidebar_mode') || 'fixa');

  // 1. REDIMENSIONAR BARRA LATERAL ESQUERDA (SETORES)
  const leftSidebar = document.querySelector('.sidebar-sectors');
  const leftResizer = document.querySelector('.sidebar-sectors-resizer');
  if (leftSidebar && leftResizer) {
    let startX = 0, startW = 0;
    const onStartLeft = (clientX, e) => {
      e.stopPropagation(); e.preventDefault();
      startX = clientX;
      startW = leftSidebar.getBoundingClientRect().width;
      leftResizer.classList.add('dragging');
      const onMoveLeft = (evt) => {
        const x = evt.clientX || (evt.touches && evt.touches[0].clientX);
        const w = startW + (x - startX);
        if (w >= 60 && w <= 320) {
          leftSidebar.style.width = w + 'px';
          localStorage.setItem('filaLeftSidebarWidth', w + 'px');
        }
      };
      const onEndLeft = () => {
        leftResizer.classList.remove('dragging');
        window.removeEventListener('mousemove', onMoveLeft);
        window.removeEventListener('touchmove', onMoveLeft);
        window.removeEventListener('mouseup', onEndLeft);
        window.removeEventListener('touchend', onEndLeft);
      };
      window.addEventListener('mousemove', onMoveLeft);
      window.addEventListener('touchmove', onMoveLeft, { passive: false });
      window.addEventListener('mouseup', onEndLeft);
      window.addEventListener('touchend', onEndLeft);
    };
    leftResizer.addEventListener('mousedown', (e) => onStartLeft(e.clientX, e));
    leftResizer.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) onStartLeft(e.touches[0].clientX, e);
    }, { passive: false });
  }

  // 2. REDIMENSIONAR BARRA LATERAL DIREITA (STATUS/FILTROS)
  const rightSidebar = document.querySelector('.right-panel-status');
  const rightResizer = document.querySelector('.right-panel-status-resizer');
  if (rightSidebar && rightResizer) {
    let startX = 0, startW = 0;
    const onStartRight = (clientX, e) => {
      e.stopPropagation(); e.preventDefault();
      startX = clientX;
      startW = rightSidebar.getBoundingClientRect().width;
      rightResizer.classList.add('dragging');
      const onMoveRight = (evt) => {
        const x = evt.clientX || (evt.touches && evt.touches[0].clientX);
        const w = startW - (x - startX);
        if (w >= 80 && w <= 350) {
          rightSidebar.style.width = w + 'px';
          localStorage.setItem('filaRightSidebarWidth', w + 'px');
        }
      };
      const onEndRight = () => {
        rightResizer.classList.remove('dragging');
        window.removeEventListener('mousemove', onMoveRight);
        window.removeEventListener('touchmove', onMoveRight);
        window.removeEventListener('mouseup', onEndRight);
        window.removeEventListener('touchend', onEndRight);
      };
      window.addEventListener('mousemove', onMoveRight);
      window.addEventListener('touchmove', onMoveRight, { passive: false });
      window.addEventListener('mouseup', onEndRight);
      window.addEventListener('touchend', onEndRight);
    };
    rightResizer.addEventListener('mousedown', (e) => onStartRight(e.clientX, e));
    rightResizer.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) onStartRight(e.touches[0].clientX, e);
    }, { passive: false });
  }

  // 3. REDIMENSIONAR COLUNAS DE CONTE├ÜDO (PROPORCIONAL DE SOMA ZERO)
  let activeColHandle = null;
  let startColX = 0;
  let colLeftName = '';
  let colRightName = '';
  let startLeftWidth = 0;
  let startRightWidth = 0;

  document.querySelectorAll('.col-resize-handle').forEach(handle => {
    const startColDrag = (clientX, e) => {
      e.stopPropagation(); e.preventDefault();

      activeColHandle = handle;
      colLeftName = handle.getAttribute('data-col');
      startColX = clientX;

      const headerContainer = document.getElementById('queue-header-sortable');
      if (!headerContainer) return;

      const cols = Array.from(headerContainer.children);
      const currentIndex = cols.findIndex(el => el.getAttribute('data-col') === colLeftName);
      
      if (currentIndex !== -1 && currentIndex < cols.length - 1) {
        colRightName = cols[currentIndex + 1].getAttribute('data-col');
      } else if (currentIndex > 0) {
        colRightName = cols[currentIndex - 1].getAttribute('data-col');
      } else {
        colRightName = 'produto';
      }

      const leftEl = headerContainer.querySelector(`.col-${colLeftName}`);
      const rightEl = headerContainer.querySelector(`.col-${colRightName}`);

      startLeftWidth = leftEl ? leftEl.getBoundingClientRect().width : 140;
      startRightWidth = rightEl ? rightEl.getBoundingClientRect().width : 140;

      handle.classList.add('dragging');
    };

    handle.addEventListener('mousedown', (e) => startColDrag(e.clientX, e));
    handle.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) startColDrag(e.touches[0].clientX, e);
    }, { passive: false });
  });

  function processColDrag(clientX) {
    if (!activeColHandle || !colLeftName || !colRightName) return;

    const dx = clientX - startColX;
    const minLeft = COL_MINS[colLeftName] || 90;
    const minRight = COL_MINS[colRightName] || 90;

    let newLeftWidth = startLeftWidth + dx;
    let newRightWidth = startRightWidth - dx;

    if (newLeftWidth < minLeft) {
      newLeftWidth = minLeft;
      newRightWidth = startLeftWidth + startRightWidth - minLeft;
    } else if (newRightWidth < minRight) {
      newRightWidth = minRight;
      newLeftWidth = startLeftWidth + startRightWidth - minRight;
    }

    applyColumnWidth(colLeftName, newLeftWidth);
    applyColumnWidth(colRightName, newRightWidth);

    localStorage.setItem(`filaColWidth-${colLeftName}`, newLeftWidth + 'px');
    localStorage.setItem(`filaColWidth-${colRightName}`, newRightWidth + 'px');
  }

  window.addEventListener('mousemove', (e) => {
    if (activeColHandle) processColDrag(e.clientX);
  });

  window.addEventListener('touchmove', (e) => {
    if (activeColHandle && e.touches.length === 1) {
      processColDrag(e.touches[0].clientX);
    }
  }, { passive: true });

  const stopColDrag = () => {
    if (activeColHandle) {
      activeColHandle.classList.remove('dragging');
      activeColHandle = null;
    }
  };

  window.addEventListener('mouseup', stopColDrag);
  window.addEventListener('touchend', stopColDrag);

  iniciarSortableColunas();

  // RESTAURAR LARGURAS SALVAS AO CARREGAR
  const savedLeft = localStorage.getItem('filaLeftSidebarWidth');
  if (savedLeft && leftSidebar) leftSidebar.style.width = savedLeft;
  
  const savedRight = localStorage.getItem('filaRightSidebarWidth');
  if (savedRight && rightSidebar) rightSidebar.style.width = savedRight;

  ['quantidade', 'produto', 'local', 'pronto'].forEach(col => {
    const savedCol = localStorage.getItem(`filaColWidth-${col}`);
    if (savedCol) applyColumnWidth(col, savedCol);
  });

  // CONTROLE DO TAMANHO DE FONTE
  let currentFontScale = parseFloat(localStorage.getItem('queue-font-scale') || '1.0');
  function updateFontScale(scale) {
    currentFontScale = Math.min(Math.max(scale, 0.6), 2.0);
    localStorage.setItem('queue-font-scale', currentFontScale.toString());
    document.documentElement.style.setProperty('--queue-font-scale', currentFontScale);
  }
  window.updateFontScale = updateFontScale;
  window.getFontScale = function() { return currentFontScale; };

  const btnFontDec = document.getElementById('btn-font-dec');
  const btnFontInc = document.getElementById('btn-font-inc');
  if (btnFontDec) btnFontDec.addEventListener('click', () => updateFontScale(currentFontScale - 0.1));
  if (btnFontInc) btnFontInc.addEventListener('click', () => updateFontScale(currentFontScale + 0.1));
  updateFontScale(currentFontScale);

  const pulseInput = document.getElementById('cfg-tempo-pulse');
  if (pulseInput) {
    const saved = localStorage.getItem('chef_kds_pulse_seconds') || '3';
    pulseInput.value = saved;
    pulseInput.addEventListener('change', (e) => {
      let val = parseInt(e.target.value) || 3;
      if (val < 1) val = 1;
      if (val > 30) val = 30;
      e.target.value = val;
      localStorage.setItem('chef_kds_pulse_seconds', val.toString());
    });
  }

  // Popup font buttons (work even without sidebar buttons)
  document.querySelectorAll('#popup-btn-font-dec, #popup-btn-font-inc').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = btn.id === 'popup-btn-font-inc' ? 0.1 : -0.1;
      updateFontScale(currentFontScale + delta);
    });
  });
});

// --- CONTROLE DE MODO DE DISPOSI├ç├âO DA TELA (LISTA / GRADE 2 COLS / GRADE 3 COLS / TV) ---
window.currentLayoutMode = localStorage.getItem('chef_kds_view_mode') || 'lista';

window.alterarModoDisposicao = function(modo) {
  window.currentLayoutMode = modo;
  localStorage.setItem('chef_kds_view_mode', modo);

  const queueList = document.getElementById('queue-list');
  const queueHeader = document.getElementById('queue-header-sortable');
  
  if (queueList) {
    queueList.classList.remove('modo-lista', 'modo-tv');
    queueList.classList.add('modo-' + modo);
  }

  if (queueHeader) {
    if (modo === 'lista') {
      queueHeader.classList.remove('modo-grid-ativo');
    } else {
      queueHeader.classList.add('modo-grid-ativo');
    }
  }

  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-mode') === modo) {
      btn.classList.add('active');
    }
  });
};

document.addEventListener('DOMContentLoaded', () => {
  window.alterarModoDisposicao(window.currentLayoutMode);
});


// --- ALERTA DE ATRASO CR├ìTICO (COZINHA) ---
let delayAlarmConfig = {
  time: parseInt(localStorage.getItem('delay-alarm-time') || 20),
  repeat: parseInt(localStorage.getItem('delay-alarm-repeat') || 5),
  sound: localStorage.getItem('delay-alarm-sound') || 'sonar'
};
const alarmCounts = {}; 

setInterval(() => {
  if (!queueData) return;
  // Refresh config inside interval just in case it changes
  delayAlarmConfig.time = parseInt(localStorage.getItem('delay-alarm-time') || 20);
  delayAlarmConfig.repeat = parseInt(localStorage.getItem('delay-alarm-repeat') || 5);
  delayAlarmConfig.sound = localStorage.getItem('delay-alarm-sound') || 'sonar';

  let shouldPlay = false;
  queueData.forEach(item => {
    if (item.status === 'Finalizado' || item.status === 'Cancelado' || item.status === 'Pronto') return;
    const timeCreated = parseUtc(item.createdAt);
    const diffMins = Math.floor((Date.now() - timeCreated) / 60000);
    
    if (diffMins >= delayAlarmConfig.time) {
      if (!alarmCounts[item.id]) alarmCounts[item.id] = 0;
      if (alarmCounts[item.id] < delayAlarmConfig.repeat) {
        alarmCounts[item.id]++;
        shouldPlay = true;
        // visual flash
        const cardEl = document.querySelector(`.queue-item[data-id="${safeId(item.id)}"]`);
        if (cardEl) {
          cardEl.style.transition = 'box-shadow 0.3s ease, transform 0.3s ease, border-left-color 0.3s ease';
          cardEl.style.boxShadow = '0 0 25px 8px rgba(239, 68, 68, 0.9)';
          cardEl.style.transform = 'scale(1.02)';
          cardEl.style.borderLeftColor = '#ef4444';
          setTimeout(() => { 
            cardEl.style.boxShadow = ''; 
            cardEl.style.transform = ''; 
            cardEl.style.borderLeftColor = ''; 
          }, 1500);
        }
      }
    }
  });

  if (shouldPlay) {
    if (typeof window.playAudioTone === 'function') {
      window.playAudioTone(delayAlarmConfig.sound);
    }
  }
}, 30000); // Check every 30 seconds
// --- PINCH TO ZOOM GESTURE FOR LAYOUT ---
(function() {
  const layouts = ['tv', 'lista'];
  let initialPinchDistance = null;
  let pinchDebounce = false;

  function getDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getCurrentLayoutIndex() {
    const currentLayout = localStorage.getItem('filaModoExibicao') || 'lista';
    let idx = layouts.indexOf(currentLayout);
    if (idx === -1) idx = 1; // default lista
    return idx;
  }

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      initialPinchDistance = getDistance(e.touches);
      pinchDebounce = false;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDistance !== null && !pinchDebounce) {
      const currentDistance = getDistance(e.touches);
      const diff = currentDistance - initialPinchDistance;

      // Threshold to trigger layout change (e.g. 60 pixels)
      if (Math.abs(diff) > 60) {
        let idx = getCurrentLayoutIndex();
        
        if (diff > 0) {
          // Pinched OUT (zoom in) => move to larger cards
          idx = Math.min(layouts.length - 1, idx + 1);
        } else {
          // Pinched IN (zoom out) => move to smaller cards
          idx = Math.max(0, idx - 1);
        }

        const newLayout = layouts[idx];
        if (newLayout !== (localStorage.getItem('filaModoExibicao') || 'grid2')) {
          if (typeof window.setQueueLayout === 'function') {
            window.setQueueLayout(newLayout);
          }
        }

        // Reset distance to require another full pinch for the next level
        initialPinchDistance = currentDistance;
        
        // Add a small debounce so it doesn't jump multiple levels too fast
        pinchDebounce = true;
        setTimeout(() => { pinchDebounce = false; }, 400);
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      initialPinchDistance = null;
    }
  });

  // Inicializar estado dos botões de autoscroll e status inicial de conexão
  atualizarBotoesAutoscroll();
  atualizarStatusConexao(socket && socket.connected);

  // Intervalo suave a cada 30 segundos para atualizar tempos decorridos e criticidade via morphdom
  setInterval(() => {
    if (Array.isArray(queueData) && queueData.length > 0) {
      renderQueue();
    }
  }, 30000);
})();
