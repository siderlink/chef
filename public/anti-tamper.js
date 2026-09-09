/**
 * anti-tamper.js — Blindagem de segurança e proteção de código-fonte
 * Impede inspeção maliciosa, scraping de código e tentativas de clonagem do sistema.
 */
(function () {
  'use strict';

  // 1. Bloqueio de teclas de atalho de desenvolvedor
  document.addEventListener('keydown', function (e) {
    // F12
    if (e.key === 'F12' || e.keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      reportarViolacao('TECLA_F12');
      return false;
    }
    // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C / Cmd+Opt+I
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      e.stopPropagation();
      reportarViolacao('ATALHO_DEVTOOLS');
      return false;
    }
    // Ctrl+U (Ver código-fonte)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u')) {
      e.preventDefault();
      e.stopPropagation();
      reportarViolacao('VER_CODIGO_FONTE');
      return false;
    }
    // Ctrl+S (Salvar página)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'S' || e.key === 's')) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // 2. Desativa menu de contexto em modo demo
  document.addEventListener('contextmenu', function (e) {
    if (localStorage.getItem('is_demo_mode') === 'true' || sessionStorage.getItem('is_tenant_demo') === 'true') {
      e.preventDefault();
      return false;
    }
  });

  // 3. Detecção de abertura de DevTools (tamanho da janela e debugger trap)
  let devToolsDetectado = false;
  function checarDevTools() {
    if (devToolsDetectado) return;
    const threshold = 160;
    const widthDiff = window.outerWidth - window.innerWidth > threshold;
    const heightDiff = window.outerHeight - window.innerHeight > threshold;
    if (widthDiff || heightDiff) {
      devToolsDetectado = true;
      reportarViolacao('DEVTOOLS_ABERTO');
    }
  }
  setInterval(checarDevTools, 2000);

  // 4. Reporte de violação de segurança ao Super Admin
  let ultimoReporte = 0;
  function reportarViolacao(tipo) {
    const agora = Date.now();
    if (agora - ultimoReporte < 15000) return; // debounce de 15s
    ultimoReporte = agora;

    const payload = {
      tipo_violacao: tipo,
      url: window.location.href,
      restaurante_id: localStorage.getItem('restaurante_id') || 1,
      is_demo: localStorage.getItem('is_demo_mode') === 'true',
      timestamp: new Date().toISOString()
    };

    fetch('/api/seguranca/reportar-violacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function () {});
  }

  // 5. Anti-Debugging Ativo (detecta pausa maliciosa por DevTools / breakpoints)
  (function antiDebugLoop() {
    function testDebugger() {
      const start = performance.now();
      try {
        (function() {}).constructor('debugger')();
      } catch (e) {}
      const diff = performance.now() - start;
      if (diff > 120) {
        reportarViolacao('DEBUGGER_ATIVO');
      }
    }
    setInterval(testDebugger, 2500);
  })();

  // 6. Proteção de Console contra extração de dados sensíveis em produção
  try {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const noop = function () {};
      console.debug = noop;
    }
  } catch (e) {}
})();
