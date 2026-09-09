/**
 * theme-manager.js — Gerenciador Universal de Temas, View Mode (Desktop/Mobile) & Tecla Coringa ESC (Chef Cozinha)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'chef_theme';
  var CUSTOM_THEME_KEY = 'chef_custom_theme_config';
  var VIEW_MODE_KEY = 'chef_view_mode'; // 'auto' | 'mobile' | 'desktop'

  /* ═══ 1. MODO CLARO / ESCURO (TEMA) ═══ */
  function getSavedTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) { }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && localStorage.getItem('chef_theme_auto') === '1') {
      return 'dark';
    }
    return 'light';
  }

  function updateThemeUI(theme) {
    var validTheme = (theme === 'dark') ? 'dark' : 'light';
    var icon = document.getElementById('theme-toggle-icon');
    var text = document.getElementById('theme-toggle-text');
    var iconSuper = document.getElementById('theme-toggle-icon-super');
    var textSuper = document.getElementById('theme-toggle-text-super');
    var iconHeader = document.getElementById('theme-toggle-icon-header');
    var iconMob = document.getElementById('theme-toggle-icon-mob');
    var textMob = document.getElementById('theme-toggle-text-mob');

    var iconClass = (validTheme === 'dark') ? 'ph ph-moon' : 'ph ph-sun';
    if (icon) icon.className = iconClass;
    if (iconHeader) iconHeader.className = iconClass;
    if (iconMob) iconMob.className = iconClass;
    if (text) text.textContent = (validTheme === 'dark') ? 'Modo Escuro' : 'Modo Claro';
    if (textMob) textMob.textContent = (validTheme === 'dark') ? 'Modo Noturno (Ativo)' : 'Modo Claro (Ativo)';

    if (iconSuper) iconSuper.className = (validTheme === 'dark') ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    if (textSuper) textSuper.textContent = (validTheme === 'dark') ? 'Modo Escuro' : 'Modo Claro';
  }

  function applyTheme(theme) {
    var validTheme = (theme === 'dark') ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', validTheme);
    if (document.body) {
      document.body.classList.remove('theme-dark', 'theme-light');
      document.body.classList.add('theme-' + validTheme);
      document.body.classList.toggle('dark-mode', validTheme === 'dark');
    }
    var dmLink = document.querySelector('link[href*="dark-mode.css"]');
    if (validTheme === 'dark') {
      if (!dmLink) {
        dmLink = document.createElement('link');
        dmLink.rel = 'stylesheet';
        dmLink.href = '/dark-mode.css';
        document.head.appendChild(dmLink);
      } else {
        dmLink.disabled = false;
      }
    } else {
      if (dmLink) {
        dmLink.disabled = true;
      }
    }
    document.documentElement.classList.toggle('dark-mode', validTheme === 'dark');
    try { localStorage.setItem(STORAGE_KEY, validTheme); } catch (e) { }
    try { localStorage.setItem('chef_garcom_theme', validTheme); } catch (e) { }
    updateThemeUI(validTheme);
    if (_lastCfg) applyCustomTheme(_lastCfg);
    window.dispatchEvent(new CustomEvent('chef_theme_changed', { detail: { theme: validTheme } }));
  }

  /* ═══ 2. VIEW MODE SWITCHER (DESKTOP / MOBILE / AUTO) ═══ */
  function getViewMode() {
    try {
      var m = localStorage.getItem(VIEW_MODE_KEY);
      if (m === 'mobile' || m === 'desktop' || m === 'auto') return m;
    } catch (e) { }
    return 'auto';
  }

  function updateViewModeUI(mode) {
    var btns = document.querySelectorAll('#btn-view-mode-toggle, .btn-view-mode-toggle');
    btns.forEach(function (btn) {
      var icon = btn.querySelector('#view-mode-icon') || btn.querySelector('i') || btn;
      var text = btn.querySelector('.view-mode-text');
      if (mode === 'mobile') {
        if (icon) {
          icon.className = icon.className.includes('fa-') ? 'fa-solid fa-mobile-screen-button' : 'ph-bold ph-device-mobile';
          icon.style.color = 'var(--primary, #fc4b15)';
        }
        if (text) text.textContent = 'Mobile';
        btn.setAttribute('title', 'Visualização: Mobile Forçado (Clique para mudar)');
        btn.classList.add('active');
      } else if (mode === 'desktop') {
        if (icon) {
          icon.className = icon.className.includes('fa-') ? 'fa-solid fa-desktop' : 'ph-bold ph-desktop';
          icon.style.color = 'var(--primary, #fc4b15)';
        }
        if (text) text.textContent = 'Desktop';
        btn.setAttribute('title', 'Visualização: Desktop Forçado (Clique para mudar)');
        btn.classList.add('active');
      } else {
        if (icon) {
          icon.className = icon.className.includes('fa-') ? 'fa-solid fa-arrows-rotate' : 'ph ph-arrows-clockwise';
          icon.style.color = '';
        }
        if (text) text.textContent = 'Auto';
        btn.setAttribute('title', 'Visualização: Automática / Responsiva (Clique para forçar Mobile)');
        btn.classList.remove('active');
      }
    });
  }

  function applyViewMode(mode) {
    var validMode = (mode === 'mobile' || mode === 'desktop') ? mode : 'auto';
    var docEl = document.documentElement;
    var body = document.body;

    docEl.classList.remove('force-mobile', 'force-desktop');
    if (body) body.classList.remove('force-mobile', 'force-desktop');

    if (validMode === 'mobile') {
      docEl.classList.add('force-mobile');
      if (body) body.classList.add('force-mobile');
      if (typeof window.switchMobileTab === 'function') {
        setTimeout(function () { window.switchMobileTab('mesas'); }, 50);
      }
    } else if (validMode === 'desktop') {
      docEl.classList.add('force-desktop');
      if (body) body.classList.add('force-desktop');
    }

    try { localStorage.setItem(VIEW_MODE_KEY, validMode); } catch (e) { }
    updateViewModeUI(validMode);
    window.dispatchEvent(new CustomEvent('chef_view_mode_changed', { detail: { mode: validMode } }));
  }

  function toggleViewMode() {
    var curr = getViewMode();
    var next = (curr === 'auto') ? 'mobile' : (curr === 'mobile' ? 'desktop' : 'auto');
    applyViewMode(next);
    var label = (next === 'mobile') ? '📱 Modo Mobile Forçado' : (next === 'desktop' ? '🖥️ Modo Desktop Forçado' : '🔄 Modo Automático (Responsivo)');
    if (typeof window.showToast === 'function') {
      window.showToast(label, 'info');
    }
    return next;
  }

  /* ═══ 3. PERSONALIZAÇÃO GLOBAL DO SUPER ADMIN (CORES, FONTES, SIZES) ═══ */
  function isLightColor(hex) {
    try {
      var h = String(hex || '').replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
      return ((0.299 * r) + (0.587 * g) + (0.114 * b)) > 140;
    } catch (e) { return false; }
  }

  var _lastCfg = null;

  function clearCustomTheme() {
    _lastCfg = null;
    try { localStorage.removeItem(CUSTOM_THEME_KEY); } catch (e) { }
    var styleEl = document.getElementById('chef-custom-theme-vars');
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    var cssEl = document.getElementById('chef-custom-theme-css');
    if (cssEl && cssEl.parentNode) cssEl.parentNode.removeChild(cssEl);
    window.dispatchEvent(new CustomEvent('chef_custom_theme_cleared'));
  }

  function applyCustomTheme(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    // Se vier embrulhado em cores ou objeto tema
    if (cfg.cores && typeof cfg.cores === 'object') {
      cfg = Object.assign({}, cfg, cfg.cores);
    }
    _lastCfg = cfg;
    try { localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(cfg)); } catch (e) { }
    if (cfg.tema_id) {
      try { localStorage.setItem('chef_tema_ativo_id', cfg.tema_id); } catch (e) { }
    }

    var styleEl = document.getElementById('chef-custom-theme-vars');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'chef-custom-theme-vars';
      document.head.appendChild(styleEl);
    }

    var prim = cfg.primary || '#fc4b15';
    var primRgb = hexToRgb(prim);
    var primHov = cfg.primaryHover || prim;
    var bg = cfg.bgColor || cfg.bgPage || '#0b0f19';
    var cardBg = cfg.bgCard || '#111827';
    var border = cfg.borderColor || '#1f2937';
    var textMain = cfg.textPrimary || cfg.textMain || '#f3f4f6';
    var isDarkBg = !isLightColor(bg);
    var textSec = cfg.textSecondary || (isDarkBg ? '#94a3b8' : '#64748b');
    var stOcup = cfg.statusOcupada || '#ef4444';
    var stLiv = cfg.statusLivre || '#10b981';

    // Se o tema veio da loja (storeTema), sincroniza modo claro/escuro
    if (cfg.storeTema) {
      var modoTema = isDarkBg ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', modoTema);
      if (document.body) {
        document.body.classList.remove('theme-dark', 'theme-light');
        document.body.classList.add('theme-' + modoTema);
        document.body.classList.toggle('dark-mode', isDarkBg);
      }
      var dmLink = document.querySelector('link[href*="dark-mode.css"]');
      if (isDarkBg) {
        if (!dmLink) {
          dmLink = document.createElement('link');
          dmLink.rel = 'stylesheet';
          dmLink.href = '/dark-mode.css';
          document.head.appendChild(dmLink);
        } else {
          dmLink.disabled = false;
        }
      } else if (dmLink) {
        dmLink.disabled = true;
      }
    }

    var cssVars = [
      // Primárias e Acentos
      '--primary: ' + prim + ' !important;',
      '--primary-rgb: ' + primRgb + ' !important;',
      '--primary-hover: ' + primHov + ' !important;',
      '--btn-primary-bg: ' + (cfg.btnPrimaryBg || prim) + ' !important;',
      '--primary-orange: ' + prim + ' !important;',
      '--primary-orange-hover: ' + primHov + ' !important;',
      '--accent-orange: ' + prim + ' !important;',
      '--primary-glow: rgba(' + primRgb + ', 0.35) !important;',
      '--cfg-primary: ' + prim + ' !important;',
      '--cfg-primary-soft: rgba(' + primRgb + ', 0.16) !important;',

      // Fundos
      '--bg-color: ' + bg + ' !important;',
      '--bg-main: ' + bg + ' !important;',
      '--bg-page: ' + bg + ' !important;',
      '--bg-slate: ' + bg + ' !important;',
      '--cfg-bg: ' + bg + ' !important;',
      '--cfg-subtle-bg: ' + bg + ' !important;',

      // Painéis e Cards
      '--bg-card: ' + cardBg + ' !important;',
      '--bg-slate-card: ' + cardBg + ' !important;',
      '--bg-panel: ' + cardBg + ' !important;',
      '--bg-sidebar: ' + (cfg.bgSidebar || cardBg) + ' !important;',
      '--bg-header: ' + (cfg.bgHeader || cardBg) + ' !important;',
      '--cfg-card-bg: ' + cardBg + ' !important;',
      '--cfg-card-alt: ' + cardBg + ' !important;',
      '--cfg-sidebar-bg: ' + (cfg.bgSidebar || cardBg) + ' !important;',
      '--cfg-header-bg: ' + (cfg.bgHeader || cardBg) + ' !important;',

      // Tipografia e Cores de Texto
      '--text-primary: ' + textMain + ' !important;',
      '--text-main: ' + textMain + ' !important;',
      '--text-header: ' + (cfg.textHeader || textMain) + ' !important;',
      '--cfg-text: ' + textMain + ' !important;',
      '--cfg-heading: ' + textMain + ' !important;',
      '--cfg-header-text: ' + (cfg.textHeader || textMain) + ' !important;',
      '--text-secondary: ' + textSec + ' !important;',
      '--text-muted: ' + textSec + ' !important;',
      '--cfg-text-muted: ' + textSec + ' !important;',
      '--cfg-sidebar-text: ' + (cfg.textSidebar || textSec) + ' !important;',

      // Bordas
      '--border-color: ' + border + ' !important;',
      '--border-panel: ' + border + ' !important;',
      '--border-light: ' + border + ' !important;',
      '--border-dark: ' + border + ' !important;',
      '--cfg-border: ' + border + ' !important;',
      '--cfg-field-border: ' + border + ' !important;',

      // Status
      '--status-ocupada: ' + stOcup + ' !important;',
      '--status-livre: ' + stLiv + ' !important;',
      '--danger: ' + stOcup + ' !important;',
      '--success: ' + stLiv + ' !important;'
    ];

    if (cfg.fontBody) {
      cssVars.push('--font-family: "' + cfg.fontBody + '", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;');
    }
    if (cfg.fontHeading) {
      cssVars.push('--font-heading: "' + cfg.fontHeading + '", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif !important;');
    }
    if (cfg.borderRadius) {
      cssVars.push('--radius-lg: ' + cfg.borderRadius + ' !important;');
      cssVars.push('--radius-md: ' + cfg.borderRadius + ' !important;');
      cssVars.push('--border-radius-base: ' + cfg.borderRadius + ' !important;');
    }
    if (cfg.fontSizeScale) cssVars.push('--fs-scale: ' + cfg.fontSizeScale + ';');
    if (cfg.btnScale) cssVars.push('--btn-scale: ' + cfg.btnScale + ';');
    if (cfg.cardPadY) cssVars.push('--card-pad-y: ' + cfg.cardPadY + ';');
    if (cfg.cardPadX) cssVars.push('--card-pad-x: ' + cfg.cardPadX + ';');
    if (cfg.modalWidth) cssVars.push('--modal-max-w: ' + cfg.modalWidth + ';');
    if (cfg.modalPosition) cssVars.push('--modal-align: ' + cfg.modalPosition + ';');

    var universalSelector = ':root, html, body, [data-theme="dark"], [data-theme="light"], body.theme-dark, body.theme-light, body.dark-mode';
    var rules = [universalSelector + ' {\n  ' + cssVars.join('\n  ') + '\n}'];

    // 3. CSS customizado
    if (cfg.css_custom && String(cfg.css_custom).trim()) {
      var cssEl = document.getElementById('chef-custom-theme-css');
      if (!cssEl) {
        cssEl = document.createElement('style');
        cssEl.id = 'chef-custom-theme-css';
        document.head.appendChild(cssEl);
      }
      cssEl.textContent = String(cfg.css_custom);
    } else {
      var oldCssEl = document.getElementById('chef-custom-theme-css');
      if (oldCssEl && oldCssEl.parentNode) oldCssEl.parentNode.removeChild(oldCssEl);
    }

    styleEl.innerHTML = rules.join('\n\n');

    // Fontes Google
    if (cfg.fontBody && !document.getElementById('font-body-' + cfg.fontBody)) {
      var fontLink = document.createElement('link');
      fontLink.id = 'font-body-' + cfg.fontBody;
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(cfg.fontBody) + ':wght@400;500;600;700&display=swap';
      document.head.appendChild(fontLink);
    }
    if (cfg.fontHeading && !document.getElementById('font-heading-' + cfg.fontHeading)) {
      var fontLinkH = document.createElement('link');
      fontLinkH.id = 'font-heading-' + cfg.fontHeading;
      fontLinkH.rel = 'stylesheet';
      fontLinkH.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(cfg.fontHeading) + ':wght@600;700;800&display=swap';
      document.head.appendChild(fontLinkH);
    }

    var tamanhosCustom = (cfg.fontSizeScale && cfg.fontSizeScale !== '1') ||
      (cfg.btnScale && cfg.btnScale !== '1') ||
      (cfg.cardPadY && cfg.cardPadY !== '10px') ||
      (cfg.cardPadX && cfg.cardPadX !== '12px') ||
      (cfg.modalWidth && cfg.modalWidth !== 'none');
    try {
      document.documentElement.setAttribute('data-chef-sizes', tamanhosCustom ? 'on' : 'off');
      if (document.body) document.body.classList.toggle('chef-sizes-on', !!tamanhosCustom);
    } catch (e) { }

    renderCoringa(cfg);
    window.dispatchEvent(new CustomEvent('chef_custom_theme_applied', { detail: cfg }));
  }

  function hexToRgb(hex) {
    try {
      var h = String(hex || '').replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var r = parseInt(h.substr(0, 2), 16) || 252;
      var g = parseInt(h.substr(2, 2), 16) || 75;
      var b = parseInt(h.substr(4, 2), 16) || 21;
      return r + ', ' + g + ', ' + b;
    } catch (e) { return '252, 75, 21'; }
  }

  /* ═══ 4. ÍCONE CORINGA ═══ */
  function executarAcaoCoringa(cfg) {
    var a = cfg.action || 'url';
    var t = cfg.target || '';
    if (a === 'tema') { window.ChefTheme.toggle(); return; }
    if (a === 'view_mode') { window.ChefViewMode.toggle(); return; }
    if (a === 'recarregar') { location.reload(); return; }
    if (a === 'fila') {
      if (typeof window.abrirFilaEsperaModal === 'function') window.abrirFilaEsperaModal();
      else alert('Fila de espera não disponível nesta tela.');
      return;
    }
    if (a === 'js') {
      try { (new Function(t))(); } catch (e) { console.error('[ChefTheme] Coringa JS:', e); }
      return;
    }
    if (/^https?:\/\//i.test(t)) window.open(t, '_blank');
    else if (t) location.href = t;
  }

  function renderCoringa(cfg) {
    var c = cfg && cfg.coringa;
    var old = document.getElementById('chef-coringa-btn');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (!c || c.enabled === false || !c.icon) return;

    var pos = c.position || 'float-br';
    if (pos.indexOf('topbar') === 0 && !document.querySelector('.top-menubar') && !document.querySelector('.topbar') && !document.querySelector('.toolbar')) return;
    if (pos.indexOf('float') === 0 && !document.body) return;

    var btn = document.createElement('button');
    btn.id = 'chef-coringa-btn';
    btn.className = 'chef-coringa-' + pos;
    btn.title = c.title || 'Atalho personalizado';
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML = '<i class="' + c.icon + '"></i>';
    if (c.color) btn.style.color = c.color;
    btn.style.background = c.bg || '#1e293b';

    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      executarAcaoCoringa(c);
    });

    if (pos === 'topbar-left' || pos === 'topbar-right') {
      var bar = document.querySelector('.top-menubar') || document.querySelector('.toolbar') || document.querySelector('.topbar');
      if (!bar) return;
      if (pos === 'topbar-left') bar.insertBefore(btn, bar.firstChild);
      else bar.appendChild(btn);
    } else {
      document.body.appendChild(btn);
    }
  }

  function fetchAndApplyGlobalTheme() {
    try {
      var cached = localStorage.getItem(CUSTOM_THEME_KEY);
      if (cached) applyCustomTheme(JSON.parse(cached));
    } catch (e) { }

    fetch('/api/public/theme?restaurante_id=' + encodeURIComponent(localStorage.getItem('restaurante_id') || '1'))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.ok && data.theme) {
          applyCustomTheme(data.theme);
        } else if (data && data.ok) {
          clearCustomTheme();
        }
      })
      .catch(function () { });
  }

  /* ═══ 5. TECLA CORINGA ESC (FECHAR QUALQUER MODAL / POPUP / OVERLAY) ═══ */
  function fecharTodosModaisEPopups() {
    var activeModals = document.querySelectorAll('.modal.active, .modal-overlay.active, .modal-backdrop.active, [class*="modal"].active, [class*="overlay"].active');
    for (var i = 0; i < activeModals.length; i++) {
      activeModals[i].classList.remove('active', 'open', 'show');
      activeModals[i].style.display = 'none';
    }

    var inlineModals = document.querySelectorAll('[id*="modal"], [class*="modal"], [id*="dialog"], [class*="popup"], [id*="popup"]');
    for (var j = 0; j < inlineModals.length; j++) {
      var el = inlineModals[j];
      if (el.id !== 'admin-panel' && el.id !== 'login-container' && el.id !== 'app' && el.id !== 'theme-live-preview-box') {
        var style = window.getComputedStyle(el);
        if (style.display !== 'none' && (style.position === 'fixed' || style.position === 'absolute' || el.classList.contains('active'))) {
          el.style.display = 'none';
          el.classList.remove('active', 'open', 'show');
        }
      }
    }

    var dropdowns = document.querySelectorAll('.dropdown-menu.active, .dropdown-menu.show, .dropdown-menu[style*="display: block"]');
    for (var k = 0; k < dropdowns.length; k++) {
      dropdowns[k].classList.remove('active', 'show');
      dropdowns[k].style.display = 'none';
    }

    var sidebar = document.querySelector('.sidebar.open');
    var sidebarOverlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('open');

    var impostorAlert = document.getElementById('impostor-live-alert');
    if (impostorAlert) impostorAlert.remove();

    if (typeof window.fecharModalAfiliado === 'function') window.fecharModalAfiliado();
    if (typeof window.fecharModalAfiliadoDetalhes === 'function') window.fecharModalAfiliadoDetalhes();
    if (typeof window.fecharModalNovaTaskSuporte === 'function') window.fecharModalNovaTaskSuporte();
    if (typeof window.fecharModalEnviarAvisoSuporte === 'function') window.fecharModalEnviarAvisoSuporte();
    if (typeof window.fecharModalCriarMissaoSurpresa === 'function') window.fecharModalCriarMissaoSurpresa();
    if (typeof window.fecharModalSenhaAdmin === 'function') window.fecharModalSenhaAdmin();
    if (typeof window.fecharModalLoginFuncionarioMobile === 'function') window.fecharModalLoginFuncionarioMobile();
  }

  window.fecharTodosModaisEPopups = fecharTodosModaisEPopups;

  document.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape' || evt.keyCode === 27) {
      fecharTodosModaisEPopups();
    }
  });

  /* ═══ 6. INICIALIZAÇÃO ═══ */
  // Aplica o tema completo já no parse do <head>: injeta dark-mode.css e, quando
  // o body existir, as classes theme-dark/dark-mode — evita página escura quebrada no refresh.
  var initialTheme = getSavedTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);
  applyTheme(initialTheme);

  var initialViewMode = getViewMode();
  if (initialViewMode === 'mobile') document.documentElement.classList.add('force-mobile');
  else if (initialViewMode === 'desktop') document.documentElement.classList.add('force-desktop');

  document.addEventListener('DOMContentLoaded', function () {
    // Re-aplica quando o body existe (classes body.dark-mode/theme-dark, dark-mode.css,
    // custom theme e coringa) — idempotente, mesmo estado do toggle de tema.
    applyTheme(getSavedTheme());
    applyViewMode(getViewMode());

    if (_lastCfg) {
      renderCoringa(_lastCfg);
    }
  });

  window.ChefTheme = {
    get: getSavedTheme,
    set: applyTheme,
    toggle: function () {
      var current = document.documentElement.getAttribute('data-theme') || getSavedTheme();
      var next = (current === 'dark') ? 'light' : 'dark';
      applyTheme(next);
      return next;
    },
    applyCustom: applyCustomTheme,
    clearCustom: clearCustomTheme,
    reloadGlobal: fetchAndApplyGlobalTheme
  };

  window.toggleTheme = function () {
    if (window.ChefTheme && typeof window.ChefTheme.toggle === 'function') {
      return window.ChefTheme.toggle();
    }
    return null;
  };

  window.ChefViewMode = {
    get: getViewMode,
    set: applyViewMode,
    toggle: toggleViewMode
  };

  fetchAndApplyGlobalTheme();

  // Sincronização via postMessage (entre iframe e janela principal)
  window.addEventListener('message', function (ev) {
    if (ev && ev.data && ev.data.action === 'chef_tema_aplicado' && ev.data.cfg) {
      applyCustomTheme(ev.data.cfg);
    }
  });

  // Propagação WebSocket em tempo real
  var temaSocketTries = 0;
  function bindTemaSocket() {
    if (temaSocketTries++ > 30) return;
    var sock = window.socket || (typeof io === 'function' ? io() : null);
    if (!sock) {
      setTimeout(bindTemaSocket, 1500);
      return;
    }
    try {
      sock.on('tema_global_atualizado', function (theme) {
        if (theme && typeof theme === 'object') {
          applyCustomTheme(theme);
        } else {
          clearCustomTheme();
        }
      });
      sock.on('tema_restaurante_atualizado', function (data) {
        var myRid = String(localStorage.getItem('restaurante_id') || '1');
        if (!data || !data.restaurante_id || String(data.restaurante_id) === myRid) {
          if (data && data.cfg && typeof data.cfg === 'object') {
            applyCustomTheme(data.cfg);
          }
        }
      });
      sock.on('tema_aplicado', function (data) {
        if (data && data.cfg) applyCustomTheme(data.cfg);
      });
    } catch (e) { }
  }
  bindTemaSocket();
})();
