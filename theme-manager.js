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

    if (icon) icon.className = (validTheme === 'dark') ? 'ph ph-moon' : 'ph ph-sun';
    if (text) text.textContent = (validTheme === 'dark') ? 'Modo Escuro' : 'Modo Claro';

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
    if (validTheme === 'dark') {
      if (!document.querySelector('link[href*="dark-mode.css"]')) {
        var dmLink = document.createElement('link');
        dmLink.rel = 'stylesheet';
        dmLink.href = '/dark-mode.css';
        document.head.appendChild(dmLink);
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

  /* No modo Desktop Forçado, fixa o layout viewport em largura de desktop.
     Mesmo aparelhos com tela de 480px renderizam a versão completa — o
     navegador reduz tudo para caber (como o "versão desktop" dos celulares).
     Nos outros modos, viewport normal responsiva. */
  function aplicarViewportModo(mode) {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      (document.head || document.documentElement).appendChild(meta);
    }
    if (mode === 'desktop') {
      meta.setAttribute('content', 'width=1280');
    } else {
      meta.setAttribute('content', 'width=device-width, initial-scale=1.0');
    }
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
      aplicarViewportModo('mobile');
      if (typeof window.switchMobileTab === 'function') {
        setTimeout(function () { window.switchMobileTab('mesas'); }, 50);
      }
    } else if (validMode === 'desktop') {
      docEl.classList.add('force-desktop');
      if (body) body.classList.add('force-desktop');
      aplicarViewportModo('desktop');
    } else {
      aplicarViewportModo('auto');
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

  /* Variáveis globais independentes do modo (fontes, raios, primária) */
  function buildGlobalVars(cfg) {
    var v = [];
    if (cfg.primary) {
      v.push('--primary: ' + cfg.primary + ' !important;');
      v.push('--primary-rgb: ' + hexToRgb(cfg.primary) + ' !important;');
      v.push('--btn-primary-bg: ' + (cfg.btnPrimaryBg || cfg.primary) + ' !important;');
    }
    if (cfg.primaryHover) {
      v.push('--primary-hover: ' + cfg.primaryHover + ' !important;');
    }
    if (cfg.btnPrimaryText) {
      v.push('--btn-primary-text: ' + cfg.btnPrimaryText + ' !important;');
    }
    if (cfg.fontBody) {
      v.push('--font-family: "' + cfg.fontBody + '", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif !important;');
    }
    if (cfg.fontHeading) {
      v.push('--font-heading: "' + cfg.fontHeading + '", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif !important;');
    }
    if (cfg.borderRadius) {
      v.push('--radius-lg: ' + cfg.borderRadius + ' !important;');
      v.push('--radius-md: ' + cfg.borderRadius + ' !important;');
      v.push('--border-radius-base: ' + cfg.borderRadius + ' !important;');
    }
    if (cfg.fontSizeScale) v.push('--fs-scale: ' + cfg.fontSizeScale + ';');
    if (cfg.btnScale) v.push('--btn-scale: ' + cfg.btnScale + ';');
    if (cfg.cardPadY) v.push('--card-pad-y: ' + cfg.cardPadY + ';');
    if (cfg.cardPadX) v.push('--card-pad-x: ' + cfg.cardPadX + ';');
    if (cfg.modalWidth) v.push('--modal-max-w: ' + cfg.modalWidth + ';');
    if (cfg.modalPosition) v.push('--modal-align: ' + cfg.modalPosition + ';');
    return v;
  }

  /* Cores específicas de um modo (fundo, cartões, textos) */
  function buildModeVars(cfg) {
    var v = [];
    if (cfg.bgHeader) v.push('--bg-header: ' + cfg.bgHeader + ';');
    if (cfg.textHeader) v.push('--text-header: ' + cfg.textHeader + ';');
    if (cfg.bgSidebar) v.push('--bg-sidebar: ' + cfg.bgSidebar + ';');
    if (cfg.textSidebar) v.push('--text-sidebar: ' + cfg.textSidebar + ';');
    if (cfg.bgColor) v.push('--bg-color: ' + cfg.bgColor + '; --bg-main: ' + cfg.bgColor + ';');
    if (cfg.bgCard) v.push('--bg-card: ' + cfg.bgCard + ';');
    if (cfg.textPrimary) v.push('--text-primary: ' + cfg.textPrimary + '; --text-main: ' + cfg.textPrimary + ';');
    if (cfg.textSecondary) v.push('--text-secondary: ' + cfg.textSecondary + '; --text-muted: ' + cfg.textSecondary + ';');
    if (cfg.borderColor) v.push('--border-color: ' + cfg.borderColor + ';');
    return v;
  }

  function applyCustomTheme(cfg) {
    if (!cfg || typeof cfg !== 'object') return;

    /* Formato DUAL novo: { modo_dual:true, claro:{...}, escuro:{...}, coringa? }
       Cada modo recebe suas próprias variáveis sob o seletor de tema certo
       (corrige o bug antigo em que UMA paleta era jogada para claro OU escuro). */
    if (cfg.modo_dual && cfg.claro && cfg.escuro) {
      _lastCfg = cfg;
      try { localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(cfg)); } catch (e) { }

      var styleDual = document.getElementById('chef-custom-theme-vars');
      if (!styleDual) {
        styleDual = document.createElement('style');
        styleDual.id = 'chef-custom-theme-vars';
        document.head.appendChild(styleDual);
      }

      var g = buildGlobalVars(cfg);
      var c = buildModeVars(cfg.claro || {});
      var e = buildModeVars(cfg.escuro || {});
      var out = [];
      if (g.length) out.push(':root, body, html {\n  ' + g.join('\n  ') + '\n}');
      if (c.length) out.push('[data-theme="light"], html[data-theme="light"] body.theme-light, body.theme-light:not(.dark-mode):not([data-theme="dark"]) {\n  ' + c.join('\n  ') + '\n}');
      if (e.length) out.push('[data-theme="dark"], body.theme-dark, body.dark-mode {\n  ' + e.join('\n  ') + '\n}');
      styleDual.innerHTML = out.join('\n\n');

      carregarFontesGoogle(cfg);
      aplicarFlagTamanhos(cfg);
      var coringaDual = cfg.coringa || (cfg.claro && cfg.claro.coringa) || (cfg.escuro && cfg.escuro.coringa);
      renderCoringa(coringaDual ? Object.assign({}, cfg, { coringa: coringaDual }) : cfg);
      window.dispatchEvent(new CustomEvent('chef_custom_theme_applied', { detail: cfg }));
      return;
    }

    _lastCfg = cfg;
    try { localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(cfg)); } catch (e) { }

    var styleEl = document.getElementById('chef-custom-theme-vars');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'chef-custom-theme-vars';
      document.head.appendChild(styleEl);
    }

    var rules = [];

    // 1. Variáveis globais no :root, body e html
    var rootVars = buildGlobalVars(cfg);

    if (rootVars.length) {
      rules.push(':root, body, html {\n  ' + rootVars.join('\n  ') + '\n}');
    }

    // 2. Cores específicas de fundo / texto
    var themeVars = buildModeVars(cfg);

    if (themeVars.length) {
      // Paleta escolhida pelo restaurante (Loja de Temas) é a PRÉ-DEFINIÇÃO do
      // ambiente: vale em AMBOS os modos (claro e escuro) em todas as telas,
      // independente do toggle de tema do operador.
      if (cfg.storeTema) {
        rules.push('[data-theme="dark"], body.theme-dark, body.dark-mode {\n  ' + themeVars.join('\n  ') + '\n}');
        rules.push('[data-theme="light"], body.theme-light, :root:not([data-theme="dark"]) {\n  ' + themeVars.join('\n  ') + '\n}');
      } else {
        var isDarkBg = !isLightColor(cfg.bgColor);
        if (isDarkBg) {
          rules.push('[data-theme="dark"], body.theme-dark, body.dark-mode {\n  ' + themeVars.join('\n  ') + '\n}');
        } else {
          rules.push('[data-theme="light"], body.theme-light, :root:not([data-theme="dark"]) {\n  ' + themeVars.join('\n  ') + '\n}');
        }
      }
    }

    styleEl.innerHTML = rules.join('\n\n');

    carregarFontesGoogle(cfg);
    aplicarFlagTamanhos(cfg);

    renderCoringa(cfg);
    window.dispatchEvent(new CustomEvent('chef_custom_theme_applied', { detail: cfg }));
  }

  function carregarFontesGoogle(cfg) {
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
  }

  function aplicarFlagTamanhos(cfg) {
    var tamanhosCustom = (cfg.fontSizeScale && cfg.fontSizeScale !== '1') ||
      (cfg.btnScale && cfg.btnScale !== '1') ||
      (cfg.cardPadY && cfg.cardPadY !== '10px') ||
      (cfg.cardPadX && cfg.cardPadX !== '12px') ||
      (cfg.modalWidth && cfg.modalWidth !== 'none');
    try {
      document.documentElement.setAttribute('data-chef-sizes', tamanhosCustom ? 'on' : 'off');
      if (document.body) document.body.classList.toggle('chef-sizes-on', !!tamanhosCustom);
    } catch (e) { }
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
    if (typeof window.fecharModalDelegarSuporte === 'function') window.fecharModalDelegarSuporte();
    if (typeof window.fecharModalLoginFuncionarioMobile === 'function') window.fecharModalLoginFuncionarioMobile();
  }

  window.fecharTodosModaisEPopups = fecharTodosModaisEPopups;

  document.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape' || evt.keyCode === 27) {
      fecharTodosModaisEPopups();
    }
  });

  /* ═══ 6. INICIALIZAÇÃO ═══ */
  var initialTheme = getSavedTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);

  var initialViewMode = getViewMode();
  if (initialViewMode === 'mobile') document.documentElement.classList.add('force-mobile');
  else if (initialViewMode === 'desktop') document.documentElement.classList.add('force-desktop');

  document.addEventListener('DOMContentLoaded', function () {
    var saved = getSavedTheme();
    updateThemeUI(saved);
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
    reloadGlobal: fetchAndApplyGlobalTheme
  };

  window.ChefViewMode = {
    get: getViewMode,
    set: applyViewMode,
    toggle: toggleViewMode
  };

  fetchAndApplyGlobalTheme();

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
        applyCustomTheme(theme);
      });
    } catch (e) { }
  }
  bindTemaSocket();
})();
