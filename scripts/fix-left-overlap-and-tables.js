/**
 * scripts/fix-left-overlap-and-tables.js
 * Corrige o vazamento dos botões da barra esquerda sobre as mesas,
 * a sobreposição de cabeçalhos e a densidade excessiva dos cartões de mesa.
 */
const fs = require('fs');
const path = require('path');

function run() {
  console.log('🔧 Iniciando correção do vazamento da barra esquerda e grade de mesas...');

  // ─────────────────────────────────────────────────────────────
  // 1. Atualizar style.css e src/css/style.css
  // ─────────────────────────────────────────────────────────────
  ['style.css', 'src/css/style.css'].forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    let css = fs.readFileSync(filePath, 'utf8');

    // Regra mestre de isolamento e contenção da barra esquerda
    const leftPanelFix = `
/* ══════════════════════════════════════════════════════════════════
   BLINDAGEM TOTAL DA BARRA ESQUERDA (SEM VAZAMENTO SOBRE AS MESAS)
   ══════════════════════════════════════════════════════════════════ */
#left-panel,
.left-actions,
aside.left-actions {
  overflow-x: hidden !important;
  box-sizing: border-box !important;
  position: relative !important;
  z-index: 20 !important;
  background-color: var(--bg-card, #0f172a) !important;
}

#left-panel .panel-content-inner,
#inner-left-panel {
  overflow-x: hidden !important;
  width: 100% !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
}

#left-panel .sidebar-header-controls {
  overflow: hidden !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

/* Quando compacta (68px ou mode-mini), força modo de ícones puros sem vazar texto */
#left-panel.mode-mini,
#left-panel.sidebar-mini,
#left-panel.dock-icon-only,
#left-panel[style*="width: 68px"],
#left-panel[style*="width:68px"],
#left-panel[style*="width: 64px"],
#left-panel[style*="width:64px"] {
  width: 68px !important;
  min-width: 68px !important;
  max-width: 68px !important;
  padding: 8px 4px !important;
  overflow-x: hidden !important;
}

#left-panel.mode-mini .sidebar-header-controls span,
#left-panel.sidebar-mini .sidebar-header-controls span,
#left-panel.dock-icon-only .sidebar-header-controls span,
#left-panel[style*="width: 68px"] .sidebar-header-controls span,
#left-panel[style*="width:68px"] .sidebar-header-controls span {
  display: none !important;
}

#left-panel.mode-mini .sidebar-header-controls > div,
#left-panel.sidebar-mini .sidebar-header-controls > div,
#left-panel.dock-icon-only .sidebar-header-controls > div,
#left-panel[style*="width: 68px"] .sidebar-header-controls > div,
#left-panel[style*="width:68px"] .sidebar-header-controls > div {
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 3px !important;
}

#left-panel.mode-mini .group-title,
#left-panel.sidebar-mini .group-title,
#left-panel.dock-icon-only .group-title,
#left-panel[style*="width: 68px"] .group-title,
#left-panel[style*="width:68px"] .group-title {
  display: none !important;
}

#left-panel.mode-mini .btn-grid-2,
#left-panel.sidebar-mini .btn-grid-2,
#left-panel.dock-icon-only .btn-grid-2,
#left-panel[style*="width: 68px"] .btn-grid-2,
#left-panel[style*="width:68px"] .btn-grid-2 {
  display: flex !important;
  flex-direction: column !important;
  gap: 5px !important;
  width: 100% !important;
}

#left-panel.mode-mini .btn-action,
#left-panel.sidebar-mini .btn-action,
#left-panel.dock-icon-only .btn-action,
#left-panel[style*="width: 68px"] .btn-action,
#left-panel[style*="width:68px"] .btn-action {
  width: 48px !important;
  min-width: 48px !important;
  max-width: 48px !important;
  height: 44px !important;
  padding: 0 !important;
  margin: 2px auto !important;
  font-size: 0 !important;
  line-height: 0 !important;
  overflow: hidden !important;
}

#left-panel.mode-mini .btn-action i,
#left-panel.sidebar-mini .btn-action i,
#left-panel.dock-icon-only .btn-action i,
#left-panel[style*="width: 68px"] .btn-action i,
#left-panel[style*="width:68px"] .btn-action i {
  font-size: 22px !important;
  margin: 0 !important;
}

/* Em telas com largura menor que 900px, garante que a barra esquerda adote o modo mini visual */
@media (max-width: 900px) {
  #left-panel:not(.user-pinned-expanded) {
    width: 68px !important;
    min-width: 68px !important;
    max-width: 68px !important;
    padding: 8px 4px !important;
    overflow-x: hidden !important;
  }
  #left-panel:not(.user-pinned-expanded) .sidebar-header-controls span {
    display: none !important;
  }
  #left-panel:not(.user-pinned-expanded) .sidebar-header-controls > div {
    flex-direction: column !important;
    align-items: center !important;
    gap: 3px !important;
  }
  #left-panel:not(.user-pinned-expanded) .group-title {
    display: none !important;
  }
  #left-panel:not(.user-pinned-expanded) .btn-grid-2 {
    display: flex !important;
    flex-direction: column !important;
    gap: 5px !important;
    width: 100% !important;
  }
  #left-panel:not(.user-pinned-expanded) .btn-action {
    width: 48px !important;
    min-width: 48px !important;
    max-width: 48px !important;
    height: 44px !important;
    padding: 0 !important;
    margin: 2px auto !important;
    font-size: 0 !important;
    line-height: 0 !important;
    overflow: hidden !important;
  }
  #left-panel:not(.user-pinned-expanded) .btn-action i {
    font-size: 22px !important;
    margin: 0 !important;
  }

  /* Grade de mesas equilibrada (máximo 2 a 3 colunas legíveis em telas compactas) */
  #orders-grid .mesas-grid-layout,
  .mesas-grid-layout {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)) !important;
    gap: 8px !important;
  }
}
`;

    // Remove bloco anterior se existir
    if (css.includes('BLINDAGEM TOTAL DA BARRA ESQUERDA')) {
      css = css.replace(/\/\* ══════════════════════════════════════════════════════════════════\s*BLINDAGEM TOTAL DA BARRA ESQUERDA[\s\S]*?\}\s*\}\s*/, '');
    }
    // Remove o bloco @media (max-width: 900px) anterior adicionado pelo fix-summary-swallow
    css = css.replace(/@media \(max-width: 900px\) \{\s*body:not\(\.force-mobile\) #left-panel[\s\S]*?#main-panel \{[\s\S]*?\}\s*\}/g, '');

    css += leftPanelFix;
    fs.writeFileSync(filePath, css, 'utf8');
    console.log(`  ✅ ${filePath} atualizado.`);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Atualizar caixa-pro-ux.css (raiz, public/ e dist/)
  // ─────────────────────────────────────────────────────────────
  ['caixa-pro-ux.css', 'public/caixa-pro-ux.css', 'dist/caixa-pro-ux.css'].forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    let css = fs.readFileSync(filePath, 'utf8');

    // Remove o bloco @media (max-width: 900px) anterior
    css = css.replace(/\/\* ── ADAPTACAO RESPONSIVA DE RESUMO PARA TELAS ESTREITAS ── \*\/[\s\S]*?#main-panel \{[\s\S]*?\}\s*\}/g, '');

    const proUxLeftFix = `
/* ── BLINDAGEM DA BARRA ESQUERDA NO CAIXA PRO UX ── */
#left-panel,
.left-actions {
  overflow-x: hidden !important;
  box-sizing: border-box !important;
  background-color: var(--surface-sidebar, #0b1120) !important;
}

#left-panel .panel-content-inner,
#inner-left-panel {
  overflow-x: hidden !important;
  width: 100% !important;
  max-width: 100% !important;
}

@media (max-width: 900px) {
  #left-panel:not(.user-pinned-expanded) {
    width: 68px !important;
    min-width: 68px !important;
    max-width: 68px !important;
    padding: 8px 4px !important;
    overflow-x: hidden !important;
  }
  #left-panel:not(.user-pinned-expanded) .sidebar-header-controls span {
    display: none !important;
  }
  #left-panel:not(.user-pinned-expanded) .sidebar-header-controls > div {
    flex-direction: column !important;
    align-items: center !important;
    gap: 3px !important;
  }
  #left-panel:not(.user-pinned-expanded) .group-title {
    display: none !important;
  }
  #left-panel:not(.user-pinned-expanded) .btn-grid-2 {
    display: flex !important;
    flex-direction: column !important;
    gap: 5px !important;
    width: 100% !important;
  }
  #left-panel:not(.user-pinned-expanded) .btn-action {
    width: 48px !important;
    min-width: 48px !important;
    max-width: 48px !important;
    height: 44px !important;
    padding: 0 !important;
    margin: 2px auto !important;
    font-size: 0 !important;
    line-height: 0 !important;
    overflow: hidden !important;
  }
  #left-panel:not(.user-pinned-expanded) .btn-action i {
    font-size: 22px !important;
    margin: 0 !important;
  }
  #right-panel {
    width: var(--right-sidebar-width, 240px) !important;
    min-width: 190px !important;
    max-width: 280px !important;
    flex-shrink: 1 !important;
  }
  #main-panel {
    flex: 1 1 0% !important;
    min-width: 0 !important;
    overflow: hidden !important;
  }
}
`;

    if (!css.includes('BLINDAGEM DA BARRA ESQUERDA NO CAIXA PRO UX')) {
      css += proUxLeftFix;
    }

    fs.writeFileSync(filePath, css, 'utf8');
    console.log(`  ✅ ${filePath} atualizado.`);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Atualizar public/chef-resizable-sidebars.js (e raiz/dist)
  // ─────────────────────────────────────────────────────────────
  ['chef-resizable-sidebars.js', 'public/chef-resizable-sidebars.js', 'dist/chef-resizable-sidebars.js'].forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    let js = fs.readFileSync(filePath, 'utf8');

    // Ao inicializar, se a tela for estreita (< 900px) e o modo não for explicitamente 'expanded', ativa mini mode nativo
    js = js.replace(
      /\/\/ Aplicar estados salvos[\s\S]*?window\.setSidebarMode\('right', savedRightMode, false\);/,
      `// Aplicar estados salvos
    if (savedLeftMode === 'mini' || savedLeftW === '68' || (window.innerWidth < 900 && savedLeftMode !== 'expanded')) {
      window.applyLeftSidebarResize(68);
    } else {
      window.setSidebarMode('left', savedLeftMode, false);
    }
    window.setSidebarMode('right', savedRightMode, false);`
    );

    fs.writeFileSync(filePath, js, 'utf8');
    console.log(`  ✅ ${filePath} atualizado.`);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Atualizar chef-layout-customizer.js (e public/dist)
  // ─────────────────────────────────────────────────────────────
  ['chef-layout-customizer.js', 'public/chef-layout-customizer.js', 'dist/chef-layout-customizer.js'].forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    let js = fs.readFileSync(filePath, 'utf8');

    // Ao iniciar, se largura < 900px, garantir dock_modo como compacta caso não definido
    js = js.replace(
      /var dockMode = cfg\.dock_modo === 'compacta' \? 'mini' : \(cfg\.dock_modo === 'oculta' \? 'hidden' : 'expanded'\);/,
      `var defaultDock = (window.innerWidth < 900 && !cfg.dock_modo) ? 'mini' : 'expanded';
        var dockMode = cfg.dock_modo === 'compacta' ? 'mini' : (cfg.dock_modo === 'oculta' ? 'hidden' : (cfg.dock_modo === 'expandida' ? 'expanded' : defaultDock));`
    );

    fs.writeFileSync(filePath, js, 'utf8');
    console.log(`  ✅ ${filePath} atualizado.`);
  });

  console.log('\n🎉 Blindagem da barra esquerda e grade de mesas aplicadas com sucesso!');
}

run();
