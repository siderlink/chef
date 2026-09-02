/**
 * chef-resizable-sidebars.js
 * Gerenciamento de redimensionamento por arraste (Splitters) e modos Oculto / Mini / Expandido
 */
(function() {
  'use strict';

  const STORAGE_LEFT_WIDTH = 'chef_sidebar_left_width';
  const STORAGE_RIGHT_WIDTH = 'chef_sidebar_right_width';
  const STORAGE_LEFT_MODE = 'chef_sidebar_left_mode'; // 'expanded' | 'mini' | 'hidden'
  const STORAGE_RIGHT_MODE = 'chef_sidebar_right_mode';

  function injectSplitterStyles() {
    if (document.getElementById('chef-splitter-styles')) return;
    const st = document.createElement('style');
    st.id = 'chef-splitter-styles';
    st.textContent = `
      .chef-sidebar-splitter {
        width: 6px;
        min-width: 6px;
        cursor: col-resize;
        z-index: 50;
        background: rgba(0, 0, 0, 0.06);
        transition: background 0.15s ease;
        position: relative;
        flex-shrink: 0;
        user-select: none;
      }
      .chef-sidebar-splitter:hover, .chef-sidebar-splitter.dragging {
        background: #fc4b15 !important;
      }
      [data-theme="dark"] .chef-sidebar-splitter {
        background: rgba(255, 255, 255, 0.08);
      }
      .chef-resizing {
        user-select: none !important;
        cursor: col-resize !important;
      }
      .chef-resizing * {
        user-select: none !important;
      }
      .sidebar-ctrl-btn:hover {
        background: rgba(0, 0, 0, 0.08) !important;
      }
      [data-theme="dark"] .sidebar-ctrl-btn:hover {
        background: rgba(255, 255, 255, 0.12) !important;
      }
    `;
    document.head.appendChild(st);
  }

  function ensureFloatRestoreStyles() {
    if (document.getElementById('chef-float-restore-styles')) return;
    const st = document.createElement('style');
    st.id = 'chef-float-restore-styles';
    st.textContent = `
      .chef-float-restore {
        width: 42px;
        height: 42px;
        border-radius: 12px;
        border: 1px solid var(--border-color, rgba(0,0,0,0.1));
        background: var(--bg-card, #ffffff);
        color: var(--text-primary, #0f172a);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 19px;
        opacity: 0.95;
        transition: transform 0.15s ease, background 0.15s ease;
      }
      .chef-float-restore:hover {
        transform: scale(1.1);
        background: var(--primary, #fc4b15);
        color: #ffffff;
      }
      [data-theme="dark"] .chef-float-restore {
        background: var(--bg-card, #1e293b);
        color: var(--text-primary, #f8fafc);
      }
    `;
    document.head.appendChild(st);
  }

  function injectFloatRestoreButtons() {
    ensureFloatRestoreStyles();
    let leftBtn = document.getElementById('float-restore-left');
    let rightBtn = document.getElementById('float-restore-right');

    const mk = (side, label, edge) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'float-restore-' + side;
      b.className = 'chef-float-restore';
      b.title = 'Restaurar barra ' + label;
      b.setAttribute('aria-label', b.title);
      b.innerHTML = '<i class="ph ph-sidebar-simple"></i>';
      b.style.position = 'fixed';
      b.style[edge] = '6px';
      b.style.top = '40%';
      b.style.zIndex = '9999';
      b.style.display = 'none';
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.setSidebarMode === 'function') {
          window.setSidebarMode(side, 'expanded');
        }
        const panel = document.getElementById(side === 'left' ? 'left-panel' : 'right-panel');
        if (panel) {
          panel.classList.remove('mode-hidden', 'mode-mini', 'sidebar-hidden', 'sidebar-mini');
          panel.classList.add('mode-expanded', 'sidebar-expanded');
          panel.style.display = '';
        }
        try { localStorage.setItem('chef_sidebar_' + side + '_mode', 'expanded'); } catch(e){}
        syncFloatRestoreVisibility();
      });
      document.body.appendChild(b);
      return b;
    };

    if (!leftBtn) leftBtn = mk('left', 'lateral esquerda', 'left');
    if (!rightBtn) rightBtn = mk('right', 'lateral direita', 'right');
  }

  function syncFloatRestoreVisibility() {
    ['left', 'right'].forEach(function (side) {
      const panel = document.getElementById(side === 'left' ? 'left-panel' : 'right-panel');
      const btn = document.getElementById('float-restore-' + side);
      if (!panel || !btn) return;
      const desktopOk = window.innerWidth >= 768 && !document.body.classList.contains('force-mobile');
      let hidden = false;
      if (panel.classList.contains('mode-hidden') || panel.classList.contains('sidebar-hidden')) {
        hidden = true;
      } else {
        const cs = window.getComputedStyle(panel);
        hidden = panel.style.display === 'none' || cs.display === 'none' || cs.visibility === 'hidden';
      }
      btn.style.display = (desktopOk && hidden) ? 'flex' : 'none';
    });
  }

  function initResizableSidebars() {
    injectSplitterStyles();
    injectFloatRestoreButtons();

    const leftPanel = document.querySelector('.left-actions, #left-panel');
    const rightPanel = document.querySelector('.right-info, #right-panel');
    const mainPanel = document.querySelector('.main-workspace, #main-panel');
    const workspace = document.querySelector('.workspace');

    if (!workspace || !leftPanel || !rightPanel) return;

    // Recuperar larguras salvas
    const savedLeftW = localStorage.getItem(STORAGE_LEFT_WIDTH) || '220';
    const savedRightW = localStorage.getItem(STORAGE_RIGHT_WIDTH) || '280';
    const savedLeftMode = localStorage.getItem(STORAGE_LEFT_MODE) || 'expanded';
    const savedRightMode = localStorage.getItem(STORAGE_RIGHT_MODE) || 'expanded';

    // 1. Injetar controles de topo na Barra Esquerda
    if (!leftPanel.querySelector('.sidebar-header-controls')) {
      const leftHeader = document.createElement('div');
      leftHeader.className = 'sidebar-header-controls';
      leftHeader.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:4px 2px 8px; border-bottom:1px solid var(--border-subtle, rgba(0,0,0,0.08)); margin-bottom:8px;">
          <span style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; opacity:0.8;">Ações Rápidas</span>
          <div style="display:flex; gap:4px;">
            <button type="button" class="sidebar-ctrl-btn" onclick="window.toggleSidebarMode('left','expanded')" title="Expandir Barra" style="background:none; border:none; cursor:pointer; padding:3px 6px; border-radius:6px; font-size:14px; color:inherit;">
              <i class="ph ph-sidebar-simple"></i>
            </button>
            <button type="button" class="sidebar-ctrl-btn" onclick="window.toggleSidebarMode('left','mini')" title="Modo Mini / Icones" style="background:none; border:none; cursor:pointer; padding:3px 6px; border-radius:6px; font-size:14px; color:inherit;">
              <i class="ph ph-arrows-in-line-horizontal"></i>
            </button>
            <button type="button" class="sidebar-ctrl-btn" onclick="window.toggleSidebarMode('left','hidden')" title="Ocultar Barra" style="background:none; border:none; cursor:pointer; padding:3px 6px; border-radius:6px; font-size:14px; color:inherit;">
              <i class="ph ph-x"></i>
            </button>
          </div>
        </div>
      `;
      leftPanel.insertBefore(leftHeader, leftPanel.firstChild);
    }

    // 2. Injetar controles de topo na Barra Direita
    if (!rightPanel.querySelector('.sidebar-header-controls')) {
      const rightHeader = document.createElement('div');
      rightHeader.className = 'sidebar-header-controls';
      rightHeader.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; padding:4px 2px 8px; border-bottom:1px solid var(--border-subtle, rgba(0,0,0,0.08)); margin-bottom:8px;">
          <span style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; opacity:0.8;">Resumo da Conta</span>
          <div style="display:flex; gap:4px;">
            <button type="button" class="sidebar-ctrl-btn" onclick="window.toggleSidebarMode('right','expanded')" title="Expandir Barra" style="background:none; border:none; cursor:pointer; padding:3px 6px; border-radius:6px; font-size:14px; color:inherit;">
              <i class="ph ph-sidebar-simple"></i>
            </button>
            <button type="button" class="sidebar-ctrl-btn" onclick="window.toggleSidebarMode('right','mini')" title="Modo Compacto" style="background:none; border:none; cursor:pointer; padding:3px 6px; border-radius:6px; font-size:14px; color:inherit;">
              <i class="ph ph-arrows-in-line-horizontal"></i>
            </button>
            <button type="button" class="sidebar-ctrl-btn" onclick="window.toggleSidebarMode('right','hidden')" title="Ocultar Resumo" style="background:none; border:none; cursor:pointer; padding:3px 6px; border-radius:6px; font-size:14px; color:inherit;">
              <i class="ph ph-x"></i>
            </button>
          </div>
        </div>
      `;
      rightPanel.insertBefore(rightHeader, rightPanel.firstChild);
    }

    // 3. Injetar Splitters de Arraste (Resize Handles)
    let leftSplitter = document.getElementById('chef-left-splitter') || document.getElementById('resizer-left');
    if (!leftSplitter) {
      leftSplitter = document.createElement('div');
      leftSplitter.id = 'chef-left-splitter';
      workspace.insertBefore(leftSplitter, mainPanel);
    }
    leftSplitter.className = 'chef-sidebar-splitter left-splitter';
    leftSplitter.title = 'Arraste para redimensionar a barra esquerda';

    let rightSplitter = document.getElementById('chef-right-splitter') || document.getElementById('resizer-right');
    if (!rightSplitter) {
      rightSplitter = document.createElement('div');
      rightSplitter.id = 'chef-right-splitter';
      workspace.insertBefore(rightSplitter, rightPanel);
    }
    rightSplitter.className = 'chef-sidebar-splitter right-splitter';
    rightSplitter.title = 'Arraste para redimensionar a barra direita';

    // 4. Lógica de Arraste do Splitter Esquerdo
    let isDraggingLeft = false;
    const startDragLeft = (e) => {
      isDraggingLeft = true;
      leftSplitter.classList.add('dragging');
      document.body.classList.add('chef-resizing');
      if (e.type === 'mousedown') e.preventDefault();
    };
    leftSplitter.addEventListener('mousedown', startDragLeft);
    leftSplitter.addEventListener('touchstart', startDragLeft, { passive: true });

    // 5. Lógica de Arraste do Splitter Direito
    let isDraggingRight = false;
    const startDragRight = (e) => {
      isDraggingRight = true;
      rightSplitter.classList.add('dragging');
      document.body.classList.add('chef-resizing');
      if (e.type === 'mousedown') e.preventDefault();
    };
    rightSplitter.addEventListener('mousedown', startDragRight);
    rightSplitter.addEventListener('touchstart', startDragRight, { passive: true });

    const handleMove = (clientX) => {
      if (isDraggingLeft) {
        const newW = Math.max(140, Math.min(clientX, 550));
        leftPanel.style.width = newW + 'px';
        leftPanel.style.minWidth = newW + 'px';
        leftPanel.style.maxWidth = newW + 'px';
        localStorage.setItem(STORAGE_LEFT_WIDTH, String(newW));
      }
      if (isDraggingRight) {
        const newW = Math.max(180, Math.min(window.innerWidth - clientX, 600));
        rightPanel.style.width = newW + 'px';
        rightPanel.style.minWidth = newW + 'px';
        rightPanel.style.maxWidth = newW + 'px';
        localStorage.setItem(STORAGE_RIGHT_WIDTH, String(newW));
      }
    };

    document.addEventListener('mousemove', (e) => {
      if (isDraggingLeft || isDraggingRight) handleMove(e.clientX);
    });

    document.addEventListener('touchmove', (e) => {
      if ((isDraggingLeft || isDraggingRight) && e.touches.length === 1) {
        handleMove(e.touches[0].clientX);
      }
    }, { passive: true });

    const stopDrag = () => {
      if (isDraggingLeft || isDraggingRight) {
        isDraggingLeft = false;
        isDraggingRight = false;
        leftSplitter.classList.remove('dragging');
        rightSplitter.classList.remove('dragging');
        document.body.classList.remove('chef-resizing');
      }
    };

    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchend', stopDrag);

    // Aplicar estados salvos
    window.setSidebarMode('left', savedLeftMode, false);
    window.setSidebarMode('right', savedRightMode, false);

    // Alinhar splitters à ordem dos painéis (layout modular)
    chefSyncSplitterOrders();

    // Manter os botões flutuantes de restauração sincronizados
    syncFloatRestoreVisibility();
    window.addEventListener('resize', syncFloatRestoreVisibility);
    new MutationObserver(syncFloatRestoreVisibility)
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    setInterval(syncFloatRestoreVisibility, 1200);
  }

  // Mantém os splitters laterais na posição correta entre o painel central e os
  // painéis laterais, mesmo quando o chef-layout-customizer aplica `order` nos
  // painéis (dock/minidock pode ir para a direita; resumo pode ir para a esquerda).
  // Ignora o caso padrão (sem `order` inline) preservando a ordem do DOM.
  function chefSyncSplitterOrders() {
    var leftPanel = document.getElementById('left-panel');
    var rightPanel = document.getElementById('right-panel');
    var mainPanel = document.getElementById('main-panel');
    var leftSplitter = document.getElementById('resizer-left');
    var rightSplitter = document.getElementById('resizer-right');
    if (!leftPanel || !rightPanel || !mainPanel || !leftSplitter || !rightSplitter) return;

    var mainOrder = parseInt(mainPanel.style.order, 10);
    if (!isFinite(mainOrder) || mainOrder !== 0) return; // layout padrão: preserva DOM order

    var leftOrder = parseInt(leftPanel.style.order, 10);
    var rightOrder = parseInt(rightPanel.style.order, 10);
    var leftSplitterOrder = isFinite(leftOrder) ? leftOrder / 2 : 0;
    var rightSplitterOrder = isFinite(rightOrder) ? rightOrder / 2 : 0;
    if (leftOrder !== 2 && leftOrder !== -2) leftSplitterOrder = 0;
    if (rightOrder !== 2 && rightOrder !== -2) rightSplitterOrder = 0;
    leftSplitter.style.order = String(leftSplitterOrder);
    rightSplitter.style.order = String(rightSplitterOrder);
  }
  window.chefSyncSplitterOrders = chefSyncSplitterOrders;

  // Função Global para Alternar Modos — unificada com caixa-pro-ux.js.
  // Se caixa-pro-ux.js carregar depois, sobrescreve setSidebarMode com a mesma lógica.
  window.chefApplySidebarMode = function (side, mode) {
    const right = side === 'right';
    const panel = (side === 'left') ? document.querySelector('.left-actions, #left-panel') : document.querySelector('.right-info, #right-panel');
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
    try { localStorage.setItem(side === 'left' ? STORAGE_LEFT_MODE : STORAGE_RIGHT_MODE, mode); } catch(e){}
    window.dispatchEvent(new CustomEvent('chef_sidebar_mode_changed', { detail: { side: side, mode: mode } }));
  };

  window.toggleSidebarMode = function (side, target) {
    const panel = (side === 'left') ? document.querySelector('.left-actions, #left-panel') : document.querySelector('.right-info, #right-panel');
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
      // Fallback mínimo caso chefApplySidebarMode não exista
      const panel = (side === 'left') ? document.querySelector('.left-actions, #left-panel') : document.querySelector('.right-info, #right-panel');
      if (!panel) return;
      panel.classList.remove('mode-expanded', 'mode-mini', 'mode-hidden', 'sidebar-expanded', 'sidebar-mini', 'sidebar-hidden');
      panel.classList.add('mode-' + mode, 'sidebar-' + mode);
      try { localStorage.setItem(side === 'left' ? STORAGE_LEFT_MODE : STORAGE_RIGHT_MODE, mode); } catch(e){}
    }
    syncFloatRestoreVisibility();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResizableSidebars);
  } else {
    initResizableSidebars();
  }
})();
