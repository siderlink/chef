const fs = require('fs');

const cssRules = `
/* ══════════════════════════════════════════════════════════════════════
   CHEF COZINHA — REFINAMENTO DEFINITIVO DO LAYOUT DO CAIXA (DARK & LIGHT)
   1. Eliminação total de bolhas/cards soltos no dock lateral esquerdo em mini mode
   2. Eliminação total de rolagem horizontal e cortes laterais no painel central (#main-panel)
   3. Garantia de proporção saudável e equilíbrio em qualquer resolução (incluindo 575px / tablets / monitores retrato)
   ══════════════════════════════════════════════════════════════════════ */

/* ── 1. DOCK LATERAL ESQUERDO COMPACTO / MINI (ESTILO TRILHO SLEEK / APPLE) ── */
#left-panel.mode-mini,
#left-panel.sidebar-mini,
#left-panel.dock-icon-only,
.left-actions.mode-mini,
.left-actions.sidebar-mini,
.left-actions.dock-icon-only,
#left-panel[style*="width: 58px"],
#left-panel[style*="width: 68px"],
#left-panel[style*="width: 60px"],
#left-panel[style*="width: 56px"] {
  width: 58px !important;
  min-width: 58px !important;
  max-width: 58px !important;
  flex: 0 0 58px !important;
  padding: 6px 3px !important;
  box-sizing: border-box !important;
  overflow-x: hidden !important;
  background: var(--surface-sidebar, #0b1120) !important;
  border-right: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08)) !important;
}

[data-theme="light"] #left-panel.mode-mini,
[data-theme="light"] #left-panel.sidebar-mini,
html[data-theme="light"] #left-panel.mode-mini,
body:not(.dark-mode) #left-panel.mode-mini {
  background: #ffffff !important;
  border-right: 1px solid #e2e8f0 !important;
}

/* Neutraliza backgrounds de bolhas/cards soltos em TODOS os temas e especificidades */
html[data-theme="dark"] #left-panel.mode-mini .action-group,
html[data-theme="dark"] #left-panel.sidebar-mini .action-group,
html[data-theme="dark"] #left-panel.dock-icon-only .action-group,
html[data-theme="dark"] .left-actions.mode-mini .action-group,
html[data-theme="dark"] .left-actions.sidebar-mini .action-group,
html[data-theme="dark"] .left-actions.dock-icon-only .action-group,
body.dark-mode #left-panel.mode-mini .action-group,
body.dark-mode #left-panel.sidebar-mini .action-group,
body.dark-mode #left-panel.dock-icon-only .action-group,
body.dark-mode .left-actions.mode-mini .action-group,
body.dark-mode .left-actions.sidebar-mini .action-group,
body.theme-dark #left-panel.mode-mini .action-group,
body.theme-dark .left-actions.mode-mini .action-group,
html[data-theme="light"] #left-panel.mode-mini .action-group,
html[data-theme="light"] .left-actions.mode-mini .action-group,
body:not(.dark-mode) #left-panel.mode-mini .action-group,
body:not(.dark-mode) .left-actions.mode-mini .action-group,
#left-panel.mode-mini .action-group,
#left-panel.sidebar-mini .action-group,
#left-panel.dock-icon-only .action-group,
.left-actions.mode-mini .action-group,
.left-actions.sidebar-mini .action-group,
.left-actions.dock-icon-only .action-group,
#left-panel[style*="width: 58px"] .action-group,
#left-panel[style*="width: 68px"] .action-group {
  background: transparent !important;
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  padding: 0 !important;
  margin: 3px 0 !important;
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  gap: 4px !important;
}

#left-panel.mode-mini .group-title,
.left-actions.mode-mini .group-title,
#left-panel.sidebar-mini .group-title,
.left-actions.sidebar-mini .group-title,
#left-panel.dock-icon-only .group-title,
.left-actions.dock-icon-only .group-title,
#left-panel[style*="width: 58px"] .group-title,
#left-panel[style*="width: 68px"] .group-title {
  display: none !important;
}

/* Botões do modo mini: ícones elegantes 42x42 com cantos arredondados */
#left-panel.mode-mini .btn-action,
.left-actions.mode-mini .btn-action,
#left-panel.sidebar-mini .btn-action,
.left-actions.sidebar-mini .btn-action,
#left-panel.dock-icon-only .btn-action,
.left-actions.dock-icon-only .btn-action,
#left-panel.mode-mini .btn-grid-2 > .btn-action,
.left-actions.mode-mini .btn-grid-2 > .btn-action,
#left-panel[style*="width: 58px"] .btn-action,
#left-panel[style*="width: 68px"] .btn-action {
  width: 42px !important;
  height: 42px !important;
  min-width: 42px !important;
  min-height: 42px !important;
  max-width: 42px !important;
  max-height: 42px !important;
  padding: 0 !important;
  margin: 2px auto !important;
  border-radius: 10px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 0 !important;
  line-height: 0 !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  background: rgba(255, 255, 255, 0.04) !important;
  color: #94a3b8 !important;
  box-shadow: none !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}

#left-panel.mode-mini .btn-action:hover,
.left-actions.mode-mini .btn-action:hover {
  background: rgba(255, 255, 255, 0.12) !important;
  color: #ffffff !important;
  transform: scale(1.06) !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
}

html[data-theme="light"] #left-panel.mode-mini .btn-action,
html[data-theme="light"] .left-actions.mode-mini .btn-action,
body:not(.dark-mode) #left-panel.mode-mini .btn-action {
  border-color: #e2e8f0 !important;
  background: #ffffff !important;
  color: #334155 !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06) !important;
}

html[data-theme="light"] #left-panel.mode-mini .btn-action:hover,
html[data-theme="light"] .left-actions.mode-mini .btn-action:hover {
  background: #f1f5f9 !important;
  color: #0f172a !important;
  transform: scale(1.06) !important;
}

#left-panel.mode-mini .btn-action i,
.left-actions.mode-mini .btn-action i {
  font-size: 20px !important;
  line-height: 1 !important;
  margin: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* Botão Restaurar Ordem dos Botões em modo mini */
#left-panel.mode-mini #btn-reset-sidebar-order,
#left-panel.mode-mini .btn-reset-order,
.left-actions.mode-mini #btn-reset-sidebar-order,
.left-actions.mode-mini .btn-reset-order,
#left-panel[style*="width: 58px"] #btn-reset-sidebar-order,
#left-panel[style*="width: 68px"] #btn-reset-sidebar-order {
  width: 42px !important;
  height: 42px !important;
  min-width: 42px !important;
  min-height: 42px !important;
  font-size: 0 !important;
  line-height: 0 !important;
  padding: 0 !important;
  margin: 6px auto !important;
  border-radius: 10px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

#left-panel.mode-mini #btn-reset-sidebar-order i,
#left-panel.mode-mini .btn-reset-order i,
.left-actions.mode-mini #btn-reset-sidebar-order i,
.left-actions.mode-mini .btn-reset-order i {
  font-size: 18px !important;
  margin: 0 !important;
}

/* Controles de topo da barra esquerda em modo mini */
#left-panel.mode-mini .sidebar-header-controls,
.left-actions.mode-mini .sidebar-header-controls {
  width: 100% !important;
  padding: 4px 0 !important;
  margin-bottom: 6px !important;
  display: flex !important;
  justify-content: center !important;
  border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08)) !important;
}

#left-panel.mode-mini .sidebar-header-controls span,
.left-actions.mode-mini .sidebar-header-controls span {
  display: none !important;
}

#left-panel.mode-mini .sidebar-header-controls > div,
.left-actions.mode-mini .sidebar-header-controls > div {
  flex-direction: column !important;
  align-items: center !important;
  gap: 3px !important;
  border-bottom: none !important;
  padding: 0 !important;
  margin: 0 !important;
}

#left-panel.mode-mini .sidebar-ctrl-btn,
.left-actions.mode-mini .sidebar-ctrl-btn {
  width: 28px !important;
  height: 28px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 13px !important;
}

/* ── 2. PROTEÇÃO ABSOLUTA CONTRA CORTE LATERAL NO PAINEL CENTRAL (#main-panel) ── */
#main-panel,
.main-workspace {
  flex: 1 1 0% !important;
  min-width: 0 !important;
  width: auto !important;
  max-width: 100% !important;
  overflow-x: clip !important;
  overflow-y: hidden !important;
  position: relative !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}

#mesas-section-container,
.mesas-container {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  overflow-x: clip !important;
}

.mesas-header {
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  flex-wrap: wrap !important;
  gap: 6px !important;
  overflow-x: hidden !important;
}

.mesas-scroll,
#orders-grid {
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  grid-template-columns: repeat(auto-fill, minmax(115px, 1fr)) !important;
  gap: 8px !important;
  padding: 8px !important;
}

.mesa-item {
  min-width: 0 !important;
  box-sizing: border-box !important;
}

#products-section-container,
.products-container {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  overflow-x: clip !important;
}

table.products-table,
#order-items-table {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  table-layout: auto !important;
}

.products-table-wrapper {
  width: 100% !important;
  max-width: 100% !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  box-sizing: border-box !important;
}

.mobile-mesa-info-card,
#mobile-mesa-info-card {
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  min-width: 0 !important;
}

/* ── 3. RESPIRO E SAÚDE DO LAYOUT EM TELAS ESTREITAS (< 900px / 575px) ── */
@media (max-width: 900px) {
  #right-panel {
    width: var(--right-sidebar-width, 220px) !important;
    min-width: 180px !important;
    max-width: 250px !important;
    flex-shrink: 1 !important;
    padding: 12px 10px !important;
  }
}
`;

const filesToAppend = [
  'style.css',
  'src/css/style.css',
  'caixa-pro-ux.css',
  'public/caixa-pro-ux.css'
];

filesToAppend.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    // Remove previous block if present to avoid duplication
    const marker = '/* ══════════════════════════════════════════════════════════════════════\r\n   CHEF COZINHA — REFINAMENTO DEFINITIVO DO LAYOUT DO CAIXA';
    const markerLF = '/* ══════════════════════════════════════════════════════════════════════\n   CHEF COZINHA — REFINAMENTO DEFINITIVO DO LAYOUT DO CAIXA';
    const idx = content.indexOf('CHEF COZINHA — REFINAMENTO DEFINITIVO DO LAYOUT DO CAIXA');
    if (idx !== -1) {
      // Find comment start
      const start = content.lastIndexOf('/*', idx);
      content = content.substring(0, start);
    }
    content = content.trimEnd() + '\n\n' + cssRules.trim() + '\n';
    fs.writeFileSync(f, content, 'utf8');
    console.log('Appended layout refinement to:', f);
  }
});
