/**
 * scripts/test-layout-customization.js
 * Valida a correção da distorção de layout e a funcionalidade de personalização do colaborador.
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

console.log('\n🎨 Iniciando Verificação do Layout e Configuração do Colaborador...\n');

// 1. Verificação de style.css
console.log('📌 Teste 1: Proteção de layout e moedas em style.css');
const styleCss = fs.readFileSync('style.css', 'utf8');
check('Proteção de quebra de moeda (.info-row .val nowrap)', styleCss.includes('white-space: nowrap !important') && styleCss.includes('.info-row .val'));
check('Ajuste de .action-group (sem borda de card solto)', styleCss.includes('.action-group {\n  border: none;\n  background: transparent;') || styleCss.includes('.action-group {\r\n  border: none;\r\n  background: transparent;'));
check('Grid summary com min-width seguro (>= 210px)', styleCss.includes('minmax(210px, 1fr)'));

// 2. Verificação de device-adapters.js
console.log('\n📌 Teste 2: Desativação do sequestro automático de modo vertical');
const devAdaptersJs = fs.readFileSync('device-adapters.js', 'utf8');
check('vMode padrão configurado como "disabled"', devAdaptersJs.includes("var vMode = 'disabled'") || devAdaptersJs.includes("|| 'disabled'"));
check('isVerticalMonitor ativado apenas com consentimento', devAdaptersJs.includes("vMode === 'stacked' || vMode === '2col'"));

// 3. Verificação de chef-layout-customizer.js
console.log('\n📌 Teste 3: Gerenciador de Layout do Colaborador');
const customizerJs = fs.readFileSync('public/chef-layout-customizer.js', 'utf8');
check('Função abrirModalPersonalizarLayout presente', customizerJs.includes('window.abrirModalPersonalizarLayout'));
check('Função aplicarPresetLayout com múltiplos presets presente', customizerJs.includes('window.aplicarPresetLayout') && customizerJs.includes('desktop_3col'));
check('Suporte a Zoom/Escala presente', customizerJs.includes('zoom_pct') && customizerJs.includes('select-zoom-pct'));
check('Função restaurarLayoutPadrao presente', customizerJs.includes('window.restaurarLayoutPadrao'));

// 4. Verificação de index.html
console.log('\n📌 Teste 4: Botões de Acesso Rápido em index.html');
const indexHtml = fs.readFileSync('index.html', 'utf8');
check('Botão de Exibição presente no Top Toolbar', indexHtml.includes('id="btn-toolbar-layout-customizer"'));
check('Botão direto de Exibição no Salão header', indexHtml.includes('id="btn-abrir-config-exibicao"'));
check('Script chef-layout-customizer importado', indexHtml.includes('chef-layout-customizer.js'));

console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`📊 RESULTADO: ${passed}/${total} passaram (${Math.round((passed / total) * 100)}% de sucesso)`);
console.log(`────────────────────────────────────────────────────────────\n`);

process.exit(passed === total ? 0 : 1);
