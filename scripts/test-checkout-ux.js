// scripts/test-checkout-ux.js
const fs = require('fs');
const path = require('path');

console.log('🩺 Testando Otimizações do Checkout de Pagamento (POS Checkout Suite)...\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition, desc) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${desc}`);
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
  }
}

// 1. Verificar index.html e src/views/caixa/index.html
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const viewHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'caixa', 'index.html'), 'utf8');

console.log('📌 Teste 1: Pills de Métodos Rápidos de Pagamento (1-Clique)');
assert(indexHtml.includes('id="checkout-modal-metodos-grid"'), 'index.html possui grid de botões de método');
assert(viewHtml.includes('id="checkout-modal-metodos-grid"'), 'src/views/caixa/index.html possui grid de botões de método');
assert(indexHtml.includes('data-method="Dinheiro"') && indexHtml.includes('data-method="Pix"'), 'Possui pills para Dinheiro e Pix');
assert(indexHtml.includes('data-method="Cartão de Crédito"') && indexHtml.includes('data-method="Cartão de Débito"'), 'Possui pills para Crédito e Débito');
assert(indexHtml.includes('data-method="Vale Refeição"') && indexHtml.includes('data-method="Fiado"'), 'Possui pills para Vale Refeição e Fiado');
assert(indexHtml.includes('checkoutModalSelectMethod'), 'Pills acionam checkoutModalSelectMethod com 1 clique');

console.log('\n📌 Teste 2: Cédulas Rápidas Brasileiras & Live Troco Card');
assert(indexHtml.includes('checkoutModalSetQuickCash(10)') && indexHtml.includes('checkoutModalSetQuickCash(20)'), 'Possui cédulas de R$ 10 e R$ 20');
assert(indexHtml.includes('checkoutModalSetQuickCash(50)') && indexHtml.includes('checkoutModalSetQuickCash(100)') && indexHtml.includes('checkoutModalSetQuickCash(200)'), 'Possui cédulas de R$ 50, R$ 100 e R$ 200');
assert(indexHtml.includes('id="checkout-modal-troco-live-card"'), 'Possui Live Troco Card de alta visibilidade');
assert(indexHtml.includes('id="checkout-modal-troco-live-val"'), 'Possui display de valor de troco instantâneo');
assert(indexHtml.includes('id="checkout-modal-toast-inline"'), 'Possui banner de notificação inline para troco sem alert bloqueante');

console.log('\n📌 Teste 3: Fluxo Instantâneo de PIX');
assert(indexHtml.includes('id="btn-pix-confirmar-rapido"'), 'Possui botão de confirmação e lançamento rápido de PIX em 1 clique');
assert(indexHtml.includes('id="btn-pix-copiar"'), 'Possui botão de copiar chave Pix atualizado');
assert(indexHtml.includes('checkoutModalConfirmarPixRapido'), 'Aciona checkoutModalConfirmarPixRapido');

console.log('\n📌 Teste 4: Divisão Inteligente de Conta por N Pessoas');
assert(indexHtml.includes('checkoutModalSplitStep'), 'Possui stepper [-] e [+] para divisão flexível de pessoas');
assert(indexHtml.includes('id="checkout-modal-split-tracker"'), 'Possui indicador de cotas pagas (X de N pagas)');
assert(indexHtml.includes('checkoutModalPreencherCota'), 'Possui botão "Lançar Cota" para preenchimento ágil');
assert(indexHtml.includes('id="checkout-modal-split-counter-label"'), 'Possui visor numérico dinâmico do divisor');

console.log('\n📌 Teste 5: Lógica e Funções Globais no main.js');
const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
assert(mainJs.includes('window.checkoutModalSelectMethod ='), 'main.js define checkoutModalSelectMethod');
assert(mainJs.includes('window.checkoutModalConfirmarPixRapido ='), 'main.js define checkoutModalConfirmarPixRapido');
assert(mainJs.includes('window.checkoutModalShowTrocoToast ='), 'main.js define checkoutModalShowTrocoToast');
assert(mainJs.includes('window.checkoutModalSplitStep ='), 'main.js define checkoutModalSplitStep');
assert(mainJs.includes('window.checkoutModalPreencherCota ='), 'main.js define checkoutModalPreencherCota');
assert(mainJs.includes('window.checkoutModalAtualizarSplitTracker ='), 'main.js define checkoutModalAtualizarSplitTracker');
assert(!mainJs.includes('alert(`✅ Pagamento em Dinheiro registrado'), 'main.js eliminou alert bloqueante em troco de dinheiro');

console.log('\n📌 Teste 6: Atalhos e Navegação por Teclado');
const shortcutsJs = fs.readFileSync(path.join(__dirname, '..', 'shortcuts.js'), 'utf8');
assert(shortcutsJs.includes('checkoutModalSelectMethod'), 'shortcuts.js integra seleção de método via teclas 1-6');
assert(shortcutsJs.includes("e.key === 'Escape'"), 'shortcuts.js suporta fechar checkout com tecla Escape');

console.log('\n📌 Teste 7: Estilos e Tema Escuro em caixa-pro-ux.css');
const cssPro = fs.readFileSync(path.join(__dirname, '..', 'caixa-pro-ux.css'), 'utf8');
assert(cssPro.includes('.checkout-method-pill'), 'caixa-pro-ux.css define regras para .checkout-method-pill');
assert(cssPro.includes('.checkout-method-pill.active[data-method="Dinheiro"]'), 'caixa-pro-ux.css estiliza pill ativo de Dinheiro');
assert(cssPro.includes('.checkout-method-pill.active[data-method="Pix"]'), 'caixa-pro-ux.css estiliza pill ativo de Pix');
assert(cssPro.includes('[data-theme="dark"] .checkout-method-pill'), 'caixa-pro-ux.css suporta modo escuro nas pills');
assert(cssPro.includes('[data-theme="dark"] #checkout-modal-troco-live-card'), 'caixa-pro-ux.css suporta modo escuro no live troco card');

console.log('\n' + '─'.repeat(60));
console.log(`📊 RESULTADO DOS TESTES DO CHECKOUT: ${passedTests}/${totalTests} passaram (${Math.round((passedTests/totalTests)*100)}% de sucesso)`);
console.log('─'.repeat(60));

if (passedTests === totalTests) {
  console.log('\n🎉 Todos os testes de checkout passaram com louvor!');
  process.exit(0);
} else {
  console.error('\n⚠️ Alguns testes falharam!');
  process.exit(1);
}
