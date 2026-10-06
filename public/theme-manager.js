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
      var primary = localStorage.getItem(STORAGE_KEY);
      if (primary === 'dark' || primary === 'light') return primary;
      var secondary = localStorage.getItem('chef_garcom_theme');
      if (secondary === 'dark' || secondary === 'light') return secondary;
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
    document.documentElement.classList.remove('theme-dark', 'theme-light', 'light', 'dark');
    document.documentElement.classList.add('theme-' + validTheme);
    document.documentElement.classList.toggle('dark-mode', validTheme === 'dark');
    document.documentElement.classList.toggle('light', validTheme === 'light');
    document.documentElement.classList.toggle('dark', validTheme === 'dark');

    if (document.body) {
      document.body.setAttribute('data-theme', validTheme);
      document.body.classList.remove('theme-dark', 'theme-light', 'light', 'dark');
      document.body.classList.add('theme-' + validTheme);
      document.body.classList.toggle('dark-mode', validTheme === 'dark');
      document.body.classList.toggle('light', validTheme === 'light');
      document.body.classList.toggle('dark', validTheme === 'dark');
    }

    var dmLinks = document.querySelectorAll('link[href*="dark-mode.css"]');
    if (validTheme === 'dark') {
      if (!dmLinks.length) {
        var dmLink = document.createElement('link');
        dmLink.rel = 'stylesheet';
        dmLink.href = '/dark-mode.css';
        document.head.appendChild(dmLink);
      } else {
        dmLinks.forEach(function (l) { l.disabled = false; });
      }
    } else {
      dmLinks.forEach(function (l) {
        l.disabled = true;
        try { if (l.parentNode) l.parentNode.removeChild(l); } catch (e) { }
      });
    }

    try { localStorage.setItem(STORAGE_KEY, validTheme); } catch (e) { }
    try { localStorage.setItem('chef_garcom_theme', validTheme); } catch (e) { }
    try { localStorage.setItem('theme', validTheme); } catch (e) { }
    try { document.cookie = 'chef_lite_theme=' + validTheme + ';path=/;max-age=31536000'; } catch (e) { }
    updateThemeUI(validTheme);

    var baseStyleEl = document.getElementById('chef-mode-base-vars');
    if (!baseStyleEl) {
      baseStyleEl = document.createElement('style');
      baseStyleEl.id = 'chef-mode-base-vars';
      document.head.appendChild(baseStyleEl);
    }
    if (validTheme === 'light') {
      baseStyleEl.textContent = [
        ':root, html, body, [data-theme="light"], body.theme-light {',
        '  --bg-slate: #f8fafc !important;',
        '  --bg-slate-card: #ffffff !important;',
        '  --bg-color: #f8fafc !important;',
        '  --bg-main: #f8fafc !important;',
        '  --bg-page: #f8fafc !important;',
        '  --bg-card: #ffffff !important;',
        '  --bg-panel: #ffffff !important;',
        '  --bg-sidebar: #ffffff !important;',
        '  --bg-header: #ffffff !important;',
        '  --surface: #ffffff !important;',
        '  --surface-panel: #ffffff !important;',
        '  --surface-card: #ffffff !important;',
        '  --surface-ground: #f8fafc !important;',
        '  --text-primary: #0f172a !important;',
        '  --text-main: #0f172a !important;',
        '  --text-body: #1e293b !important;',
        '  --text-secondary: #64748b !important;',
        '  --text-muted: #64748b !important;',
        '  --border-color: #e2e8f0 !important;',
        '  --border-light: #e2e8f0 !important;',
        '  --border-subtle: #e2e8f0 !important;',
        '  --border-main: #e2e8f0 !important;',
        '  --glass-bg: rgba(255, 255, 255, 0.92) !important;',
        '  --glass-border: rgba(226, 232, 240, 0.8) !important;',
        '  --input-bg: #ffffff !important;',
        '  --input-border: #cbd5e1 !important;',
        '  --input-color: #0f172a !important;',
        '}'
      ].join('\n');
    } else {
      baseStyleEl.textContent = [
        ':root, html, body, [data-theme="dark"], body.theme-dark, body.dark-mode {',
        '  --bg-slate: #0f172a !important;',
        '  --bg-slate-card: #1e293b !important;',
        '  --bg-color: #0b0f19 !important;',
        '  --bg-main: #090d16 !important;',
        '  --bg-page: #0b0f19 !important;',
        '  --bg-card: #1e293b !important;',
        '  --bg-panel: #0f172a !important;',
        '  --bg-sidebar: #0b1120 !important;',
        '  --bg-header: #0f172a !important;',
        '  --surface: #1e293b !important;',
        '  --surface-panel: #0f172a !important;',
        '  --surface-card: #1e293b !important;',
        '  --surface-ground: #0b0f19 !important;',
        '  --text-primary: #f8fafc !important;',
        '  --text-main: #f8fafc !important;',
        '  --text-body: #f1f5f9 !important;',
        '  --text-secondary: #94a3b8 !important;',
        '  --text-muted: #94a3b8 !important;',
        '  --border-color: rgba(255, 255, 255, 0.08) !important;',
        '  --border-light: rgba(255, 255, 255, 0.08) !important;',
        '  --border-subtle: rgba(255, 255, 255, 0.08) !important;',
        '  --border-main: rgba(255, 255, 255, 0.12) !important;',
        '  --glass-bg: rgba(15, 23, 42, 0.85) !important;',
        '  --glass-border: rgba(255, 255, 255, 0.1) !important;',
        '  --input-bg: #1e293b !important;',
        '  --input-border: #334155 !important;',
        '  --input-color: #f8fafc !important;',
        '}'
      ].join('\n');
    }

    if (_lastCfg) {
      applyCustomTheme(_lastCfg);
    }
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

    var activeTheme = getSavedTheme();
    var isDark = (activeTheme === 'dark');

    var prim = cfg.primary || '#fc4b15';
    var primRgb = hexToRgb(prim);
    var primHov = cfg.primaryHover || prim;
    var bg = cfg.bgColor || cfg.bgPage || (isDark ? '#0b0f19' : '#f8fafc');
    var cardBg = cfg.bgCard || (isDark ? '#111827' : '#ffffff');
    var border = cfg.borderColor || (isDark ? '#1f2937' : '#e2e8f0');
    var textMain = cfg.textPrimary || cfg.textMain || (isDark ? '#f3f4f6' : '#0f172a');
    var textSec = cfg.textSecondary || (isDark ? '#94a3b8' : '#64748b');
    var stOcup = cfg.statusOcupada || '#ef4444';
    var stLiv = cfg.statusLivre || '#10b981';

    // Adaptação não invasiva: respeita rigorosamente a escolha de Modo Claro ou Escuro do usuário
    if (!isDark) {
      if (!isLightColor(bg)) bg = '#f8fafc';
      if (!isLightColor(cardBg)) cardBg = '#ffffff';
      if (!isLightColor(border)) border = '#e2e8f0';
      if (isLightColor(textMain)) textMain = '#0f172a';
      if (isLightColor(textSec)) textSec = '#64748b';
    } else {
      if (isLightColor(bg)) bg = '#0b0f19';
      if (isLightColor(cardBg)) cardBg = '#1e293b';
      if (isLightColor(border)) border = 'rgba(255, 255, 255, 0.08)';
      if (!isLightColor(textMain)) textMain = '#f8fafc';
      if (!isLightColor(textSec)) textSec = '#94a3b8';
    }

    var isDarkBg = isDark;

    document.documentElement.setAttribute('data-theme', activeTheme);
    document.documentElement.classList.remove('theme-dark', 'theme-light', 'light', 'dark');
    document.documentElement.classList.add('theme-' + activeTheme);
    document.documentElement.classList.toggle('dark-mode', isDark);
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);

    if (document.body) {
      document.body.setAttribute('data-theme', activeTheme);
      document.body.classList.remove('theme-dark', 'theme-light', 'light', 'dark');
      document.body.classList.add('theme-' + activeTheme);
      document.body.classList.toggle('dark-mode', isDark);
      document.body.classList.toggle('dark', isDark);
      document.body.classList.toggle('light', !isDark);
    }

    var dmLinks = document.querySelectorAll('link[href*="dark-mode.css"]');
    if (isDark) {
      if (!dmLinks.length) {
        var dmLink = document.createElement('link');
        dmLink.rel = 'stylesheet';
        dmLink.href = '/dark-mode.css';
        document.head.appendChild(dmLink);
      } else {
        dmLinks.forEach(function (l) { l.disabled = false; });
      }
    } else {
      dmLinks.forEach(function (l) {
        l.disabled = true;
        try { if (l.parentNode) l.parentNode.removeChild(l); } catch (e) { }
      });
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
      '--bg-slate: ' + (isDarkBg ? (cfg.bgSlate || '#0f172a') : '#f8fafc') + ' !important;',
      '--cfg-bg: ' + bg + ' !important;',
      '--cfg-subtle-bg: ' + bg + ' !important;',
      '--surface-sidebar: ' + (cfg.bgSidebar || (isDarkBg ? '#0b1120' : '#f8fafc')) + ' !important;',
      '--surface-panel: ' + (isDarkBg ? cardBg : '#ffffff') + ' !important;',

      // Painéis e Cards
      '--bg-card: ' + cardBg + ' !important;',
      '--bg-slate-card: ' + (isDarkBg ? (cfg.bgSlateCard || '#1e293b') : '#ffffff') + ' !important;',
      '--bg-panel: ' + cardBg + ' !important;',
      '--bg-sidebar: ' + (cfg.bgSidebar || (isDarkBg ? cardBg : '#f8fafc')) + ' !important;',
      '--bg-header: ' + (cfg.bgHeader || (isDarkBg ? cardBg : '#ffffff')) + ' !important;',
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

    var universalSelector = ':root, html, body, [data-theme="' + activeTheme + '"], body.theme-' + activeTheme + (isDark ? ', body.dark-mode, body.dark' : ', body.light');
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
    updateThemeUI(activeTheme);
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

  // Sincronização entre abas e janelas em tempo real via storage event
  window.addEventListener('storage', function (e) {
    if (!e || !e.key) return;
    if (e.key === STORAGE_KEY) {
      var newTheme = e.newValue;
      if (newTheme === 'dark' || newTheme === 'light') {
        var currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme !== newTheme) {
          applyTheme(newTheme);
        }
      }
    } else if (e.key === CUSTOM_THEME_KEY) {
      if (e.newValue) {
        try { applyCustomTheme(JSON.parse(e.newValue)); } catch (err) { }
      } else {
        clearCustomTheme();
      }
    } else if (e.key === VIEW_MODE_KEY) {
      if (e.newValue && e.newValue !== getViewMode()) {
        applyViewMode(e.newValue);
      }
    }
  });

  // Propagação WebSocket em tempo real & Controle Remoto pelo Super Admin
  var temaSocketTries = 0;

  function exibirTelaBloqueioRemoto(motivo, contato) {
    var el = document.getElementById('chef-remote-lock-screen');
    if (!el) {
      el = document.createElement('div');
      el.id = 'chef-remote-lock-screen';
      el.style.cssText = 'position:fixed;inset:0;background:rgba(11,15,25,0.95);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);z-index:9999999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;color:#fff;text-align:center;font-family:Inter,sans-serif;animation:fadeInLock 0.3s ease;';
      document.body.appendChild(el);
    }
    el.innerHTML = '<div style="background:rgba(239,68,68,0.1);border:1.5px solid rgba(239,68,68,0.35);padding:40px 32px;border-radius:24px;max-width:520px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,0.6);display:flex;flex-direction:column;align-items:center;gap:18px;">'
      + '<div style="width:72px;height:72px;background:linear-gradient(135deg,#ef4444,#b91c1c);border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:32px;box-shadow:0 0 25px rgba(239,68,68,0.5);">'
      + '🔒'
      + '</div>'
      + '<h2 style="font-size:24px;font-weight:900;color:#fff;margin:0;letter-spacing:-0.5px;">Sistema Suspenso</h2>'
      + '<p style="font-size:15px;color:#cbd5e1;line-height:1.6;margin:0;">' + (motivo || 'Esta instalação do Chef Cozinha foi temporariamente suspensa pela administração central.') + '</p>'
      + '<div style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 18px;font-size:13px;color:#94a3b8;width:100%;box-sizing:border-box;">'
      + 'Para regularizar o acesso e reativar seus terminais, contate o suporte:'
      + '<div style="margin-top:8px;font-weight:700;color:#f8fafc;font-size:14px;">' + (contato || 'Suporte Técnico Chef Cozinha') + '</div>'
      + '</div>'
      + '<a href="https://wa.me/5511999999999" target="_blank" style="margin-top:6px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:800;font-size:14px;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 14px rgba(16,185,129,0.35);">'
      + 'Falar com o Suporte Técnico'
      + '</a>'
      + '</div>';
    el.style.display = 'flex';
  }

  function ocultarTelaBloqueioRemoto() {
    var el = document.getElementById('chef-remote-lock-screen');
    if (el) {
      el.style.transition = 'opacity 0.4s ease';
      el.style.opacity = '0';
      setTimeout(function () {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }, 400);
    }
  }

  function exibirNotificacaoSuperAdmin(title, body, type, duracao) {
    var toast = document.createElement('div');
    var bg = type === 'danger' ? '#ef4444' : type === 'warning' ? '#f59e0b' : type === 'success' ? '#10b981' : '#3b82f6';
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:999999;background:' + bg + ';color:#fff;padding:16px 24px;border-radius:14px;box-shadow:0 15px 35px rgba(0,0,0,0.35);font-family:Inter,sans-serif;max-width:90vw;width:440px;display:flex;flex-direction:column;gap:4px;animation:slideDown 0.3s ease;';
    toast.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;"><strong style="font-size:15px;font-weight:800;">' + (title || 'Aviso da Central') + '</strong><button onclick="this.parentNode.parentNode.remove()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px;line-height:1;">✕</button></div>'
      + '<div style="font-size:13px;line-height:1.5;opacity:0.95;">' + (body || '') + '</div>';
    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast && toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
      }
    }, duracao || 10000);
  }

  // Verifica estado de bloqueio na inicialização
  try {
    fetch('/api/status-bloqueio')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.bloqueado) {
          exibirTelaBloqueioRemoto(data.motivo, data.contato);
        }
      })
      .catch(function () {});
  } catch (e) {}

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

      // ── EVENTOS DE CONTROLE REMOTO DO SUPER ADMIN ─────────────────
      sock.on('sistema_bloqueado_remoto', function (data) {
        exibirTelaBloqueioRemoto(data ? data.motivo : null, data ? data.contato : null);
      });

      sock.on('sistema_desbloqueado_remoto', function () {
        ocultarTelaBloqueioRemoto();
        exibirNotificacaoSuperAdmin('Acesso Restaurado', 'O sistema foi desbloqueado com sucesso pela administração central.', 'success', 6000);
      });

      sock.on('notificacao_super_admin', function (data) {
        if (data) {
          exibirNotificacaoSuperAdmin(data.title, data.body, data.type, data.duracao);
        }
      });

      sock.on('servidor_reiniciando', function (data) {
        exibirNotificacaoSuperAdmin('Servidor Reiniciando', (data && data.mensagem) || 'O servidor está sendo reiniciado. Reconectando...', 'warning', 4000);
        setTimeout(function () {
          window.location.reload();
        }, 3000);
      });

      sock.on('forcar_logout_geral', function (data) {
        alert((data && data.motivo) || 'Sua sessão foi encerrada pela administração central.');
        window.location.href = '/login.html';
      });
    } catch (e) { }
  }
  bindTemaSocket();
})();

function applyAutoMobile() { if (localStorage.getItem('chef_view_mode') === 'desktop') return; if (window.innerWidth <= 900) { document.body && document.body.classList.add('force-mobile'); document.documentElement.classList.add('force-mobile'); } else if (localStorage.getItem('chef_view_mode') !== 'mobile') { document.body && document.body.classList.remove('force-mobile'); document.documentElement.classList.remove('force-mobile'); } }
window.addEventListener('resize', applyAutoMobile);
document.addEventListener('DOMContentLoaded', applyAutoMobile);
applyAutoMobile();
