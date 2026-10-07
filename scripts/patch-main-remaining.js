// scripts/patch-main-remaining.js
const fs = require('fs');
const path = require('path');

// --- 1. Patch main.js ---
const mainPath = path.join(__dirname, '..', 'main.js');
let mainContent = fs.readFileSync(mainPath, 'utf8');

// 1.1 Troco feedback (non-blocking toast/inline)
const targetTrocoRegex = /const troco = valor - falta;\s*alert\(`✅ Pagamento em Dinheiro registrado\.\\n\\nDEVOLVER DE TROCO AO CLIENTE: R\$ \${troco\.toFixed\(2\)\.replace\('\.', ','\)}`\);/;
if (targetTrocoRegex.test(mainContent)) {
  mainContent = mainContent.replace(targetTrocoRegex, `const troco = valor - falta;
    if (typeof window.checkoutModalShowTrocoToast === 'function') {
      window.checkoutModalShowTrocoToast(troco);
    } else {
      alert(\`✅ Pagamento em Dinheiro registrado.\\n\\nDEVOLVER DE TROCO AO CLIENTE: R$ \${troco.toFixed(2).replace('.', ',')}\`);
    }`);
  console.log('Patch 1: Troco alert replaced with non-blocking toast in main.js');
} else {
  console.log('Patch 1: Target not matched or already patched');
}

// 1.2 calcRestante: update live troco card & split tracker
const targetCalcRegex = /(if \(statusBox\) \{\s*statusBox\.style\.background = '#fff5f5';\s*statusBox\.style\.borderColor = '#fed7d7';\s*\}\s*\}\s*\})([\r\n]+)(\s*\/\/ Renderizar itens)/;
if (targetCalcRegex.test(mainContent)) {
  mainContent = mainContent.replace(targetCalcRegex, `$1

        // Atualizar Live Troco Card no Painel Central
        const liveTrocoCard = document.getElementById('checkout-modal-troco-live-card');
        const liveTrocoVal = document.getElementById('checkout-modal-troco-live-val');
        if (liveTrocoCard && liveTrocoVal) {
          if (falta > 0.01 && metodo === 'Dinheiro' && trocoSimulado > 0.009) {
            liveTrocoVal.innerText = \`R$ \${trocoSimulado.toFixed(2).replace('.', ',')}\`;
            liveTrocoCard.style.display = 'block';
          } else {
            liveTrocoCard.style.display = 'none';
          }
        }

        // Atualizar rastreador de divisão de conta se ativa
        if (window._checkoutSplitN > 0 && typeof window.checkoutModalAtualizarSplitTracker === 'function') {
          window.checkoutModalAtualizarSplitTracker();
        }$2$3`);
  console.log('Patch 2: calcRestante updated with live troco card and split tracker');
} else {
  console.log('Patch 2: Target not matched or already patched');
}

// 1.3 abrirCheckoutModal: sync method pill
const targetAbrirRegex = /(\/\/\s*Painel Pix \(se o método já estiver em Pix\)[\r\n]+\s*if \(window\.checkoutModalAtualizarPix\) window\.checkoutModalAtualizarPix\(\);)/;
if (targetAbrirRegex.test(mainContent)) {
  mainContent = mainContent.replace(targetAbrirRegex, `// Sincroniza pills de método de pagamento (padrão Dinheiro)
  const selMetodoAtual = document.getElementById('checkout-modal-metodo');
  const mAtual = (selMetodoAtual && selMetodoAtual.value) ? selMetodoAtual.value : 'Dinheiro';
  if (typeof window.checkoutModalSelectMethod === 'function') {
    window.checkoutModalSelectMethod(mAtual);
  } else if (window.checkoutModalAtualizarPix) {
    window.checkoutModalAtualizarPix();
  }`);
  console.log('Patch 3: abrirCheckoutModal updated with method pill sync');
} else {
  console.log('Patch 3: Target not matched or already patched');
}

fs.writeFileSync(mainPath, mainContent, 'utf8');

// --- 2. Patch shortcuts.js ---
const shortcutsPath = path.join(__dirname, '..', 'shortcuts.js');
let shortcutsContent = fs.readFileSync(shortcutsPath, 'utf8');

const targetShortcutsRegex = /if \(!isInputActive\) \{\s*const keyUpper = e\.key\.toUpperCase\(\);\s*let selectMethod = null;\s*if \(e\.key === '1' \|\| keyUpper === 'D'\) selectMethod = 'Dinheiro';[\s\S]*?if \(window\.checkoutModalAddPagamento\) window\.checkoutModalAddPagamento\(\);\s*\}\s*\}/;

if (targetShortcutsRegex.test(shortcutsContent)) {
  shortcutsContent = shortcutsContent.replace(targetShortcutsRegex, `// ESC fecha o modal de checkout
    if (e.key === 'Escape') {
      e.preventDefault();
      if (typeof window.fecharCheckoutModal === 'function') window.fecharCheckoutModal();
      return;
    }

    if (!isInputActive) {
      const keyUpper = e.key.toUpperCase();
      let selectMethod = null;
      if (e.key === '1' || keyUpper === 'D') selectMethod = 'Dinheiro';
      else if (e.key === '2' || keyUpper === 'P') selectMethod = 'Pix';
      else if (e.key === '3' || keyUpper === 'C') selectMethod = 'Cartão de Crédito';
      else if (e.key === '4' || keyUpper === 'V') selectMethod = 'Cartão de Débito';
      else if (e.key === '5' || keyUpper === 'R') selectMethod = 'Vale Refeição';
      else if (e.key === '6' || keyUpper === 'F') selectMethod = 'Fiado';

      if (selectMethod) {
        e.preventDefault();
        if (typeof window.checkoutModalSelectMethod === 'function') {
          window.checkoutModalSelectMethod(selectMethod);
        } else {
          const sel = document.getElementById('checkout-modal-metodo');
          if (sel) sel.value = selectMethod;
        }
      }
    }`);
  fs.writeFileSync(shortcutsPath, shortcutsContent, 'utf8');
  console.log('Patch 4: shortcuts.js updated with improved checkout shortcuts');
} else {
  console.log('Patch 4: Target not matched in shortcuts.js');
}

// --- 3. Patch caixa-checkout.js to ensure sync ---
const caixaCheckoutPath = path.join(__dirname, '..', 'caixa-checkout.js');
if (fs.existsSync(caixaCheckoutPath)) {
  let ccContent = fs.readFileSync(caixaCheckoutPath, 'utf8');
  
  // Update checkoutModalSetQuickCash in caixa-checkout.js
  const ccQuickCashRegex = /function checkoutModalSetQuickCash\(val\) \{[\s\S]*?\n\}/;
  if (ccQuickCashRegex.test(ccContent)) {
    ccContent = ccContent.replace(ccQuickCashRegex, `function checkoutModalSetQuickCash(val) {
  if (typeof window !== 'undefined') {
    const sel = document.getElementById('checkout-modal-metodo');
    if (sel && sel.value !== 'Dinheiro' && typeof window.checkoutModalSelectMethod === 'function') {
      window.checkoutModalSelectMethod('Dinheiro');
    }
  }
  const falta = (typeof window !== 'undefined' ? window.mesaFaltaPagar : 0) || 0;
  let valor;
  if (val === 'exato') {
    valor = falta > 0 ? falta : ((typeof window !== 'undefined' ? window.mesaTotalComTaxa : 0) || 0);
    if (typeof window !== 'undefined') window._checkoutAutoFilled = true;
  } else {
    valor = parseFloat(val) || 0;
    if (typeof window !== 'undefined') window._checkoutAutoFilled = false;
  }

  const cents = Math.round(valor * 100);
  if (typeof window !== 'undefined') window.checkoutModalCents = cents;

  const inputValor = typeof document !== 'undefined' ? document.getElementById('checkout-modal-valor') : null;
  if (inputValor) {
    inputValor.value = 'R$ ' + valor.toFixed(2).replace('.', ',');
    inputValor.style.borderColor = '#16a34a';
    inputValor.style.background = '#f0fdf4';
    setTimeout(() => {
      inputValor.style.borderColor = '';
      inputValor.style.background = '';
    }, 600);
  }

  if (typeof window !== 'undefined' && typeof window.checkoutModalUpdateTouchVisor === 'function') {
    window.checkoutModalUpdateTouchVisor();
  }
  if (typeof window !== 'undefined' && typeof window.calcRestante === 'function') {
    window.calcRestante();
  }
}`);
    console.log('Patch 5: caixa-checkout.js checkoutModalSetQuickCash updated');
  }

  fs.writeFileSync(caixaCheckoutPath, ccContent, 'utf8');
}

console.log('Remaining patches complete.');
