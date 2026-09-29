// Definições canônicas de atalhos operacionais (evita dependência de ordem de carregamento com main.js)
const DEFAULT_SHORTCUTS = {
  "adicionar_produtos": "F2",
  "pagamento_parcial": "F7",
  "fechar_mesa": "F12",
  "buscar_mesa": "F4",
  "atualizar_mesas": "F5",
  "desconto": "F6",
  "taxa_servico": "F10",
  "ver_comissao": "F8",
  "imprimir_conta": "F9",
  "alterar_mesa": "F11",
  "juntar_mesa": "Ctrl+J",
  "fila_cozinha": "F3",
  "venda_balcao": "F2",
  "venda_delivery": "Ctrl+D"
};

const SHORTCUT_LABELS = {
  "adicionar_produtos": { title: "Lançar Produtos / PDV", icon: "ph-shopping-cart-simple" },
  "pagamento_parcial": { title: "Pagamento Parcial / Comanda", icon: "ph-receipt" },
  "fechar_mesa": { title: "Fechar Conta / Checkout", icon: "ph-check-circle" },
  "buscar_mesa": { title: "Buscar Mesa / Comanda", icon: "ph-magnifying-glass" },
  "atualizar_mesas": { title: "Recarregar / Atualizar Mesas", icon: "ph-arrows-clockwise" },
  "desconto": { title: "Aplicar Desconto", icon: "ph-percent" },
  "taxa_servico": { title: "Taxa de Serviço (10%)", icon: "ph-wine" },
  "ver_comissao": { title: "Ver Comissão do Garçom", icon: "ph-coins" },
  "imprimir_conta": { title: "Imprimir Conferência", icon: "ph-printer" },
  "alterar_mesa": { title: "Alterar / Transferir Mesa", icon: "ph-arrows-left-right" },
  "juntar_mesa": { title: "Juntar Mesas", icon: "ph-grid-four" },
  "tela_cheia": { title: "Alternar Tela Cheia", icon: "ph-arrows-out-cardinal" },
  "fila_cozinha": { title: "Fila de Preparo da Cozinha", icon: "ph-cooking-pot" },
  "venda_balcao": { title: "Atalho Venda Balcão", icon: "ph-storefront" },
  "venda_delivery": { title: "Atalho Delivery", icon: "ph-truck" }
};

if (typeof window !== 'undefined') {
  window.DEFAULT_SHORTCUTS = window.DEFAULT_SHORTCUTS || DEFAULT_SHORTCUTS;
  window.SHORTCUT_LABELS = window.SHORTCUT_LABELS || SHORTCUT_LABELS;
}

const getCustomShortcuts = function () {
  const defaults = (typeof window !== 'undefined' && window.DEFAULT_SHORTCUTS) ? window.DEFAULT_SHORTCUTS : DEFAULT_SHORTCUTS;
  try {
    const saved = localStorage.getItem('custom_keyboard_shortcuts');
    if (saved) return { ...defaults, ...JSON.parse(saved) };
  } catch (err) { }
  return { ...defaults };
};

const saveCustomShortcuts = function (newShortcuts) {
  localStorage.setItem('custom_keyboard_shortcuts', JSON.stringify(newShortcuts));
  if (typeof socket !== 'undefined' && socket) {
    socket.emit('save_custom_shortcuts', newShortcuts);
  }
  window.renderGuiaAtalhosUI && window.renderGuiaAtalhosUI();
};

const restaurarAtalhosPadrao = function () {
  if (confirm('Deseja restaurar as teclas de atalho padrão (F1 a F12)?')) {
    localStorage.removeItem('custom_keyboard_shortcuts');
    window.saveCustomShortcuts(window.DEFAULT_SHORTCUTS);
    alert('Atalhos restaurados para o padrão original (F1 - F12)!');
  }
};

const abrirModalPersonalizarAtalhos = function () {
  const modal = document.getElementById('modal-custom-shortcuts');
  if (modal) modal.style.display = 'flex';
  window.renderGuiaAtalhosUI && window.renderGuiaAtalhosUI();
};

const iniciarGravacaoAtalho = function (actionKey, btnEl) {
  if (!btnEl) return;
  btnEl.innerText = 'Pressione a tecla...';
  btnEl.style.background = '#fc4b15';
  btnEl.style.color = '#ffffff';

  function onCaptureKey(e) {
    e.preventDefault();
    e.stopPropagation();

    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

    let keyName = e.key;
    if (keyName === ' ') keyName = 'Space';

    let combo = '';
    if (e.ctrlKey) combo += 'Ctrl+';
    if (e.altKey) combo += 'Alt+';
    if (e.shiftKey) combo += 'Shift+';

    const formattedKey = keyName.length === 1 ? keyName.toUpperCase() : keyName;
    combo += formattedKey;

    const shortcuts = window.getCustomShortcuts();
    shortcuts[actionKey] = combo;
    window.saveCustomShortcuts(shortcuts);

    window.removeEventListener('keydown', onCaptureKey, true);
    window.renderGuiaAtalhosUI && window.renderGuiaAtalhosUI();
  }

  window.addEventListener('keydown', onCaptureKey, true);
};

const renderGuiaAtalhosUI = function () {
  const shortcuts = window.getCustomShortcuts();

  ['container-shortcuts-editor', 'container-shortcuts-editor-page'].forEach(containerId => {
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = '';
    Object.keys(window.SHORTCUT_LABELS).forEach(actKey => {
      const info = window.SHORTCUT_LABELS[actKey];
      const curKey = shortcuts[actKey] || window.DEFAULT_SHORTCUTS[actKey];

      html += `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <i class="ph ${info.icon}" style="font-size: 20px; color: #fc4b15;"></i>
            <span style="font-size: 13px; font-weight: 600; color: #1e293b;">${info.title}</span>
          </div>
          <button onclick="window.iniciarGravacaoAtalho('${actKey}', this)" style="padding: 6px 14px; background: var(--bg-secondary); color: #0f172a; border: 1px solid var(--border-color); border-radius: 8px; font-family: monospace; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.2s ease;">
            ${curKey}
          </button>
        </div>
      `;
    });
    container.innerHTML = html;
  });

  const guiaTable = document.getElementById('guia-atalhos-table-body');
  if (guiaTable) {
    let tableRows = '';
    const mainActionKeys = [
      'adicionar_produtos',
      'pagamento_parcial',
      'fechar_mesa',
      'buscar_mesa',
      'imprimir_conta',
      'atualizar_mesas',
      'desconto',
      'taxa_servico',
      'ver_comissao',
      'alterar_mesa',
      'juntar_mesa',
      'tela_cheia',
      'fila_cozinha'
    ];

    mainActionKeys.forEach(actKey => {
      const info = window.SHORTCUT_LABELS[actKey];
      const curKey = shortcuts[actKey] || window.DEFAULT_SHORTCUTS[actKey];
      if (info) {
        tableRows += `
          <tr>
            <td style="padding: 4px 0; width: 75px;">
              <kbd style="background: #fc4b15; color: #ffffff; padding: 2px 7px; border-radius: 4px; font-weight: bold; font-family: monospace; font-size: 11.5px; display: inline-block;">${curKey}</kbd>
            </td>
            <td style="color: #334155; font-weight: 600;">${info.title}</td>
          </tr>
        `;
      }
    });
    guiaTable.innerHTML = tableRows;
  }
};

window.focusedMesaIndex = -1;

const abrirGuiaAtalhos = function () {
  const modal = document.getElementById('modal-guia-atalhos');
  if (modal) modal.style.display = 'flex';
  window.renderGuiaAtalhosUI && window.renderGuiaAtalhosUI();
};

document.addEventListener('keydown', (e) => {
  const activeEl = document.activeElement;
  const isInputActive = activeEl && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) &&
    !activeEl.classList.contains('allow-shortcut');

  // ESC: Fechar modais ativos ou cancelar foco
  if (e.key === 'Escape') {
    const modals = document.querySelectorAll('.modal-overlay, #pdv-overlay, #checkout-modal-overlay, #modal-guia-atalhos, #modal-zoom-qr-ponto, #comanda-checkout-overlay, #modal-custom-shortcuts, #modal-central-cadastro');
    let anyOpen = false;
    modals.forEach(m => {
      if (m.style.display !== 'none' && m.style.display !== '') {
        m.style.display = 'none';
        anyOpen = true;
      }
    });
    if (anyOpen) {
      e.preventDefault();
      return;
    }
  }

  // Tecla ? (Shift + /) para abrir o Guia de Atalhos
  if ((e.key === '?' || (e.key === '/' && e.shiftKey)) && !isInputActive) {
    e.preventDefault();
    window.abrirGuiaAtalhos();
    return;
  }

  // Se o modal de Checkout estiver visível
  const checkoutModal = document.getElementById('checkout-modal-overlay');
  const isCheckoutOpen = checkoutModal && checkoutModal.style.display !== 'none' && checkoutModal.style.display !== '';

  if (isCheckoutOpen) {
    // F12 no Checkout: Fecha instantaneamente em menos de 3s sem mouse!
    if (e.key === 'F12') {
      e.preventDefault();
      const falta = window.mesaFaltaPagar || 0;
      if (falta > 0.01) {
        if (typeof window.checkoutModalSetRemainingTouchValue === 'function') {
          window.checkoutModalSetRemainingTouchValue();
        }
        if (typeof window.checkoutModalAddPagamento === 'function') {
          window.checkoutModalAddPagamento();
        }
      }
      setTimeout(() => {
        if (typeof window.checkoutModalConfirmarFechamento === 'function') {
          window.checkoutModalConfirmarFechamento();
        }
      }, 60);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (window.checkoutModalConfirmarFechamento) window.checkoutModalConfirmarFechamento();
      return;
    }

    // Se já estiver quitado e apertar Enter: finaliza na hora!
    if (e.key === 'Enter' && (!window.mesaFaltaPagar || window.mesaFaltaPagar <= 0.01)) {
      e.preventDefault();
      if (window.checkoutModalConfirmarFechamento) window.checkoutModalConfirmarFechamento();
      return;
    }

    // ENTER no campo de valor registra o pagamento direto (teclado numérico)
    if (e.key === 'Enter' && activeEl && activeEl.id === 'checkout-modal-valor') {
      e.preventDefault();
      if (window.checkoutModalAddPagamento) window.checkoutModalAddPagamento();
      return;
    }

    if (!isInputActive) {
      const keyUpper = e.key.toUpperCase();
      let selectMethod = null;
      if (e.key === '1' || keyUpper === 'D') selectMethod = 'Dinheiro';
      else if (e.key === '2' || keyUpper === 'P') selectMethod = 'Pix';
      else if (e.key === '3' || keyUpper === 'C') selectMethod = 'Cartão de Crédito';
      else if (e.key === '4' || keyUpper === 'V') selectMethod = 'Cartão de Débito';
      else if (e.key === '5' || keyUpper === 'F') selectMethod = 'Fiado / Conta';

      if (selectMethod) {
        e.preventDefault();
        const sel = document.getElementById('checkout-modal-metodo');
        if (sel) {
          sel.value = selectMethod;
        }
        if (typeof window.checkoutModalSelectTouchMethod === 'function') {
          window.checkoutModalSelectTouchMethod(selectMethod);
        }
        if (window.checkoutModalAddPagamento) window.checkoutModalAddPagamento();
      }
    }
  }

  // Se o modal de Lançamento PDV estiver visível
  const pdvModal = document.getElementById('pdv-overlay');
  const isPdvOpen = pdvModal && pdvModal.style.display !== 'none' && pdvModal.style.display !== '';
  if (isPdvOpen) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (window.pdvConfirmarEEnviar) window.pdvConfirmarEEnviar();
      return;
    }
  }

  // ── NAVEGAÇÃO SEM MOUSE: setas movem entre mesas, Enter abre o fechamento ──
  if (!isInputActive && !isCheckoutOpen && !isPdvOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const cards = Array.from(document.querySelectorAll('.mesa-item')).filter(c => c.offsetParent !== null);
    if (cards.length > 0) {
      e.preventDefault();
      const idxAtual = cards.findIndex(c => c.classList.contains('selected'));
      let proximo;
      if (idxAtual === -1) proximo = e.key === 'ArrowDown' ? 0 : cards.length - 1;
      else proximo = e.key === 'ArrowDown' ? Math.min(cards.length - 1, idxAtual + 1) : Math.max(0, idxAtual - 1);
      if (proximo !== idxAtual) {
        cards[proximo].click();
        cards[proximo].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
    return;
  }
  if (!isInputActive && e.key === 'Enter' && !isCheckoutOpen && !isPdvOpen) {
    if (window.mesaAtual && window.abrirCheckoutModal) {
      e.preventDefault();
      window.abrirCheckoutModal();
      return;
    }
  }

  if (isInputActive) return;

  const shortcuts = window.getCustomShortcuts();
  if (!e.key) return; // Segurança
  const currentKey = e.key.toUpperCase();

  function isTriggered(actionKey) {
    const configured = (shortcuts[actionKey] || window.DEFAULT_SHORTCUTS[actionKey] || '').trim();
    if (!configured) return false;

    if (!configured.includes('+')) {
      return configured.toUpperCase() === currentKey || configured.toUpperCase() === e.key.toUpperCase();
    }

    const parts = configured.split('+').map(p => p.trim().toUpperCase());
    const reqCtrl = parts.includes('CTRL');
    const reqShift = parts.includes('SHIFT');
    const reqAlt = parts.includes('ALT');
    const mainKey = parts[parts.length - 1];

    const ctrlMatch = reqCtrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey);
    const shiftMatch = reqShift ? e.shiftKey : !e.shiftKey;
    const altMatch = reqAlt ? e.altKey : !e.altKey;
    const keyMatch = (mainKey === currentKey || mainKey === e.key.toUpperCase());

    return ctrlMatch && shiftMatch && altMatch && keyMatch;
  }

  if (isTriggered('adicionar_produtos')) {
    e.preventDefault();
    if (window.ChefUltraApp && typeof window.ChefUltraApp.abrirModalProdutos === 'function') {
      window.ChefUltraApp.abrirModalProdutos();
    } else {
      document.getElementById('btn-adicionar-produtos')?.click();
    }
  } else if (isTriggered('pagamento_parcial')) {
    e.preventDefault();
    if (window.ChefUltraApp && typeof window.ChefUltraApp.abrirPagamentoParcial === 'function') {
      window.ChefUltraApp.abrirPagamentoParcial();
    } else {
      document.getElementById('btn-movimento-parcial')?.click();
    }
  } else if (isTriggered('fechar_mesa')) {
    e.preventDefault();
    if (window.ChefUltraApp && typeof window.ChefUltraApp.concluirVenda === 'function') {
      window.ChefUltraApp.concluirVenda();
    } else if (window.abrirCheckoutModal) {
      window.abrirCheckoutModal();
    } else {
      document.getElementById('btn-movimento-concluir')?.click();
    }
  } else if (isTriggered('buscar_mesa')) {
    e.preventDefault();
    const searchInput = document.getElementById('ultra-search-input') || document.getElementById('caixa-ux-search') || document.querySelector('.search-mesa-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  } else if (isTriggered('imprimir_conta')) {
    e.preventDefault();
    document.getElementById('btn-imprimir-conta')?.click();
  } else if (isTriggered('atualizar_mesas')) {
    e.preventDefault();
    if (typeof socket !== 'undefined' && socket) socket.emit('get_mesas');
  } else if (isTriggered('desconto')) {
    e.preventDefault();
    document.getElementById('btn-aplicar-desconto')?.click();
  } else if (isTriggered('taxa_servico')) {
    e.preventDefault();
    if (window.ChefUltraApp && typeof window.ChefUltraApp.toggleTaxaServico === 'function') {
      window.ChefUltraApp.toggleTaxaServico();
    } else {
      document.getElementById('btn-aplicar-servico')?.click();
    }
  } else if (isTriggered('ver_comissao')) {
    e.preventDefault();
    document.getElementById('btn-ver-comissao')?.click();
  } else if (isTriggered('alterar_mesa')) {
    e.preventDefault();
    document.getElementById('btn-alterar-mesa')?.click();
  } else if (isTriggered('juntar_mesa')) {
    e.preventDefault();
    if (window.ChefUltraApp && typeof window.ChefUltraApp.toggleSalonView === 'function') {
      const is3d = window.ChefUltra3D && window.ChefUltra3D.isSalonActive;
      window.ChefUltraApp.toggleSalonView(is3d ? 'grid' : '3d');
    } else {
      document.getElementById('btn-juntar-mesa')?.click();
    }
  } else if (isTriggered('tela_cheia')) {
    e.preventDefault();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen().catch(() => { });
    }
  } else if (isTriggered('fila_cozinha')) {
    e.preventDefault();
    window.location.href = 'fila-pedidos.html';
  } else if (isTriggered('venda_balcao')) {
    e.preventDefault();
    document.getElementById('toolbar-balcao')?.click();
  } else if (isTriggered('venda_delivery')) {
    e.preventDefault();
    document.getElementById('toolbar-delivery')?.click();
  }

  // SHIFT COMBINATIONS FOR NAVIGATION
  if (e.shiftKey && !isInputActive) {
    const kUpper = e.key.toUpperCase();
    const creds = JSON.parse((localStorage.getItem('chef_session') || localStorage.getItem('chef_credentials')) || '{}');
    const isManagerOrAdmin = ['Admin', 'Administrador', 'adm', 'Gerente'].includes(creds.cargo);
    if (kUpper === 'G') { e.preventDefault(); window.open('/garcom.html', '_blank'); }
    else if (kUpper === 'C' && isManagerOrAdmin) { e.preventDefault(); window.location.href = 'configuracoes.html'; }
    else if (kUpper === 'F' && isManagerOrAdmin) { e.preventDefault(); window.location.href = 'financeiro.html'; }
  }

  // NAVEGAÇÃO DE MESAS COM SETAS (ArrowKeys)
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !isCheckoutOpen && !isPdvOpen) {
    const mesaCards = Array.from(document.querySelectorAll('.mesa-item'));
    if (mesaCards.length === 0) return;
    e.preventDefault();

    if (window.focusedMesaIndex < 0 || window.focusedMesaIndex >= mesaCards.length) {
      window.focusedMesaIndex = 0;
    } else {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        window.focusedMesaIndex = (window.focusedMesaIndex + 1) % mesaCards.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        window.focusedMesaIndex = (window.focusedMesaIndex - 1 + mesaCards.length) % mesaCards.length;
      }
    }

    mesaCards.forEach((card, idx) => {
      if (idx === window.focusedMesaIndex) {
        card.style.outline = '3px solid #fc4b15';
        card.style.outlineOffset = '2px';
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        card.style.outline = 'none';
      }
    });
  }

  // ENTER PARA ABRIR A MESA EM FOCO
  if (e.key === 'Enter' && window.focusedMesaIndex >= 0 && !isCheckoutOpen && !isPdvOpen) {
    const mesaCards = Array.from(document.querySelectorAll('.mesa-item'));
    if (mesaCards[window.focusedMesaIndex]) {
      e.preventDefault();
      mesaCards[window.focusedMesaIndex].click();
    }
  }
});

// --- LÓGICA DE REDIMENSIONAMENTO E RECOLHIMENTO DA SEÇÃO DE MESAS (MARCAÇÃO AMARELA) ---
let setMesasSectionCollapsed = function (collapsed) {
  if (typeof window.setMesasSectionCollapsed === 'function' && window.setMesasSectionCollapsed !== setMesasSectionCollapsed) {
    return window.setMesasSectionCollapsed(collapsed);
  }
};

(function initMesasSectionResizer() {
  function setupResizer() {
    const splitterV = document.getElementById('splitter-middle-v');
    const mesasContainer = document.getElementById('mesas-section-container');
    const middleWorkspace = document.getElementById('main-panel');
    const btnToggleMesas = document.getElementById('btn-toggle-mesas-section');
    const iconToggle = document.getElementById('icon-toggle-mesas-section');
    const labelToggle = document.getElementById('label-toggle-mesas-section');

    if (!splitterV || !mesasContainer || !middleWorkspace) return;

    let isCollapsed = false;
    let savedHeightPercent = 45;
    if (typeof window.obterConfigLayoutColaborador === 'function') {
      try {
        const cfg = window.obterConfigLayoutColaborador();
        if (cfg && cfg.mesas_height_pct) savedHeightPercent = cfg.mesas_height_pct;
      } catch (e) {}
    }

    function renderItensRecolhidos() {
      const strip = document.getElementById('mesas-collapsed-items');
      if (!strip) return;

      // No lugar do resumo de itens, mostra as COMANDAS da mesa selecionada
      // (itens não pagos agrupados por mesa_comanda). Sem comandas, a strip
      // fica totalmente oculta.
      const grupos = {};
      if (window.mesaAtual && Array.isArray(window.mesaAtual.items)) {
        window.mesaAtual.items.forEach(o => {
          if (o.status === 'Pago') return;
          const c = (o.mesa_comanda || '').trim();
          if (!c) return;
          if (!grupos[c]) grupos[c] = { q: 0, total: 0 };
          grupos[c].q += (o.quantity || 1);
          grupos[c].total += parseFloat(String(o.total).replace(',', '.')) || 0;
        });
      }

      const nomes = Object.keys(grupos);
      mesasContainer.classList.toggle('mesas-sem-comandas', nomes.length === 0);
      if (!nomes.length) {
        strip.innerHTML = '';
        return;
      }

      const chips = nomes.map(nome => {
        const g = grupos[nome];
        return `<span class="mi-chip mi-comanda"><i class="ph ph-ticket" style="color:#fc4b15;margin-right:4px;"></i>${escHtml(nome)} · ${g.q} iten${g.q === 1 ? '' : 's'} · R$ ${g.total.toFixed(2).replace('.', ',')}</span>`;
      }).join('');
      strip.innerHTML = chips;
    }
    window.renderItensRecolhidosMesas = renderItensRecolhidos;

    function applyMesasCollapsed(collapsed) {
      isCollapsed = collapsed;
      mesasContainer.classList.toggle('mesas-recolhida', isCollapsed);
      const ws = document.querySelector('.workspace');
      if (ws) ws.classList.toggle('mesas-collapsed-view', isCollapsed);
      if (splitterV) splitterV.classList.toggle('mesas-collapsed', isCollapsed);
      if (isCollapsed) {
        mesasContainer.style.setProperty('flex', '0 0 auto', 'important');
        mesasContainer.style.setProperty('height', 'auto', 'important');
        mesasContainer.style.setProperty('max-height', '44px', 'important');
        renderItensRecolhidos();
        if (iconToggle) iconToggle.className = 'ph ph-caret-down';
        if (labelToggle) labelToggle.innerText = 'Expandir';
      } else {
        const pct = savedHeightPercent || 45;
        mesasContainer.style.setProperty('flex', `0 0 ${pct}%`, 'important');
        mesasContainer.style.setProperty('height', `${pct}%`, 'important');
        mesasContainer.style.setProperty('max-height', 'none', 'important');
        if (iconToggle) iconToggle.className = 'ph ph-caret-up';
        if (labelToggle) labelToggle.innerText = 'Recolher';
      }
    }

    let lastToggleTime = 0;
    function toggleMesasSection() {
      const now = Date.now();
      if (now - lastToggleTime < 250) return;
      lastToggleTime = now;
      applyMesasCollapsed(!isCollapsed);
    }

    // Controle externo (usado pela aba unificada Mesas & Pedido no mobile)
    setMesasSectionCollapsed = function (collapsed) {
      applyMesasCollapsed(!!collapsed);
    };
    window.setMesasSectionCollapsed = setMesasSectionCollapsed;

    if (btnToggleMesas) {
      btnToggleMesas.onclick = (e) => {
        e.stopPropagation();
        toggleMesasSection();
      };
    }

    // Duplo clique no header das mesas também recolhe/expande
    const mesasHeader = mesasContainer.querySelector('.mesas-header');
    if (mesasHeader) {
      mesasHeader.addEventListener('dblclick', (e) => {
        if (e.target.closest('button, input, select, .chip-view-btn')) return;
        toggleMesasSection();
      });
    }

    let isDraggingV = false;
    let workspaceRect = null;
    let startY = 0;
    let hasMoved = false;
    let lastSplitterClick = 0;
    const prodContainer = document.getElementById('products-section-container');

    const initDragV = (e) => {
      isDraggingV = true;
      hasMoved = false;
      splitterV.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      workspaceRect = middleWorkspace.getBoundingClientRect();
      if (prodContainer) {
        prodContainer.style.flex = '1 1 0%';
        prodContainer.style.minHeight = '60px';
      }
      if (e && e.pointerId && typeof splitterV.setPointerCapture === 'function') {
        try { splitterV.setPointerCapture(e.pointerId); } catch(err){}
      }
    };

    const doDragV = (clientY) => {
      if (!isDraggingV || !workspaceRect) return;
      hasMoved = true;
      const offsetY = clientY - workspaceRect.top;
      let percent = (offsetY / workspaceRect.height) * 100;
      if (percent < 10) percent = 10;
      if (percent > 85) percent = 85;

      savedHeightPercent = Math.round(percent);
      if (isCollapsed) {
        isCollapsed = false;
        mesasContainer.classList.remove('mesas-recolhida');
        const ws = document.querySelector('.workspace');
        if (ws) ws.classList.remove('mesas-collapsed-view');
        if (splitterV) splitterV.classList.remove('mesas-collapsed');
        if (iconToggle) iconToggle.className = 'ph ph-caret-up';
        if (labelToggle) labelToggle.innerText = 'Recolher';
      }
      mesasContainer.style.setProperty('flex', `0 0 ${percent}%`, 'important');
      mesasContainer.style.setProperty('height', `${percent}%`, 'important');
      mesasContainer.style.setProperty('max-height', 'none', 'important');
    };

    const stopDragV = (e) => {
      if (isDraggingV) {
        isDraggingV = false;
        workspaceRect = null;
        splitterV.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (e && e.pointerId && typeof splitterV.releasePointerCapture === 'function') {
          try { splitterV.releasePointerCapture(e.pointerId); } catch(err){}
        }
        if (hasMoved && typeof window.salvarAlturaPainelMesas === 'function') {
          window.salvarAlturaPainelMesas(savedHeightPercent);
        }
      }
    };

    // Suporte universal a PointerEvents (Mouse, Touch e Caneta)
    const onPointerMove = (e) => {
      if (isDraggingV) {
        doDragV(e.clientY);
      }
    };

    const onPointerUp = (e) => {
      const moved = hasMoved;
      stopDragV(e);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      // Se foi clique/tap rápido sem arrastar (menos de 4px de movimento)
      if (!moved) {
        const now = Date.now();
        if (now - lastSplitterClick < 400) {
          lastSplitterClick = 0;
          toggleMesasSection();
        } else {
          lastSplitterClick = now;
        }
      }
    };

    splitterV.addEventListener('pointerdown', (e) => {
      startY = e.clientY;
      initDragV(e);
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    });

    // Native dblclick event
    splitterV.ondblclick = (e) => {
      e.preventDefault();
      toggleMesasSection();
    };
    splitterV.addEventListener('dblclick', (e) => {
      e.preventDefault();
      toggleMesasSection();
    });

    // Aplica a altura salva no boot
    if (savedHeightPercent) {
      mesasContainer.style.setProperty('flex', `0 0 ${savedHeightPercent}%`, 'important');
      mesasContainer.style.setProperty('height', `${savedHeightPercent}%`, 'important');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupResizer);
  } else {
    setupResizer();
  }
})();

// --- MODAL DE JUNÇÃO DE MESAS INTERATIVO ---
window.selectedTargetMesaJuntar = null;

const abrirModalJuntarMesas = function () {
  if (!window.mesaAtual || window.mesaAtual.isGroup === false) {
    return alert('Selecione uma mesa ou comanda ocupada primeiro.');
  }

  const nomeOrigem = window.mesaAtual.nome || window.mesaAtual.mesaName;
  const modal = document.getElementById('modal-juntar-mesas');
  const labelOrigem = document.getElementById('modal-juntar-mesa-origem');
  const grid = document.getElementById('modal-juntar-mesas-grid');
  const searchInput = document.getElementById('modal-juntar-busca-input');

  if (labelOrigem) labelOrigem.innerText = nomeOrigem;
  if (searchInput) searchInput.value = '';
  window.selectedTargetMesaJuntar = null;

  if (grid) {
    let html = '';
    const nomesMesasEncontradas = new Set();

    // Capturar mesas ativas do DOM
    const mesaCardsDOM = Array.from(document.querySelectorAll('.mesa-item'));
    mesaCardsDOM.forEach(card => {
      const elNome = card.querySelector('.mesa-id');
      if (elNome) {
        const n = elNome.innerText.trim();
        if (n && n !== nomeOrigem) {
          nomesMesasEncontradas.add(n);
        }
      }
    });

    // Se estiver vazio por algum motivo, preencher de 1 a 30
    if (nomesMesasEncontradas.size === 0) {
      for (let i = 1; i <= 30; i++) {
        const n = `Mesa ${i}`;
        if (n !== nomeOrigem) nomesMesasEncontradas.add(n);
      }
    }

    const listaOrdenada = Array.from(nomesMesasEncontradas).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    listaOrdenada.forEach(nomeMesa => {
      html += `
        <div class="card-juntar-target" data-mesa="${nomeMesa}" onclick="window.selecionarMesaTargetJuntar('${nomeMesa}', this)" style="padding: 12px; background: var(--bg-card); border: 1.5px solid var(--border-color); border-radius: 10px; cursor: pointer; text-align: center; transition: all 0.15s; user-select: none;">
          <div style="font-weight: 700; font-size: 14px; color: var(--text-main, #1e293b); display: flex; align-items: center; justify-content: center; gap: 6px;">
            <i class="ph ph-table" style="color: #fc4b15;"></i> ${nomeMesa}
          </div>
        </div>
      `;
    });

    grid.innerHTML = html;
  }

  if (modal) modal.style.display = 'flex';
};

const selecionarMesaTargetJuntar = function (nomeMesa, el) {
  window.selectedTargetMesaJuntar = nomeMesa;
  document.querySelectorAll('.card-juntar-target').forEach(card => {
    card.style.borderColor = 'var(--border-color, #e2e8f0)';
    card.style.background = 'var(--bg-card, white)';
    card.style.boxShadow = 'none';
  });
  if (el) {
    el.style.borderColor = '#fc4b15';
    el.style.background = 'rgba(252, 75, 21, 0.12)';
    el.style.boxShadow = '0 2px 8px rgba(252,75,21,0.2)';
  }
};

const filtrarMesasJuntar = function (termo) {
  const termoLower = (termo || '').toLowerCase().trim();
  document.querySelectorAll('.card-juntar-target').forEach(card => {
    const mesaNome = card.getAttribute('data-mesa').toLowerCase();
    if (!termoLower || mesaNome.includes(termoLower)) {
      card.style.display = 'block';
    } else {
      card.style.display = 'none';
    }
  });
};

const confirmarJuncaoMesasModal = function (mode) {
  if (!window.mesaAtual) return alert('Nenhuma mesa de origem selecionada.');
  if (!window.selectedTargetMesaJuntar) return alert('Selecione uma mesa de destino para juntar.');

  const mesaA = window.mesaAtual.nome || window.mesaAtual.mesaName;
  const mesaB = window.selectedTargetMesaJuntar;
  const operador = window.crmPerfil ? window.crmPerfil.nome : 'Desconhecido';

  if (typeof socket !== 'undefined' && socket) {
    if (mode === 'mover') {
      socket.emit('transferir_mesas_itens', { mesaA, mesaB, operador });
    } else {
      socket.emit('juntar_mesas', { mesaA, mesaB, operador });
    }
  }

  const modal = document.getElementById('modal-juntar-mesas');
  if (modal) modal.style.display = 'none';
};

// --- SISTEMA ANTI-FRAUDE E SOLICITAÇÃO DE SENHA ADMIN / GERENTE (TOUCH PIN) ---
window.pendingAdminAction = null;
let _pinValidating = false;

// Garante exposição segura no objeto window para acessibilidade global
if (typeof window !== 'undefined') {
  window.getCustomShortcuts = getCustomShortcuts;
  window.saveCustomShortcuts = saveCustomShortcuts;
  window.restaurarAtalhosPadrao = restaurarAtalhosPadrao;
  window.abrirModalPersonalizarAtalhos = abrirModalPersonalizarAtalhos;
  window.iniciarGravacaoAtalho = iniciarGravacaoAtalho;
  window.renderGuiaAtalhosUI = renderGuiaAtalhosUI;
  window.abrirGuiaAtalhos = abrirGuiaAtalhos;
  window.setMesasSectionCollapsed = setMesasSectionCollapsed;
  window.abrirModalJuntarMesas = abrirModalJuntarMesas;
  window.selecionarMesaTargetJuntar = selecionarMesaTargetJuntar;
  window.filtrarMesasJuntar = filtrarMesasJuntar;
  window.confirmarJuncaoMesasModal = confirmarJuncaoMesasModal;

  if (typeof document !== 'undefined') {
    var checkAutoRender = function() {
      if (document.getElementById('container-shortcuts-editor-page') || document.getElementById('container-shortcuts-editor')) {
        renderGuiaAtalhosUI();
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkAutoRender);
    } else {
      checkAutoRender();
    }
  }
}

export { getCustomShortcuts, saveCustomShortcuts, restaurarAtalhosPadrao, abrirModalPersonalizarAtalhos, iniciarGravacaoAtalho, renderGuiaAtalhosUI, abrirGuiaAtalhos, setMesasSectionCollapsed, abrirModalJuntarMesas, selecionarMesaTargetJuntar, filtrarMesasJuntar, confirmarJuncaoMesasModal };
