const fs = require('fs');

// 1. Adicionar CSS em caixa-pro-ux.css
let css = fs.readFileSync('caixa-pro-ux.css', 'utf8');
const shortcutCss = `
/* ── KEYBOARD SHORTCUT PILL EM BOTÕES DO CAIXA ── */
.shortcut-pill {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-family: 'JetBrains Mono', Consolas, monospace !important;
  font-size: 10px !important;
  font-weight: 800 !important;
  padding: 1px 5px !important;
  border-radius: 4px !important;
  margin-left: auto !important;
  line-height: 1.2 !important;
  background: rgba(0, 0, 0, 0.06) !important;
  color: var(--text-secondary, #64748b) !important;
  border: 1px solid rgba(0, 0, 0, 0.1) !important;
  pointer-events: none !important;
  user-select: none !important;
}

[data-theme="dark"] .shortcut-pill,
body.dark-mode .shortcut-pill,
body.theme-dark .shortcut-pill {
  background: rgba(255, 255, 255, 0.1) !important;
  color: #cbd5e1 !important;
  border-color: rgba(255, 255, 255, 0.14) !important;
}

.btn-action.primary .shortcut-pill {
  background: rgba(255, 255, 255, 0.28) !important;
  color: #ffffff !important;
  border-color: rgba(255, 255, 255, 0.4) !important;
}

#left-panel.mini .shortcut-pill,
.left-actions.mini .shortcut-pill {
  display: none !important;
}
`;

if (!css.includes('.shortcut-pill')) {
  css += shortcutCss;
  fs.writeFileSync('caixa-pro-ux.css', css, 'utf8');
  console.log('Adicionado .shortcut-pill em caixa-pro-ux.css');
}

// 2. Atualizar botões no index.html e src/views/caixa/index.html
const htmlFiles = ['index.html', 'src/views/caixa/index.html'];
htmlFiles.forEach(f => {
  if (!fs.existsSync(f)) return;
  let html = fs.readFileSync(f, 'utf8');

  // Lançar -> F2
  html = html.replace(
    /<button class="btn-action primary" id="btn-adicionar-produtos"[^>]*>[\s\S]*?<\/button>/,
    `<button class="btn-action primary" id="btn-adicionar-produtos" title="Lançar itens de consumo (F2)">\n              <i class="ph ph-plus-circle"></i> <span>Lançar</span> <span class="shortcut-pill">F2</span>\n            </button>`
  );

  // Parcial -> F7
  html = html.replace(
    /<button class="btn-action" id="btn-movimento-parcial"[^>]*>[\s\S]*?<\/button>/,
    `<button class="btn-action" id="btn-movimento-parcial" title="Receber pagamento parcial (F7)">\n                <i class="ph ph-currency-dollar" style="color: #3ab55b;"></i> <span>Parcial</span> <span class="shortcut-pill">F7</span>\n              </button>`
  );

  // Fechar Mesa -> F12
  html = html.replace(
    /<button class="btn-action" id="btn-movimento-concluir"[^>]*>[\s\S]*?<\/button>/,
    `<button class="btn-action" id="btn-movimento-concluir" title="Fechar conta da mesa (F12)">\n                <i class="ph ph-check" style="color: #3ab55b;"></i> <span>Fechar</span> <span class="shortcut-pill">F12</span>\n              </button>`
  );

  // Imprimir -> F9
  html = html.replace(
    /<button class="btn-action" id="btn-imprimir-conta"[^>]*>[\s\S]*?<\/button>/,
    `<button class="btn-action" id="btn-imprimir-conta" title="Imprimir conferência da conta (F9)">\n                <i class="ph ph-printer"></i> <span>Imprimir</span> <span class="shortcut-pill">F9</span>\n              </button>`
  );

  // Desconto -> F6
  html = html.replace(
    /<button class="btn-action" id="btn-aplicar-desconto"[^>]*>[\s\S]*?<\/button>/,
    `<button class="btn-action" id="btn-aplicar-desconto" title="Aplicar desconto na conta (F6)">\n                <i class="ph ph-percent"></i> <span>Desconto</span> <span class="shortcut-pill">F6</span>\n              </button>`
  );

  // Serviços -> F10
  html = html.replace(
    /<button class="btn-action" id="btn-aplicar-servico"[^>]*>[\s\S]*?<\/button>/,
    `<button class="btn-action" id="btn-aplicar-servico" title="Serviços ou gorjeta (F10)">\n                <i class="ph ph-bell"></i> <span>Serviços</span> <span class="shortcut-pill">F10</span>\n              </button>`
  );

  fs.writeFileSync(f, html, 'utf8');
  console.log('Atualizados atalhos em ' + f);
});
