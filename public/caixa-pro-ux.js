/**
 * caixa-pro-ux.js — Controlador de Usabilidade, Acessibilidade e Ações Rápidas do Caixa
 */
(function (window) {
  'use strict';

  // 1. INICIALIZAÇÃO E ATALHOS DE TECLADO GLOBAIS (F2, F4, F8, ESC)
  document.addEventListener('keydown', function (e) {
    const modoCaixa = localStorage.getItem('chef_caixa_tema') || 'pro_ux';

    // F4: Focar na Busca de Mesas / Comandas (funciona em TODAS as visualizações)
    if (e.key === 'F4' || e.keyCode === 115) {
      e.preventDefault();
      const searchInput = document.getElementById('caixa-ux-search') || document.querySelector('.search-mesa-input');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return false;
    }

    // ESC dentro da busca: limpa e desfoca
    if (e.key === 'Escape' || e.keyCode === 27) {
      const searchInput = document.getElementById('caixa-ux-search');
      if (searchInput && document.activeElement === searchInput) {
        searchInput.value = '';
        window.filtrarMesasBusca('');
        searchInput.blur();
        return false;
      }
    }

    if (modoCaixa === 'classico') return; // F2/F8/ESC-modal não interferem no modo clássico

    // F2: Venda Balcão / Lançamento Rápido
    if (e.key === 'F2' || e.keyCode === 113) {
      e.preventDefault();
      const balcaoCard = Array.from(document.querySelectorAll('.mesa-item')).find(c => {
        const idEl = c.querySelector('.mesa-id');
        return idEl && idEl.innerText.toLowerCase().includes('balc');
      });
      if (balcaoCard) balcaoCard.click();
      return false;
    }

    // F8: Abrir Fechamento de Conta da Mesa Ativa
    if (e.key === 'F8' || e.keyCode === 119) {
      e.preventDefault();
      if (typeof window.abrirCheckoutModal === 'function' && window.mesaAtual) {
        window.abrirCheckoutModal();
      }
      return false;
    }

    // ESC: Fechar Modais Abertos
    if (e.key === 'Escape' || e.keyCode === 27) {
      if (typeof window.fecharCheckoutModal === 'function') {
        window.fecharCheckoutModal();
      }
      const modalDividir = document.getElementById('modal-fracionar-item-mobile');
      if (modalDividir) modalDividir.style.display = 'none';
    }
  });

  // 1b. DIGITAR SEM SELEÇÃO = ESCREVE NA BUSCA DE MESA/COMANDA IMEDIATAMENTE
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Busca de mesa/comanda fala com o grid de mesas
    if (window.viewFilter && window.viewFilter !== 'Mesas' && window.viewFilter !== 'Todas') return;

    const searchInput = document.getElementById('caixa-ux-search');
    if (!searchInput) return;

    if (e.key.length === 1) {
      e.preventDefault();
      searchInput.focus();
      const insertAt = searchInput.selectionStart != null ? searchInput.selectionStart : searchInput.value.length;
      searchInput.value = searchInput.value.slice(0, insertAt) + e.key + searchInput.value.slice(insertAt);
      searchInput.setSelectionRange(insertAt + 1, insertAt + 1);
      window.filtrarMesasBusca(searchInput.value);
    } else if (e.key === 'Backspace' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.value = searchInput.value.slice(0, -1);
      window.filtrarMesasBusca(searchInput.value);
    }
  });

  // ─── DECORAÇÃO DAS MESAS COM O SETOR REAL (mesas.sala do servidor) ───
  function statusReal(card) {
    const st = (card.dataset.status || '').toLowerCase();
    if (st) return st;
    const m = (card.className || '').match(/status-([a-z]+)/);
    return m ? m[1].toLowerCase() : '';
  }

  window.decorarMesasComSala = function () {
    const porNome = {};
    (window.allMesas || []).forEach(m => {
      const n = (m.nome || '').toString().trim().toLowerCase();
      if (n) porNome[n] = (m.sala || '').toString().trim() || 'Salão principal';
    });
    document.querySelectorAll('.mesa-item').forEach(card => {
      const n = (card.dataset.mesa || '').toString().trim().toLowerCase();
      if (!card.dataset.sala) card.dataset.sala = porNome[n] || 'Salão principal';
    });
    if (window._setorAtivoCaixa || window._categoriaAtivaCaixa) window.aplicarFiltrosCaixa();
  };

  // ─── FILTRO MESTRE (setor + categoria + busca combinados) ───
  window.aplicarFiltrosCaixa = function () {
    const setor = window._setorAtivoCaixa || 'todos';
    const cat = window._categoriaAtivaCaixa || null;
    const input = document.getElementById('caixa-ux-search');
    const term = ((input && input.value) || '').toLowerCase().trim();

    document.querySelectorAll('.mesa-item').forEach(card => {
      let show = true;
      if (show && setor !== 'todos' && (card.dataset.sala || 'Salão principal') !== setor) show = false;
      if (show && cat) {
        const st = statusReal(card);
        if (cat === 'livres') show = st === 'disponivel' || st === 'livre';
        else if (cat === 'ocupadas') show = st === 'ocupada';
        else if (cat === 'fechamento') show = st === 'solicitada' || st === 'fechamento';
        else show = true;
      }
      if (show && term && !((card.innerText || '').toLowerCase()).includes(term)) show = false;
      card.style.display = show ? 'flex' : 'none';
    });
    document.querySelectorAll('.caixa-ux-stat-badge').forEach(b => {
      b.classList.toggle('caixa-ux-stat-active', b.dataset.cat === cat);
    });
  };

  // 2. INJETAR BARRA DE RESUMO DO SALÃO NO TOPO DO GRID DE MESAS
  window.atualizarDashboardResumoCaixa = function () {
    const modoCaixa = localStorage.getItem('chef_caixa_tema') || 'pro_ux';
    if (modoCaixa === 'classico') {
      const el = document.getElementById('caixa-ux-dashboard-header');
      if (el) el.style.display = 'none';
      return;
    }

    window.decorarMesasComSala();

    let header = document.getElementById('caixa-ux-dashboard-header');
    const container = document.getElementById('tables-wrapper') || document.getElementById('orders-grid')?.parentNode;
    if (!container) return;

    if (!header) {
      header = document.createElement('div');
      header.id = 'caixa-ux-dashboard-header';
      container.insertBefore(header, container.firstChild);
    }
    header.style.display = 'block';

    const cards = Array.from(document.querySelectorAll('.mesa-item'));
    const total = cards.length;
    const ocupadas = cards.filter(c => statusReal(c) === 'ocupada').length;
    const fechando = cards.filter(c => statusReal(c) === 'solicitada' || statusReal(c) === 'fechamento').length;
    const reservadas = cards.filter(c => statusReal(c) === 'reservada').length;
    const livres = Math.max(0, total - ocupadas - fechando - reservadas);

    header.innerHTML = `
      <div class="caixa-ux-shortcuts-bar">
        <span>⚡ <strong>Atalhos Rápidos:</strong></span>
        <span><span class="caixa-ux-key-badge">F2</span> Venda Balcão</span>
        <span><span class="caixa-ux-key-badge">F4</span> Buscar Mesa</span>
        <span><span class="caixa-ux-key-badge">F8</span> Fechar Conta</span>
        <span><span class="caixa-ux-key-badge">ESC</span> Cancelar/Voltar</span>
      </div>

      <div class="caixa-ux-dashboard-bar">
        <div class="caixa-ux-stat-badge" data-cat="todas" onclick="window.filtrarMesasPorCategoria('todas')" title="Ver todas as mesas">
          <div class="caixa-ux-stat-icon" style="background:#f1f5f9; color:#475569;"><i class="ph-bold ph-squares-four"></i></div>
          <div class="caixa-ux-stat-info">
            <span class="caixa-ux-stat-num">${total}</span>
            <span class="caixa-ux-stat-label">Total Mesas</span>
          </div>
        </div>

        <div class="caixa-ux-stat-badge" data-cat="livres" onclick="window.filtrarMesasPorCategoria('livres')" title="Filtrar mesas disponíveis">
          <div class="caixa-ux-stat-icon" style="background:#dcfce7; color:#16a34a;"><i class="ph-bold ph-check"></i></div>
          <div class="caixa-ux-stat-info">
            <span class="caixa-ux-stat-num" style="color:#16a34a;">${livres}</span>
            <span class="caixa-ux-stat-label">Livres</span>
          </div>
        </div>

        <div class="caixa-ux-stat-badge" data-cat="ocupadas" onclick="window.filtrarMesasPorCategoria('ocupadas')" title="Filtrar mesas ocupadas">
          <div class="caixa-ux-stat-icon" style="background:#fee2e2; color:#dc2626;"><i class="ph-bold ph-users"></i></div>
          <div class="caixa-ux-stat-info">
            <span class="caixa-ux-stat-num" style="color:#dc2626;">${ocupadas}</span>
            <span class="caixa-ux-stat-label">Ocupadas</span>
          </div>
        </div>

        <div class="caixa-ux-stat-badge" data-cat="fechamento" onclick="window.filtrarMesasPorCategoria('fechamento')" title="Filtrar mesas pedindo conta">
          <div class="caixa-ux-stat-icon" style="background:#fef3c7; color:#d97706;"><i class="ph-bold ph-receipt"></i></div>
          <div class="caixa-ux-stat-info">
            <span class="caixa-ux-stat-num" style="color:#d97706;">${fechando}</span>
            <span class="caixa-ux-stat-label">Pedindo Conta</span>
          </div>
        </div>
      </div>
    `;

    if (typeof window.injetarAbasSetoresSalao === 'function') {
      window.injetarAbasSetoresSalao();
    }
    window.aplicarVisibilidadeComponentesCaixaUx();
  };

  window.filtrarMesasBusca = function (term) {
    if (typeof term === 'string') {
      const input = document.getElementById('caixa-ux-search');
      if (input) input.value = term;
    }
    window.aplicarFiltrosCaixa();
  };

  window.filtrarMesasPorCategoria = function (cat) {
    if (cat === 'todas') cat = null;
    window._categoriaAtivaCaixa = cat || null;
    window.aplicarFiltrosCaixa();
  };

  // Observa mudanças no DOM para atualizar os contadores em tempo real
  const observer = new MutationObserver(() => {
    if (window._debounceDashboardResumo) clearTimeout(window._debounceDashboardResumo);
    window._debounceDashboardResumo = setTimeout(window.atualizarDashboardResumoCaixa, 300);
  });

  document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('orders-grid') || document.body;
    observer.observe(grid, { childList: true, subtree: true });
    window.aplicarVisibilidadeComponentesCaixaUx();
    setTimeout(window.atualizarDashboardResumoCaixa, 600);
  });

  // ─── VISIBILIDADE POR "PERSONALIZAR LAYOUT" (Resumo / Setores / Busca) ───
  window.aplicarVisibilidadeComponentesCaixaUx = function () {
    let cfg = null;
    try {
      if (typeof window.obterConfigLayoutColaborador === 'function') {
        cfg = window.obterConfigLayoutColaborador();
      }
    } catch (err) { cfg = null; }
    if (!cfg) return;

    const resumo = document.getElementById('caixa-ux-dashboard-header');
    if (resumo) resumo.style.setProperty('display', (cfg.caixa_ux_resumo_visible === false) ? 'none' : 'block', 'important');

    const setores = document.getElementById('caixa-ux-setores-container');
    if (setores) setores.style.setProperty('display', (cfg.caixa_ux_setores_visible === false) ? 'none' : 'block', 'important');

    const buscaBox = document.getElementById('caixa-ux-search-box-topbar');
    if (buscaBox) buscaBox.style.setProperty('display', (cfg.caixa_ux_busca_visible === false) ? 'none' : 'flex', 'important');
  };

  document.addEventListener('chef_layout_colaborador_salvo', window.aplicarVisibilidadeComponentesCaixaUx);
  window.addEventListener('chef_layout_colaborador_salvo', window.aplicarVisibilidadeComponentesCaixaUx);
  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf('chef_layout_user_') === 0) window.aplicarVisibilidadeComponentesCaixaUx();
  });


  // ─── CÉDULAS RÁPIDAS NO MODAL DE FECHAMENTO ───
  window.injetarCedulasRapidasCheckout = function (valorTotal) {
    const modoModal = localStorage.getItem('chef_fechamento_modal_tema') || 'pro_ux';
    if (modoModal === 'classico') return;

    const inputRecebido = document.getElementById('checkout-pago-input') || document.querySelector('.input-valor-recebido');
    if (!inputRecebido) return;

    let cedulasContainer = document.getElementById('caixa-ux-cedulas-container');
    if (!cedulasContainer) {
      cedulasContainer = document.createElement('div');
      cedulasContainer.id = 'caixa-ux-cedulas-container';
      inputRecebido.parentNode.insertBefore(cedulasContainer, inputRecebido.nextSibling);
    }

    const valNum = parseFloat(String(valorTotal).replace(',', '.')) || 0;
    const cedulas = [10, 20, 50, 100, 200];

    cedulasContainer.innerHTML = `
      <div class="caixa-ux-cedulas-bar">
        <button type="button" class="btn-cedula-rapida exato" onclick="window.aplicarValorCedula(${valNum})">
          <span>🎯 Exato</span>
          <small style="font-size:10px; opacity:0.8;">R$ ${valNum.toFixed(2).replace('.', ',')}</small>
        </button>
        ${cedulas.map(c => `
          <button type="button" class="btn-cedula-rapida" onclick="window.aplicarValorCedula(${c})">
            <span>R$ ${c}</span>
          </button>
        `).join('')}
      </div>
    `;
  };

  window.aplicarValorCedula = function (val) {
    const inputRecebido = document.getElementById('checkout-pago-input') || document.querySelector('.input-valor-recebido');
    if (inputRecebido) {
      inputRecebido.value = Number(val).toFixed(2).replace('.', ',');
      inputRecebido.dispatchEvent(new Event('input', { bubbles: true }));
      inputRecebido.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  // ─── ABAS DE SETORES DO SALÃO (geradas a partir dos setores reais das mesas) ───
  window.injetarAbasSetoresSalao = function () {
    const modoMapa = localStorage.getItem('chef_mapa_salao_tema') || 'pro_ux';
    if (modoMapa === 'classico') {
      const el = document.getElementById('caixa-ux-setores-container');
      if (el) el.style.display = 'none';
      return;
    }

    let container = document.getElementById('caixa-ux-setores-container');
    const header = document.getElementById('caixa-ux-dashboard-header');
    if (!header) return;

    if (!container) {
      container = document.createElement('div');
      container.id = 'caixa-ux-setores-container';
      header.parentNode.insertBefore(container, header.nextSibling);
      container.addEventListener('click', function (ev) {
        const btn = ev.target.closest('.btn-setor-tab');
        if (btn && btn.dataset.setor) window.filtrarMesaSetor(btn.dataset.setor);
      });
    }
    container.style.display = 'block';

    // Agrupa mesas pelos setores reais (coluna salas da tabela de mesas)
    const contagem = {};
    (window.allMesas || []).forEach(m => {
      const s = (m.sala || '').toString().trim() || 'Salão principal';
      contagem[s] = (contagem[s] || 0) + 1;
    });
    const nomes = Object.keys(contagem).sort((a, b) => a.localeCompare(b, 'pt'));
    const totalMesas = (window.allMesas || []).length;

    const sig = 'todos:' + totalMesas + '|' + nomes.join(',');
    if (container.dataset.sig !== sig) {
      container.dataset.sig = sig;
      const btns = [
        '<button type="button" class="btn-setor-tab" data-setor="todos"><i class="ph-bold ph-grid-four"></i> Todos os Setores <span class="setor-count">' + totalMesas + '</span></button>'
      ];
      nomes.forEach(s => {
        const esc = String(s).replace(/"/g, '&quot;');
        btns.push('<button type="button" class="btn-setor-tab" data-setor="' + esc + '"><i class="ph-bold ph-house-line"></i> ' + String(s) + ' <span class="setor-count">' + contagem[s] + '</span></button>');
      });
      container.innerHTML = '<div class="caixa-ux-setores-bar">' + btns.join('') + '</div>';
    }

    container.querySelectorAll('.btn-setor-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.setor === (window._setorAtivoCaixa || 'todos'));
    });
    window.aplicarFiltrosCaixa();
    window.aplicarVisibilidadeComponentesCaixaUx();
  };

  window.filtrarMesaSetor = function (setor) {
    window._setorAtivoCaixa = setor || 'todos';
    document.querySelectorAll('.btn-setor-tab').forEach(b => b.classList.toggle('active', b.dataset.setor === window._setorAtivoCaixa));
    window.aplicarFiltrosCaixa();
  };


  // ─── SINCRONIZAÇÃO DA CLASSE MODO CLÁSSICO NO BODY ───
  function aplicarModoTemaCaixa() {
    const modo = localStorage.getItem('chef_caixa_tema') || 'pro_ux';
    if (modo === 'classico') {
      document.body.classList.add('modo-classico-ativo');
    } else {
      document.body.classList.remove('modo-classico-ativo');
    }
  }

  aplicarModoTemaCaixa();
  window.addEventListener('storage', aplicarModoTemaCaixa);


  // ─── ABA CORINGA NO RODAPÉ MOBILE (TAP TO TOGGLE / ESCONDER COM 1 TOQUE) ───
  window.toggleAbaRodapeMobile = function () {
    const aba = document.getElementById('caixa-ux-coringa-rodape') || document.querySelector('.floating-qr-badge');
    if (!aba) return;

    if (aba.classList.contains('recolhido')) {
      aba.classList.remove('recolhido');
      aba.style.transform = 'translateY(0)';
    } else {
      aba.classList.add('recolhido');
      aba.style.transform = 'translateY(calc(100% - 16px))';
    }
  };

  window.executarFuncaoCoringaRodape = function () {
    const funcao = localStorage.getItem('chef_funcao_coringa_rodape') || 'qr_pendentes';

    if (funcao === 'balcao') {
      const balcaoCard = Array.from(document.querySelectorAll('.mesa-item')).find(c => c.innerText.toLowerCase().includes('balc'));
      if (balcaoCard) balcaoCard.click();
    } else if (funcao === 'buscar') {
      const s = document.getElementById('caixa-ux-search');
      if (s) { s.focus(); s.select(); }
    } else if (funcao === 'garcom') {
      window.open('/garcom.html', '_blank');
    } else if (funcao === 'financeiro') {
      window.location.href = 'financeiro.html';
    } else {
      // Padrão: Pedidos QR Pendentes
      if (typeof window.abrirModalPedidosQr === 'function') {
        window.abrirModalPedidosQr();
      }
    }
  };


  // ─── APLICAÇÃO DE TAMANHO DE FONTE / LEGIBILIDADE ───
  function aplicarEscalaFonte() {
    const scale = localStorage.getItem('chef_font_scale') || 'lg'; // Padrão Confortável
    document.body.classList.remove('font-scale-sm', 'font-scale-md', 'font-scale-lg', 'font-scale-xl', 'font-scale-xxl');
    document.body.classList.add('font-scale-' + scale);
  }

  aplicarEscalaFonte();
  window.addEventListener('storage', aplicarEscalaFonte);
  window.aplicarEscalaFonte = aplicarEscalaFonte;


  // ─── MOTOR DE CONTROLE DE 3 MODOS DAS BARRAS LATERAIS ───
  // Unificado (aplicado também em chef-resizable-sidebars.js):
  // classes mode-* E sidebar-* + larguras inline + botão flutuante de restauração.
  window.chefApplySidebarMode = function (side, mode) {
    const right = side === 'right';
    const panel = document.getElementById(side === 'left' ? 'left-panel' : 'right-panel');
    const floatRestore = document.getElementById('float-restore-' + side);
    if (!panel) return;

    panel.classList.remove('mode-expanded', 'mode-mini', 'mode-hidden', 'sidebar-expanded', 'sidebar-mini', 'sidebar-hidden');
    panel.classList.add('mode-' + mode, 'sidebar-' + mode);

    const desktop = window.innerWidth >= 768;
    if (desktop) {
      if (mode === 'hidden') {
        panel.style.setProperty('display', 'none', 'important');
      } else if (mode === 'mini') {
        const w = right ? '190px' : '68px';
        panel.style.display = '';
        panel.style.width = w;
        panel.style.minWidth = w;
        panel.style.maxWidth = w;
      } else {
        panel.style.display = '';
        const stored = localStorage.getItem('chef_sidebar_' + side + '_width');
        const w = stored ? stored + 'px' : (right ? '320px' : '220px');
        panel.style.width = w;
        panel.style.minWidth = w;
        panel.style.maxWidth = w;
      }
    } else {
      panel.style.display = (mode === 'hidden') ? 'none' : '';
      if (mode !== 'hidden') {
        panel.style.width = '';
        panel.style.minWidth = '';
        panel.style.maxWidth = '';
      }
    }

    if (floatRestore) floatRestore.style.display = (desktop && mode === 'hidden') ? 'flex' : 'none';
    try { localStorage.setItem('chef_sidebar_' + side + '_mode', mode); } catch(e){}
    window.dispatchEvent(new CustomEvent('chef_sidebar_mode_changed', { detail: { side: side, mode: mode } }));
  };

  window.toggleSidebarMode = function (side, target) {
    const panel = document.getElementById(side === 'left' ? 'left-panel' : 'right-panel');
    let cur = 'expanded';
    if (panel) {
      if (panel.classList.contains('mode-hidden') || panel.classList.contains('sidebar-hidden')) cur = 'hidden';
      else if (panel.classList.contains('mode-mini') || panel.classList.contains('sidebar-mini')) cur = 'mini';
    }
    let next = target;
    if (cur === target) next = 'expanded';
    if (typeof window.chefApplySidebarMode === 'function') window.chefApplySidebarMode(side, next);
    else if (typeof window.setSidebarMode === 'function') window.setSidebarMode(side, next);
  };

  window.setSidebarMode = function (side, mode) {
    if (typeof window.chefApplySidebarMode === 'function') {
      window.chefApplySidebarMode(side, mode);
    } else {
      const panelId = side === 'left' ? 'left-panel' : 'right-panel';
      const panel = document.getElementById(panelId);
      if (!panel) return;
      panel.classList.remove('mode-expanded', 'mode-mini', 'mode-hidden');
      panel.classList.add('mode-' + mode);
      try { localStorage.setItem('chef_sidebar_' + side + '_mode', mode); } catch(e){}
    }

    // Atualizar botões de modo
    ['expanded', 'mini', 'hidden'].forEach(m => {
      const btn = document.getElementById(`btn-mode-${side}-${m}`);
      if (btn) {
        if (m === mode) {
          btn.style.background = '#fc4b15';
          btn.style.color = '#ffffff';
        } else {
          btn.style.background = side === 'left' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
          btn.style.color = side === 'left' ? '#cbd5e1' : 'var(--text-secondary, #64748b)';
        }
      }
    });
  };

  window.toggleAutoHoverSidebar = function (side) {
    const panelId = side === 'left' ? 'left-panel' : 'right-panel';
    const panel = document.getElementById(panelId);
    const btn = document.getElementById('btn-autohover-' + side);
    if (!panel) return;

    const isActive = panel.classList.toggle('auto-hover-active');
    try { localStorage.setItem('chef_sidebar_' + side + '_autohover', isActive ? 'true' : 'false'); } catch(e){}

    if (btn) {
      if (isActive) {
        btn.style.background = '#10b981';
        btn.style.color = '#ffffff';
        if (typeof window.showToast === 'function') window.showToast(`Auto-Hover ativado na barra ${side === 'left' ? 'esquerda' : 'direita'}!`, 'success');
      } else {
        btn.style.background = side === 'left' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
        btn.style.color = side === 'left' ? '#cbd5e1' : 'var(--text-secondary, #64748b)';
        if (typeof window.showToast === 'function') window.showToast(`Auto-Hover desativado.`, 'info');
      }
    }
  };

  function inicializarModosBarrasLaterais() {
    ['left', 'right'].forEach(side => {
      const savedMode = localStorage.getItem('chef_sidebar_' + side + '_mode') || 'expanded';
      const savedHover = localStorage.getItem('chef_sidebar_' + side + '_autohover') === 'true';

      window.setSidebarMode(side, savedMode);

      const panelId = side === 'left' ? 'left-panel' : 'right-panel';
      const panel = document.getElementById(panelId);
      const btn = document.getElementById('btn-autohover-' + side);
      if (panel && savedHover) {
        panel.classList.add('auto-hover-active');
        if (btn) {
          btn.style.background = '#10b981';
          btn.style.color = '#ffffff';
        }
      }
    });
  }

  inicializarModosBarrasLaterais();

})(window);
