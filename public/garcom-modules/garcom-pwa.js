/**
 * garcom-pwa.js — Controlador do PWA Dedicado do Garçom
 * Gerencia Service Worker (/sw-garcom.js), manifesto, instalação nativa e modo tela cheia.
 */
(function () {
  let deferredPrompt = null;
  const DISMISS_KEY = 'chef_pwa_garcom_dismissed_at';
  const DISMISS_HOURS = 48;

  // Verifica se já está rodando como PWA instalado (Standalone)
  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://') ||
      window.location.search.includes('pwa=1')
    );
  }

  // Registra o Service Worker dedicado do Garçom
  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw-garcom.js', { scope: '/' })
        .then((reg) => {
          console.log('✅ [PWA Garçom] Service Worker ativo com escopo:', reg.scope);

          // Verifica atualizações do SW periodicamente
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('🔄 [PWA Garçom] Nova versão disponível em segundo plano.');
              }
            });
          });
        })
        .catch((err) => {
          console.warn('⚠️ [PWA Garçom] Falha ao registrar Service Worker:', err);
        });
    });
  }

  // Injeta estilos CSS do banner PWA
  function injetarEstilosPWA() {
    if (document.getElementById('pwa-garcom-styles')) return;
    const style = document.createElement('style');
    style.id = 'pwa-garcom-styles';
    style.textContent = `
      .pwa-standalone body {
        padding-top: env(safe-area-inset-top, 0px);
        padding-bottom: env(safe-area-inset-bottom, 0px);
        -webkit-user-select: none;
        user-select: none;
      }
      #btn-pwa-install {
        position: relative;
        color: #10b981;
        font-size: 24px;
        background: none;
        border: none;
        cursor: pointer;
        min-width: 44px;
        min-height: 44px;
        display: none;
        align-items: center;
        justify-content: center;
      }
      #btn-pwa-install .pwa-badge-pulse {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 8px;
        height: 8px;
        background: #10b981;
        border-radius: 50%;
        box-shadow: 0 0 0 2px #fff;
        animation: pwaPulse 2s infinite;
      }
      @keyframes pwaPulse {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
      }
      .pwa-install-banner-wrapper {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(120px);
        width: calc(100% - 32px);
        max-width: 440px;
        z-index: 99999;
        transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s;
        opacity: 0;
        pointer-events: none;
      }
      .pwa-install-banner-wrapper.visible {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
        pointer-events: auto;
      }
      .pwa-install-card {
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 18px;
        padding: 14px 16px;
        box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        gap: 12px;
        backdrop-filter: blur(16px);
      }
      .pwa-install-icon-box {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: linear-gradient(135deg, #fc4b15, #f59e0b);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-size: 22px;
        flex-shrink: 0;
        box-shadow: 0 4px 12px rgba(252, 75, 21, 0.4);
      }
      .pwa-install-info {
        flex: 1;
        min-width: 0;
      }
      .pwa-install-title {
        font-size: 14px;
        font-weight: 700;
        color: #ffffff;
        margin-bottom: 2px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .pwa-install-desc {
        font-size: 11.5px;
        color: #94a3b8;
        line-height: 1.3;
      }
      .pwa-install-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }
      .pwa-btn-confirm {
        background: #16a34a;
        color: #ffffff;
        border: none;
        border-radius: 10px;
        padding: 8px 14px;
        font-size: 12.5px;
        font-weight: 700;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        box-shadow: 0 4px 10px rgba(22, 163, 74, 0.3);
      }
      .pwa-btn-close {
        background: rgba(255, 255, 255, 0.08);
        color: #94a3b8;
        border: none;
        border-radius: 8px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 14px;
      }
      .pwa-ios-modal {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        z-index: 99999;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding-bottom: 20px;
      }
      .pwa-ios-card {
        background: #1e293b;
        color: #ffffff;
        border-radius: 20px;
        padding: 20px;
        max-width: 380px;
        width: calc(100% - 32px);
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }

  // Cria o banner visual no DOM
  function criarBannerDOM() {
    if (document.getElementById('pwa-install-banner-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'pwa-install-banner-wrapper';
    wrapper.className = 'pwa-install-banner-wrapper';
    wrapper.innerHTML = `
      <div class="pwa-install-card">
        <div class="pwa-install-icon-box">
          <i class="ph-bold ph-device-mobile"></i>
        </div>
        <div class="pwa-install-info">
          <div class="pwa-install-title">App do Garçom <span style="font-size: 9px; background: #16a34a; padding: 1px 6px; border-radius: 6px; text-transform: uppercase;">PWA</span></div>
          <div class="pwa-install-desc">Instalar na tela de início para abrir em tela cheia e mais rápido.</div>
        </div>
        <div class="pwa-install-actions">
          <button type="button" class="pwa-btn-confirm" onclick="window.instalarAppGarcom()">
            <i class="ph-bold ph-download-simple"></i> Instalar
          </button>
          <button type="button" class="pwa-btn-close" onclick="window.fecharBannerPWA()" title="Depois">
            ✕
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);
  }

  // Exibe o banner se o usuário ainda não dispensou recentemente
  function exibirBannerSeApropriado() {
    if (isStandalone()) return;

    const lastDismissed = localStorage.getItem(DISMISS_KEY);
    if (lastDismissed) {
      const hoursAgo = (Date.now() - parseInt(lastDismissed, 10)) / (1000 * 60 * 60);
      if (hoursAgo < DISMISS_HOURS) {
        // Ainda no período de dispensa; não incomoda no banner flutuante, mas deixa o botão do cabeçalho ativo
        return;
      }
    }

    const wrapper = document.getElementById('pwa-install-banner-wrapper');
    if (wrapper) {
      wrapper.classList.add('visible');
    }
  }

  // Fecha o banner flutuante e guarda registro
  window.fecharBannerPWA = function () {
    const wrapper = document.getElementById('pwa-install-banner-wrapper');
    if (wrapper) wrapper.classList.remove('visible');
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch (_) {}
  };

  // Dispara a instalação nativa do PWA
  window.instalarAppGarcom = async function () {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult && choiceResult.outcome === 'accepted') {
        console.log('✅ Usuário aceitou instalar o PWA do Garçom');
      }
      deferredPrompt = null;
      window.fecharBannerPWA();
      const btn = document.getElementById('btn-pwa-install');
      if (btn) btn.style.display = 'none';
      return;
    }

    // Se estiver no iOS / Safari:
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      exibirModalAjudaIOS();
      return;
    }

    // Se já estiver em standalone ou browser não disparou prompt
    if (isStandalone()) {
      if (typeof showToast === 'function') {
        showToast('O App do Garçom já está instalado em tela cheia!', '#10b981');
      } else {
        alert('O App do Garçom já está instalado neste aparelho!');
      }
      return;
    }

    // Caso o browser não suporte beforeinstallprompt nativo (Chrome antigo, Firefox etc.)
    if (typeof showToast === 'function') {
      showToast('Toque no menu (3 pontinhos) e escolha "Adicionar à tela inicial"', '#3b82f6');
    } else {
      alert('Para instalar: Toque nos 3 pontinhos do navegador e escolha "Adicionar à tela inicial".');
    }
  };

  // Ajuda para iOS Safari
  function exibirModalAjudaIOS() {
    if (document.getElementById('pwa-ios-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'pwa-ios-modal';
    modal.className = 'pwa-ios-modal';
    modal.innerHTML = `
      <div class="pwa-ios-card">
        <div style="font-size: 32px; margin-bottom: 8px;">📲</div>
        <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Instalar no iPhone / iPad</h3>
        <p style="font-size: 13px; color: #cbd5e1; line-height: 1.4; margin-bottom: 16px;">
          1. Toque no botão de <strong>Compartilhar</strong> (ícone do quadrado com a seta para cima <i class="ph-bold ph-export"></i> na barra do Safari).<br><br>
          2. Role para baixo e selecione <strong>"Adicionar à Tela de Início"</strong>.
        </p>
        <button type="button" onclick="document.getElementById('pwa-ios-modal').remove()" style="width: 100%; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 12px; font-weight: bold; font-size: 14px; cursor: pointer;">
          Entendi
        </button>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
  }

  // Inicialização principal
  function initPWA() {
    injetarEstilosPWA();

    if (isStandalone()) {
      document.documentElement.classList.add('pwa-standalone');
      document.body.classList.add('pwa-standalone');
      console.log('📱 [PWA Garçom] Executando em modo Standalone nativo.');
    } else {
      criarBannerDOM();
    }

    // Captura o evento nativo de instalação do Chrome/Android
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      console.log('💡 [PWA Garçom] beforeinstallprompt capturado com sucesso.');

      // Exibe botão no cabeçalho
      const btn = document.getElementById('btn-pwa-install');
      if (btn) btn.style.display = 'inline-flex';

      // Exibe banner flutuante
      exibirBannerSeApropriado();
    });

    // Quando o app é instalado com sucesso
    window.addEventListener('appinstalled', () => {
      console.log('🎉 [PWA Garçom] Aplicativo instalado no dispositivo!');
      deferredPrompt = null;
      window.fecharBannerPWA();
      const btn = document.getElementById('btn-pwa-install');
      if (btn) btn.style.display = 'none';
      if (typeof showToast === 'function') {
        showToast('App Garçom instalado com sucesso!', '#10b981');
      }
    });

    registrarServiceWorker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPWA);
  } else {
    initPWA();
  }
})();
