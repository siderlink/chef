
function formatarTempoFila(mins) {
  if (!mins || mins <= 0) return 'agora';
  if (mins < 60) return `${mins} min`;
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(mins / 1440);
  return `+${d}d`;
}

const HOST = window.location.hostname;

// Se o restaurante configurou o modo Clássico, redireciona para a fila clássica.
(function kdsDetectarVersaoClassica() {
  fetch('/api/config')
    .then(r => r.json())
    .then(cfg => {
      if (cfg && String(cfg.fila_modo || '').toLowerCase() === 'classica') {
        window.location.replace('/fila-pedidos-classica.html');
      }
    })
    .catch(() => {});
})();

// ── Preferências da fila sincronizadas com o servidor (config por restaurante) ──
let kdsSyncTimer = null;
function kdsSalvarNoServidor(extra) {
  const colWidths = {};
  ['quantidade', 'produto', 'local', 'pronto'].forEach(c => {
    const w = localStorage.getItem('filaColWidth-' + c);
    if (w) colWidths[c] = w;
  });
  const payload = {
    kds_font_scale: (localStorage.getItem('chef_kds_font_scale') || '1'),
    kds_view_mode: (localStorage.getItem('chef_kds_layout_mode') || 'grid'),
    kds_pulse_seconds: (localStorage.getItem('chef_kds_pulse_seconds') || '3'),
    kds_sound: (localStorage.getItem('chef_kds_sound') || '1'),
    kds_card_order: (localStorage.getItem('chef_kds_card_order') || JSON.stringify(['cabecalho', 'quantidade', 'produto', 'acao'])),
    kds_card_hidden: (localStorage.getItem('chef_kds_card_hidden') || '[]')
  };
  try {
    const ord = localStorage.getItem('filaColOrder');
    if (ord) payload.kds_col_order = ord;
    if (Object.keys(colWidths).length) payload.kds_col_widths = JSON.stringify(colWidths);
  } catch (e) {}
  Object.assign(payload, extra || {});
  try {
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + obterTokenAtual() },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (e) {}
}
function kdsAgendarSalvarNoServidor() {
  if (kdsSyncTimer) clearTimeout(kdsSyncTimer);
  kdsSyncTimer = setTimeout(() => { kdsSyncTimer = null; kdsSalvarNoServidor(); }, 800);
}
function kdsAplicarPreferencias(cfg) {
  if (!cfg) return;
  if (cfg.kds_font_scale) {
    localStorage.setItem('chef_kds_font_scale', String(cfg.kds_font_scale));
    const ql = document.getElementById('queue-list');
    if (ql) ql.style.fontSize = (parseFloat(cfg.kds_font_scale) * 100) + '%';
  }
  if (cfg.kds_pulse_seconds) {
    localStorage.setItem('chef_kds_pulse_seconds', String(cfg.kds_pulse_seconds));
    const pulseInput = document.getElementById('cfg-tempo-pulse');
    if (pulseInput) pulseInput.value = String(cfg.kds_pulse_seconds);
  }
  if (cfg.kds_sound) localStorage.setItem('chef_kds_sound', String(cfg.kds_sound));
  if (cfg.kds_view_mode && localStorage.getItem('chef_kds_layout_mode') !== cfg.kds_view_mode) {
    localStorage.setItem('chef_kds_layout_mode', cfg.kds_view_mode);
    if (typeof window.alterarModoDisposicao === 'function') window.alterarModoDisposicao(cfg.kds_view_mode);
  }
  if (cfg.kds_col_order) {
    try { const arr = JSON.parse(cfg.kds_col_order); if (Array.isArray(arr) && arr.length) localStorage.setItem('filaColOrder', JSON.stringify(arr)); } catch (e) {}
  }
  if (cfg.kds_col_widths) {
    try {
      const w = JSON.parse(cfg.kds_col_widths);
      Object.keys(w || {}).forEach(c => { if (w[c]) localStorage.setItem('filaColWidth-' + c, String(w[c])); });
    } catch (e) {}
  }
  if (cfg.kds_card_order) carregarCardConfig(cfg.kds_card_order, 'order');
  if (cfg.kds_card_hidden) carregarCardConfig(cfg.kds_card_hidden, 'hidden');
}

// ── CAMPOS DO CARD (ORDEM E VISIBILIDADE) ──
const CARD_FIELDS = [
  { key: 'cabecalho', label: 'Mesa / Comanda e Tempo' },
  { key: 'quantidade', label: 'Quantidade' },
  { key: 'produto', label: 'Produto (Nome, Obs, Composição)' },
  { key: 'acao', label: 'Botão de Ação (Pronto / Chamar)' }
];
let kdsCardOrder = [];
let kdsCardHidden = new Set();
function carregarCardConfig(val, tipo) {
  try {
    const arr = JSON.parse(typeof val === 'string' ? val : JSON.stringify(val || []));
    if (tipo === 'order') {
      const validos = arr.filter(k => CARD_FIELDS.some(f => f.key === k));
      if (validos.length > 0) {
        kdsCardOrder = validos.slice();
        localStorage.setItem('chef_kds_card_order', JSON.stringify(kdsCardOrder));
      }
    } else if (tipo === 'hidden') {
      kdsCardHidden = new Set(arr.filter(k => CARD_FIELDS.some(f => f.key === k)));
      localStorage.setItem('chef_kds_card_hidden', JSON.stringify(Array.from(kdsCardHidden)));
    }
  } catch (e) {}
}
function obterCardOrder() {
  if (kdsCardOrder.length === 0) {
    try {
      const raw = localStorage.getItem('chef_kds_card_order');
      if (raw) kdsCardOrder = JSON.parse(raw).filter(k => CARD_FIELDS.some(f => f.key === k));
    } catch (e) {}
  }
  if (kdsCardOrder.length === 0) kdsCardOrder = CARD_FIELDS.map(f => f.key);
  kdsCardOrder.forEach(k => { if (!CARD_FIELDS.some(f => f.key === k)) kdsCardOrder = kdsCardOrder.filter(x => x !== k); });
  return kdsCardOrder;
}
window.obterCardHidden = function() {
  if (kdsCardHidden.size === 0) {
    try {
      const raw = localStorage.getItem('chef_kds_card_hidden');
      if (raw) kdsCardHidden = new Set(JSON.parse(raw).filter(k => CARD_FIELDS.some(f => f.key === k)));
    } catch (e) {}
  }
  return kdsCardHidden;
};
window.cardFieldLabel = function(key) {
  const f = CARD_FIELDS.find(x => x.key === key);
  return f ? f.label : key;
};
window.moverCampoCard = function(key, dir) {
  const ordem = obterCardOrder();
  const i = ordem.indexOf(key);
  if (i === -1) return;
  const j = i + dir;
  if (j < 0 || j >= ordem.length) return;
  ordem.splice(i, 1);
  ordem.splice(j, 0, key);
  kdsCardOrder = ordem.slice();
  localStorage.setItem('chef_kds_card_order', JSON.stringify(kdsCardOrder));
  renderizarCamposCardModal();
  renderQueue();
  kdsAgendarSalvarNoServidor();
};
window.alternarCampoCard = function(key) {
  const hidden = new Set(window.obterCardHidden());
  if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
  kdsCardHidden = hidden;
  localStorage.setItem('chef_kds_card_hidden', JSON.stringify(Array.from(hidden)));
  renderizarCamposCardModal();
  renderQueue();
  kdsAgendarSalvarNoServidor();
};
function renderizarCamposCardModal() {
  const wrap = document.getElementById('kds-card-fields-config');
  if (!wrap) return;
  const ordem = obterCardOrder();
  const hidden = window.obterCardHidden();
  wrap.innerHTML = ordem.map(k => {
    const oculto = hidden.has(k);
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;margin-bottom:6px;">
      <button type="button" onclick="window.moverCampoCard('${k}',-1)" title="Mover para cima" style="background:none;border:none;cursor:pointer;font-size:14px;color:#64748b;"><i class="ph ph-arrow-u-up-left"></i></button>
      <span style="flex:1;font-size:13px;font-weight:600;color:#1e293b;">${window.cardFieldLabel(k)}</span>
      <span style="font-size:11px;color:${oculto ? '#ef4444' : '#22c55e'};font-weight:700;width:70px;text-align:center;">${oculto ? 'Oculto' : 'Visível'}</span>
      <button type="button" onclick="window.alternarCampoCard('${k}')" title="${oculto ? 'Mostrar' : 'Ocultar'}" style="background:none;border:none;cursor:pointer;font-size:15px;color:${oculto ? '#22c55e' : '#ef4444'};"><i class="ph ${oculto ? 'ph-eye' : 'ph-eye-slash'}"></i></button>
      <button type="button" onclick="window.moverCampoCard('${k}',1)" title="Mover para baixo" style="background:none;border:none;cursor:pointer;font-size:14px;color:#64748b;"><i class="ph ph-arrow-up-right"></i></button>
    </div>`;
  }).join('');
}
// Parse timestamps stored as UTC in DB (SQLite datetime('now') = UTC)
function parseUtc(s) { if (!s) return Date.now(); const t = s.includes('T') ? s : s + 'Z'; const d = new Date(t); return isNaN(d.getTime()) ? Date.now() : d.getTime(); }
// (Segurança) Escapa valor para string JS dentro de onclick.
function escJs(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  return JSON.stringify(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
// (Segurança) Escapa valor para conteúdo HTML.
function escHtml(v) {
  return (v === null || v === undefined) ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// (Segurança) Converte para id numérico seguro (evita injeção via onclick/data-id/querySelector).
function safeId(v) {
  const n = parseInt(v, 10);
  return (Number.isFinite(n) && n > 0) ? n : 0;
}
// (Segurança) Converte para quantidade numérica segura (mínimo 1).
function safeQty(v) {
  const n = parseInt(v, 10);
  return (Number.isFinite(n) && n > 0) ? n : 1;
}
// Colaboradores usam a sessão de funcionário (chef_session); dono/gerente usam chef_token.
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
    if (sess.token) {
      socket.emit('login_funcionario_token', sess.token);
    }
  } catch(e){}
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

// --- FILTRO POR TIPO DE ITEM (Todos / Porções / A La Carte) ---
// A categoria do produto vem do cardápio (produtos.categoria); o pedido só guarda o nome.
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
    if (c.indexOf('porç') !== -1) return 'porcao';
    if (c.indexOf('a la carte') !== -1) return 'alacarte';
    return 'outro';
  }
  const n = String(nome).toLowerCase();
  if (n.indexOf('porç') !== -1) return 'porcao';
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
        throw new Error('Não autenticado');
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

socket.on('connect', () => {
  carregarPedidos();
  aplicarFiltrosSalvos();
  sincronizarSecoesFilaDoServidor();
  socket.emit('get_produtos');
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

// --- SEÇÕES DA FILA DE PEDIDOS (configuráveis em Sons & Notificações) ---
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
    const chipsDynamic = document.getElementById('kds-sectors-chips-dynamic');
    if (chipsDynamic) {
      chipsDynamic.innerHTML = filaSecoes.map(nome =>
        `<button class="kds-chip-item sector-modal-btn ${nome === currentSector ? 'active' : ''}" data-sector="${escHtml(nome)}" onclick="filtrarSetor(${escJs(nome)})">
          <i class="ph ${iconeSecaoFila(nome)}"></i> <span>${escHtml(nome)}</span>
        </button>`
      ).join('');
    }
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
      kdsAplicarPreferencias(cfg);
      if (document.getElementById('kds-card-fields-config')) renderizarCamposCardModal();
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
// No mobile as pills de setor já ficam sempre visíveis, então não abre modal.
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

// ── SOM E VIBRAÇÃO PARA NOVOS PEDIDOS (MOBILE & DESKTOP) ──
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

// Desbloquear áudio no primeiro toque/clique do usuário
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

  // 1. Vibração em dispositivos móveis
  if (navigator && typeof navigator.vibrate === 'function') {
    try {

      navigator.vibrate([300, 100, 300, 100, 400]);
    } catch (e) {}
  }

  // 2. Notificações de som conforme configurações salvas (por seção e etapa)
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
      // Bipe de retorno caso playAudioTone não esteja pronto
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

  // 3. Notificação do Navegador (Desktop / PWA)
  if ('Notification' in window && Notification.permission === 'granted') {
    if (!window._lastNewOrderNotifTime || Date.now() - window._lastNewOrderNotifTime > 60000) {
      try {
        new Notification('🔔 Novo Pedido na Cozinha!', {
          body: 'Chegou um novo pedido na fila de produção.',
          icon: '/favicon.ico',
          requireInteraction: true
        });
        window._lastNewOrderNotifTime = Date.now();
      } catch (e) {}
    }
  }
}

socket.on('pedidos_atualizados', (data) => {
  if (Array.isArray(data)) {
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

let scrollTimer = null;
function autoScrollToNewOrders(targetId) {
  requestAnimationFrame(() => {
    const queueSection = document.querySelector('.queue-section');
    if (!queueSection) return;

    let targetEl = targetId ? document.querySelector(`.queue-item[data-id="${safeId(targetId)}"]`) : null;
    if (!targetEl) targetEl = document.querySelector('.queue-item.is-new');

    const pulseSecs = parseInt(localStorage.getItem('chef_kds_pulse_seconds')) || 3;

    if (targetEl) {
      // 1. Rolar suavemente até o pedido no final/posição da fila
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.add('new-order-entry-pulse');

      // 2. Tocar som configurado (por seção e etapa) e vibrar o celular
      const novoPedido = queueData.find(x => x.id === targetId);
      playOrderSoundAndVibrate(novoPedido ? novoPedido.status : 'Em espera', novoPedido ? novoPedido.sector : '');

      // 3. Após o tempo configurado (ex: 3s), rolar de volta suavemente para o topo da tela
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        queueSection.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => {
          if (targetEl) targetEl.classList.remove('new-order-entry-pulse');
        }, 1000);
      }, pulseSecs * 1000);
    }
  });
}

// ── IA COZINHA: Pedidos especiais/urgentes ──
const iaPedidosEspeciais = new Map();

socket.on('ia_pedido_especial', (data) => {
  const { pedidoId, tipo, cor, urgencia, mensagem } = data;
  iaPedidosEspeciais.set(pedidoId, { tipo, cor, urgencia, mensagem });
  renderQueue();
});

// ── Top Toast Notifications Queue System ──
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
  window.enqueueTopNotification(`🔥 ${mensagem}`, '#ff6b35', 4500);
});

socket.on('ia_pedido_atencao', (data) => {
  const { pedidoId, cor, minutos, mesa, produto, mensagem } = data;
  attentionOrderIds.add(pedidoId);
  iaPedidosEspeciais.set(pedidoId, { tipo: 'atencao', cor, urgencia: 'atencao', mensagem });
  renderQueue();

  window.enqueueTopNotification(`⏰ ${mensagem} - Mesa ${mesa} - ${produto}`, cor || '#dc2626', 5000);

  if ('Notification' in window && Notification.permission === 'granted') {
    if (!window._lastIaNotifTime || Date.now() - window._lastIaNotifTime > 60000) {
      new Notification(`⏰ Atenção - Mesa ${mesa}`, { body: `${produto} - ${formatarTempoFila(minutos)} de espera`, icon: '/favicon.ico', requireInteraction: true });
      window._lastIaNotifTime = Date.now();
    }
  }
});

// ── Dicas Rápidas Interativas (Lâmpada 💡) ──
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
      const icone = d.tipo === 'alerta' ? '⚠️' : d.tipo === 'acao' ? '🎯' : d.tipo === 'dica' ? '💡' : 'ℹ️';
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
  toast.innerHTML = `👨‍🍳 <strong>${escHtml(garcomNome)}</strong> está indo buscar ${escHtml(productName || '')} - ${escHtml(localName || '')}`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; }, 4000);
  setTimeout(() => toast.remove(), 4500);
});

socket.on('validacao_pedido_necessaria', ({ id, mesa, mesa_origem, cliente_nome }) => {
  if (typeof initAudio === 'function') initAudio();
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:16px;right:16px;background:#f59e0b;color:#1e293b;padding:12px 18px;border-radius:10px;font-size:13px;font-weight:700;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);max-width:300px;';
  toast.innerHTML = `⚠️ Validação: <strong>${escHtml(cliente_nome || '?')}</strong> trocou de mesa (${escHtml(mesa_origem || '?')} → ${escHtml(mesa)}). Verifique!`;
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

window.alterarStatusPedido = function(id, novoStatus) {
  socket.emit('atualizar_status', { id, status: novoStatus });
  const p = queueData.find(x => x.id === id);
  if (p) {
    p.status = novoStatus;
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
      toast.innerHTML = `🔔 Re-chamando: ${escHtml(productName)} - ${escHtml(localName)}`;
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

  // Atualizar badges de contagem em tempo real
  const countEspera = queueData.filter(i => (i.status === 'Pendente' || i.status === 'Em espera') && !['Finalizado', 'Cancelado', 'Entregue', 'Pago'].includes(i.status)).length;
  const countPreparo = queueData.filter(i => (i.status === 'Em preparo' || i.status === 'Em Preparo') && !['Finalizado', 'Cancelado', 'Entregue', 'Pago'].includes(i.status)).length;
  const countPronto = queueData.filter(i => (i.status === 'Pronto' || i.status === 'Prontos') && !['Finalizado', 'Cancelado', 'Entregue', 'Pago'].includes(i.status)).length;

  const bEspera = document.getElementById('kds-badge-espera');
  const bPreparo = document.getElementById('kds-badge-preparo');
  const bPronto = document.getElementById('kds-badge-pronto');
  if (bEspera) bEspera.innerText = countEspera;
  if (bPreparo) bPreparo.innerText = countPreparo;
  if (bPronto) bPronto.innerText = countPronto;

  const bEsperaMob = document.getElementById('kds-badge-espera-mob');
  const bPreparoMob = document.getElementById('kds-badge-preparo-mob');
  const bProntoMob = document.getElementById('kds-badge-pronto-mob');
  if (bEsperaMob) bEsperaMob.innerText = countEspera;
  if (bPreparoMob) bPreparoMob.innerText = countPreparo;
  if (bProntoMob) bProntoMob.innerText = countPronto;

  if (filtered.length === 0) {
    queueList.innerHTML = `
      <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center; background: var(--bg-card, #ffffff); border-radius: 24px; border: 1.5px dashed var(--border-color, #cbd5e1); margin: 30px auto; max-width: 480px; box-shadow: 0 4px 16px rgba(0,0,0,0.02);">
        <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(16, 185, 129, 0.12); color: #10b981; display: flex; align-items: center; justify-content: center; font-size: 38px; margin-bottom: 16px;">
          <i class="ph-fill ph-check-circle"></i>
        </div>
        <h3 style="font-size: 19px; font-weight: 800; color: var(--text-primary, #0f172a); margin: 0 0 6px 0;">Tudo limpo na cozinha!</h3>
        <p style="font-size: 14px; color: var(--text-secondary, #64748b); margin: 0 0 16px 0; line-height: 1.4;">Nenhum pedido com status <strong>${escHtml(currentFilter)}</strong> no setor <strong>${escHtml(currentSector)}</strong> no momento.</p>
        <span style="font-size: 12px; background: var(--bg-secondary, #f1f5f9); color: var(--text-secondary, #64748b); padding: 6px 14px; border-radius: 20px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
          <i class="ph-fill ph-circle" style="color:#10b981; font-size: 8px;"></i> Monitorando novos pedidos em tempo real...
        </span>
      </div>`;
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
    let btnIcon, btnColor, nextStatus, btnTitle, btnText;
    let prevStatus = null;
    let prevIcon = null;
    let prevTitle = null;
    let isPronto = false;

    if (status === 'Em espera' || status === 'Pendente') {
      btnIcon = 'ph-fire';
      btnColor = '#eb5757';
      nextStatus = 'Em preparo';
      btnTitle = 'Iniciar preparo';
      btnText = 'Iniciar Preparo';
    } else if (status === 'Em preparo') {
      btnIcon = 'ph-bowl-food';
      btnColor = '#10b981';
      nextStatus = 'Pronto';
      btnTitle = 'Marcar como Pronto';
      btnText = 'Marcar Pronto';
      prevStatus = 'Em espera';
      prevIcon = 'ph-arrow-u-up-left';
      prevTitle = 'Voltar para Em espera';
    } else {
      isPronto = true;
      btnIcon = 'ph-bell-ringing';
      btnColor = '#8b5cf6';
      btnText = item._chamado ? 'Chamar Novamente' : 'Chamar Garçom';
      prevStatus = 'Em preparo';
      prevIcon = 'ph-arrow-u-up-left';
      prevTitle = 'Voltar para Em preparo';
    }

    const revertBtn = prevStatus
      ? `<button class="btn-reverter" onclick="window.alterarStatusPedido(${id}, '${prevStatus}')" title="${prevTitle}"><i class="ph ${prevIcon}"></i> <span>Voltar</span></button>`
      : '';

    const chamadoClass = (isPronto && item._chamado) ? ' chamado' : '';
    const especial = iaPedidosEspeciais.get(item.id);
    const isManobra = especial && especial.tipo === 'manobra';
    const corSegura = especial && /^#[0-9a-fA-F]{3,8}$/.test(String(especial.cor || '')) ? especial.cor : '#ff6b35';
    const estiloEspecial = especial ? `border-left: 4px solid ${corSegura} !important; box-shadow: 0 0 12px ${corSegura}33;${isManobra ? 'animation: pulseManobra 1.5s infinite;' : ''}` : '';

    const badgeEspecial = especial
      ? `<span class="kds-badge-especial" style="background:${corSegura};color:white;${isManobra ? 'animation: pulseBadge 1.5s infinite;' : ''}">${isManobra ? '🔥 ' : ''}${escHtml(especial.mensagem)}</span>`
      : '';

    const mainBtn = isPronto
      ? `<button class="btn-chamar${chamadoClass}" onclick="window.chamarGarcom(${id}, ${escJs(item.productName)}, ${qty}, ${escJs(item.localName)}, ${escJs(item.userName)})" title="Chamar garçom para entregar" style="background: #8b5cf6; color: white;"><i class="ph ${btnIcon}"></i> <span>${btnText}</span></button>`
      : `<button class="btn-pronto" onclick="window.alterarStatusPedido(${id}, '${nextStatus}')" style="background: ${btnColor}; color: white;" title="${btnTitle}"><i class="ph ${btnIcon}"></i> <span>${btnText}</span></button>`;

    const isMultipleClass = qty > 1 ? ' is-multiple' : '';
    const isNewClass = newOrderIds.has(id) ? ' new-order-entry-pulse' : '';

    const statusEsc = escHtml(status);
    const nomeEsc = escHtml(item.productName || item.nome || 'Produto');
    const emojiEsc = escHtml(item.productEmoji || '🍽️');
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
            if (!byCat['Composição']) byCat['Composição'] = [];
            byCat['Composição'].push(typeof c === 'object' ? (c.nome || c.opcao || JSON.stringify(c)) : String(c));
          }
        });
        compsHtml = '<div class="item-composicoes">' + Object.keys(byCat).map(cat =>
          '<span style="font-weight:700;color:#1e3a5f;">' + escHtml(cat) + ':</span> ' +
          byCat[cat].map(o => '<span class="comp-item">' + escHtml(o) + '</span>').join(' ')
        ).join(' &nbsp; ') + '</div>';
      }
    } catch(e) {}

    const urgencyClass = diffMins >= 30 ? 'urgente' : (diffMins >= 15 ? 'atencao' : 'normal');

    const ptCabecalho = `
        <div class="kds-card-mobile-header">
          <div class="kds-card-mesa-badge">
            <i class="ph-bold ph-table" style="color: ${localColor}; font-size: 18px;"></i>
            <strong style="font-size: 14.5px; font-weight: 800; color: inherit;">${localEsc}</strong>
            ${userEsc ? `<span class="kds-card-garcom" style="opacity:0.75; font-size:12px;">· ${userEsc}</span>` : ''}
          </div>
          <div class="kds-card-time-badge ${urgencyClass}">
            <i class="ph ph-clock"></i>
            <span>${formatarTempoFila(diffMins)}</span>
          </div>
        </div>`;

    const ptQtd = `
        <div class="kds-qty-badge">${qty}x</div>`;

    const ptProduto = `
        <div class="item-produto">
          <div class="item-produto-title-line">
            <span class="item-emoji" style="font-size:20px;">${emojiEsc}</span>
            <span class="kds-product-name">${nomeEsc}</span>
            ${badgeEspecial}
          </div>
          ${obsEsc ? `<div class="item-observacao" style="background:rgba(239,68,68,0.1); color:#ef4444; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:700;"><i class="ph-bold ph-warning-circle"></i> OBS: ${obsEsc}</div>` : ''}
          ${compsHtml}
        </div>`;

    const ptAcao = `
        <div class="item-pronto">
          ${revertBtn}
          ${mainBtn}
        </div>`;

    const camposMontados = { cabecalho: ptCabecalho, quantidade: ptQtd, produto: ptProduto, acao: ptAcao };
    const hiddenFields = window.obterCardHidden();
    const corpoCard = obterCardOrder().map(k => hiddenFields.has(k) ? '' : (camposMontados[k] || '')).join('');

    return `
      <div class="queue-item${isNewClass}" data-id="${id}" data-status="${statusEsc}" style="border-left: 5px solid ${localColor}; ${estiloEspecial}">
        ${corpoCard}
      </div>
    `;
  }).join('');

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

// --- REORDENAÇÃO DE COLUNAS (POSIÇÃO) ---
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
  
  // Reordenar colunas do cabeçalho
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
        kdsAgendarSalvarNoServidor();
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
  const mode = localStorage.getItem('chef_kds_sidebar_mode') || 'oculta';
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

// LÓGICA COMPLETA DE REDIMENSIONAMENTO DE BARRAS LATERAIS E COLUNAS
document.addEventListener('DOMContentLoaded', () => {
  carregarPedidos();
  window.setSidebarDisplayMode(localStorage.getItem('chef_kds_sidebar_mode') || 'oculta');

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

  // 3. REDIMENSIONAR COLUNAS DE CONTEÚDO (PROPORCIONAL DE SOMA ZERO)
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
    kdsAgendarSalvarNoServidor();
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
  let currentFontScale = parseFloat(localStorage.getItem('chef_kds_font_scale') || localStorage.getItem('queue-font-scale') || '1.0');
  function updateFontScale(scale) {
    currentFontScale = Math.min(Math.max(scale, 0.6), 2.0);
    localStorage.setItem('chef_kds_font_scale', currentFontScale.toString());
    localStorage.setItem('queue-font-scale', currentFontScale.toString());
    document.documentElement.style.setProperty('--queue-font-scale', currentFontScale);
    const queueList = document.getElementById('queue-list');
    if (queueList) queueList.style.fontSize = (currentFontScale * 100) + '%';
    kdsAgendarSalvarNoServidor();
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
      kdsAgendarSalvarNoServidor();
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

// --- CONTROLE DE MODO DE DISPOSIÇÃO DA TELA (LISTA / GRADE 2 COLS / GRADE 3 COLS / TV) ---
window.currentLayoutMode = localStorage.getItem('chef_kds_layout_mode') || 'lista';

// Ajuste de tamanho da fonte da fila (botões A- / A+ do popup de configurações)
window.filaFontScale = parseFloat(localStorage.getItem('chef_kds_font_scale')) || 1;
window.alterarTamanhoFonte = function(delta) {
  window.filaFontScale = Math.max(0.7, Math.min(1.6, window.filaFontScale + (delta || 0) * 0.1));
  localStorage.setItem('chef_kds_font_scale', String(window.filaFontScale));
  const queueList = document.getElementById('queue-list');
  if (queueList) queueList.style.fontSize = (window.filaFontScale * 100) + '%';
  kdsAgendarSalvarNoServidor();
};


window.alternarLayoutRapido = function() {
  const current = localStorage.getItem('chef_kds_layout_mode') === 'lista' ? 'grid' : 'lista';
  window.alterarModoDisposicao(current);
};


window.alterarModoDisposicao = function(modo) {
  localStorage.setItem('chef_kds_layout_mode', modo);
  const queueList = document.getElementById('queue-list');
  const btnGrid = document.getElementById('btn-layout-grid');
  const btnLista = document.getElementById('btn-layout-lista');
  const btnLayout3col = document.getElementById('btn-layout-3col');
  const btnLayoutTv = document.getElementById('btn-layout-tv');

  if (queueList) {
    if (modo === 'lista') {
      queueList.classList.add('modo-lista');
      queueList.style.gridTemplateColumns = '1fr';
    } else {
      queueList.classList.remove('modo-lista');
      queueList.style.gridTemplateColumns = '';
    }
    queueList.classList.remove('grade-2col', 'grade-3col', 'modo-tv');
    if (modo === 'grid') queueList.classList.add('grade-2col');
    if (modo === 'grade3') queueList.classList.add('grade-3col');
    if (modo === 'tv') queueList.classList.add('modo-tv');
  }

  if (btnGrid && btnLista) {
    btnGrid.style.background = modo === 'grid' ? '#fc4b15' : 'transparent';
    btnGrid.style.color = modo === 'grid' ? '#ffffff' : 'var(--text-muted, #94a3b8)';
    btnGrid.style.fontWeight = modo === 'grid' ? '800' : '700';

    btnLista.style.background = modo === 'lista' ? '#fc4b15' : 'transparent';
    btnLista.style.color = modo === 'lista' ? '#ffffff' : 'var(--text-muted, #94a3b8)';
    btnLista.style.fontWeight = modo === 'lista' ? '800' : '700';
  }
  if (btnLayout3col) btnLayout3col.classList.toggle('active', modo === 'grade3');
  if (btnLayoutTv) btnLayoutTv.classList.toggle('active', modo === 'tv');

  document.querySelectorAll('#modal-fila-settings .layout-btn').forEach(btn => {
    if (btn.getAttribute('data-mode') === modo) btn.classList.add('active');
    else btn.classList.remove('active');
  });
  kdsAgendarSalvarNoServidor();
};

window.abrirModalFilaSettings = function() {
  const modal = document.getElementById('modal-fila-settings');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
    try {
      const modo = localStorage.getItem('chef_kds_layout_mode') || 'grid';
      if (typeof window.alterarModoDisposicao === 'function') window.alterarModoDisposicao(modo);
      const audioStatus = localStorage.getItem('chef_kds_sound') !== '0';
      const audioToggle = document.getElementById('kds-toggle-sound');
      if (audioToggle) audioToggle.checked = audioStatus;
      if (typeof renderizarCamposCardModal === 'function') renderizarCamposCardModal();
    } catch (e) {}
  }
};

window.fecharModalFilaSettings = function() {
  const modal = document.getElementById('modal-fila-settings');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  try {
    const savedLayout = localStorage.getItem('chef_kds_layout_mode');
    if (savedLayout) window.alterarModoDisposicao(savedLayout);
    const savedFontScale = localStorage.getItem('chef_kds_font_scale');
    if (savedFontScale && document.getElementById('queue-list')) {
      document.getElementById('queue-list').style.fontSize = (parseFloat(savedFontScale) * 100) + '%';
    }
  } catch(e){}
});
