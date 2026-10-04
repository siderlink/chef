/**
 * scripts/apply-pos-layout-master-fix.js
 * Restaura o visual de alta qualidade do Caixa PDV com layout saudável, flexível e configurável pelo colaborador.
 */

const fs = require('fs');

const MASTER_CHEF_CSS = `
/* ═════════════════════════════════════════════════════════════════════════
   CHEF COZINHA — REFINAMENTO DEFINITIVO DO LAYOUT DO CAIXA (DARK & LIGHT)
   ═════════════════════════════════════════════════════════════════════════ */

/* ── 1. MODO MONITOR VERTICAL (PIVOT / RETRATO) ── */
body.chef-monitor-vertical:not(.chef-vertical-2col) .workspace {
  display: grid !important;
  grid-template-columns: 58px 1fr !important;
  grid-template-rows: 1fr auto !important;
  height: 100% !important;
  max-height: 100% !important;
  width: 100% !important;
  overflow: hidden !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col).left-expanded .workspace {
  grid-template-columns: 220px 1fr !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) #left-panel {
  grid-column: 1 !important;
  grid-row: 1 / span 2 !important;
  height: 100% !important;
  overflow-y: auto !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) #main-panel {
  grid-column: 2 !important;
  grid-row: 1 !important;
  height: 100% !important;
  min-height: 0 !important;
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) #resizer-left,
body.chef-monitor-vertical:not(.chef-vertical-2col) #resizer-right,
body.chef-monitor-vertical:not(.chef-vertical-2col) .chef-sidebar-splitter {
  display: none !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) #right-panel,
body.chef-monitor-vertical:not(.chef-vertical-2col) aside.right-info,
body.chef-monitor-vertical:not(.chef-vertical-2col) .right-info {
  grid-column: 2 !important;
  grid-row: 2 !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 100% !important;
  height: auto !important;
  max-height: 180px !important;
  border-left: none !important;
  border-top: 2px solid var(--border-color, #e2e8f0) !important;
  background: var(--bg-card, #ffffff) !important;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08) !important;
  padding: 8px 16px !important;
  z-index: 50 !important;
  overflow-y: auto !important;
  display: flex !important;
  flex-direction: column !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) #right-panel .sidebar-header-controls {
  display: none !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) #inner-right-panel {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 12px !important;
  flex-wrap: nowrap !important;
  width: 100% !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) #inner-right-panel .info-group.summary {
  flex: 1 1 auto !important;
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)) !important;
  gap: 4px 12px !important;
  padding: 8px 12px !important;
  margin-bottom: 0 !important;
  background: var(--bg-secondary, #f8fafc) !important;
  border-radius: 12px !important;
  border: 1px solid var(--border-color, #e2e8f0) !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) #inner-right-panel .info-group.summary .group-title {
  display: none !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) #inner-right-panel .info-group.summary .info-row {
  margin-bottom: 2px !important;
  font-size: 12px !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) #inner-right-panel .info-group.summary .info-row.bold:has(#total-pagar-text),
body.chef-monitor-vertical:not(.chef-vertical-2col) #inner-right-panel .info-group.summary .info-row:has(#total-pagar-text) {
  grid-column: 1 / -1 !important;
  border-top: 1px dashed #cbd5e1 !important;
  padding-top: 4px !important;
  margin-top: 2px !important;
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) #total-pagar-text {
  font-size: 20px !important;
  font-weight: 800 !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) .checkout-sticky-footer {
  position: static !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  flex: 0 0 190px !important;
  display: flex !important;
  align-items: center !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) .checkout-sticky-footer .info-group {
  width: 100% !important;
}

body.chef-monitor-vertical:not(.chef-vertical-2col) #btn-finalizar-venda {
  width: 100% !important;
  height: 48px !important;
  min-height: 48px !important;
  font-size: 15px !important;
  font-weight: 800 !important;
  border-radius: 12px !important;
  box-shadow: 0 4px 14px rgba(58, 181, 91, 0.35) !important;
}

/* ── 2. MODO DESKTOP 3-COLUNAS (SEM ESMAGAMENTO E COM SCROLL SUAVE EM TELAS ESTREITAS) ── */
body:not(.chef-monitor-vertical):not(.force-mobile) .workspace {
  display: flex !important;
  flex-direction: row !important;
  flex: 1 1 auto !important;
  height: 100% !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
}

body:not(.chef-monitor-vertical):not(.force-mobile) #left-panel {
  flex-shrink: 0 !important;
}

body:not(.chef-monitor-vertical):not(.force-mobile) #main-panel {
  flex: 1 1 auto !important;
  min-width: 440px !important;
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

body:not(.chef-monitor-vertical):not(.force-mobile) #right-panel {
  flex: 0 0 var(--right-sidebar-width, 280px) !important;
  min-width: 250px !important;
  max-width: 340px !important;
  height: 100% !important;
  overflow-y: auto !important;
  flex-shrink: 0 !important;
}

/* ── 3. CONTENÇÃO DO PAINEL PRINCIPAL (#main-panel) ── */
#main-panel,
.main-workspace {
  min-width: 0 !important;
  overflow-x: clip !important;
}

#mesas-section-container,
.mesas-container {
  overflow-x: clip !important;
}

/* ── 4. MINI DOCK ESQUERDA (58px RAIL SEM CARDS/BOLHAS) ── */
#left-panel.mode-mini,
#left-panel.sidebar-mini,
#left-panel.dock-icon-only,
.left-actions.mode-mini,
.left-actions.sidebar-mini,
.left-actions.dock-icon-only {
  width: 58px !important;
  min-width: 58px !important;
  max-width: 58px !important;
  flex: 0 0 58px !important;
  padding: 6px 3px !important;
  box-sizing: border-box !important;
  overflow-x: hidden !important;
}

html[data-theme="dark"] #left-panel.mode-mini .action-group,
body.dark-mode #left-panel.mode-mini .action-group,
#left-panel.mode-mini .action-group,
.left-actions.mode-mini .action-group {
  background: transparent !important;
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  margin: 3px 0 !important;
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
}

#left-panel.mode-mini .group-title,
.left-actions.mode-mini .group-title,
#left-panel.mode-mini .btn-action span,
.left-actions.mode-mini .btn-action span {
  display: none !important;
}

#left-panel.mode-mini .btn-action,
.left-actions.mode-mini .btn-action {
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
}

#left-panel.mode-mini .btn-action i,
.left-actions.mode-mini .btn-action i {
  font-size: 20px !important;
  margin: 0 !important;
}

#left-panel.mode-mini #btn-reset-sidebar-order,
#left-panel.mode-mini .btn-reset-order,
.left-actions.mode-mini #btn-reset-sidebar-order,
.left-actions.mode-mini .btn-reset-order {
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
  overflow: hidden !important;
}

#left-panel.mode-mini #btn-reset-sidebar-order i,
#left-panel.mode-mini .btn-reset-order i,
.left-actions.mode-mini #btn-reset-sidebar-order i,
.left-actions.mode-mini .btn-reset-order i {
  font-size: 18px !important;
  margin: 0 !important;
  display: block !important;
}

/* ── 5. MESAS: GRADE INTELIGENTE QUE NUNCA TRUNCA EM 'Mes...' ── */
.mesas-scroll,
#orders-grid {
  grid-template-columns: repeat(auto-fill, minmax(115px, 1fr)) !important;
}

.mesas-grid-layout,
#orders-grid .mesas-grid-layout {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)) !important;
  gap: 8px !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

.mesa-item {
  min-width: 125px !important;
  box-sizing: border-box !important;
  border-radius: 12px !important;
  padding: 8px 10px !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: space-between !important;
  cursor: pointer !important;
  transition: transform 0.15s ease, box-shadow 0.15s ease !important;
}

.mesa-item:hover {
  transform: translateY(-2px) !important;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

.mesa-header-info {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  width: 100% !important;
  margin-bottom: 4px !important;
}

.mesa-id {
  font-size: 14px !important;
  font-weight: 800 !important;
  white-space: nowrap !important;
}

.mesa-client {
  font-size: 11.5px !important;
  color: var(--text-secondary, #64748b) !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.mesa-value {
  font-size: 14px !important;
  font-weight: 800 !important;
  color: #10b981 !important;
  margin-top: 4px !important;
}

/* ── 6. TABELA DE ITENS (ABAIXO DO SPLITTER) — SEM CORTE LATERAL ── */
#products-section-container,
.products-container {
  flex: 1 1 auto !important;
  width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

.products-table-wrapper {
  flex: 1 1 auto !important;
  width: 100% !important;
  box-sizing: border-box !important;
  overflow-x: auto !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch !important;
}

table.products-table,
#order-items-table {
  width: 100% !important;
  min-width: 460px !important;
  table-layout: auto !important;
  border-collapse: collapse !important;
}

.mobile-mesa-info-card,
#mobile-mesa-info-card {
  width: 100% !important;
  box-sizing: border-box !important;
}

/* ── 7. BARRAS SUPERIOR E INFERIOR — ZERO QUEBRAS / MULTILINHA ── */
.top-menubar {
  display: flex !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  white-space: nowrap !important;
  height: 40px !important;
  min-height: 40px !important;
  max-height: 40px !important;
  align-items: center !important;
}
.top-menubar::-webkit-scrollbar { display: none !important; }

.top-toolbar {
  display: flex !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  white-space: nowrap !important;
  height: 44px !important;
  min-height: 44px !important;
  max-height: 44px !important;
  align-items: center !important;
}
.top-toolbar::-webkit-scrollbar { display: none !important; }

.status-bar {
  display: flex !important;
  flex-wrap: nowrap !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  white-space: nowrap !important;
  height: 36px !important;
  min-height: 36px !important;
  max-height: 36px !important;
  align-items: center !important;
  justify-content: space-between !important;
}
.status-bar::-webkit-scrollbar { display: none !important; }
`;

function patchCssFiles() {
  ['style.css', 'src/css/style.css', 'caixa-pro-ux.css', 'public/caixa-pro-ux.css'].forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    let css = fs.readFileSync(filePath, 'utf8');

    const mark = '/* ═════════════════════════════════════════════════════════════════════════\n   CHEF COZINHA — REFINAMENTO DEFINITIVO DO LAYOUT DO CAIXA';
    const markCRLF = '/* ═════════════════════════════════════════════════════════════════════════\r\n   CHEF COZINHA — REFINAMENTO DEFINITIVO DO LAYOUT DO CAIXA';
    const oldMark = '/* ══════════════════════════════════════════════════════════════════════\n   CHEF COZINHA — REFINAMENTO DEFINITIVO DO LAYOUT DO CAIXA';
    const oldMarkCRLF = '/* ══════════════════════════════════════════════════════════════════════\r\n   CHEF COZINHA — REFINAMENTO DEFINITIVO DO LAYOUT DO CAIXA';

    let cutPoint = css.indexOf(mark);
    if (cutPoint === -1) cutPoint = css.indexOf(markCRLF);
    if (cutPoint === -1) cutPoint = css.indexOf(oldMark);
    if (cutPoint === -1) cutPoint = css.indexOf(oldMarkCRLF);

    if (cutPoint !== -1) {
      css = css.substring(0, cutPoint);
    }

    css = css.trim() + '\n\n' + MASTER_CHEF_CSS + '\n';
    fs.writeFileSync(filePath, css, 'utf8');
    console.log(`[OK] Successfully patched CSS rules in ${filePath}`);
  });
}

function patchCustomizer() {
  ['chef-layout-customizer.js', 'public/chef-layout-customizer.js'].forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    let js = fs.readFileSync(filePath, 'utf8');

    js = js.replace(/monitor_vertical_modo:\s*'disabled'/g, "monitor_vertical_modo: 'auto'");

    const regexVMode = /var vMode = cfg\.monitor_vertical_modo[\s\S]*?isVert = isPortrait && h >= 680 && w < 640;[\s\S]*?document\.body\.classList\.toggle\('chef-monitor-vertical'/;
    const replacementVMode = `var vMode = cfg.monitor_vertical_modo || localStorage.getItem('chef_monitor_vertical_mode') || 'auto';
    var isPortrait = (window.innerHeight || 0) >= (window.innerWidth || 1);
    var h = window.innerHeight || 0;
    var w = window.innerWidth || 0;
    var isVert = false;
    if (vMode === 'stacked' || vMode === '2col') {
      isVert = true;
    } else if (vMode === 'auto') {
      isVert = (isPortrait && h >= 580 && w < 850) || (w < 680);
    } else {
      isVert = false;
    }

    document.body.classList.toggle('chef-monitor-vertical'`;

    if (regexVMode.test(js)) {
      js = js.replace(regexVMode, replacementVMode);
    }

    fs.writeFileSync(filePath, js, 'utf8');
    console.log(`[OK] Successfully updated customizer in ${filePath}`);
  });
}

function bumpIndexHtml() {
  const indexPath = 'index.html';
  if (!fs.existsSync(indexPath)) return;
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace(/\?v=2026\d+[a-z0-9]*/g, '?v=20261004v4');
  html = html.replace(/href="\/style\.css"/g, 'href="/style.css?v=20261004v4"');
  html = html.replace(/href="\/responsive-native\.css"/g, 'href="/responsive-native.css?v=20261004v4"');
  html = html.replace(/href="\/device-adapters\.css"/g, 'href="/device-adapters.css?v=20261004v4"');
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log(`[OK] Cache-busted links in ${indexPath}`);
}

patchCssFiles();
patchCustomizer();
bumpIndexHtml();
console.log('[COMPLETE] Master layout fix applied cleanly!');
