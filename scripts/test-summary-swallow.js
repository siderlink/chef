/**
 * scripts/test-summary-swallow.js
 * Validação automatizada para garantir que o Painel de Resumo da Conta
 * nunca seja engolido, cortado ou distorcido pelo layout em nenhuma resolução.
 */
const fs = require('fs');
const path = require('path');

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

console.log('\n📊 Iniciando Verificação de Integridade do Painel de Resumo...\n');

// 1. style.css
console.log('📌 Teste 1: Regras do Painel Direito em style.css');
const styleCss = fs.readFileSync('style.css', 'utf8');
check('.right-info possui flex-shrink: 1 (flexível)', styleCss.includes('.right-info') && styleCss.includes('flex-shrink: 1'));
check('Eliminadas media queries portrait que sequestravam #inner-right-panel sem chef-monitor-vertical', !styleCss.includes('body:not(.chef-vertical-2col):not(.force-mobile) #inner-right-panel'));
check('Proteção de integridade do painel lateral presente', styleCss.includes('#right-panel:not(.mode-hidden)'));

// 2. caixa-pro-ux.css
console.log('\n📌 Teste 2: Regras em caixa-pro-ux.css');
const proUxCss = fs.readFileSync('caixa-pro-ux.css', 'utf8');
check('.workspace usa width: 100% (evita estouro de 100vw com scrollbars)', !proUxCss.includes('width: 100vw !important;'));
check('.right-info possui flex-shrink: 1 !important em vez de 0 rígido', proUxCss.includes('flex-shrink: 1 !important'));
check('Adaptação responsiva para telas estreitas (<= 900px) presente', proUxCss.includes('ADAPTACAO RESPONSIVA DE RESUMO PARA TELAS ESTREITAS') || proUxCss.includes('@media (max-width: 900px)'));

// 3. chef-layout-customizer.js
console.log('\n📌 Teste 3: Lógica no Personalizador de Layout');
const customizerJs = fs.readFileSync('public/chef-layout-customizer.js', 'utf8');
check('Resumo possui minWidth seguro de 190px (não trava em 300px rígidos)', customizerJs.includes("rightPanel.style.minWidth = '190px'"));
check('Clamping para telas estreitas (< 850px) presente', customizerJs.includes('window.innerWidth < 850'));

// 4. chef-resizable-sidebars.js
console.log('\n📌 Teste 4: Gerenciamento de Splitters');
const resizableJs = fs.readFileSync('public/chef-resizable-sidebars.js', 'utf8');
check('chefApplySidebarMode define minWidth flexível para o painel direito', resizableJs.includes("panel.style.minWidth = right ? '190px' : '64px'"));

console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`📊 RESULTADO: ${passed}/${total} passaram (${Math.round((passed / total) * 100)}% de sucesso)`);
console.log(`────────────────────────────────────────────────────────────\n`);

process.exit(passed === total ? 0 : 1);
