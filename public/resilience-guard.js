/**
 * public/resilience-guard.js
 * Sistema Global de Ultra-Robustez e Auto-Recuperação do Frontend (Chef Cozinha).
 *
 * Funcionalidades:
 * 1. Error Boundary Global: Intercepta window.onerror e unhandledrejection sem travar a interface.
 * 2. Supressão de Erros Benignos (ResizeObserver, extensões do Chrome, AbortError).
 * 3. Monitoramento de Rede e Fallback Offline em tempo real.
 * 4. Auto-recuperação de estado e toast não-intrusivo de diagnóstico.
 */
(function () {
  'use strict';

  // Lista de mensagens benignas que nunca devem alertar o operador
  const IGNORED_ERRORS = [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'The user aborted a request',
    'AbortError',
    'Extension context invalidated',
    'Receiving end does not exist'
  ];

  let toastElement = null;

  function showRecoveryToast(msg, isWarning = true) {
    try {
      if (!toastElement) {
        toastElement = document.createElement('div');
        toastElement.id = 'chef-resilience-toast';
        toastElement.style.cssText = `
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 999999;
          background: #0f172a;
          border: 1px solid ${isWarning ? '#f59e0b' : '#10b981'};
          color: #f8fafc;
          padding: 10px 16px;
          border-radius: 10px;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          transition: all 0.3s ease;
        `;
        document.body.appendChild(toastElement);
      }

      toastElement.innerHTML = `
        <span style="font-size:16px;">${isWarning ? '⚠️' : '✅'}</span>
        <span>${msg}</span>
        <button onclick="this.parentElement.style.display='none'" style="background:none;border:none;color:#94a3b8;font-size:14px;cursor:pointer;margin-left:6px;">&times;</button>
      `;
      toastElement.style.display = 'flex';

      setTimeout(() => {
        if (toastElement) toastElement.style.display = 'none';
      }, 5000);
    } catch (_) {}
  }

  // 1. Error Boundary Global para o Navegador
  window.onerror = function (message, source, lineno, colno, error) {
    const errorStr = String(message || '');
    for (const ignored of IGNORED_ERRORS) {
      if (errorStr.includes(ignored)) return true; // Impede propagação de erro benigno
    }

    console.warn('[Resilience Guard] Erro capturado e contido:', message, 'em', source, `L:${lineno}`);

    // Telemetria silenciosa para o servidor (sem bloquear a UX)
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/log-error', JSON.stringify({
          tipo: 'frontend_uncaught',
          msg: errorStr,
          src: source,
          linha: lineno,
          url: window.location.href,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (_) {}

    return true; // Suprime a quebra da tela
  };

  // 2. Interceptador de Rejeições de Promessas Não Tratadas
  window.addEventListener('unhandledrejection', function (event) {
    const reason = event.reason;
    const msg = (reason && (reason.message || reason)) || 'Falha de comunicação assíncrona';
    const msgStr = String(msg);

    for (const ignored of IGNORED_ERRORS) {
      if (msgStr.includes(ignored)) {
        event.preventDefault();
        return;
      }
    }

    console.warn('[Resilience Guard] Promessa rejeitada recuperada:', msg);
    event.preventDefault(); // Impede crash do console e quebra do browser
  });

  // 3. Monitor de Conectividade com Fallback Automático
  window.addEventListener('online', function () {
    showRecoveryToast('Conexão restabelecida! Sincronizando dados com o servidor...', false);
    if (window.ChefOfflineQueue && typeof window.ChefOfflineQueue.flush === 'function') {
      window.ChefOfflineQueue.flush();
    }
  });

  window.addEventListener('offline', function () {
    showRecoveryToast('Modo Offline Ativo. As operações estão protegidas no dispositivo.', true);
  });

  // 4. API de Diagnóstico e Recuperação Exposta Globalmente
  window.ChefResilience = {
    recuperarInterface: function () {
      console.log('[Resilience Guard] Forçando re-renderização da interface...');
      if (window.ChefUltraApp && typeof window.ChefUltraApp.renderAll === 'function') {
        window.ChefUltraApp.renderAll();
      } else if (typeof window.carregarMesas === 'function') {
        window.carregarMesas();
      }
      showRecoveryToast('Interface restaurada com sucesso!', false);
    },
    exportarDiagnostico: function () {
      const diag = {
        userAgent: navigator.userAgent,
        online: navigator.onLine,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        localStorageKeys: Object.keys(localStorage),
        sessionStorageKeys: Object.keys(sessionStorage)
      };
      const blob = new Blob([JSON.stringify(diag, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `diagnostico-chef-${Date.now()}.json`;
      a.click();
    }
  };

  console.log('🛡️ [Resilience Guard] Proteção universal de frontend ativa.');
})();
