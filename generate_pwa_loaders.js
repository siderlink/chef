const fs = require('fs');

const appConfigs = {
  garcom: {
    id: 'garcom',
    manifest: '/manifest-garcom.json',
    name: 'Chef Sync — Garçom',
    shortName: 'Garçom',
    description: 'Atendimento de salão, mesas e comandas',
    file: 'garcom.html',
    color: '#f59e0b',
    colorLight: 'rgba(245, 158, 11, 0.15)',
    colorGlow: 'rgba(245, 158, 11, 0.3)',
    icon: 'ph-notebook',
    shortcutTips: 'Ideal para smartphones de garçons e atendentes de salão.'
  },
  cozinha: {
    id: 'cozinha',
    manifest: '/manifest-cozinha.json',
    name: 'Chef Sync — KDS Cozinha',
    shortName: 'KDS Cozinha',
    description: 'Fila de pedidos, esteira e expedição',
    file: 'fila-pedidos.html',
    color: '#ef4444',
    colorLight: 'rgba(239, 68, 68, 0.15)',
    colorGlow: 'rgba(239, 68, 68, 0.3)',
    icon: 'ph-cooking-pot',
    shortcutTips: 'Ideal para tablets e monitores de parede na cozinha.'
  },
  motoboy: {
    id: 'motoboy',
    manifest: '/manifest-motoboy.json',
    name: 'Chef Sync — Motoboy',
    shortName: 'Motoboy',
    description: 'Entregas, GPS e comprovantes de rota',
    file: 'motoboy.html',
    color: '#22c55e',
    colorLight: 'rgba(34, 197, 94, 0.15)',
    colorGlow: 'rgba(34, 197, 94, 0.3)',
    icon: 'ph-motorcycle',
    shortcutTips: 'Ideal para celulares de motoboys e entregadores de delivery.'
  },
  pdv: {
    id: 'pdv',
    manifest: '/manifest-pdv.json',
    name: 'Chef Sync — PDV Mobile',
    shortName: 'PDV Mobile',
    description: 'Frente de caixa móvel e pagamentos',
    file: 'pdv-mobile.html',
    color: '#fc4b15',
    colorLight: 'rgba(252, 75, 21, 0.15)',
    colorGlow: 'rgba(252, 75, 21, 0.3)',
    icon: 'ph-storefront',
    shortcutTips: 'Ideal para terminais de atendimento balcão e caixas volantes.'
  },
  gerente: {
    id: 'gerente',
    manifest: '/manifest-gerente.json',
    name: 'Chef Sync — Painel Gerencial',
    shortName: 'Painel Dono',
    description: 'Cockpit do gestor, KPIs e financeiro',
    file: 'painel-dono.html',
    color: '#8b5cf6',
    colorLight: 'rgba(139, 92, 246, 0.15)',
    colorGlow: 'rgba(139, 92, 246, 0.3)',
    icon: 'ph-chart-line-up',
    shortcutTips: 'Ideal para o celular ou tablet do proprietário e gerente.'
  }
};

function renderPwaHtml(appKey, isUniversalLoader = false) {
  const currentApp = appConfigs[appKey] || appConfigs.garcom;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="${currentApp.color}">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="${currentApp.shortName}">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="format-detection" content="telephone=no">
  <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png">
  <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
  <link rel="icon" href="/icon.ico">
  <title>${currentApp.name}</title>
  
  <link rel="manifest" href="${currentApp.manifest}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/vendor/phosphor/src/bold/style.css">
  <link rel="stylesheet" href="/vendor/phosphor/src/fill/style.css">

  <style>
    :root {
      --primary: ${currentApp.color};
      --primary-light: ${currentApp.colorLight};
      --primary-glow: ${currentApp.colorGlow};
      --bg: #0b0f19;
      --card: #121927;
      --card-hover: #182235;
      --border: rgba(255, 255, 255, 0.08);
      --border-focus: ${currentApp.color};
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --safe-top: env(safe-area-inset-top, 0px);
      --safe-bottom: env(safe-area-inset-bottom, 0px);
      --safe-left: env(safe-area-inset-left, 0px);
      --safe-right: env(safe-area-inset-right, 0px);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }

    html, body {
      width: 100%;
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      overflow: hidden;
      touch-action: manipulation;
      overscroll-behavior: none;
    }

    /* Container Principal */
    #app-container {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ═══════════════════════════════════════════════
       TELA DE CONFIGURAÇÃO / SETUP INICIAL
       ═══════════════════════════════════════════════ */
    #setup-screen {
      position: absolute;
      inset: 0;
      z-index: 50;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: calc(var(--safe-top) + 24px) 20px calc(var(--safe-bottom) + 24px) 20px;
      overflow-y: auto;
      background: radial-gradient(circle at top center, rgba(30, 41, 59, 0.7) 0%, #0b0f19 75%);
    }

    .setup-wrapper {
      width: 100%;
      max-width: 380px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin: auto 0;
    }

    .app-brand-badge {
      width: 80px;
      height: 80px;
      border-radius: 24px;
      background: var(--primary-light);
      border: 2px solid var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      color: var(--primary);
      box-shadow: 0 12px 30px var(--primary-glow);
      margin-bottom: 20px;
      animation: pulse-gentle 3s infinite ease-in-out;
    }

    @keyframes pulse-gentle {
      0%, 100% { transform: scale(1); box-shadow: 0 12px 30px var(--primary-glow); }
      50% { transform: scale(1.04); box-shadow: 0 16px 40px var(--primary-glow); }
    }

    h1.app-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 6px;
      color: #ffffff;
    }

    p.app-desc {
      color: var(--text-muted);
      font-size: 0.95rem;
      line-height: 1.45;
      margin-bottom: 24px;
    }

    /* PWA Install Banner no Setup */
    .pwa-install-banner {
      display: none;
      width: 100%;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 20px;
      text-align: left;
      backdrop-filter: blur(10px);
    }

    .pwa-install-banner-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }

    .pwa-install-banner-header i {
      font-size: 20px;
      color: var(--primary);
    }

    .pwa-install-banner-header span {
      font-weight: 700;
      font-size: 0.95rem;
    }

    .pwa-install-banner p {
      font-size: 0.82rem;
      color: var(--text-muted);
      line-height: 1.35;
      margin-bottom: 12px;
    }

    .btn-install-pwa {
      width: 100%;
      background: #ffffff;
      color: #0b0f19;
      border: none;
      padding: 10px 16px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(255, 255, 255, 0.15);
      transition: 0.2s;
    }
    .btn-install-pwa:active { transform: scale(0.97); }

    /* Card de Conexão */
    .connection-card {
      width: 100%;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 20px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
      margin-bottom: 16px;
    }

    .input-field-group {
      text-align: left;
      margin-bottom: 16px;
    }

    .input-field-group label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .input-field-group input {
      width: 100%;
      background: rgba(15, 23, 42, 0.8);
      border: 1.5px solid var(--border);
      border-radius: 14px;
      padding: 16px;
      color: #ffffff;
      font-size: 1.15rem;
      font-weight: 600;
      font-family: 'Inter', monospace;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .input-field-group input:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 4px var(--primary-light);
    }

    .btn-primary-action {
      width: 100%;
      background: var(--primary);
      color: #ffffff;
      border: none;
      padding: 16px;
      border-radius: 14px;
      font-size: 1.05rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      box-shadow: 0 8px 20px var(--primary-glow);
      transition: transform 0.15s, filter 0.15s;
      margin-bottom: 12px;
    }

    .btn-primary-action:active {
      transform: scale(0.97);
      filter: brightness(0.9);
    }

    .btn-secondary-action {
      width: 100%;
      background: transparent;
      color: var(--text);
      border: 1.5px solid var(--border);
      padding: 14px;
      border-radius: 14px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.15s, border-color 0.15s;
    }

    .btn-secondary-action:active {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.2);
    }

    /* Container do Leitor QR Code */
    #qr-scanner-box {
      width: 100%;
      display: none;
      margin-top: 14px;
      border-radius: 16px;
      overflow: hidden;
      border: 2px solid var(--primary);
      background: #000000;
      position: relative;
    }

    #qr-reader-target {
      width: 100%;
    }

    /* ═══════════════════════════════════════════════
       TELA DE SPLASH / CARREGANDO
       ═══════════════════════════════════════════════ */
    #splash-loading {
      position: absolute;
      inset: 0;
      z-index: 40;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--bg);
      padding: 24px;
      text-align: center;
      transition: opacity 0.35s ease;
    }

    .splash-logo {
      width: 88px;
      height: 88px;
      border-radius: 26px;
      background: var(--primary-light);
      border: 2px solid var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 44px;
      color: var(--primary);
      margin-bottom: 24px;
      animation: pulse-gentle 2s infinite ease-in-out;
    }

    .splash-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.5rem;
      font-weight: 800;
      margin-bottom: 8px;
    }

    .splash-status {
      font-size: 0.95rem;
      color: var(--text-muted);
      margin-bottom: 28px;
    }

    .loading-bar-track {
      width: 220px;
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.1);
      overflow: hidden;
      position: relative;
    }

    .loading-bar-thumb {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 40%;
      background: var(--primary);
      border-radius: 3px;
      animation: indeterminate 1.5s infinite ease-in-out;
    }

    @keyframes indeterminate {
      0% { left: -40%; }
      50% { left: 40%; width: 50%; }
      100% { left: 100%; }
    }

    /* ═══════════════════════════════════════════════
       ERRO / TIMEOUT DE CONEXÃO
       ═══════════════════════════════════════════════ */
    #connection-error-screen {
      position: absolute;
      inset: 0;
      z-index: 45;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--bg);
      padding: 24px;
      text-align: center;
    }

    .error-card {
      width: 100%;
      max-width: 360px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
    }

    .error-icon {
      width: 64px;
      height: 64px;
      border-radius: 18px;
      background: rgba(239, 68, 68, 0.15);
      border: 2px solid var(--danger);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      color: var(--danger);
      margin: 0 auto 16px auto;
    }

    .error-card h3 {
      font-family: 'Outfit', sans-serif;
      font-size: 1.35rem;
      margin-bottom: 8px;
    }

    .error-card p {
      font-size: 0.9rem;
      color: var(--text-muted);
      line-height: 1.45;
      margin-bottom: 18px;
    }

    .diagnostic-list {
      text-align: left;
      background: rgba(0,0,0,0.25);
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 20px;
      font-size: 0.85rem;
      color: #cbd5e1;
    }

    .diagnostic-list li {
      list-style: none;
      margin-bottom: 6px;
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .diagnostic-list li:last-child { margin-bottom: 0; }
    .diagnostic-list li i { color: var(--warning); margin-top: 2px; }

    /* ═══════════════════════════════════════════════
       IFRAME WRAPPER (APP EM EXECUÇÃO)
       ═══════════════════════════════════════════════ */
    #app-frame {
      display: none;
      width: 100%;
      height: 100%;
      border: none;
      background: var(--bg);
      z-index: 10;
    }

    /* ═══════════════════════════════════════════════
       DOCK FLUTUANTE DE USABILIDADE (MOBILE ERGONÔMICO)
       ═══════════════════════════════════════════════ */
    #pwa-control-dock {
      position: fixed;
      top: calc(var(--safe-top) + 8px);
      right: calc(var(--safe-right) + 12px);
      z-index: 9999;
      display: none;
      align-items: center;
    }

    .dock-pill {
      background: rgba(18, 25, 39, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 30px;
      padding: 6px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      transition: transform 0.2s, background 0.2s;
    }
    .dock-pill:active { transform: scale(0.95); }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
    }
    .status-dot.offline { background: var(--danger); box-shadow: 0 0 8px var(--danger); }
    .status-dot.connecting { background: var(--warning); box-shadow: 0 0 8px var(--warning); }

    .dock-pill-label {
      font-size: 12px;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Bottom Sheet Modal de Controles do PWA */
    #control-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(6px);
      z-index: 10000;
      display: none;
      opacity: 0;
      transition: opacity 0.25s ease;
      align-items: flex-end;
      justify-content: center;
    }

    #control-sheet {
      width: 100%;
      max-width: 440px;
      background: var(--card);
      border-top-left-radius: 24px;
      border-top-right-radius: 24px;
      border: 1px solid var(--border);
      border-bottom: none;
      padding: 16px 20px calc(var(--safe-bottom) + 20px) 20px;
      transform: translateY(100%);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .sheet-handle {
      width: 40px;
      height: 4px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.2);
      margin: 0 auto 16px auto;
    }

    .sheet-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .sheet-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.25rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sheet-close-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .sheet-options-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 16px;
    }

    .sheet-action-card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
      cursor: pointer;
      color: var(--text);
      transition: 0.15s;
    }
    .sheet-action-card:active {
      transform: scale(0.96);
      background: var(--primary-light);
      border-color: var(--primary);
    }

    .sheet-action-card i {
      font-size: 24px;
      color: var(--primary);
    }

    .sheet-action-card span {
      font-size: 12px;
      font-weight: 600;
    }

    .sheet-server-info {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 12px;
      padding: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-muted);
    }

    /* ═══════════════════════════════════════════════
       TOAST DE STATUS OFFLINE / ONLINE
       ═══════════════════════════════════════════════ */
    #network-toast {
      position: fixed;
      top: calc(var(--safe-top) + 12px);
      left: 50%;
      transform: translateX(-50%) translateY(-100px);
      z-index: 10001;
      background: #1e293b;
      border: 1px solid var(--border);
      border-radius: 30px;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    }

    #network-toast.visible {
      transform: translateX(-50%) translateY(0);
    }

    #network-toast.toast-offline {
      background: #7f1d1d;
      border-color: #ef4444;
      color: #fecaca;
    }

    #network-toast.toast-online {
      background: #064e3b;
      border-color: #10b981;
      color: #a7f3d0;
    }
  </style>
</head>
<body>

  <div id="app-container">

    <!-- 1. TELA DE SETUP E CONFIGURAÇÃO -->
    <div id="setup-screen">
      <div class="setup-wrapper">
        <div class="app-brand-badge">
          <i class="ph-bold ${currentApp.icon}"></i>
        </div>

        <h1 class="app-title" id="app-title-text">${currentApp.name}</h1>
        <p class="app-desc" id="app-desc-text">${currentApp.description}</p>

        <!-- Banner de Instalação PWA (Nativo & iOS) -->
        <div id="install-banner" class="pwa-install-banner">
          <div class="pwa-install-banner-header">
            <i class="ph-bold ph-download-simple"></i>
            <span>Instalar Aplicativo Oficial</span>
          </div>
          <p id="install-banner-desc">Instale no seu celular para abrir direto na tela cheia, sem barra do navegador.</p>
          <button id="btn-trigger-install" class="btn-install-pwa" onclick="dispararInstalacaoPWA()">
            <i class="ph-bold ph-plus-circle"></i> Adicionar à Tela de Início
          </button>
        </div>

        <!-- Card de Conexão IP -->
        <div class="connection-card">
          <div class="input-field-group">
            <label for="server-ip">
              <span>Endereço IP do Servidor</span>
              <span style="font-size: 10px; color: var(--primary); text-transform:none;">Wi-Fi Local</span>
            </label>
            <input type="text" id="server-ip" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Ex: 192.168.1.100:3000">
          </div>

          <button class="btn-primary-action" onclick="conectarServidor()">
            <i class="ph-bold ph-plug"></i> Conectar e Iniciar
          </button>

          <button class="btn-secondary-action" id="btn-scan-qr" onclick="alternarScannerQR()">
            <i class="ph-bold ph-qr-code"></i> Escanear QR Code do Caixa
          </button>

          <!-- Leitor de Câmera QR Code -->
          <div id="qr-scanner-box">
            <div id="qr-reader-target"></div>
          </div>
        </div>

        <p style="font-size: 11px; color: #64748b; line-height: 1.4;">
          ${currentApp.shortcutTips}
        </p>
      </div>
    </div>

    <!-- 2. TELA DE SPLASH / CARREGAMENTO SUAVE -->
    <div id="splash-loading">
      <div class="splash-logo">
        <i class="ph-bold ${currentApp.icon}"></i>
      </div>
      <h2 class="splash-title">${currentApp.shortName}</h2>
      <p class="splash-status" id="splash-status-text">Conectando ao Chef Cozinha...</p>
      <div class="loading-bar-track">
        <div class="loading-bar-thumb"></div>
      </div>
    </div>

    <!-- 3. TELA DE ERRO & DIAGNÓSTICO -->
    <div id="connection-error-screen">
      <div class="error-card">
        <div class="error-icon">
          <i class="ph-bold ph-wifi-slash"></i>
        </div>
        <h3>Sem Resposta do Servidor</h3>
        <p id="error-card-msg">Não conseguimos nos comunicar com o servidor no endereço especificado.</p>

        <ul class="diagnostic-list">
          <li><i class="ph-bold ph-warning-circle"></i> O celular deve estar no mesmo Wi-Fi do computador.</li>
          <li><i class="ph-bold ph-warning-circle"></i> O sistema Chef Cozinha deve estar aberto no Caixa.</li>
        </ul>

        <button class="btn-primary-action" onclick="tentarNovamente()">
          <i class="ph-bold ph-arrow-clockwise"></i> Tentar Novamente
        </button>

        <button class="btn-secondary-action" onclick="reabrirConfiguracao()" style="margin-top: 8px;">
          <i class="ph-bold ph-gear"></i> Mudar Endereço IP / Re-escanear
        </button>
      </div>
    </div>

    <!-- 4. IFRAME WRAPPER -->
    <iframe id="app-frame" allow="geolocation; camera; microphone; fullscreen; clipboard-read; clipboard-write; wake-lock"></iframe>

    <!-- 5. DOCK FLUTUANTE DE USABILIDADE (MOBILE ERGONÔMICO) -->
    <div id="pwa-control-dock">
      <div class="dock-pill" onclick="abrirPainelControles()">
        <span class="status-dot" id="dock-status-dot"></span>
        <span class="dock-pill-label">
          <span>${currentApp.shortName}</span>
          <i class="ph-bold ph-dots-three-vertical"></i>
        </span>
      </div>
    </div>

    <!-- 6. MODAL BOTTOM SHEET DE CONTROLES -->
    <div id="control-modal-overlay" onclick="fecharPainelControles(event)">
      <div id="control-sheet" onclick="event.stopPropagation()">
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          <div class="sheet-title">
            <i class="ph-bold ph-sliders" style="color: var(--primary);"></i>
            <span>Painel do App</span>
          </div>
          <button class="sheet-close-btn" onclick="fecharPainelControles()"><i class="ph-bold ph-x"></i></button>
        </div>

        <div class="sheet-options-grid">
          <div class="sheet-action-card" onclick="recarregarIframe()">
            <i class="ph-bold ph-arrow-clockwise"></i>
            <span>Recarregar Tela</span>
          </div>

          <div class="sheet-action-card" onclick="alternarWakeLock()" id="btn-wake-lock">
            <i class="ph-bold ph-lightbulb" id="icon-wake-lock"></i>
            <span id="label-wake-lock">Manter Tela Ligada</span>
          </div>

          <div class="sheet-action-card" onclick="alternarTelaCheia()">
            <i class="ph-bold ph-corners-out"></i>
            <span>Tela Cheia</span>
          </div>

          <div class="sheet-action-card" onclick="reabrirConfiguracao()">
            <i class="ph-bold ph-gear"></i>
            <span>Mudar Servidor</span>
          </div>
        </div>

        <div class="sheet-server-info">
          <span>Servidor: <strong id="dock-ip-text" style="color: #fff;">-</strong></span>
          <span id="dock-latency-badge" style="color: var(--success); font-weight:700;">Conectado</span>
        </div>
      </div>
    </div>

    <!-- 7. TOAST NOTIFICAÇÃO OFFLINE/ONLINE -->
    <div id="network-toast">
      <i class="ph-bold ph-wifi-slash"></i>
      <span id="toast-msg">Sem conexão de rede</span>
    </div>

  </div>

  <script src="/vendor/html5-qrcode/html5-qrcode.min.js"></script>
  <script>
    /* ═══════════════════════════════════════════════
       LÓGICA DO PWA SHELL ULTRA ERGONÔMICO
       ═══════════════════════════════════════════════ */
    
    // Registro do Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw-loader.js').then(reg => {
          console.log('[PWA] Service Worker ativo:', reg.scope);
        }).catch(err => console.warn('[PWA] SW erro:', err));
      });
    }

    const appConfig = ${JSON.stringify(currentApp)};
    ${isUniversalLoader ? `
    // Suporte dinâmico caso seja o pwa-loader.html genérico
    const urlParams = new URLSearchParams(window.location.search);
    const queryApp = urlParams.get('app');
    const dynamicMap = ${JSON.stringify(appConfigs)};
    if (queryApp && dynamicMap[queryApp]) {
      Object.assign(appConfig, dynamicMap[queryApp]);
    }
    ` : ''}

    let deferredPrompt = null;
    let wakeLockSentinel = null;
    let html5QrScanner = null;
    let loadTimeoutTimer = null;

    // 1. Captura de Evento de Instalação PWA (Lighthouse / Chrome)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const banner = document.getElementById('install-banner');
      if (banner) banner.style.display = 'block';
    });

    // Detecta se é iOS para exibir dica de instalação apropriada
    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isIos && !isStandalone) {
      const banner = document.getElementById('install-banner');
      const bannerDesc = document.getElementById('install-banner-desc');
      const btnInstall = document.getElementById('btn-trigger-install');
      if (banner && bannerDesc && btnInstall) {
        banner.style.display = 'block';
        bannerDesc.innerHTML = 'No iPhone/iPad: Toque no botão <strong>Compartilhar <i class="ph-bold ph-export"></i></strong> e selecione <strong>"Adicionar à Tela de Início"</strong>.';
        btnInstall.style.display = 'none';
      }
    }

    function dispararInstalacaoPWA() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('[PWA] Usuário aceitou instalar');
            const banner = document.getElementById('install-banner');
            if (banner) banner.style.display = 'none';
          }
          deferredPrompt = null;
        });
      }
    }

    // 2. Monitoramento de Rede Online / Offline
    function showToast(msg, isOnline = true) {
      const toast = document.getElementById('network-toast');
      const toastMsg = document.getElementById('toast-msg');
      if (!toast || !toastMsg) return;

      toastMsg.innerText = msg;
      toast.className = isOnline ? 'visible toast-online' : 'visible toast-offline';
      toast.querySelector('i').className = isOnline ? 'ph-bold ph-wifi-high' : 'ph-bold ph-wifi-slash';

      setTimeout(() => {
        toast.classList.remove('visible');
      }, 3500);
    }

    window.addEventListener('online', () => {
      showToast('Conexão restabelecida!', true);
      document.getElementById('dock-status-dot').className = 'status-dot';
      document.getElementById('dock-latency-badge').innerText = 'Online';
      document.getElementById('dock-latency-badge').style.color = 'var(--success)';
    });

    window.addEventListener('offline', () => {
      showToast('Sem conexão Wi-Fi/Internet!', false);
      document.getElementById('dock-status-dot').className = 'status-dot offline';
      document.getElementById('dock-latency-badge').innerText = 'Offline';
      document.getElementById('dock-latency-badge').style.color = 'var(--danger)';
    });

    // 3. Inicialização e Carregamento Automático
    function init() {
      const savedIp = localStorage.getItem('chef_server_ip');
      const currentHost = window.location.host;

      if (savedIp) {
        document.getElementById('server-ip').value = savedIp;
        iniciarCarregamento(savedIp);
      } else if (currentHost && !currentHost.includes('localhost') && !currentHost.includes('127.0.0.1')) {
        document.getElementById('server-ip').value = currentHost;
        // Se abriu direto pelo IP da rede, inicia automaticamente
        iniciarCarregamento(currentHost);
      } else {
        document.getElementById('server-ip').value = currentHost || '';
      }
    }

    function conectarServidor() {
      let ip = document.getElementById('server-ip').value.trim();
      if (!ip) {
        document.getElementById('server-ip').focus();
        return;
      }
      ip = ip.replace(/^https?:\\/\\//, '');
      localStorage.setItem('chef_server_ip', ip);
      iniciarCarregamento(ip);
    }

    function iniciarCarregamento(ip) {
      document.getElementById('setup-screen').style.display = 'none';
      document.getElementById('connection-error-screen').style.display = 'none';

      const splash = document.getElementById('splash-loading');
      splash.style.display = 'flex';
      splash.style.opacity = '1';
      document.getElementById('splash-status-text').innerText = 'Carregando ' + appConfig.shortName + '...';

      const frame = document.getElementById('app-frame');
      frame.style.display = 'block';

      // Define timeout de 9 segundos para detectar servidor desligado / IP incorreto
      clearTimeout(loadTimeoutTimer);
      loadTimeoutTimer = setTimeout(() => {
        verificarFalhaCarregamento(ip);
      }, 9000);

      frame.onload = () => {
        clearTimeout(loadTimeoutTimer);
        // Sucesso no carregamento
        setTimeout(() => {
          splash.style.opacity = '0';
          setTimeout(() => {
            splash.style.display = 'none';
            document.getElementById('pwa-control-dock').style.display = 'flex';
            document.getElementById('dock-ip-text').innerText = ip;
          }, 350);
        }, 300);

        // Notificar servidor via Socket.io para registrar dispositivo
        registrarDispositivoNoCaixa(ip);
      };

      frame.src = 'http://' + ip + '/' + appConfig.file;
    }

    function verificarFalhaCarregamento(ip) {
      const splash = document.getElementById('splash-loading');
      splash.style.display = 'none';
      document.getElementById('app-frame').style.display = 'none';

      const errScreen = document.getElementById('connection-error-screen');
      document.getElementById('error-card-msg').innerText = 'Não conseguimos carregar o Chef Cozinha no endereço ' + ip + '.';
      errScreen.style.display = 'flex';
    }

    function tentarNovamente() {
      const ip = localStorage.getItem('chef_server_ip') || document.getElementById('server-ip').value.trim();
      if (ip) iniciarCarregamento(ip);
      else reabrirConfiguracao();
    }

    function reabrirConfiguracao() {
      clearTimeout(loadTimeoutTimer);
      fecharPainelControles();
      document.getElementById('app-frame').style.display = 'none';
      document.getElementById('app-frame').src = '';
      document.getElementById('splash-loading').style.display = 'none';
      document.getElementById('connection-error-screen').style.display = 'none';
      document.getElementById('pwa-control-dock').style.display = 'none';
      document.getElementById('setup-screen').style.display = 'flex';
    }

    function recarregarIframe() {
      fecharPainelControles();
      const frame = document.getElementById('app-frame');
      if (frame && frame.src) {
        showToast('Atualizando tela...', true);
        frame.contentWindow.location.reload();
      }
    }

    // 4. Scanner QR Code do Caixa
    function alternarScannerQR() {
      const box = document.getElementById('qr-scanner-box');
      const btn = document.getElementById('btn-scan-qr');

      if (box.style.display === 'block') {
        pararScannerQR();
        return;
      }

      box.style.display = 'block';
      btn.innerHTML = '<i class="ph-bold ph-x"></i> Fechar Câmera';

      if (!html5QrScanner) {
        html5QrScanner = new Html5Qrcode("qr-reader-target");
      }

      html5QrScanner.start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          pararScannerQR();
          try {
            let parsedIp = decodedText.trim();
            if (parsedIp.startsWith('http')) {
              const urlObj = new URL(parsedIp);
              parsedIp = urlObj.host;
            } else {
              parsedIp = parsedIp.replace(/^https?:\\/\\//, '');
            }
            document.getElementById('server-ip').value = parsedIp;
            conectarServidor();
          } catch(e) {
            document.getElementById('server-ip').value = decodedText.trim();
            conectarServidor();
          }
        },
        (errorMessage) => { /* frame vazio ignorado */ }
      ).catch((err) => {
        alert("Não foi possível acessar a câmera (" + err + "). Digite o IP manualmente.");
        pararScannerQR();
      });
    }

    function pararScannerQR() {
      const box = document.getElementById('qr-scanner-box');
      const btn = document.getElementById('btn-scan-qr');
      if (html5QrScanner) {
        html5QrScanner.stop().catch(() => {}).then(() => {
          box.style.display = 'none';
          btn.innerHTML = '<i class="ph-bold ph-qr-code"></i> Escanear QR Code do Caixa';
        });
      } else {
        box.style.display = 'none';
        btn.innerHTML = '<i class="ph-bold ph-qr-code"></i> Escanear QR Code do Caixa';
      }
    }

    // 5. Controles de Usabilidade: Wake Lock (Manter Tela Ligada)
    async function alternarWakeLock() {
      const icon = document.getElementById('icon-wake-lock');
      const label = document.getElementById('label-wake-lock');

      if ('wakeLock' in navigator) {
        if (!wakeLockSentinel) {
          try {
            wakeLockSentinel = await navigator.wakeLock.request('screen');
            wakeLockSentinel.addEventListener('release', () => {
              wakeLockSentinel = null;
              icon.style.color = 'var(--primary)';
              label.innerText = 'Manter Tela Ligada';
            });
            icon.style.color = 'var(--success)';
            label.innerText = 'Tela Ativa (Sem Dormir)';
            showToast('Modo Sem Dormir Ativado! Tela permanecerá ligada.', true);
          } catch (err) {
            showToast('Erro ao ativar Wake Lock: ' + err.message, false);
          }
        } else {
          wakeLockSentinel.release();
          wakeLockSentinel = null;
          icon.style.color = 'var(--primary)';
          label.innerText = 'Manter Tela Ligada';
          showToast('Modo normal restaurado.', true);
        }
      } else {
        showToast('Wake Lock não é suportado neste navegador.', false);
      }
    }

    // 6. Controles de Usabilidade: Tela Cheia
    function alternarTelaCheia() {
      fecharPainelControles();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    }

    // 7. Modal Bottom Sheet
    function abrirPainelControles() {
      const overlay = document.getElementById('control-modal-overlay');
      const sheet = document.getElementById('control-sheet');
      overlay.style.display = 'flex';
      setTimeout(() => {
        overlay.style.opacity = '1';
        sheet.style.transform = 'translateY(0)';
      }, 10);
    }

    function fecharPainelControles(e) {
      if (e && e.target !== e.currentTarget) return;
      const overlay = document.getElementById('control-modal-overlay');
      const sheet = document.getElementById('control-sheet');
      sheet.style.transform = 'translateY(100%)';
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 250);
    }

    // 8. Registro de Dispositivo via Socket
    function registrarDispositivoNoCaixa(ip) {
      let deviceId = localStorage.getItem('chef_device_id');
      if (!deviceId) {
        deviceId = 'pwa_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('chef_device_id', deviceId);
      }

      const script = document.createElement('script');
      script.src = 'http://' + ip + '/socket.io/socket.io.js';
      script.onload = () => {
        if (window.io) {
          const socket = io('http://' + ip, { reconnectionAttempts: 2, timeout: 3000 });
          socket.on('connect', () => {
            socket.emit('pwa_device_connected', {
              deviceId: deviceId,
              appName: appConfig.name,
              appId: appConfig.id,
              userAgent: navigator.userAgent
            });
            setTimeout(() => socket.disconnect(), 2000);
          });
        }
      };
      script.onerror = () => {};
      document.body.appendChild(script);
    }

    window.addEventListener('DOMContentLoaded', init);
  </script>
</body>
</html>
`;
}

// Generate each dedicated PWA HTML
for (const appKey of Object.keys(appConfigs)) {
  const html = renderPwaHtml(appKey, false);
  fs.writeFileSync(`pwa-${appKey}.html`, html, 'utf8');
  console.log(`Generated: pwa-${appKey}.html`);
}

// Generate the universal pwa-loader.html
const loaderHtml = renderPwaHtml('garcom', true);
fs.writeFileSync('pwa-loader.html', loaderHtml, 'utf8');
console.log('Generated: pwa-loader.html');
