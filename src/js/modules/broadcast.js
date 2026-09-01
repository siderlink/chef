/* Broadcast Notifications — Chef Cozinha */
(function() {
  var KEY = 'chef_broadcast_dismissed';
  function getDismissed() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e) { return []; } }
  function markDismissed(id) { var d = getDismissed(); if (d.indexOf(id) === -1) d.push(id); localStorage.setItem(KEY, JSON.stringify(d.slice(-50))); }
  function isDismissed(id) { return getDismissed().indexOf(id) !== -1; }
  function escapeHtml(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }

  var icons = { aviso: '\u26A0', atualizacao: '\u2714', manutencao: '\u2699', urgente: '\u26A1' };
  var labels = { aviso: 'Aviso', atualizacao: 'Atualização', manutencao: 'Manutenção', urgente: 'Urgente' };
  var colors = { aviso: '#3b82f6', atualizacao: '#10b981', manutencao: '#f59e0b', urgente: '#ef4444' };

  function injectStyle() {
    if (document.getElementById('chef-bc-style')) return;
    var s = document.createElement('style');
    s.id = 'chef-bc-style';
    s.textContent =
      '#chef-bc-wrap{position:fixed;top:0;left:0;right:0;z-index:99999;display:flex;flex-direction:column;align-items:center;pointer-events:none;padding:10px;gap:8px;}' +
      '.chef-bc-toast{pointer-events:all;display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-radius:10px;max-width:560px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,0.35);animation:bcIn .3s ease;font-family:system-ui,-apple-system,sans-serif;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}' +
      '.chef-bc-dark{background:rgba(25,25,30,0.92);color:#eee;border:1px solid rgba(255,255,255,0.08);}' +
      '.chef-bc-light{background:rgba(255,255,255,0.95);color:#222;border:1px solid rgba(0,0,0,0.08);}' +
      '.chef-bc-icon{font-size:1.3rem;flex-shrink:0;line-height:1;}' +
      '.chef-bc-body{flex:1;min-width:0;}' +
      '.chef-bc-tipo{font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;}' +
      '.chef-bc-titulo{font-size:0.92rem;font-weight:700;margin-bottom:2px;}' +
      '.chef-bc-corpo{font-size:0.83rem;opacity:.88;line-height:1.4;}' +
      '.chef-bc-x{flex-shrink:0;background:none;border:none;cursor:pointer;padding:2px 6px;font-size:18px;line-height:1;opacity:.5;}' +
      '.chef-bc-x:hover{opacity:1;}' +
      '@keyframes bcIn{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}' +
      '#chef-pwa-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);animation:pwaFadeIn .3s ease;font-family:system-ui,-apple-system,sans-serif;}' +
      '#chef-pwa-overlay .chef-pwa-card{background:#fff;border-radius:20px;padding:40px 32px 24px;text-align:center;max-width:340px;width:90%;box-shadow:0 24px 64px rgba(0,0,0,0.3);animation:pwaSlideUp .4s ease;}' +
      '.dark #chef-pwa-overlay .chef-pwa-card{background:#1e1e24;color:#eee;}' +
      '#chef-pwa-overlay .chef-pwa-icon{font-size:3.2rem;margin-bottom:12px;}' +
      '#chef-pwa-overlay .chef-pwa-title{font-size:1.2rem;font-weight:700;margin-bottom:6px;}' +
      '#chef-pwa-overlay .chef-pwa-text{font-size:0.88rem;color:#666;line-height:1.5;margin-bottom:24px;}' +
      '.dark #chef-pwa-overlay .chef-pwa-text{color:#aaa;}' +
      '#chef-pwa-overlay .chef-pwa-btn{display:block;width:100%;padding:14px;background:#fc4b15;color:#fff;border:none;border-radius:12px;font-size:1.15rem;font-weight:700;cursor:pointer;transition:background .2s;margin-bottom:8px;}' +
      '#chef-pwa-overlay .chef-pwa-btn:hover{background:#e03a0b;}' +
      '#chef-pwa-overlay .chef-pwa-link{display:block;background:none;border:none;color:#999;font-size:0.78rem;cursor:pointer;padding:8px;text-decoration:underline;text-underline-offset:2px;}' +
      '#chef-pwa-overlay .chef-pwa-link:hover{color:#666;}' +
      '@keyframes pwaFadeIn{from{opacity:0}to{opacity:1}}' +
      '@keyframes pwaSlideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(s);
  }

  function darkMode() {
    var el = document.documentElement;
    if (el && el.classList && el.classList.contains('dark')) return true;
    if (el && el.classList && el.classList.contains('light')) return false;
    if (el && el.getAttribute) { var t = el.getAttribute('data-theme'); if (t === 'dark') return true; if (t === 'light') return false; }
    if (document.body && document.body.classList) { if (document.body.classList.contains('dark')) return true; if (document.body.classList.contains('light')) return false; }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function show(msg) {
    var wrap = document.getElementById('chef-bc-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'chef-bc-wrap'; document.body.appendChild(wrap); }
    var tc = darkMode() ? 'chef-bc-dark' : 'chef-bc-light';
    var cor = colors[msg.tipo] || colors.aviso;
    var icon = icons[msg.tipo] || '\u2022';
    var label = labels[msg.tipo] || msg.tipo;
    var dt = msg.criado_em ? new Date(msg.criado_em).toLocaleString('pt-BR') : '';
    var toast = document.createElement('div');
    toast.className = 'chef-bc-toast ' + tc;
    toast.style.borderLeft = '4px solid ' + cor;
    toast.innerHTML =
      '<span class="chef-bc-icon">' + icon + '</span>' +
      '<div class="chef-bc-body">' +
        '<div class="chef-bc-tipo" style="color:' + cor + ';">' + escapeHtml(label) + (dt ? ' \u2022 ' + escapeHtml(dt) : '') + '</div>' +
        '<div class="chef-bc-titulo">' + escapeHtml(msg.titulo) + '</div>' +
        '<div class="chef-bc-corpo">' + escapeHtml(msg.corpo) + '</div>' +
      '</div>' +
      '<button class="chef-bc-x" title="Fechar">&times;</button>';

    toast.querySelector('.chef-bc-x').addEventListener('click', function() {
      markDismissed(msg.id);
      toast.style.opacity = '0'; toast.style.transform = 'translateY(-10px)'; toast.style.transition = 'all .25s';
      setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 260);
      var rid = localStorage.getItem('restaurante_id');
      if (rid) { var x = new XMLHttpRequest(); x.open('POST', '/api/mensagens/' + msg.id + '/lida', true); x.setRequestHeader('Content-Type', 'application/json'); x.send(JSON.stringify({ restaurante_id: rid })); }
    });
    wrap.appendChild(toast);
    var delay = msg.tipo === 'urgente' ? 12000 : 7000;
    setTimeout(function() { if (toast.parentNode) { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300); } }, delay);
  }

  function check() {
    var x = new XMLHttpRequest();
    x.open('GET', '/api/mensagens', true);
    x.onreadystatechange = function() {
      if (x.readyState !== 4) return;
      try {
        var data = JSON.parse(x.responseText);
        if (!data.ok || !data.mensagens) return;
        data.mensagens.forEach(function(m) {
          if (!isDismissed(m.id)) show(m);
        });
      } catch(e) {}
    };
    x.send(null);
  }

  injectStyle();

  // --- PWA Install Prompt ---
  var PWA_KEY = 'chef_pwa_dismissed';
  function pwaDismissed() { return localStorage.getItem(PWA_KEY) === '1'; }
  function markPwaDismissed() { localStorage.setItem(PWA_KEY, '1'); }

  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  function showPwaPopup() {
    if (pwaDismissed() || !deferredPrompt) return;
    var overlay = document.createElement('div');
    overlay.id = 'chef-pwa-overlay';
    overlay.innerHTML =
      '<div class="chef-pwa-card">' +
        '<div class="chef-pwa-icon">📱</div>' +
        '<div class="chef-pwa-title">Instale o Chef Cozinha</div>' +
        '<div class="chef-pwa-text">Instale o aplicativo para ter o melhor aproveitamento do sistema!</div>' +
        '<button class="chef-pwa-btn">SIM</button>' +
        '<button class="chef-pwa-link">continuar aqui</button>' +
      '</div>';
    overlay.querySelector('.chef-pwa-btn').addEventListener('click', function() {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function() { deferredPrompt = null; });
      markPwaDismissed();
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
    overlay.querySelector('.chef-pwa-link').addEventListener('click', function() {
      markPwaDismissed();
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    });
    document.body.appendChild(overlay);
  }

  var pwaTimer = setTimeout(showPwaPopup, 180000);

  // Reset timer on user interaction (only first time)
  function pwaResetTimer() {
    clearTimeout(pwaTimer);
    if (!pwaDismissed()) pwaTimer = setTimeout(showPwaPopup, 180000);
    document.removeEventListener('pointerdown', pwaResetTimer);
    document.removeEventListener('keydown', pwaResetTimer);
  }
  document.addEventListener('pointerdown', pwaResetTimer);
  document.addEventListener('keydown', pwaResetTimer);

  // --- End PWA Install Prompt ---

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }
  setInterval(check, 300000);
})();
