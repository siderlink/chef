// --- Data Fetching ---
socket.on('mesas_atualizadas', (mesas) => {
  MESAS = mesas;
  if (typeof atualizarPillsSetoresMesas === 'function') atualizarPillsSetoresMesas();
  renderTables();
});

/* Delta: servidor envia apenas a mesa que mudou (otimização de rede) */
socket.on('mesa_delta', (mesa) => {
  if (!mesa || !Array.isArray(MESAS)) return;
  const idx = MESAS.findIndex(m => m.id === mesa.id || m.nome === mesa.nome);
  if (idx === -1) { socket.emit('get_mesas'); return; }
  MESAS[idx] = { ...MESAS[idx], ...mesa };
  if (typeof atualizarPillsSetoresMesas === 'function') atualizarPillsSetoresMesas();
  renderTables();
});

socket.on('configuracoes_atualizadas', fetchConfigs);

async function fetchConfigs() {
  try {
    const res = await fetch('/api/config?restaurante_id=' + encodeURIComponent(localStorage.getItem('restaurante_id') || '1'));
    CONFIGS = await res.json();
    if (MENU.length > 0) reorderTabs();
    aplicarModoOperacaoGarcom();
  } catch (e) {
    console.error(e);
  }
}
fetchConfigs();

function aplicarModoOperacaoGarcom() {
  const localModo = localStorage.getItem('garcom_modo');
  const modo = (localModo || (CONFIGS && CONFIGS.garcom_modo) || 'pro').toLowerCase();
  const isClassico = (modo === 'classico' || modo === 'essencial');

  const navAtalhos = document.getElementById('nav-atalhos');
  if (navAtalhos) {
    navAtalhos.style.display = isClassico ? 'none' : '';
  }

  const atalhosGrid = document.getElementById('atalhos-grid-container');
  if (atalhosGrid) {
    atalhosGrid.style.display = isClassico ? 'none' : 'grid';
  }

  if (isClassico && typeof currentViewId !== 'undefined' && currentViewId === 'view-atalhos') {
    if (typeof showView === 'function') showView('tables', 'Mesas');
  }

  let badgeEl = document.getElementById('garcom-modo-badge');
  if (!badgeEl) {
    const topBar = document.querySelector('.top-nav') || document.querySelector('.header') || document.querySelector('.logo');
    if (topBar) {
      badgeEl = document.createElement('span');
      badgeEl.id = 'garcom-modo-badge';
      badgeEl.style.cssText = 'font-size:10px; font-weight:800; padding:3px 8px; border-radius:12px; margin-left:8px; cursor:pointer; vertical-align:middle; display:inline-flex; align-items:center; gap:4px;';
      topBar.appendChild(badgeEl);
      badgeEl.onclick = function() {
        const novo = (localStorage.getItem('garcom_modo') === 'classico') ? 'pro' : 'classico';
        localStorage.setItem('garcom_modo', novo);
        aplicarModoOperacaoGarcom();
        showToast(novo === 'classico' ? 'Modo Essencial (Clássico) ativado' : 'Modo Pro ativado');
      };
    }
  }
  if (badgeEl) {
    badgeEl.innerHTML = isClassico ? '<i class="ph-bold ph-clock-counter-clockwise"></i> Clássico' : '<i class="ph-bold ph-sparkle"></i> Pro';
    badgeEl.style.background = isClassico ? '#f1f5f9' : '#dcfce7';
    badgeEl.style.color = isClassico ? '#475569' : '#15803d';
    badgeEl.title = 'Alternar entre Modo Clássico (Simples) e Modo Pro';
  }
}

function reorderTabs() {
  let rawTabs = [...new Set(MENU.map(m => m.category).filter(Boolean))];
  
  if (CONFIGS && CONFIGS.ordem_categorias) {
    try {
      const order = JSON.parse(CONFIGS.ordem_categorias);
      rawTabs = rawTabs.sort((a, b) => {
        let idxA = order.indexOf(a);
        let idxB = order.indexOf(b);
        if (idxA === -1) idxA = 999;
        if (idxB === -1) idxB = 999;
        return idxA - idxB;
      });
    } catch(e) {}
  }

  // Aba inteligente de Mais Pedidos sempre disponível na primeira posição
  TABS = ['⭐ Mais Pedidos', ...rawTabs.filter(t => t !== '⭐ Mais Pedidos' && t !== 'Mais Pedidos')];

  if (TABS.length > 0 && !TABS.includes(currentTab)) {
    currentTab = TABS[0];
  }
  if (document.getElementById('view-menu').classList.contains('active')) {
    renderMenu();
  }
}

socket.on('produtos_atualizados', (produtos) => {
  MENU = produtos
    .filter(p => p.status !== 'inativo' && p.visibilidade !== 'caixa' && p.visibilidade !== 'invisivel')
    .map(p => ({
    id: p.id,
    originalId: p.originalId,
    category: p.categoria,
    name: p.nome,
    emoji: p.emoji || '🍽️',
    price: Number(p.preco),
    sector: p.setor || 'Cozinha 1',
    hasAddons: p.hasAddons === 1 || p.hasAddons === 'true' || p.hasAddons === true
  }));
  
  reorderTabs();
});
