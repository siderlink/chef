/**
 * scripts/test-pos-screen-health.js
 * Teste automatizado para garantir a saúde total da tela do Caixa:
 * 1. Mini dock lateral esquerda sem bolhas/cards soltos (VS Code sleek rail)
 * 2. Painel central (#main-panel) sem cortes à esquerda e sem scroll horizontal espúrio
 * 3. Tabela de produtos fluida sem min-width rígido
 * 4. Atalhos com inline: 'nearest' sem deslocar o scroll do workspace
 */
const fs = require('fs');

let total = 0;
let passed = 0;

function check(desc, condition) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${desc}`);
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
  }
}

console.log('\n🩺 Iniciando Teste de Saúde da Tela do Caixa (POS Health Suite)...\n');

// 1. Verificação de eliminação das bolhas do dock esquerdo (style.css e caixa-pro-ux.css)
console.log('📌 Teste 1: Eliminação de bolhas/cards do dock esquerdo em mini-mode');
const styleCss = fs.readFileSync('style.css', 'utf8');
const proUxCss = fs.readFileSync('caixa-pro-ux.css', 'utf8');

check('style.css neutraliza background de .action-group em mini mode', 
  styleCss.includes('#left-panel.mode-mini .action-group') && 
  styleCss.includes('background: transparent !important'));

check('caixa-pro-ux.css neutraliza background de .action-group em mini mode em tema escuro', 
  proUxCss.includes('html[data-theme="dark"] #left-panel.mode-mini .action-group') && 
  proUxCss.includes('background: transparent !important'));

check('Mini dock configurado com largura compacta e sleek de 58px', 
  proUxCss.includes('width: 58px !important') && proUxCss.includes('min-width: 58px !important'));

check('Botões da mini dock configurados como 42x42 com ícones centralizados', 
  proUxCss.includes('width: 42px !important') && proUxCss.includes('height: 42px !important'));

// 2. Verificação de integridade e eliminação de corte do #main-panel
console.log('\n📌 Teste 2: Integridade do Painel Central (#main-panel)');
check('#main-panel possui overflow-x: clip para impedir descolamento horizontal', 
  styleCss.includes('#main-panel') && styleCss.includes('overflow-x: clip !important'));

check('#main-panel possui min-width: 0 !important para flexibilidade total', 
  proUxCss.includes('#main-panel') && proUxCss.includes('min-width: 0 !important'));

check('mesas-section-container com overflow-x: clip', 
  styleCss.includes('#mesas-section-container') && styleCss.includes('overflow-x: clip !important'));

check('Grade de mesas com minmax fluido (115px) sem estourar em 4 colunas rígidas', 
  proUxCss.includes('grid-template-columns: repeat(auto-fill, minmax(115px, 1fr)) !important'));

// 3. Verificação da tabela de produtos sem travamento de largura
console.log('\n📌 Teste 3: Tabela de produtos fluida sem min-width rígido');
const nativeCss = fs.readFileSync('responsive-native.css', 'utf8');
check('responsive-native.css sem min-width: 560px em telas pequenas', 
  !nativeCss.includes('min-width: 560px'));

check('style.css sem min-width: 640px para force-mobile', 
  !styleCss.includes('min-width: 640px'));

// 4. Verificação de scroll prevention em JS
console.log('\n📌 Teste 4: Prevenção de scroll horizontal espúrio via JavaScript');
const resizableJs = fs.readFileSync('chef-resizable-sidebars.js', 'utf8');
const shortcutsJs = fs.readFileSync('shortcuts.js', 'utf8');

check('chef-resizable-sidebars reseta scrollLeft do mainPanel para 0', 
  resizableJs.includes('mainPanel.scrollLeft = 0'));

check('shortcuts.js usa inline: nearest para evitar deslocamento de tela', 
  shortcutsJs.includes("inline: 'nearest'"));

console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`📊 RESULTADO DA SAÚDE DA TELA: ${passed}/${total} passaram (${Math.round((passed / total) * 100)}% de sucesso)`);
console.log(`────────────────────────────────────────────────────────────\n`);

process.exit(passed === total ? 0 : 1);
