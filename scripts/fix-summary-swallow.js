/**
 * scripts/fix-summary-swallow.js
 * Corrige em definitivo o problema do painel de resumo da conta ser engolido ou cortado
 * pela limitação do layout em telas compactas, monitores verticais ou resoluções estreitas.
 */
const fs = require('fs');
const path = require('path');

function run() {
  console.log('🔧 Iniciando correção definitiva do painel de resumo...');

  // ─────────────────────────────────────────────────────────────
  // 1. Corrigir style.css e src/css/style.css
  // ─────────────────────────────────────────────────────────────
  ['style.css', 'src/css/style.css'].forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    let css = fs.readFileSync(filePath, 'utf8');

    // 1.1 Atualizar regra base de .right-info
    css = css.replace(
      /\.right-info\s*\{[\s\S]*?flex-shrink:\s*0\s*\}/,
      `.right-info {
  word-break: break-word;
  background-color: var(--bg-secondary);
  flex-direction: column;
  width: var(--right-sidebar-width, 280px);
  min-width: 190px;
  max-width: 360px;
  padding: 12px;
  display: flex;
  overflow: hidden auto;
  flex-shrink: 1;
  box-sizing: border-box;
}`
    );

    // 1.2 Limpar as media queries portrait duplicadas que sequestravam #inner-right-panel
    // Substituir blocos que usam body:not(.chef-vertical-2col):not(.force-mobile) nas regras do rodapé vertical
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #inner-right-panel \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #inner-right-panel \.info-group\.summary \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #inner-right-panel \.info-group\.summary \.group-title \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #inner-right-panel \.info-group\.summary \.info-row \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #inner-right-panel \.info-group\.summary \.info-row\.bold:has\(#total-pagar-text\),[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #total-pagar-text \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) \.checkout-sticky-footer \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) \.checkout-sticky-footer \.info-group \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #btn-finalizar-venda \{[\s\S]*?\}\s*\}/g,
      ''
    );

    // 1.3 Adicionar proteção de contenção e integridade vertical para a barra lateral direita
    const protectionRule = `
/* ── INTEGRIDADE DO PAINEL LATERAL DE RESUMO (EVITA SER ENGOLIDO PELO LAYOUT) ── */
#right-panel:not(.mode-hidden) {
  display: flex !important;
  flex-direction: column !important;
  box-sizing: border-box !important;
  max-width: 100% !important;
  min-width: 190px !important;
  flex-shrink: 1 !important;
}

body:not(.chef-monitor-vertical) #inner-right-panel,
body.chef-vertical-2col #inner-right-panel {
  display: flex !important;
  flex-direction: column !important;
  width: 100% !important;
  box-sizing: border-box !important;
  gap: 8px !important;
}

body:not(.chef-monitor-vertical) #inner-right-panel .info-group.summary,
body.chef-vertical-2col #inner-right-panel .info-group.summary {
  display: flex !important;
  flex-direction: column !important;
  width: 100% !important;
  box-sizing: border-box !important;
  padding: 10px 12px !important;
}

body:not(.chef-monitor-vertical) #inner-right-panel .info-group.summary .group-title,
body.chef-vertical-2col #inner-right-panel .info-group.summary .group-title {
  display: block !important;
}

body:not(.chef-monitor-vertical) #inner-right-panel .info-row,
body.chef-vertical-2col #inner-right-panel .info-row {
  display: flex !important;
  flex-direction: row !important;
  justify-content: space-between !important;
  align-items: center !important;
  width: 100% !important;
}

@media (max-width: 900px) {
  body:not(.force-mobile) #left-panel:not(.user-pinned-expanded) {
    width: var(--left-sidebar-width, 68px) !important;
    min-width: 64px !important;
  }
  body:not(.force-mobile) #right-panel {
    width: var(--right-sidebar-width, 240px) !important;
    min-width: 190px !important;
    max-width: 280px !important;
    flex-shrink: 1 !important;
  }
  body:not(.force-mobile) #main-panel {
    flex: 1 1 0% !important;
    min-width: 0 !important;
  }
}
`;

    if (!css.includes('INTEGRIDADE DO PAINEL LATERAL DE RESUMO')) {
      css += protectionRule;
    }

    fs.writeFileSync(filePath, css, 'utf8');
    console.log(`  ✅ ${filePath} atualizado.`);
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Corrigir caixa-pro-ux.css (raiz, public/ e dist/)
  // ─────────────────────────────────────────────────────────────
  ['caixa-pro-ux.css', 'public/caixa-pro-ux.css', 'dist/caixa-pro-ux.css'].forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    let css = fs.readFileSync(filePath, 'utf8');

    // Substituir width: 100vw !important por width: 100% !important
    css = css.replace(/width:\s*100vw\s*!important;/g, 'width: 100% !important; max-width: 100% !important; box-sizing: border-box !important;');

    // Atualizar bloco 127-149: width: 310px; min-width: 310px; flex-shrink: 0 !important
    css = css.replace(
      /width:\s*310px;\s*min-width:\s*310px;\s*max-width:\s*310px;([\s\S]*?)flex-shrink:\s*0\s*!important;/,
      'width: var(--right-sidebar-width, 280px); min-width: 190px !important; max-width: 340px;$1flex-shrink: 1 !important;'
    );

    // Atualizar bloco 887-900: width: 280px; min-width: 240px; ... flex-shrink: 0 !important;
    css = css.replace(
      /width:\s*280px;\s*min-width:\s*240px;\s*max-width:\s*320px;([\s\S]*?)flex-shrink:\s*0\s*!important;/,
      'width: var(--right-sidebar-width, 280px); min-width: 190px !important; max-width: 340px;$1flex-shrink: 1 !important;'
    );

    // Adicionar regras de contenção caso não estejam presentes
    if (!css.includes('ADAPTACAO RESPONSIVA DE RESUMO PARA TELAS ESTREITAS')) {
      css += `
/* ── ADAPTACAO RESPONSIVA DE RESUMO PARA TELAS ESTREITAS ── */
@media (max-width: 900px) {
  body:not(.force-mobile) #left-panel:not(.user-pinned-expanded) {
    width: var(--left-sidebar-width, 68px) !important;
    min-width: 64px !important;
  }
  body:not(.force-mobile) #right-panel {
    width: var(--right-sidebar-width, 240px) !important;
    min-width: 190px !important;
    max-width: 280px !important;
    flex-shrink: 1 !important;
  }
  body:not(.force-mobile) #main-panel {
    flex: 1 1 0% !important;
    min-width: 0 !important;
  }
}
`;
    }

    fs.writeFileSync(filePath, css, 'utf8');
    console.log(`  ✅ ${filePath} atualizado.`);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Corrigir device-adapters.css (raiz e public/)
  // ─────────────────────────────────────────────────────────────
  ['device-adapters.css', 'public/device-adapters.css'].forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    let css = fs.readFileSync(filePath, 'utf8');

    // Limpar linhas com ponto e vírgula solto
    css = css.replace(/body\.chef-monitor-vertical:not\(\.chef-vertical-2col\)\s*#inner-right-panel\s*\.info-group\.summary;/g, '');
    css = css.replace(/body\.chef-monitor-vertical:not\(\.chef-vertical-2col\)\s*#inner-right-panel\s*\.info-group\.summary\s*\.group-title;/g, '');
    css = css.replace(/body\.chef-monitor-vertical:not\(\.chef-vertical-2col\)\s*#inner-right-panel\s*\.info-group\.summary\s*\.info-row;/g, '');
    css = css.replace(/body\.chef-monitor-vertical:not\(\.chef-vertical-2col\)\s*#inner-right-panel\s*\.info-group\.summary\s*\.info-row\.bold:has\(#total-pagar-text\),[\s\S]*?;/g, '');
    css = css.replace(/body\.chef-monitor-vertical:not\(\.chef-vertical-2col\)\s*#total-pagar-text;/g, '');
    css = css.replace(/body\.chef-monitor-vertical:not\(\.chef-vertical-2col\)\s*\.checkout-sticky-footer;/g, '');
    css = css.replace(/body\.chef-monitor-vertical:not\(\.chef-vertical-2col\)\s*\.checkout-sticky-footer\s*\.info-group;/g, '');
    css = css.replace(/body\.chef-monitor-vertical:not\(\.chef-vertical-2col\)\s*#btn-finalizar-venda;/g, '');
    css = css.replace(/body\.chef-monitor-vertical:not\(\.chef-vertical-2col\)\s*\.workspace;/g, '');
    css = css.replace(/body\.chef-monitor-vertical:not\(\.chef-vertical-2col\)\s*#right-panel\s*\.sidebar-header-controls;/g, '');
    css = css.replace(/body\.chef-monitor-vertical:not\(\.chef-vertical-2col\)\s*#inner-right-panel;/g, '');

    // Limpar os blocos duplicados de media queries portrait
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #inner-right-panel \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #inner-right-panel \.info-group\.summary \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #inner-right-panel \.info-group\.summary \.group-title \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #inner-right-panel \.info-group\.summary \.info-row \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #inner-right-panel \.info-group\.summary \.info-row\.bold:has\(#total-pagar-text\),[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #total-pagar-text \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) \.checkout-sticky-footer \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) \.checkout-sticky-footer \.info-group \{[\s\S]*?\}\s*\}/g,
      ''
    );
    css = css.replace(
      /@media screen and \(orientation: portrait\) and \(min-height: 680px\) and \(min-width: 500px\) \{\s*body:not\(\.chef-vertical-2col\):not\(\.force-mobile\) #btn-finalizar-venda \{[\s\S]*?\}\s*\}/g,
      ''
    );

    fs.writeFileSync(filePath, css, 'utf8');
    console.log(`  ✅ ${filePath} atualizado.`);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Corrigir chef-layout-customizer.js (raiz, public/ e dist/)
  // ─────────────────────────────────────────────────────────────
  ['chef-layout-customizer.js', 'public/chef-layout-customizer.js', 'dist/chef-layout-customizer.js'].forEach(filePath => {
    if (!fs.existsSync(filePath)) return;
    let js = fs.readFileSync(filePath, 'utf8');

    // Substituir definição de largura rígida do resumo por flexível com clamping
    js = js.replace(
      /if\s*\(resumoMode === 'expanded'\)\s*\{\s*var wRes = parseInt\(cfg\.resumo_width_px, 10\) \|\| 320;\s*rightPanel\.style\.width = wRes \+ 'px';\s*rightPanel\.style\.maxWidth = \(wRes \+ 20\) \+ 'px';\s*rightPanel\.style\.minWidth = \(wRes - 20\) \+ 'px';/g,
      `if (resumoMode === 'expanded') {
        var wRes = parseInt(cfg.resumo_width_px, 10) || 280;
        if (window.innerWidth < 850 && wRes > 250) {
          wRes = 240;
        }
        rightPanel.style.width = wRes + 'px';
        rightPanel.style.maxWidth = Math.max(wRes + 20, 340) + 'px';
        rightPanel.style.minWidth = '190px';
        rightPanel.style.flexShrink = '1';`
    );

    // Ajustar preset desktop_3col para largura padrão equilibrada de 280px
    js = js.replace(
      /document\.getElementById\('range-resumo-width'\)\.value = '320';\s*document\.getElementById\('label-resumo-width-val'\)\.innerText = '320px';/,
      `document.getElementById('range-resumo-width').value = '280';\n      document.getElementById('label-resumo-width-val').innerText = '280px';`
    );

    fs.writeFileSync(filePath, js, 'utf8');
    console.log(`  ✅ ${filePath} atualizado.`);
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Corrigir chef-resizable-sidebars.js (public, dist e copiar para raiz)
  // ─────────────────────────────────────────────────────────────
  const resizablePublic = path.resolve(__dirname, '../public/chef-resizable-sidebars.js');
  if (fs.existsSync(resizablePublic)) {
    let js = fs.readFileSync(resizablePublic, 'utf8');

    // Ajustar chefApplySidebarMode
    js = js.replace(
      /panel\.style\.minWidth = w;\s*panel\.style\.maxWidth = w;/,
      `panel.style.minWidth = right ? '190px' : '64px';\n        panel.style.maxWidth = right ? '360px' : '600px';\n        panel.style.flexShrink = '1';`
    );

    // Salvar em public/
    fs.writeFileSync(resizablePublic, js, 'utf8');

    // Copiar para raiz e dist
    fs.writeFileSync(path.resolve(__dirname, '../chef-resizable-sidebars.js'), js, 'utf8');
    const distResizable = path.resolve(__dirname, '../dist/chef-resizable-sidebars.js');
    if (fs.existsSync(path.dirname(distResizable))) {
      fs.writeFileSync(distResizable, js, 'utf8');
    }
    console.log(`  ✅ chef-resizable-sidebars.js sincronizado em public/, dist/ e raiz.`);
  }

  console.log('\n🎉 Todas as correções do painel de resumo foram aplicadas com sucesso!');
}

run();
