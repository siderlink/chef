
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

// Se o restaurante configurou o modo Clássico, redireciona para a fila clássica (a não ser que forçado na URL).
(function kdsDetectarVersaoClassica() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('v') === '2' || urlParams.get('v') === 'nova' || urlParams.get('force') === '1') {
    localStorage.setItem('fila_modo', 'nova');
    localStorage.setItem('chef_fila_modo', 'nova');
    return;
  }
  const localModo = localStorage.getItem('fila_modo') || localStorage.getItem('chef_fila_modo');
  if (localModo === 'classica') {
    window.location.replace('/fila-pedidos-classica.html?v=1');
    return;
  }
  fetch('/api/config')
    .then(r => r.json())
    .then(cfg => {
      if (cfg && String(cfg.fila_modo || '').toLowerCase() === 'classica') {
        const curP = new URLSearchParams(window.location.search);
        if (curP.get('v') !== '2' && curP.get('force') !== '1') {
          localStorage.setItem('fila_modo', 'classica');
          localStorage.setItem('chef_fila_modo', 'classica');
          window.location.replace('/fila-pedidos-classica.html?v=1');
        }
      }
    })
    .catch(() => {});
})();

window.trocarVersaoFila = function(versao) {
  const isV1 = (versao === 'v1' || versao === 'classica');
  localStorage.setItem('fila_modo', isV1 ? 'classica' : 'nova');
  localStorage.setItem('chef_fila_modo', isV1 ? 'classica' : 'nova');
  try {
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (typeof obterTokenAtual === 'function' ? obterTokenAtual() : '') },
      body: JSON.stringify({ fila_modo: isV1 ? 'classica' : 'nova' })
    }).catch(() => {});
  } catch(e) {}
  window.location.href = isV1 ? '/fila-pedidos-classica.html?v=1' : '/fila-pedidos.html?v=2';
};

// ── PILAR 2: KDS Smart-Sync de Cozinha (Saída Simultânea de Pratos) ──
const forcedFireItemIds = new Set();

function inferirTempoPreparoPrato(nome) {
  if (!nome) return 15;
  const n = String(nome).toLowerCase();
  if (/picanha|bife|steak|carne|costela|churrasco|feijoada|paella|bacalhau|moqueca|cordeiro|ancho|t-bone|wagyu/.test(n)) return 22;
  if (/risoto|pizza|hamb[uú]rguer|burger|massa|lasanha|parmegiana|peixe|salm[aã]o|polvo|fondue/.test(n)) return 16;
  if (/frango|omelete|pastel|por[cç][aã]o|batata|tapioca|sandu[ií]che|wrap|guarni[cç][aã]o/.test(n)) return 12;
  if (/sobremesa|pudim|petit|torta|brownie|a[cç]a[ií]|sorvete|churros/.test(n)) return 6;
  if (/salada|carpaccio|ceviche|tartare|bruschetta|couvert|entrada|tabua/.test(n)) return 6;
  if (/bebida|refrigerante|suco|cerveja|chopp|vinho|drink|caipirinha|caf[eé]|água|shot/.test(n)) return 3;
  return 15;
}

function calcularSmartSyncInfo(item, allData) {
  const ssAtivo = localStorage.getItem('chef_kds_smartsync') !== '0';
  if (!ssAtivo) return null;
  if (['Finalizado', 'Cancelado', 'Entregue', 'Pago', 'Aguardando Marcha'].includes(item.status)) return null;

  const tableKey = (item.mesa_comanda || item.localName || '').trim().toLowerCase();
  if (!tableKey) return null;

  const itemEtapa = (item.etapa || 'Principal').trim().toLowerCase();
  const companions = (allData || []).filter(c => {
    if (['Finalizado', 'Cancelado', 'Entregue', 'Pago'].includes(c.status)) return false;
    const cTable = (c.mesa_comanda || c.localName || '').trim().toLowerCase();
    if (cTable !== tableKey) return false;
    const cEtapa = (c.etapa || 'Principal').trim().toLowerCase();
    return cEtapa === itemEtapa;
  });

  if (companions.length <= 1) return null;

  const itemPrep = parseInt(item.tempo_preparo_min) || inferirTempoPreparoPrato(item.productName);
  let maxPrep = 0;
  let minCreatedAt = parseUtc(item.createdAt);

  companions.forEach(c => {
    const t = parseInt(c.tempo_preparo_min) || inferirTempoPreparoPrato(c.productName);
    if (t > maxPrep) maxPrep = t;
    const ca = parseUtc(c.createdAt);
    if (ca < minCreatedAt) minCreatedAt = ca;
  });

  const allProntos = companions.every(c => c.status === 'Pronto' || c.status === 'Prontos');
  if (allProntos) {
    return { tipo: 'pronto_sincronizado' };
  }

  if (forcedFireItemIds.has(item.id)) {
    return item.status === 'Em preparo' ? { tipo: 'prep', faltamMin: itemPrep, tempoPreparo: itemPrep } : null;
  }

  const holdMin = Math.max(0, maxPrep - itemPrep);
  const idealStart = minCreatedAt + (holdMin * 60000);
  const targetFinish = minCreatedAt + (maxPrep * 60000);
  const now = Date.now();

  if (item.status === 'Em espera' || item.status === 'Pendente') {
    if (now < idealStart) {
      const diffSec = Math.max(0, Math.ceil((idealStart - now) / 1000));
      const m = Math.floor(diffSec / 60);
      const s = diffSec % 60;
      return { tipo: 'hold', minutos: m, segundos: s, tempoPreparo: itemPrep, maxPrep: maxPrep, idealStart };
    } else {
      return { tipo: 'fogo', tempoPreparo: itemPrep, maxPrep: maxPrep };
    }
  }

  if (item.status === 'Em preparo' || item.status === 'Em Preparo') {
    const diffSec = Math.max(0, Math.ceil((targetFinish - now) / 1000));
    const m = Math.max(1, Math.floor(diffSec / 60));
    return { tipo: 'prep', faltamMin: m, tempoPreparo: itemPrep };
  }

  return null;
}

window.alternarSmartSync = function() {
  const current = localStorage.getItem('chef_kds_smartsync') !== '0';
  const next = current ? '0' : '1';
  localStorage.setItem('chef_kds_smartsync', next);
  atualizarBotaoSmartSyncUI();
  if (typeof renderQueue === 'function') renderQueue(true);
};

window.forcarInicioSmartSync = function(itemId) {
  forcedFireItemIds.add(itemId);
  if (typeof window.alterarStatusPedido === 'function') {
    window.alterarStatusPedido(itemId, 'Em preparo');
  }
};

function atualizarBotaoSmartSyncUI() {
  const btn = document.getElementById('btn-toggle-smartsync');
  const lbl = document.getElementById('label-smartsync');
  if (!btn || !lbl) return;
  const ativo = localStorage.getItem('chef_kds_smartsync') !== '0';
  if (ativo) {
    btn.style.background = 'rgba(139,92,246,0.18)';
    btn.style.borderColor = 'rgba(139,92,246,0.5)';
    btn.style.color = '#8b5cf6';
    lbl.innerText = 'Smart-Sync: ON';
    btn.title = 'Smart-Sync de Cozinha Ativo (Pratos sincronizados para saída simultânea). Clique para desativar.';
  } else {
    btn.style.background = 'transparent';
    btn.style.borderColor = 'var(--border-color, #475569)';
    btn.style.color = 'var(--text-muted, #94a3b8)';
    lbl.innerText = 'Smart-Sync: OFF';
    btn.title = 'Smart-Sync de Cozinha Desativado. Clique para ativar.';
  }
}

// Timer vivo a cada 1 segundo para atualizar as contagens de hold
setInterval(() => {
  const holdBadges = document.querySelectorAll('.kds-smart-sync-badge.hold');
  if (!holdBadges || holdBadges.length === 0) return;
  let precisaRerender = false;
  holdBadges.forEach(badge => {
    const itemId = parseInt(badge.getAttribute('data-ss-item'));
    if (!itemId) return;
    const item = (queueData || []).find(q => q.id === itemId);
    if (!item) return;
    const info = calcularSmartSyncInfo(item, queueData);
    if (!info || info.tipo !== 'hold') {
      precisaRerender = true;
    } else {
      const segStr = String(info.segundos).padStart(2, '0');
      const timerSpan = badge.querySelector('.ss-timer-display');
      if (timerSpan) {
        timerSpan.innerText = `${info.minutos}:${segStr}`;
      }
    }
  });
  if (precisaRerender && typeof renderQueue === 'function') {
    renderQueue(false);
  }
}, 1000);

document.addEventListener('DOMContentLoaded', () => {
  atualizarBotaoSmartSyncUI();
});

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
    kds_card_hidden: (localStorage.getItem('chef_kds_card_hidden') || '[]'),
    kds_section_sizes: (localStorage.getItem('chef_kds_section_sizes') || JSON.stringify(DEFAULT_SECTION_SIZES)),
    kds_colab_apelidos: (localStorage.getItem('chef_kds_colab_apelidos') || '{}')
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
  if (cfg.kds_section_sizes) {
    try {
      const parsed = typeof cfg.kds_section_sizes === 'string' ? JSON.parse(cfg.kds_section_sizes) : cfg.kds_section_sizes;
      if (parsed && typeof parsed === 'object') {
        Object.assign(kdsSectionSizes, parsed);
        localStorage.setItem('chef_kds_section_sizes', JSON.stringify(kdsSectionSizes));
        if (typeof aplicarTamanhosCSS === 'function') aplicarTamanhosCSS(kdsSectionSizes);
      }
    } catch(e){}
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
  if (cfg.kds_colab_apelidos) {
    try {
      const parsed = typeof cfg.kds_colab_apelidos === 'string' ? JSON.parse(cfg.kds_colab_apelidos) : cfg.kds_colab_apelidos;
      if (parsed && typeof parsed === 'object') {
        Object.assign(kdsColabApelidos, parsed);
        localStorage.setItem('chef_kds_colab_apelidos', JSON.stringify(kdsColabApelidos));
        renderizarListaApelidosDrawer();
      }
    } catch(e) {}
  }
}

// ── DIMENSIONAMENTO DINÂMICO DE SEÇÕES E LAYOUT DO KDS ──
const DEFAULT_SECTION_SIZES = {
  header: 260,
  qty: 54,
  action: 230,
  height: 76,
  gap: 12,
  cardMin: 290,
  gridCols: 'auto',
  cardSize: 'm',
  fontSize: 15,
  caixaAlta: false
};

let kdsSectionSizes = Object.assign({}, DEFAULT_SECTION_SIZES);
try {
  const savedSizes = localStorage.getItem('chef_kds_section_sizes');
  if (savedSizes) Object.assign(kdsSectionSizes, JSON.parse(savedSizes));
} catch(e){}

// Apelidos de Colaboradores e de Pedidos
let kdsColabApelidos = {};
try {
  const savedColabs = localStorage.getItem('chef_kds_colab_apelidos');
  if (savedColabs) kdsColabApelidos = JSON.parse(savedColabs);
} catch(e) {}

let kdsPedidoApelidos = {};
try {
  const savedPedidos = localStorage.getItem('chef_kds_pedidos_apelidos');
  if (savedPedidos) kdsPedidoApelidos = JSON.parse(savedPedidos);
} catch(e) {}

function aplicarTamanhosCSS(sizes) {
  if (!sizes) sizes = kdsSectionSizes;
  const root = document.documentElement;
  const queueList = document.getElementById('queue-list');

  root.style.setProperty('--kds-col-header-width', (sizes.header || 260) + 'px');
  root.style.setProperty('--kds-col-qty-width', (sizes.qty || 54) + 'px');
  root.style.setProperty('--kds-col-action-width', (sizes.action || 230) + 'px');
  root.style.setProperty('--kds-card-height', (sizes.height || 76) + 'px');
  root.style.setProperty('--kds-card-gap', (sizes.gap !== undefined ? sizes.gap : 12) + 'px');
  root.style.setProperty('--kds-card-min-width', (sizes.cardMin || 290) + 'px');
  root.style.setProperty('--kds-font-size', (sizes.fontSize || 15) + 'px');

  // Ajustes dinâmicos de Grid Columns
  const colCss = (sizes.gridCols && sizes.gridCols !== 'auto')
    ? `repeat(${sizes.gridCols}, minmax(0, 1fr))`
    : `repeat(auto-fill, minmax(var(--kds-card-min-width, ${sizes.cardMin || 290}px), 1fr))`;
  root.style.setProperty('--kds-grid-columns', colCss);

  // Densidade de padding e min-height para modo grid
  let gridPad = '16px';
  let gridMinH = '190px';
  if (sizes.cardSize === 'p') { gridPad = '10px 12px'; gridMinH = '140px'; }
  else if (sizes.cardSize === 'm') { gridPad = '16px'; gridMinH = '190px'; }
  else if (sizes.cardSize === 'g') { gridPad = '22px'; gridMinH = '240px'; }
  else if (sizes.cardSize === 'gg') { gridPad = '28px'; gridMinH = '300px'; }
  root.style.setProperty('--kds-card-grid-padding', gridPad);
  root.style.setProperty('--kds-card-grid-min-height', gridMinH);

  if (queueList) {
    queueList.style.setProperty('--kds-grid-columns', colCss);
    queueList.style.setProperty('--kds-card-gap', (sizes.gap !== undefined ? sizes.gap : 12) + 'px');
    queueList.style.setProperty('--kds-card-grid-padding', gridPad);
    queueList.style.setProperty('--kds-card-grid-min-height', gridMinH);

    queueList.classList.remove('grade-2col', 'grade-3col', 'grade-4col', 'grade-5col');
    if (sizes.gridCols && sizes.gridCols !== 'auto') {
      const w = window.innerWidth;
      if (w <= 680) {
        // No celular/smartphone, sempre 1 coluna limpa vertical
      } else if (w <= 960 && parseInt(sizes.gridCols) > 2) {
        queueList.classList.add('grade-2col');
      } else if (w <= 1200 && parseInt(sizes.gridCols) > 3) {
        queueList.classList.add('grade-3col');
      } else {
        queueList.classList.add(`grade-${sizes.gridCols}col`);
      }
    }
    queueList.classList.remove('card-tam-p', 'card-tam-m', 'card-tam-g', 'card-tam-gg');
    if (sizes.cardSize) {
      queueList.classList.add(`card-tam-${sizes.cardSize}`);
    }
    if (sizes.caixaAlta) {
      queueList.classList.add('kds-caixa-alta');
      document.body.classList.add('kds-caixa-alta');
    } else {
      queueList.classList.remove('kds-caixa-alta');
      document.body.classList.remove('kds-caixa-alta');
    }
  }
  sincronizarControlesLayoutUI(sizes);
}

let kdsResizeDebounceTimer = null;
window.addEventListener('resize', () => {
  if (kdsResizeDebounceTimer) clearTimeout(kdsResizeDebounceTimer);
  kdsResizeDebounceTimer = setTimeout(() => {
    if (typeof aplicarTamanhosCSS === 'function') {
      aplicarTamanhosCSS();
    }
  }, 120);
});

function sincronizarControlesLayoutUI(sizes) {
  if (!sizes) sizes = kdsSectionSizes;
  const mapInputs = {
    'kds-slider-header': { val: sizes.header, unit: 'px', labelId: 'kds-val-header' },
    'kds-slider-qty': { val: sizes.qty, unit: 'px', labelId: 'kds-val-qty' },
    'kds-slider-action': { val: sizes.action, unit: 'px', labelId: 'kds-val-action' },
    'kds-slider-height': { val: sizes.height, unit: 'px', labelId: 'kds-val-height' },
    'kds-slider-gap': { val: sizes.gap !== undefined ? sizes.gap : 12, unit: 'px', labelId: 'kds-val-gap' },
    'kds-slider-font': { val: sizes.fontSize || 15, unit: 'px', labelId: 'kds-val-font' }
  };
  Object.keys(mapInputs).forEach(id => {
    const el = document.getElementById(id);
    const item = mapInputs[id];
    if (el) el.value = item.val;
    const label = document.getElementById(item.labelId);
    if (label) label.innerText = item.val + item.unit;
  });

  const btnCaixaAlta = document.getElementById('btn-toggle-caixa-alta');
  const lblCaixaAlta = document.getElementById('label-caixa-alta-status');
  if (btnCaixaAlta && lblCaixaAlta) {
    const ativa = !!sizes.caixaAlta;
    btnCaixaAlta.classList.toggle('active', ativa);
    lblCaixaAlta.innerText = ativa ? 'Ativado (A-Z)' : 'Desativado';
    lblCaixaAlta.style.background = ativa ? 'rgba(34, 197, 94, 0.15)' : 'rgba(0,0,0,0.1)';
    lblCaixaAlta.style.color = ativa ? '#22c55e' : 'var(--kds-text-muted)';
  }

  document.querySelectorAll('.btn-col-choice').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-cols') === String(sizes.gridCols));
  });
  document.querySelectorAll('.btn-size-choice').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-size') === String(sizes.cardSize));
  });
  const modo = localStorage.getItem('chef_kds_layout_mode') || 'grid';
  document.querySelectorAll('.btn-mode-choice').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-mode') === modo);
  });
  const gradeOpts = document.getElementById('kds-grade-options-group');
  if (gradeOpts) gradeOpts.style.display = modo === 'grid' ? 'flex' : 'none';
}

window.alterarTamanhoSecao = function(chave, valor) {
  const num = parseInt(valor, 10);
  if (isNaN(num)) return;
  kdsSectionSizes[chave] = num;
  localStorage.setItem('chef_kds_section_sizes', JSON.stringify(kdsSectionSizes));
  aplicarTamanhosCSS(kdsSectionSizes);
  kdsAgendarSalvarNoServidor();
};

window.alterarColunasGrade = function(cols) {
  kdsSectionSizes.gridCols = cols;
  localStorage.setItem('chef_kds_section_sizes', JSON.stringify(kdsSectionSizes));
  aplicarTamanhosCSS(kdsSectionSizes);
  renderQueue(true);
  kdsAgendarSalvarNoServidor();
};

window.alterarTamanhoCard = function(tam) {
  kdsSectionSizes.cardSize = tam;
  if (tam === 'p') {
    kdsSectionSizes.fontSize = 13;
    kdsSectionSizes.gap = 8;
  } else if (tam === 'm') {
    kdsSectionSizes.fontSize = 15;
    kdsSectionSizes.gap = 12;
  } else if (tam === 'g') {
    kdsSectionSizes.fontSize = 18;
    kdsSectionSizes.gap = 16;
  } else if (tam === 'gg') {
    kdsSectionSizes.fontSize = 22;
    kdsSectionSizes.gap = 20;
  }
  localStorage.setItem('chef_kds_section_sizes', JSON.stringify(kdsSectionSizes));
  aplicarTamanhosCSS(kdsSectionSizes);
  renderQueue(true);
  kdsAgendarSalvarNoServidor();
};

window.aplicarPresetDensidade = function(preset) {
  if (preset === 'ultra') {
    kdsSectionSizes.gap = 2;
    kdsSectionSizes.height = 36;
    kdsSectionSizes.fontSize = 12;
    kdsSectionSizes.qty = 44;
    kdsSectionSizes.action = 170;
    kdsSectionSizes.header = 200;
    kdsSectionSizes.cardSize = 'p';
  } else if (preset === 'compacto') {
    kdsSectionSizes.gap = 6;
    kdsSectionSizes.height = 52;
    kdsSectionSizes.fontSize = 13;
    kdsSectionSizes.qty = 48;
    kdsSectionSizes.action = 200;
    kdsSectionSizes.header = 230;
    kdsSectionSizes.cardSize = 'p';
  } else if (preset === 'padrao') {
    kdsSectionSizes.gap = 12;
    kdsSectionSizes.height = 76;
    kdsSectionSizes.fontSize = 15;
    kdsSectionSizes.qty = 54;
    kdsSectionSizes.action = 230;
    kdsSectionSizes.header = 260;
    kdsSectionSizes.cardSize = 'm';
  } else if (preset === 'amplo') {
    kdsSectionSizes.gap = 18;
    kdsSectionSizes.height = 96;
    kdsSectionSizes.fontSize = 17;
    kdsSectionSizes.qty = 64;
    kdsSectionSizes.action = 260;
    kdsSectionSizes.header = 290;
    kdsSectionSizes.cardSize = 'g';
  }
  localStorage.setItem('chef_kds_section_sizes', JSON.stringify(kdsSectionSizes));
  aplicarTamanhosCSS(kdsSectionSizes);
  renderQueue(true);
  kdsAgendarSalvarNoServidor();
};

window.toggleCaixaAlta = function(forcar) {
  if (typeof forcar === 'boolean') {
    kdsSectionSizes.caixaAlta = forcar;
  } else {
    kdsSectionSizes.caixaAlta = !kdsSectionSizes.caixaAlta;
  }
  localStorage.setItem('chef_kds_caixa_alta', kdsSectionSizes.caixaAlta ? '1' : '0');
  localStorage.setItem('chef_kds_section_sizes', JSON.stringify(kdsSectionSizes));
  aplicarTamanhosCSS(kdsSectionSizes);
  renderQueue(true);
  kdsAgendarSalvarNoServidor();
};

window.restaurarTamanhosPadrao = function() {
  kdsSectionSizes = Object.assign({}, DEFAULT_SECTION_SIZES);
  localStorage.setItem('chef_kds_section_sizes', JSON.stringify(kdsSectionSizes));
  localStorage.setItem('chef_kds_caixa_alta', '0');
  aplicarTamanhosCSS(kdsSectionSizes);
  renderQueue(true);
  kdsAgendarSalvarNoServidor();
};

window.cadastrarApelidoColaborador = function(nomeOriginal) {
  if (!nomeOriginal) return;
  const atual = kdsColabApelidos[nomeOriginal] || '';
  const novo = prompt(`Cadastrar apelido para o garçom/colaborador "${nomeOriginal}":\n(Deixe em branco para remover o apelido)`, atual);
  if (novo === null) return;
  const apelidoLimpo = novo.trim();
  if (apelidoLimpo) {
    kdsColabApelidos[nomeOriginal] = apelidoLimpo;
  } else {
    delete kdsColabApelidos[nomeOriginal];
  }
  localStorage.setItem('chef_kds_colab_apelidos', JSON.stringify(kdsColabApelidos));
  renderizarListaApelidosDrawer();
  renderQueue(true);
  kdsAgendarSalvarNoServidor({ kds_colab_apelidos: JSON.stringify(kdsColabApelidos) });
};

window.cadastrarApelidoPedido = function(pedidoId) {
  const idStr = String(pedidoId);
  const atual = kdsPedidoApelidos[idStr] || '';
  const novo = prompt(`Cadastrar identificação/apelido para este pedido na fila:\n(Ex: Mesa de Aniversário, VIP, Pedido do Zé, Balcão 2)`, atual);
  if (novo === null) return;
  const apelidoLimpo = novo.trim();
  if (apelidoLimpo) {
    kdsPedidoApelidos[idStr] = apelidoLimpo;
  } else {
    delete kdsPedidoApelidos[idStr];
  }
  localStorage.setItem('chef_kds_pedidos_apelidos', JSON.stringify(kdsPedidoApelidos));
  renderQueue(true);
};

window.salvarApelidoColaboradorDoDrawer = function() {
  const inOrig = document.getElementById('kds-input-colab-orig');
  const inApelido = document.getElementById('kds-input-colab-apelido');
  if (!inOrig || !inApelido) return;
  const orig = inOrig.value.trim();
  const apelido = inApelido.value.trim();
  if (!orig || !apelido) {
    alert('Informe o nome original do colaborador e o apelido desejado.');
    return;
  }
  kdsColabApelidos[orig] = apelido;
  localStorage.setItem('chef_kds_colab_apelidos', JSON.stringify(kdsColabApelidos));
  inOrig.value = '';
  inApelido.value = '';
  renderizarListaApelidosDrawer();
  renderQueue(true);
  kdsAgendarSalvarNoServidor({ kds_colab_apelidos: JSON.stringify(kdsColabApelidos) });
};

window.removerApelidoColaborador = function(orig) {
  delete kdsColabApelidos[orig];
  localStorage.setItem('chef_kds_colab_apelidos', JSON.stringify(kdsColabApelidos));
  renderizarListaApelidosDrawer();
  renderQueue(true);
  kdsAgendarSalvarNoServidor({ kds_colab_apelidos: JSON.stringify(kdsColabApelidos) });
};

function renderizarListaApelidosDrawer() {
  const wrap = document.getElementById('kds-lista-colab-apelidos');
  if (!wrap) return;
  const keys = Object.keys(kdsColabApelidos);
  if (keys.length === 0) {
    wrap.innerHTML = '<span style="font-size:12px; color:var(--kds-text-muted); font-style:italic;">Nenhum apelido cadastrado ainda. Digite acima ou clique sobre o nome do garçom no card.</span>';
    return;
  }
  wrap.innerHTML = keys.map(k => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:var(--kds-btn-bg); border:1px solid var(--kds-card-border); border-radius:8px; font-size:12px;">
      <div>
        <span style="color:var(--kds-text-secondary);">${escHtml(k)}:</span>
        <strong style="color:var(--kds-primary, #fc4b15); margin-left:4px;">${escHtml(kdsColabApelidos[k])}</strong>
      </div>
      <button type="button" onclick="window.removerApelidoColaborador('${escJs(k)}')" style="border:none; background:transparent; color:#ef4444; cursor:pointer; font-weight:bold; font-size:14px;" title="Remover apelido">&times;</button>
    </div>
  `).join('');
}

window.toggleLayoutDrawer = function(forceOpen) {
  const drawer = document.getElementById('kds-layout-drawer');
  if (!drawer) return;
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !drawer.classList.contains('active');
  if (shouldOpen) {
    drawer.classList.add('active');
    aplicarTamanhosCSS(kdsSectionSizes);
    renderizarCamposCardModal();
    renderizarListaApelidosDrawer();
  } else {
    drawer.classList.remove('active');
  }
};

window.trocarAbaLayoutDrawer = function(aba) {
  document.querySelectorAll('.kds-drawer-tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === aba);
  });
  document.querySelectorAll('.kds-drawer-tab-content').forEach(c => {
    c.style.display = (c.getAttribute('data-tab') === aba) ? 'flex' : 'none';
  });
  if (aba === 'apelidos') {
    renderizarListaApelidosDrawer();
  }
  if (aba === 'loja' && typeof window.renderizarDrawerPresets === 'function') {
    window.renderizarDrawerPresets();
  }
};

// ── CAMPOS DO CARD (ORDEM E VISIBILIDADE) ──
const CARD_FIELDS = [
  { key: 'cabecalho', label: 'Mesa / Comanda e Tempo' },
  { key: 'quantidade', label: 'Badge Quantidade' },
  { key: 'produto', label: 'Produto (Nome, Obs, Adicionais)' },
  { key: 'acao', label: 'Botões de Ação (Pronto / Chamar)' }
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
  renderQueue(true);
  kdsAgendarSalvarNoServidor();
};
window.alternarCampoCard = function(key) {
  const hidden = new Set(window.obterCardHidden());
  if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
  kdsCardHidden = hidden;
  localStorage.setItem('chef_kds_card_hidden', JSON.stringify(Array.from(hidden)));
  renderizarCamposCardModal();
  renderQueue(true);
  kdsAgendarSalvarNoServidor();
};

function renderizarCamposCardList(containerId) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const ordem = obterCardOrder();
  const hidden = window.obterCardHidden();
  wrap.innerHTML = ordem.map(k => {
    const oculto = hidden.has(k);
    return `
      <div class="kds-field-item" data-key="${k}">
        <div class="kds-drag-handle" title="Segure e arraste para reordenar">
          <i class="ph-bold ph-dots-six-vertical"></i>
        </div>
        <div class="kds-field-title">
          <span>${window.cardFieldLabel(k)}</span>
          <span style="font-size: 11px; padding: 2px 7px; border-radius: 6px; font-weight: 800; ${oculto ? 'background: rgba(239,68,68,0.15); color: #ef4444;' : 'background: rgba(34,197,94,0.15); color: #22c55e;'}">
            ${oculto ? 'Oculto' : 'Visível'}
          </span>
        </div>
        <div class="kds-field-actions">
          <button type="button" class="kds-field-btn" onclick="window.moverCampoCard('${k}',-1)" title="Mover para cima / esquerda">
            <i class="ph-bold ph-arrow-up"></i>
          </button>
          <button type="button" class="kds-field-btn" onclick="window.moverCampoCard('${k}',1)" title="Mover para baixo / direita">
            <i class="ph-bold ph-arrow-down"></i>
          </button>
          <button type="button" class="kds-field-btn" onclick="window.alternarCampoCard('${k}')" title="${oculto ? 'Mostrar' : 'Ocultar'}" style="${oculto ? 'color: #22c55e;' : 'color: #ef4444;'}">
            <i class="ph-bold ${oculto ? 'ph-eye' : 'ph-eye-slash'}"></i>
          </button>
        </div>
      </div>`;
  }).join('');

  if (typeof Sortable !== 'undefined' && !wrap._sortableInited) {
    wrap._sortableInited = true;
    Sortable.create(wrap, {
      handle: '.kds-drag-handle',
      animation: 160,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: () => {
        const novaOrdem = Array.from(wrap.children).map(c => c.getAttribute('data-key')).filter(Boolean);
        if (novaOrdem.length === CARD_FIELDS.length) {
          kdsCardOrder = novaOrdem.slice();
          localStorage.setItem('chef_kds_card_order', JSON.stringify(kdsCardOrder));
          if (containerId === 'kds-card-fields-drawer') {
            const outro = document.getElementById('kds-card-fields-config');
            if (outro) renderizarCamposCardList('kds-card-fields-config');
          } else {
            const outro = document.getElementById('kds-card-fields-drawer');
            if (outro) renderizarCamposCardList('kds-card-fields-drawer');
          }
          renderQueue(true);
          kdsAgendarSalvarNoServidor();
        }
      }
    });
  }
}

function renderizarCamposCardModal() {
  renderizarCamposCardList('kds-card-fields-config');
  renderizarCamposCardList('kds-card-fields-drawer');
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
let currentCanalFilter = localStorage.getItem('filaCurrentCanal') || 'todos';
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
  document.querySelectorAll('#kds-mobile-bottom-nav .kds-nav-tab[data-status]').forEach(btn => {
    const bStatus = btn.getAttribute('data-status');
    btn.classList.toggle('active', bStatus === currentFilter || (currentFilter === 'Pronto' && (bStatus === 'Pronto' || bStatus === 'Prontos')));
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
  const labelMobile = document.getElementById('current-sector-label-mobile');
  if (labelMobile) labelMobile.textContent = sectorName;
  
  // New labels from V2
  const labelSub = document.getElementById('current-sector-label-sub');
  if (labelSub) labelSub.textContent = (sectorName === 'Todos' ? 'Todos os Setores' : sectorName);
  
  // Center navbar chip in V2
  const navChip = document.querySelector('.kds-navbar-center .sector-modal-btn span');
  if (navChip) navChip.textContent = (sectorName === 'Todos' ? 'Todos os Setores' : sectorName);

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

// Alerta de Demanda do Buffet para a Cozinha
socket.on('alerta_buffet_cozinha', (dados) => {
  try {
    const audio = new Audio('/sounds/bell.mp3');
    audio.play().catch(() => {});
  } catch (e) {}

  const antigo = document.getElementById('alerta-buffet-banner');
  if (antigo) antigo.remove();

  const banner = document.createElement('div');
  banner.id = 'alerta-buffet-banner';
  banner.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg, #dc2626 0%, #991b1b 100%);color:white;padding:22px 28px;border-radius:20px;font-size:15px;font-weight:800;z-index:99999;box-shadow:0 20px 50px rgba(220,38,38,0.6);border:2px solid #fca5a5;max-width:560px;width:92%;text-align:center;animation:popIn 0.3s ease-out;';
  banner.innerHTML = `
    <div style="font-size: 22px; font-weight: 900; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 8px;">
      <span>🚨</span> <span>ATENÇÃO COZINHA: REPOR BUFFET!</span>
    </div>
    <div style="font-size: 14.5px; line-height: 1.5; color: #fee2e2; margin-bottom: 16px;">
      ${dados.mensagem || 'Demanda alta no buffet! Favor conferir reposição de cubas.'}
    </div>
    <div style="display: flex; gap: 10px; justify-content: center;">
      <button onclick="document.getElementById('alerta-buffet-banner').remove()" style="padding: 12px 26px; background: white; color: #991b1b; border: none; border-radius: 12px; font-weight: 900; font-size: 14.5px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.25);">
        👍 Ciente / Buffet Conferido
      </button>
    </div>
  `;
  document.body.appendChild(banner);
});



window.filtrarFila = function(statusText) {
  currentFilter = statusText;
  localStorage.setItem('filaCurrentFilter', statusText);

  // Desktop navbar segmented control
  document.querySelectorAll('#kds-status-tabs-desktop .status-btn, .kds-segmented-control .status-btn').forEach(btn => {
    const bStatus = btn.getAttribute('data-status');
    btn.classList.toggle('active', bStatus === statusText || (statusText === 'Pronto' && (bStatus === 'Pronto' || bStatus === 'Prontos')));
  });

  // Mobile bottom navigation bar
  document.querySelectorAll('#kds-mobile-bottom-nav .kds-nav-tab').forEach(btn => {
    const bStatus = btn.getAttribute('data-status');
    btn.classList.toggle('active', bStatus === statusText || (statusText === 'Pronto' && (bStatus === 'Pronto' || bStatus === 'Prontos')));
  });

  // Modal settings status buttons
  document.querySelectorAll('.fila-settings-btn.status-btn').forEach(btn => {
    const bStatus = btn.getAttribute('data-status');
    btn.classList.toggle('active', bStatus === statusText || (statusText === 'Pronto' && (bStatus === 'Pronto' || bStatus === 'Prontos')));
  });

  // Legacy lateral panel status buttons
  document.querySelectorAll('.right-panel-status .status-btn').forEach(btn => {
    btn.classList.remove('active');
    const bStatus = btn.getAttribute('data-status');
    if (bStatus === statusText || (statusText === 'Pronto' && (bStatus === 'Pronto' || bStatus === 'Prontos'))) {
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

function renderQueue(forceRerender) {
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
    if (currentCanalFilter === 'ifood') {
      const isIfood = (item.canal && String(item.canal).toLowerCase().includes('ifood')) ||
                      (item.origem && String(item.origem).toLowerCase().includes('ifood')) ||
                      (item.localName && String(item.localName).toLowerCase().includes('ifood')) ||
                      (item.mesa_comanda && String(item.mesa_comanda).toLowerCase().includes('ifood'));
      if (!isIfood) return false;
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
  const countEspera = queueData.filter(i => (i.status === 'Pendente' || i.status === 'Em espera' || i.status === 'Aguardando Marcha') && !['Finalizado', 'Cancelado', 'Entregue', 'Pago'].includes(i.status)).length;
  const countPreparo = queueData.filter(i => (i.status === 'Em preparo' || i.status === 'Em Preparo') && !['Finalizado', 'Cancelado', 'Entregue', 'Pago'].includes(i.status)).length;
  const countPronto = queueData.filter(i => (i.status === 'Pronto' || i.status === 'Prontos') && !['Finalizado', 'Cancelado', 'Entregue', 'Pago'].includes(i.status)).length;

  const countIfood = queueData.filter(i => {
    if (['Finalizado', 'Cancelado', 'Entregue', 'Pago'].includes(i.status)) return false;
    return (i.canal && String(i.canal).toLowerCase().includes('ifood')) ||
           (i.origem && String(i.origem).toLowerCase().includes('ifood')) ||
           (i.localName && String(i.localName).toLowerCase().includes('ifood')) ||
           (i.mesa_comanda && String(i.mesa_comanda).toLowerCase().includes('ifood'));
  }).length;

  const bIfood = document.getElementById('kds-badge-ifood');
  if (bIfood) {
    bIfood.innerText = countIfood;
    bIfood.style.display = countIfood > 0 ? 'inline-block' : 'none';
  }

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
    const emptyHtml = `
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
    if (forceRerender || typeof window.morphdom !== 'function') {
      queueList.innerHTML = emptyHtml;
    } else {
      const tempWrapper = queueList.cloneNode(false);
      tempWrapper.innerHTML = emptyHtml;
      window.morphdom(queueList, tempWrapper, {
        getNodeKey: function(node) {
          return node.getAttribute ? (node.getAttribute('data-field-key') || node.getAttribute('data-id') || node.id || null) : null;
        }
      });
    }
    return;
  }

// ══════════════════════════════════════════════════════════════════
// 🍕 KDS PIZZARIA: PARSER DE FATIAS, RETIRADAS, ADICIONAIS & FORNO
// ══════════════════════════════════════════════════════════════════
window.kdsFornoTimers = window.kdsFornoTimers || {};
let _fornoLoopInterval = null;

function iniciarLoopFornoTimer() {
  if (_fornoLoopInterval) return;
  _fornoLoopInterval = setInterval(() => {
    const keys = Object.keys(window.kdsFornoTimers);
    if (keys.length === 0) {
      clearInterval(_fornoLoopInterval);
      _fornoLoopInterval = null;
      return;
    }
    let precisaRender = false;
    keys.forEach(k => {
      const t = window.kdsFornoTimers[k];
      if (t && t.segRestantes > 0) {
        t.segRestantes--;
        precisaRender = true;
        if (t.segRestantes === 0) {
          try {
            const bell = new Audio('/sounds/bell.mp3');
            bell.play().catch(() => {});
          } catch (_) {}
        }
      }
    });
    if (precisaRender && typeof renderQueue === 'function') {
      renderQueue();
    }
  }, 1000);
}

window.iniciarTimerForno = function(itemId, minutos = 10) {
  if (!itemId) return;
  const segs = minutos * 60;
  window.kdsFornoTimers[itemId] = {
    segRestantes: segs,
    totalSeg: segs
  };

  const p = queueData.find(x => x.id === itemId);
  if (p) p.status = 'No Forno';

  if (typeof socket !== 'undefined' && socket.connected) {
    socket.emit('atualizar_status', { id: itemId, status: 'No Forno' });
  }

  iniciarLoopFornoTimer();
  if (typeof renderQueue === 'function') renderQueue();
};

window.ajustarTimerForno = function(itemId, deltaSeg) {
  if (!window.kdsFornoTimers[itemId]) return;
  window.kdsFornoTimers[itemId].segRestantes = Math.max(0, window.kdsFornoTimers[itemId].segRestantes + deltaSeg);
  if (typeof renderQueue === 'function') renderQueue();
};

window.pararTimerFornoEFinalizar = function(itemId) {
  if (window.kdsFornoTimers[itemId]) {
    delete window.kdsFornoTimers[itemId];
  }
  if (typeof window.alterarStatusPedido === 'function') {
    window.alterarStatusPedido(itemId, 'Pronto');
  }
};

function renderPizzaKdsDetails(item) {
  const nomeLower = (item.productName || item.nome || '').toLowerCase();
  const obs = item.observations || '';
  let comps = [];
  try {
    comps = typeof item.composicoes === 'string' ? JSON.parse(item.composicoes) : (item.composicoes || []);
  } catch (_) { comps = []; }

  const isPizza = nomeLower.includes('pizza') || (item.sector || '').toLowerCase().includes('forno') || comps.some(c => {
    const cat = (c.categoria || '').toLowerCase();
    return cat.includes('fatia') || cat.includes('borda') || cat.includes('tamanho');
  });

  if (!isPizza) return '';

  const fatias = comps.filter(c => (c.categoria || '').toLowerCase().includes('fatia'));
  const retiradas = comps.filter(c => (c.categoria || '').toLowerCase().includes('retirada')).map(c => c.opcao || c.nome || String(c));
  const adicionais = comps.filter(c => (c.categoria || '').toLowerCase().includes('adicional')).map(c => c.opcao || c.nome || String(c));
  const borda = comps.find(c => (c.categoria || '').toLowerCase().includes('borda'));

  if (retiradas.length === 0 && obs.includes('🚫')) {
    const part = obs.split('🚫')[1];
    if (part) {
      const retsStr = part.split('•')[0].trim();
      retsStr.split(',').forEach(r => { if (r.trim()) retiradas.push(r.trim()); });
    }
  }

  if (adicionais.length === 0 && obs.includes('🟢')) {
    const part = obs.split('🟢')[1];
    if (part) {
      const addsStr = part.split('•')[0].trim();
      addsStr.split(',').forEach(a => { if (a.trim()) adicionais.push(a.trim()); });
    }
  }

  let bordaStr = borda ? (borda.opcao || borda.nome || '') : '';
  if (!bordaStr && obs.toLowerCase().includes('borda:')) {
    const bPart = obs.split(/borda:/i)[1];
    if (bPart) bordaStr = bPart.split('•')[0].trim();
  }

  let html = `<div class="kds-pizza-block">`;

  if (fatias.length > 0) {
    html += `<div style="display:flex; flex-wrap:wrap; gap:4px;">`;
    fatias.forEach(f => {
      html += `<span class="badge-kds-fatia">🍕 ${escHtml(f.categoria)}: ${escHtml(f.opcao || f.nome || '')}</span>`;
    });
    html += `</div>`;
  }

  if (retiradas.length > 0) {
    html += `
      <div class="kds-pizza-retiradas">
        <span style="font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:0.5px; display:inline-flex; align-items:center; gap:4px;">
          <i class="ph-bold ph-prohibit" style="color:#dc2626; font-size:14px;"></i> ATENÇÃO:
        </span>
        ${retiradas.map(r => `<span style="background:#ef4444; color:white; font-size:11px; font-weight:900; padding:2px 7px; border-radius:4px; text-transform:uppercase;">🚫 ${escHtml(r)}</span>`).join(' ')}
      </div>`;
  }

  if (adicionais.length > 0) {
    html += `
      <div class="kds-pizza-adicionais" style="display:flex; flex-wrap:wrap; gap:4px;">
        ${adicionais.map(a => `<span style="background:#dcfce7; color:#166534; border:1px solid #86efac; font-size:11px; font-weight:800; padding:2px 8px; border-radius:6px;">🟢 ${escHtml(a)}</span>`).join(' ')}
      </div>`;
  }

  if (bordaStr && !bordaStr.toLowerCase().includes('sem recheio') && !bordaStr.toLowerCase().includes('nenhuma')) {
    html += `
      <div style="background:#fffbeb; border:1.5px solid #f59e0b; border-radius:6px; padding:4px 8px; color:#b45309; font-size:11.5px; font-weight:800; display:inline-flex; align-items:center; gap:5px;">
        <i class="ph-fill ph-circle-notch" style="color:#d97706;"></i>
        <span>BORDA RECHEADA: <strong>${escHtml(bordaStr)}</strong></span>
      </div>`;
  }

  const fornoAtivo = window.kdsFornoTimers && window.kdsFornoTimers[item.id];
  const isPreparo = item.status === 'Em preparo' || item.status === 'Em Preparo';
  if (isPreparo || fornoAtivo) {
    if (fornoAtivo) {
      const rest = fornoAtivo.segRestantes;
      const min = Math.floor(rest / 60);
      const seg = rest % 60;
      const timeStr = `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
      const isPronto = rest <= 0;

      html += `
        <div class="kds-forno-active-box" style="background:${isPronto ? '#fee2e2' : '#ffedd5'}; border:2px solid ${isPronto ? '#dc2626' : '#ea580c'};">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:18px;">🔥</span>
            <div>
              <div style="font-size:11px; font-weight:800; color:${isPronto ? '#dc2626' : '#9a3412'}; text-transform:uppercase;">${isPronto ? '🔔 RETIRAR DO FORNO!' : 'No Forno (Assando)'}</div>
              <div style="font-size:16px; font-weight:900; color:${isPronto ? '#b91c1c' : '#c2410c'}; font-family:monospace;">${timeStr}</div>
            </div>
          </div>
          <div style="display:flex; gap:4px;">
            <button type="button" onclick="event.stopPropagation(); window.ajustarTimerForno(${item.id}, 60)" style="background:#fff; border:1px solid #ea580c; border-radius:6px; padding:4px 6px; font-weight:800; font-size:11px; color:#c2410c; cursor:pointer;">+1m</button>
            <button type="button" onclick="event.stopPropagation(); window.ajustarTimerForno(${item.id}, -60)" style="background:#fff; border:1px solid #ea580c; border-radius:6px; padding:4px 6px; font-weight:800; font-size:11px; color:#c2410c; cursor:pointer;">-1m</button>
            ${isPronto ? `<button type="button" onclick="event.stopPropagation(); window.pararTimerFornoEFinalizar(${item.id})" style="background:#16a34a; color:white; border:none; border-radius:6px; padding:4px 8px; font-weight:800; font-size:11px; cursor:pointer;">Pronto!</button>` : ''}
          </div>
        </div>`;
    } else {
      html += `
        <div style="margin-top:4px;">
          <button type="button" class="btn-iniciar-forno" onclick="event.stopPropagation(); window.iniciarTimerForno(${item.id}, 10)" style="background:linear-gradient(135deg, #f97316, #ea580c); color:white; border:none; padding:6px 12px; border-radius:8px; font-size:11.5px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(234,88,12,0.3);">
            <i class="ph-fill ph-fire"></i> Colocar no Forno (10m)
          </button>
        </div>`;
    }
  }

  html += `</div>`;
  return html;
}

function renderizarCardIndividual(item, itemIndex = 0) {
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

  if (status === 'Aguardando Marcha') {
    btnIcon = 'ph-play';
    btnColor = '#8b5cf6';
    nextStatus = 'Em preparo';
    btnTitle = 'Forçar início do preparo';
    btnText = '▶️ Forçar Marcha';
  } else if (status === 'Em espera' || status === 'Pendente') {
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

  let mainBtn = '';
  let btnEntregar = '';

  if (isPronto) {
    mainBtn = `<button class="btn-chamar${chamadoClass}" onclick="window.chamarGarcom(${id}, ${escJs(item.productName)}, ${qty}, ${escJs(item.localName)}, ${escJs(item.userName)})" title="Chamar garçom para entregar"><i class="ph ${btnIcon}"></i> <span>${btnText}</span></button>`;
    btnEntregar = `<button class="btn-entregar" onclick="window.alterarStatusPedido(${id}, 'Finalizado')" title="Marcar como Entregue / Despachado (Concluir)"><i class="ph-bold ph-check-circle"></i> <span>Entregar</span></button>`;
  } else {
    mainBtn = `<button class="btn-pronto" onclick="window.alterarStatusPedido(${id}, '${nextStatus}')" style="background: ${btnColor}; color: white;" title="${btnTitle}"><i class="ph ${btnIcon}"></i> <span>${btnText}</span></button>`;
  }

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

  const rawUser = (item.userName || '').trim();
  const apelidoColab = rawUser ? (kdsColabApelidos[rawUser] || kdsColabApelidos[rawUser.toLowerCase()] || '') : '';
  const displayUser = apelidoColab || rawUser;

  const idStr = String(item.id);
  const apelidoPedido = kdsPedidoApelidos[idStr] || '';

  const isIfood = (item.canal && String(item.canal).toLowerCase().includes('ifood')) ||
                  (item.origem && String(item.origem).toLowerCase().includes('ifood')) ||
                  (item.localName && String(item.localName).toLowerCase().includes('ifood')) ||
                  (item.mesa_comanda && String(item.mesa_comanda).toLowerCase().includes('ifood'));
  const badgeIfood = isIfood
    ? `<span class="kds-ifood-badge" style="background:#ea1d2c;color:white;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:900;display:inline-flex;align-items:center;gap:4px;box-shadow:0 2px 6px rgba(234,29,44,0.3);"><i class="ph-bold ph-moped"></i> iFood</span>`
    : '';

  const bumpKeyBadge = itemIndex < 9 ? `<span class="kds-bump-tag" title="Bump Bar: pressione a tecla [${itemIndex + 1}] para avançar">[${itemIndex + 1}]</span>` : '';

  const ptCabecalho = `
      <div class="kds-card-mobile-header" data-field-key="cabecalho">
        <div class="kds-card-mesa-badge">
          <i class="ph-bold ph-table" style="color: ${localColor}; font-size: 19px; flex-shrink: 0;"></i>
          <div class="kds-card-mesa-info">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <strong class="kds-mesa-title">${localEsc}</strong>
              ${bumpKeyBadge}
              ${badgeIfood}
              ${apelidoPedido ? `
                <span class="kds-item-nickname-badge" onclick="event.stopPropagation(); window.cadastrarApelidoPedido(${id})" title="Apelido do Pedido: ${escHtml(apelidoPedido)}. Clique para alterar.">
                  <i class="ph-fill ph-tag"></i> <span>${escHtml(apelidoPedido)}</span>
                </span>
              ` : `
                <button type="button" class="kds-btn-add-apelido" onclick="event.stopPropagation(); window.cadastrarApelidoPedido(${id})" title="Cadastrar apelido/identificação para este pedido">
                  <i class="ph-bold ph-tag"></i>
                </button>
              `}
            </div>
            ${rawUser ? `
              <span class="kds-card-garcom" onclick="event.stopPropagation(); window.cadastrarApelidoColaborador('${escJs(rawUser)}')" title="Colaborador: ${escHtml(rawUser)}${apelidoColab ? ` (Apelido: ${escHtml(apelidoColab)})` : ''}. Clique para alterar apelido.">
                <i class="ph-bold ph-user"></i>
                <span>${escHtml(displayUser)}</span>
                ${apelidoColab ? '<i class="ph-fill ph-tag" style="color:#fc4b15;font-size:9px;"></i>' : '<i class="ph ph-pencil-simple" style="font-size:9px;opacity:0.6;"></i>'}
              </span>
            ` : ''}
          </div>
        </div>
        <div class="kds-card-time-badge ${urgencyClass}" title="Tempo no status atual">
          <i class="ph ph-clock"></i>
          <span>${formatarTempoFila(diffMins)}</span>
        </div>
      </div>`;

  const ptQtd = `
      <div class="kds-qty-badge" data-field-key="quantidade">${qty}x</div>`;

  const smartSyncInfo = calcularSmartSyncInfo(item, queueData);
  let smartSyncHtml = '';
  if (smartSyncInfo) {
    if (smartSyncInfo.tipo === 'hold') {
      const segFormat = String(smartSyncInfo.segundos).padStart(2, '0');
      smartSyncHtml = `
        <div class="kds-smart-sync-badge hold" data-ss-item="${id}">
          <div style="display:flex;align-items:center;gap:6px;">
            <i class="ph-bold ph-hourglass-high"></i>
            <span>HOLD SMART-SYNC: Inicia em <strong class="ss-timer-display">${smartSyncInfo.minutos}:${segFormat}</strong></span>
          </div>
          <button type="button" class="kds-btn-force-fire" onclick="event.stopPropagation(); window.forcarInicioSmartSync(${id})" title="Quebrar hold e iniciar preparo imediatamente">
            <i class="ph-bold ph-fire"></i> Forçar
          </button>
        </div>`;
    } else if (smartSyncInfo.tipo === 'fogo') {
      smartSyncHtml = `
        <div class="kds-smart-sync-badge fogo" data-ss-item="${id}">
          <div style="display:flex;align-items:center;gap:6px;">
            <i class="ph-fill ph-fire"></i>
            <span>🔥 FOGO! INICIAR AGORA</span>
          </div>
          <span style="font-size:10.5px;opacity:0.9;">Cocção ~${smartSyncInfo.tempoPreparo}m</span>
        </div>`;
    } else if (smartSyncInfo.tipo === 'prep') {
      smartSyncHtml = `
        <div class="kds-smart-sync-badge prep" data-ss-item="${id}">
          <div style="display:flex;align-items:center;gap:6px;">
            <i class="ph-bold ph-cooking-pot"></i>
            <span>SINCRONIZADO: ~${smartSyncInfo.faltamMin} min</span>
          </div>
          <span style="font-size:10px;opacity:0.85;">Saída conjunta</span>
        </div>`;
    } else if (smartSyncInfo.tipo === 'pronto_sincronizado') {
      smartSyncHtml = `
        <div class="kds-smart-sync-badge sync-done" data-ss-item="${id}">
          <div style="display:flex;align-items:center;gap:6px;">
            <i class="ph-fill ph-sparkle"></i>
            <span>MESA SINCRONIZADA</span>
          </div>
          <span style="font-size:10px;">Prontos juntos!</span>
        </div>`;
    }
  }

  const pizzaKdsHtml = renderPizzaKdsDetails(item);

  const ptProduto = `
      <div class="item-produto" data-field-key="produto">
        <div class="item-produto-title-line">
          <span class="kds-card-qty-inline">${qty}x</span>
          <span class="item-emoji" style="font-size:20px;">${emojiEsc}</span>
          <span class="kds-product-name">${nomeEsc}</span>
          ${badgeEspecial}
        </div>
        ${pizzaKdsHtml}
        ${obsEsc ? `<div class="item-observacao" style="background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.3); padding:4px 8px; border-radius:6px; font-size:12px; font-weight:800; margin-top:4px;"><i class="ph-bold ph-warning-circle"></i> OBS: ${obsEsc}</div>` : ''}
        ${compsHtml}
        ${smartSyncHtml}
      </div>`;

  const ptAcao = `
      <div class="item-pronto" data-field-key="acao">
        ${revertBtn}
        ${mainBtn}
        ${btnEntregar}
      </div>`;

  const camposMontados = { cabecalho: ptCabecalho, quantidade: ptQtd, produto: ptProduto, acao: ptAcao };
  const hiddenFields = window.obterCardHidden();
  const corpoCard = obterCardOrder().map(k => hiddenFields.has(k) ? '' : (camposMontados[k] || '')).join('');

  // KDS SLA: borda dinâmica por tempo (não afeta itens já prontos)
  let slaBorderColor = localColor;
  let slaAnimation = '';
  if (!['Pronto', 'Prontos', 'Finalizado', 'Entregue', 'Pago', 'Cancelado'].includes(status)) {
    if (diffMins < 12) {
      slaBorderColor = '#22c55e';  // Verde  — dentro do SLA
    } else if (diffMins < 20) {
      slaBorderColor = '#f59e0b';  // Amarelo — atenção
    } else {
      slaBorderColor = '#ef4444';  // Vermelho — SLA estourado
      slaAnimation = 'animation: slaPulseBorder 1.8s ease-in-out infinite;';
    }
  }

  return `
    <div class="queue-item${isNewClass}" data-id="${id}" data-status="${statusEsc}" style="border-left: 5px solid ${slaBorderColor}; ${estiloEspecial} ${slaAnimation}">
      ${corpoCard}
    </div>
  `;
}


  const modoAtual = localStorage.getItem('chef_kds_layout_mode') || 'grid';

  if (modoAtual === 'kanban') {
    const itensValidos = queueData.filter(item => {
      if (['Finalizado', 'Cancelado', 'Entregue', 'Pago'].includes(item.status)) return false;
      const itemSector = (item.sector || '').trim().toLowerCase();
      if (currentSector !== 'Todos' && item.sector && itemSector !== currentSector.trim().toLowerCase()) return false;
      if (filaTipoFiltro !== 'todos' && tipoDoItem(item) !== filaTipoFiltro) return false;
      if (filaSearchText) {
        const productName = (item.productName || '').toLowerCase();
        const localName = (item.localName || '').toLowerCase();
        const mesaComanda = (item.mesa_comanda || '').toLowerCase();
        if (!productName.includes(filaSearchText) && !localName.includes(filaSearchText) && !mesaComanda.includes(filaSearchText)) return false;
      }
      return true;
    });

    const itensEspera = itensValidos.filter(i => i.status === 'Pendente' || i.status === 'Em espera' || i.status === 'Aguardando Marcha');
    const itensPreparo = itensValidos.filter(i => i.status === 'Em preparo' || i.status === 'Em Preparo');
    const itensProntos = itensValidos.filter(i => i.status === 'Pronto' || i.status === 'Prontos');

    const htmlEspera = itensEspera.map(renderizarCardIndividual).join('');
    const htmlPreparo = itensPreparo.map(renderizarCardIndividual).join('');
    const htmlProntos = itensProntos.map(renderizarCardIndividual).join('');

    const kanbanHtml = `
      <div class="kds-kanban-column col-status-espera">
        <div class="kds-kanban-header" style="color: #f59e0b; border-bottom: 2px solid rgba(245, 158, 11, 0.4);">
          <span style="display:flex;align-items:center;gap:8px;"><i class="ph-bold ph-hourglass-high"></i> Em Espera</span>
          <span class="kds-badge-count badge-espera" style="background:#f59e0b;color:#ffffff;">${itensEspera.length}</span>
        </div>
        <div class="kds-kanban-body">
          ${htmlEspera || '<div class="kds-kanban-empty">Nenhum pedido em espera</div>'}
        </div>
      </div>
      <div class="kds-kanban-column col-status-preparo">
        <div class="kds-kanban-header" style="color: #3b82f6; border-bottom: 2px solid rgba(59, 130, 246, 0.4);">
          <span style="display:flex;align-items:center;gap:8px;"><i class="ph-bold ph-fire"></i> Em Preparo</span>
          <span class="kds-badge-count badge-preparo" style="background:#3b82f6;color:#ffffff;">${itensPreparo.length}</span>
        </div>
        <div class="kds-kanban-body">
          ${htmlPreparo || '<div class="kds-kanban-empty">Nenhum pedido em preparo</div>'}
        </div>
      </div>
      <div class="kds-kanban-column col-status-pronto">
        <div class="kds-kanban-header" style="color: #10b981; border-bottom: 2px solid rgba(16, 185, 129, 0.4);">
          <span style="display:flex;align-items:center;gap:8px;"><i class="ph-bold ph-bowl-food"></i> Prontos</span>
          <span class="kds-badge-count badge-pronto" style="background:#10b981;color:#ffffff;">${itensProntos.length}</span>
        </div>
        <div class="kds-kanban-body">
          ${htmlProntos || '<div class="kds-kanban-empty">Nenhum pedido pronto</div>'}
        </div>
      </div>
    `;

    queueList.innerHTML = kanbanHtml;
    aplicarTamanhosCSS(kdsSectionSizes);
    return;
  }

  const itemsHtml = filtered.map(renderizarCardIndividual).join('');

  const hadKanban = queueList ? !!queueList.querySelector('.kds-kanban-column') : false;
  if (forceRerender || hadKanban || typeof window.morphdom !== 'function') {
    queueList.innerHTML = itemsHtml;
  } else {
    const tempWrapper = queueList.cloneNode(false);
    tempWrapper.innerHTML = itemsHtml;
    window.morphdom(queueList, tempWrapper, {
      getNodeKey: function(node) {
        return node.getAttribute ? (node.getAttribute('data-field-key') || node.getAttribute('data-id') || node.id || null) : null;
      },
      onBeforeElChildrenUpdated: function(fromEl, toEl) {
        if (fromEl.classList && fromEl.classList.contains('item-exiting')) {
          return false;
        }
        return true;
      }
    });
  }

  aplicarTamanhosCSS(kdsSectionSizes);
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

// LÓGICA COMPLETA DE REDIMENSIONAMENTO DE BARRAS LATERAIS E COLUNAS
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

window.alterarTamanhoCampo = function(campo, delta) {
  const cssVar = '--kds-font-' + campo;
  const storageKey = 'chef_kds_font_' + campo;
  
  // Define tamanhos padrao
  const defaultSizes = { nome: 16.5, qtd: 15, obs: 12, comps: 11.7 };
  
  // Pega o atual do estilo root ou do cache
  let currentRaw = document.documentElement.style.getPropertyValue(cssVar) || localStorage.getItem(storageKey);
  let size = parseFloat(currentRaw);
  if (isNaN(size) || !size) size = defaultSizes[campo];
  
  // Incremento/Decremento
  size += (delta * 1.5);
  
  // Limites
  if (size < 8) size = 8;
  if (size > 40) size = 40;
  
  document.documentElement.style.setProperty(cssVar, size + 'px');
  localStorage.setItem(storageKey, size);
};

// Ao inicializar, aplicar tamanhos salvos
function aplicarTamanhosCamposSalvos() {
  ['nome', 'qtd', 'obs', 'comps'].forEach(campo => {
    const val = localStorage.getItem('chef_kds_font_' + campo);
    if (val) {
      document.documentElement.style.setProperty('--kds-font-' + campo, val + 'px');
    }
  });
}
aplicarTamanhosCamposSalvos();

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
  if (!['grid', 'lista', 'kanban'].includes(modo)) modo = 'grid';
  localStorage.setItem('chef_kds_layout_mode', modo);
  const queueList = document.getElementById('queue-list');
  const btnGrid = document.getElementById('btn-layout-grid');
  const btnLista = document.getElementById('btn-layout-lista');
  const btnKanban = document.getElementById('btn-layout-kanban');

  if (queueList) {
    queueList.classList.remove('modo-lista', 'modo-kanban');
    if (modo === 'lista') queueList.classList.add('modo-lista');
    if (modo === 'kanban') queueList.classList.add('modo-kanban');
  }

  if (btnGrid) {
    btnGrid.style.background = modo === 'grid' ? '#fc4b15' : 'transparent';
    btnGrid.style.color = modo === 'grid' ? '#ffffff' : 'var(--text-muted, #94a3b8)';
    btnGrid.style.fontWeight = modo === 'grid' ? '800' : '700';
  }
  if (btnLista) {
    btnLista.style.background = modo === 'lista' ? '#fc4b15' : 'transparent';
    btnLista.style.color = modo === 'lista' ? '#ffffff' : 'var(--text-muted, #94a3b8)';
    btnLista.style.fontWeight = modo === 'lista' ? '800' : '700';
  }
  if (btnKanban) {
    btnKanban.style.background = modo === 'kanban' ? '#fc4b15' : 'transparent';
    btnKanban.style.color = modo === 'kanban' ? '#ffffff' : 'var(--text-muted, #94a3b8)';
    btnKanban.style.fontWeight = modo === 'kanban' ? '800' : '700';
  }

  document.querySelectorAll('.btn-mode-choice, #modal-fila-settings .layout-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-mode') === modo);
  });

  const gradeOpts = document.getElementById('kds-grade-options-group');
  if (gradeOpts) {
    gradeOpts.style.display = modo === 'grid' ? 'flex' : 'none';
  }

  aplicarTamanhosCSS(kdsSectionSizes);
  renderQueue(true);
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
    const savedLayout = localStorage.getItem('chef_kds_layout_mode') || 'grid';
    window.alterarModoDisposicao(savedLayout);
    aplicarTamanhosCSS(kdsSectionSizes);
    if (typeof renderizarCamposCardModal === 'function') renderizarCamposCardModal();
    const savedFontScale = localStorage.getItem('chef_kds_font_scale');
    if (savedFontScale && document.getElementById('queue-list')) {
      document.getElementById('queue-list').style.fontSize = (parseFloat(savedFontScale) * 100) + '%';
    }
    atualizarBotoesAutoscroll();
    atualizarStatusConexao(socket && socket.connected);
  } catch(e){}
});

// Intervalo suave a cada 30 segundos para atualizar tempos decorridos e criticidade via morphdom
setInterval(() => {
  if (Array.isArray(queueData) && queueData.length > 0) {
    renderQueue();
  }
}, 30000);

// ── INTEGRAÇÃO & POLLER IFOOD EM TEMPO REAL NO KDS ──
window.filtrarCanal = function(canal) {
  if (currentCanalFilter === canal) {
    currentCanalFilter = 'todos';
  } else {
    currentCanalFilter = canal;
  }
  localStorage.setItem('filaCurrentCanal', currentCanalFilter);
  const btnIfood = document.getElementById('kds-filter-ifood');
  if (btnIfood) btnIfood.classList.toggle('active', currentCanalFilter === 'ifood');
  renderQueue();
};

window.sincronizarIfoodManual = function() {
  const btn = document.getElementById('btn-sync-ifood');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i> <span>Sincronizando...</span>';
  }
  if (socket && socket.emit) {
    socket.emit('ifood_manual_poll');
  }
  if (typeof window.enqueueTopNotification === 'function') {
    window.enqueueTopNotification('🛵 Consultando novos pedidos no iFood (Merchant API)...', '#ea1d2c', 4000);
  }
  setTimeout(() => {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph-bold ph-moped"></i> <span>iFood Sync</span>';
    }
  }, 3500);
};

socket.on('ifood_poll_done', () => {
  if (typeof window.enqueueTopNotification === 'function') {
    window.enqueueTopNotification('✅ Poller iFood sincronizado com sucesso!', '#10b981', 3500);
  }
  carregarPedidos();
});

socket.on('ifood_error', (msg) => {
  if (typeof window.enqueueTopNotification === 'function') {
    window.enqueueTopNotification(`⚠️ iFood: ${msg}`, '#ef4444', 4000);
  }
});

// ══════════════════════════════════════════════════════════════════
// LOJA DE LAYOUTS & PRESETS DA COZINHA (KDS PRESET HUB)
// ══════════════════════════════════════════════════════════════════

window.KDS_PRESETS_DATA = {
  buffet: {
    id: 'buffet',
    category: 'buffet',
    name: 'Buffet, Self-Service & A Quilo',
    subtitle: 'Visão de Longe para Reposição de Cubas',
    icon: 'ph-cooking-pot',
    color: '#10b981',
    tag: 'Self-Service & Quilo',
    desc: 'Ideal para cozinhas de reposição de pista e cubas a quilo. Cards gigantes (GG) em 2 colunas amplas com fonte 20px em CAIXA ALTA, permitindo leitura cristalina a mais de 5 metros de distância do fogão.',
    layout: 'grid',
    sizes: { gridCols: '2', cardSize: 'gg', height: 96, gap: 18, fontSize: 20, qty: 72, header: 320, action: 260, cardMin: 420, caixaAlta: true },
    smartSync: false,
    specs: [
      { label: 'Disposição', val: 'Grade 2 Colunas (GG)' },
      { label: 'Visibilidade', val: 'Leitura a 5+ metros' },
      { label: 'Tipografia', val: '20px CAIXA ALTA' },
      { label: 'Foco Operação', val: 'Reposição de Cubas' }
    ]
  },
  pizzaria: {
    id: 'pizzaria',
    category: 'pizzaria',
    name: 'Pizzaria & Forneria Tradicional',
    subtitle: 'Sincronia de Forno, Bordas & Sabores',
    icon: 'ph-pizza',
    color: '#ea580c',
    tag: 'Pizzaria & Forno',
    desc: 'Otimizado para tempo de forno e comandas com múltiplos sabores (meio-a-meio) e bordas recheadas. Smart-Sync ativo em 15 minutos para sincronizar entradas e pizzas na mesma fornada.',
    layout: 'grid',
    sizes: { gridCols: '3', cardSize: 'm', height: 80, gap: 12, fontSize: 16, qty: 56, header: 270, action: 230, cardMin: 320, caixaAlta: true },
    smartSync: true,
    specs: [
      { label: 'Disposição', val: 'Grade 3 Colunas' },
      { label: 'Smart-Sync', val: 'ON (15 min Forno)' },
      { label: 'Destaques', val: 'Bordas & Sabores' },
      { label: 'Tipografia', val: '16px CAIXA ALTA' }
    ]
  },
  sushi: {
    id: 'sushi',
    category: 'sushi',
    name: 'Sushi Bar & Rodízio Japonês',
    subtitle: 'Ultra-Compacto para Sushiman',
    icon: 'ph-fish',
    color: '#06b6d4',
    tag: 'Rodízio Japonês',
    desc: 'Projetado para altíssimo volume de peças (combinados, temakis, sashimis e sushis). Densidade P com 5 colunas para o sushiman visualizar 15+ pedidos simultaneamente sem rolagem.',
    layout: 'grid',
    sizes: { gridCols: '5', cardSize: 'p', height: 56, gap: 8, fontSize: 13, qty: 44, header: 210, action: 180, cardMin: 220, caixaAlta: false },
    smartSync: false,
    specs: [
      { label: 'Disposição', val: 'Grade 5 Colunas (P)' },
      { label: 'Densidade', val: 'Alta Visão (15+ itens)' },
      { label: 'Agilidade', val: 'Finalização 1-clique' },
      { label: 'Smart-Sync', val: 'OFF (Fluxo Contínuo)' }
    ]
  },
  bar: {
    id: 'bar',
    category: 'bar',
    name: 'Bar, Pub & Choperia',
    subtitle: 'Linhas Ágeis & Foco em Bebidas',
    icon: 'ph-beer-bottle',
    color: '#f59e0b',
    tag: 'Bar & Balcão',
    desc: 'Fila horizontal em linhas compactas (banners de 58px) para bartenders e baristas. Foco em velocidade com tempo alvo inferior a 3 minutos para drinks, chopps e coquetéis.',
    layout: 'lista',
    sizes: { gridCols: 'auto', cardSize: 'p', height: 58, gap: 8, fontSize: 14, qty: 48, header: 220, action: 210, cardMin: 280, caixaAlta: false },
    smartSync: false,
    specs: [
      { label: 'Disposição', val: 'Linhas Ágeis (58px)' },
      { label: 'Tempo Alvo', val: '< 3 minutos' },
      { label: 'Alertas', val: 'Foco Bartender' },
      { label: 'Foco Operação', val: 'Chopps & Coquetéis' }
    ]
  },
  alacarte: {
    id: 'alacarte',
    category: 'alacarte',
    name: 'À La Carte & Alta Gastronomia',
    subtitle: 'Hold & Fire com Marcha de Pratos',
    icon: 'ph-fork-knife',
    color: '#8b5cf6',
    tag: 'Alta Gastronomia',
    desc: 'Fluxo refinado de cozinha com Marcha de Cursos (Entradas ➔ Principais ➔ Sobremesas) e Smart-Sync ativo com contagem regressiva para carnes, massas e guarnições finalizarem no mesmo segundo.',
    layout: 'grid',
    sizes: { gridCols: '3', cardSize: 'g', height: 86, gap: 14, fontSize: 16, qty: 58, header: 280, action: 240, cardMin: 340, caixaAlta: false },
    smartSync: true,
    specs: [
      { label: 'Disposição', val: 'Grade 3 Colunas (G)' },
      { label: 'Smart-Sync', val: 'Hold & Fire Ativo' },
      { label: 'Marcha', val: 'Controle de Cursos' },
      { label: 'Tipografia', val: '16px Elegante' }
    ]
  },
  hamburgueria: {
    id: 'hamburgueria',
    category: 'hamburgueria',
    name: 'Hamburgueria, Smash & Fast-Food',
    subtitle: 'Kanban por Estações de Chapa e Montagem',
    icon: 'ph-hamburger',
    color: '#ef4444',
    tag: 'Smash & Burguer',
    desc: 'Fluxo em 3 colunas Kanban sincronizadas (Espera ➔ Chapa/Montagem ➔ Expedição). Destaque em negrito para pontos de carne (ao ponto, bem passada) e lista visual clara de adicionais.',
    layout: 'kanban',
    sizes: { gridCols: '3', cardSize: 'm', height: 76, gap: 12, fontSize: 15, qty: 54, header: 250, action: 220, cardMin: 300, caixaAlta: true },
    smartSync: true,
    specs: [
      { label: 'Disposição', val: 'Kanban 3 Estações' },
      { label: 'Destaques', val: 'Pontos & Adicionais' },
      { label: 'Fluxo', val: 'Chapa ➔ Expedição' },
      { label: 'Tipografia', val: '15px CAIXA ALTA' }
    ]
  },
  delivery: {
    id: 'delivery',
    category: 'delivery',
    name: 'Delivery Exclusivo & Dark Kitchen',
    subtitle: 'Expedição, Motoboy & iFood Poller',
    icon: 'ph-moped',
    color: '#ea1d2c',
    tag: 'Dark Kitchen & iFood',
    desc: 'Fila linear com rastreamento de tempo de despacho para motoboys e integração nativa com o Poller iFood. Exibe código do pedido, embalagem e cronômetro de tolerância de entrega.',
    layout: 'lista',
    sizes: { gridCols: 'auto', cardSize: 'm', height: 68, gap: 10, fontSize: 15, qty: 54, header: 270, action: 230, cardMin: 300, caixaAlta: false },
    smartSync: true,
    specs: [
      { label: 'Disposição', val: 'Linhas com Endereço' },
      { label: 'Canais', val: 'iFood, Whats & Balcão' },
      { label: 'SLA Entrega', val: 'Timer Regressivo' },
      { label: 'Despacho', val: 'Código Motoboy' }
    ]
  },
  cafeteria: {
    id: 'cafeteria',
    category: 'cafeteria',
    name: 'Cafeteria, Bistrô & Doceria',
    subtitle: 'Balcão Rápido & Cafés Especiais',
    icon: 'ph-coffee',
    color: '#d97706',
    tag: 'Cafeteria & Bistrô',
    desc: 'Visual leve e direto para pedidos rápidos de balcão (cafés, toasts, tortas, salgados). Cards médios com 4 colunas para operadores visualizarem o preparo instantâneo com rapidez.',
    layout: 'grid',
    sizes: { gridCols: '4', cardSize: 'm', height: 72, gap: 10, fontSize: 14, qty: 50, header: 240, action: 200, cardMin: 260, caixaAlta: false },
    smartSync: false,
    specs: [
      { label: 'Disposição', val: 'Grade 4 Colunas' },
      { label: 'Operação', val: 'Balcão & Takeaway' },
      { label: 'Tempo Médio', val: '< 5 minutos' },
      { label: 'Smart-Sync', val: 'OFF' }
    ]
  }
};

let kdsPresetFilterCurrent = 'todos';

window.abrirLojaLayouts = function() {
  const modal = document.getElementById('modal-loja-layouts');
  if (modal) {
    modal.style.display = 'flex';
    window.renderizarLojaPresets(kdsPresetFilterCurrent);
  }
};

window.fecharLojaLayouts = function() {
  const modal = document.getElementById('modal-loja-layouts');
  if (modal) {
    modal.style.display = 'none';
  }
};

window.filtrarLojaPresets = function(cat) {
  kdsPresetFilterCurrent = cat;
  document.querySelectorAll('#kds-store-filter-bar .kds-store-filter-chip').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-cat') === cat);
  });
  window.renderizarLojaPresets(cat);
};

window.renderizarLojaPresets = function(filtro = 'todos') {
  const grid = document.getElementById('kds-store-cards-grid');
  if (!grid) return;

  const activePreset = localStorage.getItem('chef_kds_active_preset') || '';
  const entries = Object.values(window.KDS_PRESETS_DATA).filter(p => {
    return filtro === 'todos' || p.category === filtro;
  });

  grid.innerHTML = entries.map(preset => {
    const isActive = activePreset === preset.id;
    const specsHtml = preset.specs.map(s => `
      <div class="kds-niche-spec-row">
        <span>${s.label}:</span>
        <strong>${s.val}</strong>
      </div>
    `).join('');

    return `
      <div class="kds-niche-card ${isActive ? 'active-preset' : ''}" data-preset-id="${preset.id}">
        <div class="kds-niche-card-header">
          <div class="kds-niche-title-box">
            <span class="kds-niche-tag-niche" style="background: ${preset.color}20; color: ${preset.color};">${preset.tag}</span>
            <h3 style="margin-top: 6px;">${preset.name}</h3>
            <span style="font-size: 11.5px; color: var(--kds-text-muted);">${preset.subtitle}</span>
          </div>
          <div class="kds-niche-icon-wrap" style="background: ${preset.color}15; color: ${preset.color};">
            <i class="ph-bold ${preset.icon}"></i>
          </div>
        </div>

        <p class="kds-niche-desc">${preset.desc}</p>

        <div class="kds-niche-specs">
          ${specsHtml}
        </div>

        <div class="kds-niche-footer">
          <button type="button" class="kds-btn-apply-preset ${isActive ? 'is-active' : ''}" onclick="window.aplicarPresetNicho('${preset.id}')">
            <i class="ph-bold ${isActive ? 'ph-check-circle' : 'ph-sparkle'}"></i>
            <span>${isActive ? 'Layout Ativo na Cozinha' : 'Aplicar Este Layout'}</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
};

window.renderizarDrawerPresets = function() {
  const container = document.getElementById('kds-drawer-presets-container');
  if (!container) return;

  const activePreset = localStorage.getItem('chef_kds_active_preset') || '';
  const list = Object.values(window.KDS_PRESETS_DATA);

  container.innerHTML = list.map(preset => {
    const isActive = activePreset === preset.id;
    return `
      <div class="kds-drawer-preset-item ${isActive ? 'active-preset' : ''}">
        <div class="kds-drawer-preset-info">
          <i class="ph-bold ${preset.icon}" style="color: ${preset.color};"></i>
          <div class="kds-drawer-preset-texts">
            <strong>${preset.name}</strong>
            <span>${preset.tag} • ${preset.specs[0].val}</span>
          </div>
        </div>
        <button type="button" class="kds-btn-drawer-apply ${isActive ? 'is-active' : ''}" onclick="window.aplicarPresetNicho('${preset.id}')">
          ${isActive ? 'Ativo' : 'Ativar'}
        </button>
      </div>
    `;
  }).join('');
};

window.aplicarPresetNicho = function(presetId) {
  const preset = window.KDS_PRESETS_DATA[presetId];
  if (!preset) return;

  // 1. Salvar preset ativo no LocalStorage
  localStorage.setItem('chef_kds_active_preset', presetId);

  // 2. Aplicar modo de layout (grid / lista / kanban)
  if (typeof window.alterarModoDisposicao === 'function') {
    window.alterarModoDisposicao(preset.layout);
  }

  // 3. Aplicar tamanhos e dimensões das seções
  if (preset.sizes) {
    Object.assign(kdsSectionSizes, preset.sizes);
    localStorage.setItem('chef_kds_section_sizes', JSON.stringify(kdsSectionSizes));
    if (preset.sizes.caixaAlta !== undefined) {
      localStorage.setItem('chef_kds_caixa_alta', preset.sizes.caixaAlta ? '1' : '0');
    }
    aplicarTamanhosCSS(kdsSectionSizes);
  }

  // 4. Aplicar SmartSync
  if (preset.smartSync !== undefined) {
    localStorage.setItem('chef_kds_smartsync', preset.smartSync ? '1' : '0');
    if (typeof atualizarBotaoSmartSyncUI === 'function') {
      atualizarBotaoSmartSyncUI();
    }
  }

  // 5. Salvar preferências no servidor para persistência
  if (typeof kdsAgendarSalvarNoServidor === 'function') {
    kdsAgendarSalvarNoServidor();
  }

  // 6. Atualizar UI
  window.renderizarLojaPresets(kdsPresetFilterCurrent);
  window.renderizarDrawerPresets();

  // 7. Forçar atualização imediata da fila de pedidos
  if (typeof renderQueue === 'function') {
    renderQueue(true);
  }

  // 8. Notificação visual de sucesso
  if (typeof window.enqueueTopNotification === 'function') {
    window.enqueueTopNotification(`✨ Layout ativado com sucesso: ${preset.name}`, preset.color || '#10b981', 4000);
  } else {
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:${preset.color || '#10b981'};color:white;padding:12px 24px;border-radius:12px;font-size:13px;font-weight:800;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,0.3);`;
    toast.innerHTML = `✨ Layout Ativado: <strong>${preset.name}</strong>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; }, 3000);
    setTimeout(() => toast.remove(), 3500);
  }
};

// Renderizar drawer presets ao carregar o DOM se necessário
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (typeof window.renderizarDrawerPresets === 'function') {
      window.renderizarDrawerPresets();
    }
  } catch(e){}
});

// ══════════════════════════════════════════════════════════════════
// 📺 KDS MULTI-DISPOSITIVOS: MODO TV, TELA CHEIA, SOM & BUMP BAR
// ══════════════════════════════════════════════════════════════════

window.alternarModoTv = function(forcar) {
  const isTv = typeof forcar === 'boolean' ? forcar : !document.body.classList.contains('kds-modo-tv');
  if (isTv) {
    document.body.classList.add('kds-modo-tv');
    localStorage.setItem('chef_kds_modo_tv', '1');
    window.toggleKdsFullscreen(true);
  } else {
    document.body.classList.remove('kds-modo-tv');
    localStorage.setItem('chef_kds_modo_tv', '0');
  }
  const btnTv = document.getElementById('btn-toggle-modo-tv');
  if (btnTv) {
    btnTv.classList.toggle('active', isTv);
    btnTv.style.background = isTv ? '#10b981' : 'rgba(34,197,94,0.12)';
    btnTv.style.color = isTv ? '#ffffff' : '#22c55e';
    const span = btnTv.querySelector('span');
    if (span) span.innerText = isTv ? 'Sair TV' : 'Modo TV';
  }
  renderQueue(true);
};

window.toggleKdsFullscreen = function(forcar) {
  try {
    if (forcar === true) {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else if (forcar === false) {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } else {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    }
  } catch(e) {}
};

function atualizarIconeFullscreenKds() {
  const isFull = !!document.fullscreenElement;
  const icon = document.getElementById('icon-kds-fullscreen');
  if (icon) {
    icon.className = isFull ? 'ph-bold ph-arrows-in' : 'ph-bold ph-arrows-out';
  }
}
document.addEventListener('fullscreenchange', atualizarIconeFullscreenKds);

window.toggleKdsSound = function() {
  const isAtivo = localStorage.getItem('chef_kds_sound') !== '0';
  const novo = !isAtivo;
  localStorage.setItem('chef_kds_sound', novo ? '1' : '0');
  window.atualizarIconeSomKds();
  if (novo) {
    if (typeof initAudio === 'function') initAudio();
    if (typeof playOrderSoundAndVibrate === 'function') playOrderSoundAndVibrate('Em espera');
  }
};

window.atualizarIconeSomKds = function() {
  const isAtivo = localStorage.getItem('chef_kds_sound') !== '0';
  const btn = document.getElementById('btn-toggle-sound');
  if (btn) {
    btn.innerHTML = isAtivo
      ? `<i class="ph-bold ph-speaker-high" style="color: #10b981; font-size: 16px;"></i> <span>Som: ON</span>`
      : `<i class="ph-bold ph-speaker-slash" style="color: #ef4444; font-size: 16px;"></i> <span>Mudo</span>`;
    btn.style.borderColor = isAtivo ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)';
    btn.title = isAtivo ? 'Alertas sonoros ativados (Clique para silenciar)' : 'Alertas sonoros mutados (Clique para ativar)';
  }
};

window.entregarMesa = function(localName) {
  if (!localName) return;
  const prontos = (Array.isArray(queueData) ? queueData : []).filter(i => 
    (i.status === 'Pronto' || i.status === 'Prontos') && 
    (i.localName === localName || i.mesa_comanda === localName)
  );
  if (prontos.length === 0) return;
  if (!confirm(`Entregar todos os ${prontos.length} itens prontos de "${localName}"?`)) return;
  prontos.forEach(item => {
    window.alterarStatusPedido(item.id, 'Finalizado');
  });
};

// ── BUMP BAR & TECLADO PROFISSIONAL PARA KDS ──
window.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  if (e.isComposing || e.defaultPrevented) return;

  const key = e.key;

  // Bump Bar 1 a 9: Avança o pedido correspondente
  if (/^[1-9]$/.test(key)) {
    const idx = parseInt(key, 10) - 1;
    const cards = Array.from(document.querySelectorAll('#queue-list .queue-item'));
    if (cards[idx]) {
      const card = cards[idx];
      if (e.shiftKey || e.altKey) {
        const revBtn = card.querySelector('.btn-reverter');
        if (revBtn) { revBtn.click(); e.preventDefault(); }
      } else {
        const actionBtn = card.querySelector('.btn-entregar') || card.querySelector('.btn-pronto') || card.querySelector('.btn-chamar');
        if (actionBtn) {
          actionBtn.click();
          e.preventDefault();
        }
      }
    }
    return;
  }

  // Enter ou Espaço: Avança o primeiro pedido da lista
  if (key === 'Enter' || key === ' ') {
    const firstCard = document.querySelector('#queue-list .queue-item');
    if (firstCard) {
      const actionBtn = firstCard.querySelector('.btn-entregar') || firstCard.querySelector('.btn-pronto') || firstCard.querySelector('.btn-chamar');
      if (actionBtn) {
        actionBtn.click();
        e.preventDefault();
      }
    }
    return;
  }

  // U ou Ctrl+Z: Desfazer última ação
  if ((key === 'z' && (e.ctrlKey || e.metaKey)) || key === 'u' || key === 'U') {
    const undoBtn = document.querySelector('#btn-undo-action');
    if (undoBtn) {
      undoBtn.click();
      e.preventDefault();
    }
    return;
  }

  // T: Alternar Modo TV
  if ((key === 't' || key === 'T') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    window.alternarModoTv();
    e.preventDefault();
    return;
  }

  // F: Alternar Tela Cheia
  if ((key === 'f' || key === 'F') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    window.toggleKdsFullscreen();
    e.preventDefault();
    return;
  }

  // B ou C: Chamar garçom no primeiro pedido pronto
  if ((key === 'b' || key === 'B' || key === 'c' || key === 'C') && !e.ctrlKey && !e.altKey) {
    const firstChamar = document.querySelector('#queue-list .btn-chamar');
    if (firstChamar) {
      firstChamar.click();
      e.preventDefault();
    }
    return;
  }
});

// Inicialização automática das preferências
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (localStorage.getItem('chef_kds_modo_tv') === '1') {
      window.alternarModoTv(true);
    }
    window.atualizarIconeSomKds();
  } catch(e) {}
});




