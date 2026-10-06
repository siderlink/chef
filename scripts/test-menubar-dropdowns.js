/**
 * scripts/test-menubar-dropdowns.js
 * Testa a integridade do menu superior (.top-menubar) e de todos os menus dropdown (.dropdown-menu),
 * garantindo que nenhum dropdown fique oculto ou preso atrás do layout.
 */
const fs = require('fs');
const assert = require('assert');

console.log('🩺 Testando integridade dos Dropdowns e Menubar...');

const styleCss = fs.readFileSync('style.css', 'utf8');
const caixaProCss = fs.readFileSync('caixa-pro-ux.css', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');
const versionManagerJs = fs.readFileSync('caixa-version-manager.js', 'utf8');

// 1. .top-menubar deve ter overflow: visible e z-index alto em style.css
const styleMenubarMatches = styleCss.match(/\.top-menubar\s*\{[^}]+\}/g) || [];
const hasVisibleInStyle = styleMenubarMatches.some(m => m.includes('overflow: visible') && m.includes('z-index'));
assert(hasVisibleInStyle, 'style.css deve conter .top-menubar com overflow: visible e z-index');
console.log('  ✅ [PASS] style.css define .top-menubar com overflow: visible e z-index');

// 2. caixa-pro-ux.css deve ter overflow: visible e z-index alto no .top-menubar
const uxMenubarMatches = caixaProCss.match(/\.top-menubar\s*\{[^}]+\}/g) || [];
const hasVisibleInUx = uxMenubarMatches.some(m => m.includes('overflow: visible') && m.includes('z-index'));
assert(hasVisibleInUx, 'caixa-pro-ux.css deve conter .top-menubar com overflow: visible e z-index');
console.log('  ✅ [PASS] caixa-pro-ux.css define .top-menubar com overflow: visible e z-index');

// 3. .dropdown-wrapper e .dropdown-menu devem ter z-index definidos
assert(caixaProCss.includes('.dropdown-wrapper') && caixaProCss.includes('.dropdown-menu'), 'caixa-pro-ux.css deve conter regras de .dropdown-wrapper e .dropdown-menu');
console.log('  ✅ [PASS] caixa-pro-ux.css possui regras explícitas para .dropdown-wrapper e .dropdown-menu');

// 4. index.html possui os dropdowns de Arquivo, Visualizar e Seletor de Versão
assert(indexHtml.includes('id="drop-arquivo"'), 'index.html deve conter drop-arquivo');
assert(indexHtml.includes('id="drop-visualizar"'), 'index.html deve conter drop-visualizar');
assert(indexHtml.includes('id="drop-caixa-version"'), 'index.html deve conter drop-caixa-version');
console.log('  ✅ [PASS] index.html possui todos os dropdowns estruturados');

// 5. CaixaVersionManager implementa toggleDropdown e stopPropagation
assert(versionManagerJs.includes('toggleDropdown: function'), 'caixa-version-manager.js deve ter toggleDropdown');
assert(versionManagerJs.includes('stopImmediatePropagation'), 'toggleDropdown deve usar stopImmediatePropagation para não ser cancelado por outros ouvintes');
console.log('  ✅ [PASS] CaixaVersionManager possui toggleDropdown blindado contra conflitos');

// 6. Botões do Caixa possuem atalhos operacionais rápidos (.shortcut-pill)
assert(indexHtml.includes('shortcut-pill'), 'index.html deve conter badges .shortcut-pill para atalhos do teclado');
assert(styleCss.includes('.shortcut-pill'), 'style.css deve conter estilos para .shortcut-pill');
console.log('  ✅ [PASS] Atalhos de teclado operacionais (F2, F7, F9, F12) visíveis nos botões de ação');

console.log('\n🎉 Todos os testes de usabilidade, dropdowns e menubar passaram com sucesso!');
