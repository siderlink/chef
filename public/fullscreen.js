(function() {

  // ─── DARK MODE CSS INJECTION ─────────────────────────────────────────────────
  // Inject dark-mode.css if not already present (for pages that don't load it directly)
  if (!document.querySelector('link[href*="dark-mode.css"]')) {
    var dmLink = document.createElement('link');
    dmLink.rel = 'stylesheet';
    dmLink.href = '/dark-mode.css';
    document.head.appendChild(dmLink);
  }

  // ─── DARK MODE STATE ─────────────────────────────────────────────────────────
  var DARK_KEY = 'chef_garcom_theme';
  // Unificado: prefere a chave do theme-manager (chef_theme) para os dois sistemas nunca divergirem
  var isDark = (function() {
    try {
      var t = localStorage.getItem('chef_theme');
      if (t === 'dark') return true;
      if (t === 'light') return false;
    } catch (e) { }
    return localStorage.getItem(DARK_KEY) === 'dark';
  })();

  // Apply immediately on load (before DOMContentLoaded to avoid flash)
  if (isDark) document.documentElement.classList.add('dark-mode-pre');

  // ─── ROTAÇÃO REMOVIDA ──────────────────────────────────────────────────────
  // O botão de rotação foi removido de TODAS as telas. A orientação agora é
  // controlada exclusivamente no totem.html, via comando remoto do dono
  // (socket 'totem_rotacionar' tratado dentro do próprio totem.js).

  // Na tela principal do CAIXA (index.html) a barra deve ter SOMENTE o botão
  // de tela cheia — sem modo noturno.
  var IS_CAIXA_PAGE = location.pathname === '/' || /\/index\.html$/i.test(location.pathname);

  // SVG icons
  var SVG_FS_IN  = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>';
  var SVG_FS_OUT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>';

  // ─── FULLSCREEN BUTTON ──────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.id = 'btn-global-fullscreen';
  btn.innerHTML = SVG_FS_IN;
  btn.title = 'Tela Cheia';

  // ─── DARK MODE BUTTON ────────────────────────────────────────────────────────
  var SVG_MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var SVG_SUN  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

  var darkBtn = document.createElement('button');
  darkBtn.id = 'btn-global-darkmode';
  darkBtn.innerHTML = isDark ? SVG_SUN : SVG_MOON;
  darkBtn.title = isDark ? 'Modo Claro' : 'Modo Noturno';

  function applyButtonStyle(b) {
    b.style.width = '36px';
    b.style.height = '36px';
    b.style.borderRadius = '8px';
    b.style.backgroundColor = 'transparent';
    b.style.color = 'inherit';
    b.style.border = '1px solid currentColor';
    b.style.cursor = 'pointer';
    b.style.display = 'flex';
    b.style.justifyContent = 'center';
    b.style.alignItems = 'center';
    b.style.transition = 'all 0.2s ease';
    b.style.opacity = '0.7';
    b.onmouseover = function() { b.style.opacity = '1'; };
    b.onmouseout  = function() { b.style.opacity = '0.7'; };
  }

  applyButtonStyle(btn);
  applyButtonStyle(darkBtn);

  // ─── DARK MODE LOGIC ─────────────────────────────────────────────────────────
  function applyDarkMode(dark) {
    document.body.classList.toggle('dark-mode', dark);
    document.documentElement.classList.toggle('dark-mode', dark);
    darkBtn.innerHTML = dark ? SVG_SUN : SVG_MOON;
    darkBtn.title = dark ? 'Modo Claro' : 'Modo Noturno';
    darkBtn.style.opacity = dark ? '1' : '0.7';
    darkBtn.style.color = dark ? '#f59e0b' : 'inherit';
  }

  // Apply saved theme on DOM ready (promotes pre-class to body.dark-mode)
  function applyDarkOnLoad() {
    // Only apply if body.dark-mode isn't already managed by the page itself
    // (garcom.html manages its own via garcom.js — avoid double-toggle)
    var pageManages = !!document.getElementById('btn-theme-toggle');
    if (!pageManages && isDark) {
      applyDarkMode(true);
    } else if (pageManages) {
      // Sync icon with garcom.js state
      var bodyIsDark = document.body.classList.contains('dark-mode');
      isDark = bodyIsDark;
      darkBtn.innerHTML = bodyIsDark ? SVG_SUN : SVG_MOON;
      darkBtn.style.color = bodyIsDark ? '#f59e0b' : 'inherit';
      darkBtn.style.opacity = bodyIsDark ? '1' : '0.7';
    }
    document.documentElement.classList.remove('dark-mode-pre');
  }
  document.addEventListener('DOMContentLoaded', applyDarkOnLoad);
  if (document.readyState === 'complete' || document.readyState === 'interactive') applyDarkOnLoad();

  darkBtn.addEventListener('click', function(e) {
    e.preventDefault(); e.stopPropagation();
    isDark = !isDark;
    localStorage.setItem(DARK_KEY, isDark ? 'dark' : 'light');
    try { localStorage.setItem('chef_theme', isDark ? 'dark' : 'light'); } catch (err) { }
    // Mantém o sistema do theme-manager alinhado quando a página usa os dois
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    applyDarkMode(isDark);
    // Sync garcom.js button if present
    var garcomBtn = document.getElementById('btn-theme-toggle');
    if (garcomBtn) garcomBtn.innerHTML = isDark ? '<i class="ph ph-sun"></i>' : '<i class="ph ph-moon"></i>';
  });

  // ─── GEAR BUTTON (existing) ──────────────────────────────────────────────────
  function createGearButton() {
    const gear = document.createElement('button');
    gear.id = 'btn-fila-settings';
    gear.innerHTML = '<i class="ph ph-gear" style="font-size: 20px;"></i>';
    gear.title = 'Configurações da Fila';
    applyButtonStyle(gear);
    gear.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var popup = document.getElementById('modal-fila-settings');
      if (popup) {
        popup.style.display = popup.style.display === 'flex' ? 'none' : 'flex';
      }
    });
    return gear;
  }

  // ─── INJECT BUTTONS ──────────────────────────────────────────────────────────
  function injectButton() {
    if (document.getElementById('btn-global-fullscreen')) return;

    const headerRightActions = document.getElementById('header-right-actions');
    const topMenubar = document.querySelector('.top-menubar');
    const headerElement = document.querySelector('.header') || document.querySelector('header');
    const gearBtn = document.getElementById('modal-fila-settings') ? createGearButton() : null;

    function styleForDark(b) {
      b.style.border = '1px solid rgba(255,255,255,0.3)';
      b.style.padding = '4px';
      b.style.width = '38px';
      b.style.height = '38px';
    }
    function styleForLight(b) {
      b.style.color = '#333';
      b.style.border = 'none';
      b.style.backgroundColor = '#f1f5f9';
    }

    if (headerRightActions) {
      styleForDark(btn);
      if (!IS_CAIXA_PAGE) { styleForDark(darkBtn); }
      const wrap = document.createElement('div');
      wrap.style.display = 'flex';
      wrap.style.gap = '6px';
      if (gearBtn) { styleForDark(gearBtn); wrap.appendChild(gearBtn); }
      if (!IS_CAIXA_PAGE) { wrap.appendChild(darkBtn); }
      wrap.appendChild(btn);
      headerRightActions.prepend(wrap);

    } else if (topMenubar) {
      const wrapper = document.createElement('div');
      wrapper.style.marginLeft = 'auto';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '6px';
      wrapper.style.paddingRight = '10px';
      styleForLight(btn);
      if (!IS_CAIXA_PAGE) { styleForLight(darkBtn); }
      if (gearBtn) { styleForLight(gearBtn); wrapper.appendChild(gearBtn); }
      if (!IS_CAIXA_PAGE) { wrapper.appendChild(darkBtn); }
      wrapper.appendChild(btn);
      topMenubar.appendChild(wrapper);

    } else if (headerElement) {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '6px';
      wrapper.style.marginLeft = '8px';
      if (gearBtn) wrapper.appendChild(gearBtn);
      if (!IS_CAIXA_PAGE) { wrapper.appendChild(darkBtn); }
      wrapper.appendChild(btn);
      headerElement.appendChild(wrapper);

    } else {
      // Floating fallback (no header found)
      btn.style.position = 'fixed';
      btn.style.top = '10px';
      btn.style.right = '10px';
      btn.style.zIndex = '999999';
      btn.style.backgroundColor = '#333';
      btn.style.color = 'white';
      document.body.appendChild(btn);

      if (!IS_CAIXA_PAGE) {
        darkBtn.style.position = 'fixed';
        darkBtn.style.top = '10px';
        darkBtn.style.right = '56px';
        darkBtn.style.zIndex = '999999';
        darkBtn.style.backgroundColor = '#333';
        darkBtn.style.color = isDark ? '#f59e0b' : 'white';
        document.body.appendChild(darkBtn);

        if (gearBtn) {
          gearBtn.style.position = 'fixed';
          gearBtn.style.top = '10px';
          gearBtn.style.right = '102px';
          gearBtn.style.zIndex = '999999';
          gearBtn.style.backgroundColor = '#333';
          gearBtn.style.color = 'white';
          document.body.appendChild(gearBtn);
        }
      }
    }

    // Highlight dark mode button if currently dark
    if (isDark) {
      darkBtn.style.opacity = '1';
      darkBtn.style.color = '#f59e0b';
    }
  }

  document.addEventListener('DOMContentLoaded', injectButton);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    injectButton();
  }

  // ─── FULLSCREEN LOGIC ────────────────────────────────────────────────────────
  function getFsElement() {
    return document.fullscreenElement ||
           document.webkitFullscreenElement ||
           document.mozFullScreenElement ||
           document.msFullscreenElement || null;
  }

  function enterFullscreen(elem) {
    elem = elem || document.documentElement;
    var rfs = elem.requestFullscreen ||
              elem.webkitRequestFullscreen ||
              elem.mozRequestFullScreen ||
              elem.msRequestFullscreen;
    if (rfs) {
      try {
        var p = rfs.call(elem);
        if (p && typeof p.then === 'function') {
          return p.catch(function(err) {
            console.log('Fullscreen info:', err && err.message);
          });
        }
      } catch (err) {
        console.log('Fullscreen erro síncrono:', err && err.message);
      }
    }
  }

  function exitFullscreen() {
    var efs = document.exitFullscreen ||
              document.webkitExitFullscreen ||
              document.mozCancelFullScreen ||
              document.msExitFullscreen;
    if (efs) {
      try {
        var p = efs.call(document);
        if (p && typeof p.then === 'function') {
          return p.catch(function(err) {
            console.log('Exit fullscreen info:', err && err.message);
          });
        }
      } catch (err) {}
    }
  }

  function updateFsIcon() {
    if (btn) {
      btn.innerHTML = getFsElement() ? SVG_FS_OUT : SVG_FS_IN;
      btn.title = getFsElement() ? 'Sair da Tela Cheia' : 'Tela Cheia';
    }
  }

  function toggleFullScreen(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!getFsElement()) {
      enterFullscreen();
      btn.innerHTML = SVG_FS_OUT;
    } else {
      exitFullscreen();
      btn.innerHTML = SVG_FS_IN;
    }
  }

  btn.addEventListener('click', toggleFullScreen);
  btn.addEventListener('touchend', function(e) {
    toggleFullScreen(e);
  });

  // Keep icon in sync when fullscreen status changes (via ESC or gestures)
  ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function(evt) {
    document.addEventListener(evt, updateFsIcon);
  });

  // Auto-fullscreen ao primeiro toque ou clique na página (qualquer dispositivo/largura)
  var hasAttemptedAutoFs = false;
  function onFirstUserGesture(e) {
    if (hasAttemptedAutoFs) return;
    // Se o clique foi no próprio botão de fullscreen, deixa o toggleFullScreen tratar
    if (e && e.target && (e.target === btn || btn.contains(e.target))) return;
    hasAttemptedAutoFs = true;
    if (!getFsElement()) {
      enterFullscreen();
    }
    // Remove os listeners uma vez tentado
    window.removeEventListener('pointerdown', onFirstUserGesture, true);
    window.removeEventListener('touchstart', onFirstUserGesture, true);
    window.removeEventListener('click', onFirstUserGesture, true);
  }
  window.addEventListener('pointerdown', onFirstUserGesture, { capture: true, passive: true });
  window.addEventListener('touchstart', onFirstUserGesture, { capture: true, passive: true });
  window.addEventListener('click', onFirstUserGesture, { capture: true, passive: true });

  // ─── MODO ESPERA: modal fica expandido até a primeira interação ────────────
  // Usado pelo Zoom do QR do Ponto nas telas de caixa. Enquanto ninguém
  // interage com a tela, o modal permanece visível/expandido ("em espera").
  // No primeiro toque, clique, tecla, scroll ou 1px de movimento do
  // ponteiro, ele recolhe na hora e libera a tela.
  var _espera = { ativo: false, modalId: null, x: 0, y: 0, origemOk: false, timer: null };

  function _esperaModal() {
    return document.getElementById(_espera.modalId);
  }

  function _esperaDesarmar() {
    _espera.ativo = false;
    clearTimeout(_espera.timer);
    window.removeEventListener('pointerdown', _esperaInterao, true);
    window.removeEventListener('touchstart', _esperaInterao, true);
    window.removeEventListener('keydown', _esperaInterao, true);
    window.removeEventListener('wheel', _esperaInterao, true);
    window.removeEventListener('pointermove', _esperaMove, true);
    window.removeEventListener('mousemove', _esperaMove, true);
  }

  function _esperaLiberar(e) {
    var modal = _esperaModal();
    _esperaDesarmar();
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    // Engole o clique/tap residual para não acionar nada por baixo do modal
    var engolir = function(ev) { ev.stopPropagation(); if (ev.cancelable) ev.preventDefault(); };
    window.addEventListener('click', engolir, { capture: true, once: true });
    setTimeout(function() { window.removeEventListener('click', engolir, true); }, 350);
    if (e && e.type === 'keydown' && e.cancelable) e.preventDefault();
  }

  function _esperaInterao(e) {
    if (_espera.ativo) _esperaLiberar(e);
  }

  function _esperaMove(e) {
    if (!_espera.ativo) return;
    if (!_espera.origemOk) {
      // Primeiro evento apenas define a posição de referência
      _espera.x = e.clientX || 0;
      _espera.y = e.clientY || 0;
      _espera.origemOk = true;
      return;
    }
    if (Math.abs((e.clientX || 0) - _espera.x) >= 1 || Math.abs((e.clientY || 0) - _espera.y) >= 1) {
      _esperaLiberar(e);
    }
  }

  // Fecha o modal em espera (usado também pelo botão X)
  window.chefFecharEspera = function(modalId) {
    _esperaDesarmar();
    var modal = document.getElementById(modalId || _espera.modalId);
    if (modal) modal.style.display = 'none';
  };

  // Ativa a espera no modal após um pequeno atraso (ignora o toque que abriu)
  window.chefModoEsperaArmar = function(modalId, atrasoMs) {
    _esperaDesarmar();
    _espera.modalId = modalId;
    _espera.origemOk = false;
    _espera.timer = setTimeout(function() {
      _espera.ativo = true;
      var opts = { capture: true, passive: true };
      window.addEventListener('pointerdown', _esperaInterao, opts);
      window.addEventListener('touchstart', _esperaInterao, opts);
      window.addEventListener('keydown', _esperaInterao, true);
      window.addEventListener('wheel', _esperaInterao, opts);
      window.addEventListener('pointermove', _esperaMove, opts);
      window.addEventListener('mousemove', _esperaMove, opts);
    }, atrasoMs || 400);
  };
})();
