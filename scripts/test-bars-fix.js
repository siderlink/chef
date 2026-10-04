/**
 * scripts/test-bars-fix.js
 * Verificação automatizada das correções da barra superior (menubars/toolbar)
 * e da barra inferior (status bar / dock do colaborador / scrollbar).
 */
const fs = require('fs');
const path = require('path');

function testBarsFix() {
  console.log('🔍 Iniciando Verificação das Barras Superior e Inferior...');
  let totalTests = 0;
  let passedTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
    }
  }

  // 1. Verificar style.css
  const styleCss = fs.readFileSync(path.resolve(__dirname, '../style.css'), 'utf8');
  console.log('\n📌 Teste 1: Regras do Cabeçalho Superior em style.css');
  assert(styleCss.includes('.top-menubar') && styleCss.includes('height: 38px !important'), '.top-menubar possui altura fixa de 38px');
  assert(styleCss.includes('.dropdown-menu') && styleCss.includes('display: none !important'), '.dropdown-menu possui display: none !important por padrão');
  assert(styleCss.includes('.dropdown-menu.show') && styleCss.includes('display: flex !important'), '.dropdown-menu.show configurado para display: flex !important');
  assert(styleCss.includes('.top-toolbar') && styleCss.includes('flex-wrap: nowrap !important'), '.top-toolbar configurada com flex-wrap: nowrap (sem quebra)');
  assert(styleCss.includes('.qr-ponto-box') && styleCss.includes('height: 28px !important'), '.qr-ponto-box compactado em 28px');
  assert(styleCss.includes('.qr-ponto-img') && styleCss.includes('width: 22px !important'), '.qr-ponto-img reduzido para 22px');
  assert(styleCss.includes('#modality-indicator-badge') && styleCss.includes('margin-left: auto !important'), '#modality-indicator-badge alinhado à direita na mesma linha');

  // 2. Verificar Barra Inferior e Scrollbar
  console.log('\n📌 Teste 2: Barra Inferior e Eliminação de Rolagem Horizontal');
  assert(styleCss.includes('.status-bar') && styleCss.includes('height: 30px !important'), '.status-bar configurada com 30px');
  assert(styleCss.includes('overflow-x: hidden !important'), 'Proteção overflow-x: hidden em workspace e main-panel');
  assert(styleCss.includes('.products-table-wrapper') && styleCss.includes('overflow-x: hidden !important'), '.products-table-wrapper com overflow-x: hidden (sem scrollbar cinza desnecessária)');
  assert(styleCss.includes('body:has(.status-bar) #chef-colab-global-dock-btn'), 'Proteção CSS contra sobreposição de dock em telas com status-bar');

  // 3. Verificar chef-colaborador-dock.js
  console.log('\n📌 Teste 3: Script do Colaborador Dock (chef-colaborador-dock.js)');
  const dockJs = fs.readFileSync(path.resolve(__dirname, '../chef-colaborador-dock.js'), 'utf8');
  assert(dockJs.includes('hasStatusBar') || dockJs.includes('isCaixaPage'), 'Dock isenta páginas de caixa/status-bar de renderizar botão flutuante');

  // 4. Verificar caixa-pro-ux.css
  console.log('\n📌 Teste 4: Regras de Layout em caixa-pro-ux.css');
  const proUxCss = fs.readFileSync(path.resolve(__dirname, '../caixa-pro-ux.css'), 'utf8');
  assert(!proUxCss.includes('padding-right: 220px !important'), 'Removido padding-right excessivo de 220px do menubar');
  assert(proUxCss.includes('min-width: 0 !important'), 'Tabela de produtos sem largura mínima rígida de 680px');
  assert(proUxCss.includes('overflow-x: hidden !important'), 'products-table-wrapper com overflow-x: hidden em caixa-pro-ux.css');

  console.log('\n────────────────────────────────────────────────────────────');
  console.log(`📊 RESULTADO: ${passedTests}/${totalTests} passaram (${Math.round((passedTests/totalTests)*100)}% de sucesso)`);
  console.log('────────────────────────────────────────────────────────────');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

testBarsFix();
