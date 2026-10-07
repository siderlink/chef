// scripts/patch-main-checkout.js
const fs = require('fs');
const path = require('path');

const mainPath = path.join(__dirname, '..', 'main.js');
let mainContent = fs.readFileSync(mainPath, 'utf8');

// 1. Replace alert on troco in checkoutModalAddPagamento
const oldTrocoAlert = `    const troco = valor - falta;
    alert(\`✅ Pagamento em Dinheiro registrado.\\n\\nDEVOLVER DE TROCO AO CLIENTE: R$ \${troco.toFixed(2).replace('.', ',')}\`);`;

const newTrocoToast = `    const troco = valor - falta;
    if (typeof window.checkoutModalShowTrocoToast === 'function') {
      window.checkoutModalShowTrocoToast(troco);
    } else {
      alert(\`✅ Pagamento em Dinheiro registrado.\\n\\nDEVOLVER DE TROCO AO CLIENTE: R$ \${troco.toFixed(2).replace('.', ',')}\`);
    }`;

if (mainContent.includes(oldTrocoAlert)) {
  mainContent = mainContent.replace(oldTrocoAlert, newTrocoToast);
  console.log('Updated troco feedback in checkoutModalAddPagamento');
} else {
  console.warn('Could not find oldTrocoAlert in main.js');
}

// 2. In calcRestante, update live troco card and split tracker
const oldCalcEnd = `            if (statusBox) {
              statusBox.style.background = '#fff5f5';
              statusBox.style.borderColor = '#fed7d7';
            }
          }
        }`;

const newCalcEnd = `            if (statusBox) {
              statusBox.style.background = '#fff5f5';
              statusBox.style.borderColor = '#fed7d7';
            }
          }
        }

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
        }`;

if (mainContent.includes(oldCalcEnd)) {
  mainContent = mainContent.replace(oldCalcEnd, newCalcEnd);
  console.log('Updated calcRestante with live troco card & split tracker');
} else {
  console.warn('Could not find oldCalcEnd in main.js');
}

// 3. In abrirCheckoutModal, sync method pill
const oldAbrirModalPix = `  // Painel Pix (se o método já estiver em Pix)
  if (window.checkoutModalAtualizarPix) window.checkoutModalAtualizarPix();`;

const newAbrirModalPix = `  // Sincroniza pills de método de pagamento (padrão Dinheiro)
  const selMetodoAtual = document.getElementById('checkout-modal-metodo');
  const mAtual = (selMetodoAtual && selMetodoAtual.value) ? selMetodoAtual.value : 'Dinheiro';
  if (typeof window.checkoutModalSelectMethod === 'function') {
    window.checkoutModalSelectMethod(mAtual);
  } else if (window.checkoutModalAtualizarPix) {
    window.checkoutModalAtualizarPix();
  }`;

if (mainContent.includes(oldAbrirModalPix)) {
  mainContent = mainContent.replace(oldAbrirModalPix, newAbrirModalPix);
  console.log('Updated abrirCheckoutModal with method sync');
} else {
  console.warn('Could not find oldAbrirModalPix in main.js');
}

// 4. Replace quick cash & split suite
const quickCashStart = `// ── 💰 QUICK CASH (Rush Mode) ──────────────────────────────────────────`;
const quickCashEnd = `window.customNfceConfig = null;`;

const quickCashBlockRegex = /\/\/ ── 💰 QUICK CASH \(Rush Mode\)[\s\S]*?window\.customNfceConfig = null;/;

const newQuickCashAndMethodsSuite = `// ── 💳 CHECKOUT PRO UX: MÉTODOS 1-CLIQUE, CÉDULAS & DIVISÃO INTELIGENTE ──

window.checkoutModalSelectMethod = function (metodo) {
  const sel = document.getElementById('checkout-modal-metodo');
  if (sel) {
    sel.value = metodo;
  }
  window.checkoutModalSyncMetodoUI(metodo);

  const pixPanel = document.getElementById('checkout-modal-pix-panel');
  const quickCashRow = document.getElementById('checkout-modal-quick-cash-row');
  const liveTrocoCard = document.getElementById('checkout-modal-troco-live-card');
  const inputValor = document.getElementById('checkout-modal-valor');
  const falta = typeof window.mesaFaltaPagar === 'number' ? window.mesaFaltaPagar : 0;

  if (metodo === 'Pix') {
    if (pixPanel) pixPanel.style.display = 'block';
    if (quickCashRow) quickCashRow.style.display = 'none';
    if (liveTrocoCard) liveTrocoCard.style.display = 'none';
    if (typeof window.checkoutModalAtualizarPix === 'function') {
      window.checkoutModalAtualizarPix();
    }
    if (inputValor && falta > 0) {
      inputValor.value = 'R$ ' + falta.toFixed(2).replace('.', ',');
      window.checkoutModalCents = Math.round(falta * 100);
      window._checkoutAutoFilled = true;
    }
  } else if (metodo === 'Dinheiro') {
    if (pixPanel) pixPanel.style.display = 'none';
    if (quickCashRow) quickCashRow.style.display = 'block';
    if (liveTrocoCard && typeof window.calcRestante === 'function') {
      window.calcRestante();
    }
  } else {
    // Cartões / VR / Fiado
    if (pixPanel) pixPanel.style.display = 'none';
    if (quickCashRow) quickCashRow.style.display = 'none';
    if (liveTrocoCard) liveTrocoCard.style.display = 'none';
    if (inputValor && falta > 0) {
      inputValor.value = 'R$ ' + falta.toFixed(2).replace('.', ',');
      window.checkoutModalCents = Math.round(falta * 100);
      window._checkoutAutoFilled = true;
    }
  }

  if (typeof window.checkoutModalUpdateTouchVisor === 'function') {
    window.checkoutModalUpdateTouchVisor();
  }
  if (typeof window.calcRestante === 'function') {
    window.calcRestante();
  }

  // Foco no input
  if (inputValor && !window.checkoutModalTouchModeActive) {
    inputValor.focus();
    inputValor.select();
  }
};

window.checkoutModalSyncMetodoUI = function (metodo) {
  document.querySelectorAll('.checkout-method-pill').forEach(btn => {
    const m = btn.getAttribute('data-method');
    const isActive = m === metodo;
    btn.classList.toggle('active', isActive);
  });
  // Também sincroniza botões touch se existirem
  document.querySelectorAll('.touch-method-btn').forEach(btn => {
    const m = btn.getAttribute('data-method');
    const isActive = m === metodo;
    btn.classList.toggle('active', isActive);
    btn.style.borderColor = isActive ? '#fc4b15' : 'var(--border-color)';
    btn.style.background = isActive ? 'rgba(252,75,21,0.08)' : 'var(--bg-card)';
  });
};

window.checkoutModalConfirmarPixRapido = function () {
  const falta = typeof window.mesaFaltaPagar === 'number' ? window.mesaFaltaPagar : 0;
  if (!window.mesaAtual) return alert('Selecione uma mesa primeiro.');
  if (falta <= 0.01) {
    return alert('Esta mesa já está quitada.');
  }
  window.checkoutModalSelectMethod('Pix');
  const inputValor = document.getElementById('checkout-modal-valor');
  if (inputValor) {
    inputValor.value = 'R$ ' + falta.toFixed(2).replace('.', ',');
    window.checkoutModalCents = Math.round(falta * 100);
  }
  window.checkoutModalAddPagamento();
};

window.checkoutPixCopiar = function () {
  const payload = window._pixPayloadAtual || (document.getElementById('pix-copia-texto') ? document.getElementById('pix-copia-texto').value : '');
  if (!payload) return;
  const btn = document.getElementById('btn-pix-copiar');
  const origHtml = btn ? btn.innerHTML : '';
  const origBg = btn ? btn.style.background : '';

  const showCopiedFeedback = () => {
    if (btn) {
      btn.innerHTML = '<i class="ph ph-check-circle"></i> <span>Chave Copiada!</span>';
      btn.style.background = '#059669';
      setTimeout(() => {
        btn.innerHTML = origHtml;
        btn.style.background = origBg;
      }, 2500);
    }
    const toast = document.getElementById('checkout-modal-toast-inline');
    const toastMsg = document.getElementById('checkout-modal-toast-inline-msg');
    if (toast && toastMsg) {
      toastMsg.innerText = 'Código PIX Copia-e-Cola copiado com sucesso para a área de transferência!';
      toast.style.display = 'flex';
      setTimeout(() => { toast.style.display = 'none'; }, 3500);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(payload).then(showCopiedFeedback).catch(() => {
      const ta = document.getElementById('pix-copia-texto');
      if (ta) { ta.select(); document.execCommand('copy'); }
      showCopiedFeedback();
    });
  } else {
    const ta = document.getElementById('pix-copia-texto');
    if (ta) { ta.select(); document.execCommand('copy'); }
    showCopiedFeedback();
  }
};

window.checkoutModalShowTrocoToast = function (troco) {
  const toast = document.getElementById('checkout-modal-toast-inline');
  const toastMsg = document.getElementById('checkout-modal-toast-inline-msg');
  if (toast && toastMsg) {
    toastMsg.innerHTML = \`Pagamento em <b>Dinheiro</b> registrado! <span style="color:#059669; font-weight:900;">DEVOLVER TROCO: R$ \${troco.toFixed(2).replace('.', ',')}</span>\`;
    toast.style.display = 'flex';
    setTimeout(() => { toast.style.display = 'none'; }, 8000);
  }
  if (typeof window.showToast === 'function') {
    window.showToast(\`Pagamento em Dinheiro! Troco: R$ \${troco.toFixed(2).replace('.', ',')}\`, 'success');
  }
};

// ── 💰 QUICK CASH (Rush Mode) ──────────────────────────────────────────
window.checkoutModalSetQuickCash = function (val) {
  const sel = document.getElementById('checkout-modal-metodo');
  if (sel && sel.value !== 'Dinheiro') {
    window.checkoutModalSelectMethod('Dinheiro');
  }

  const falta = window.mesaFaltaPagar || 0;
  let valor;
  if (val === 'exato') {
    valor = falta > 0 ? falta : (window.mesaTotalComTaxa || 0);
    window._checkoutAutoFilled = true;
  } else {
    valor = parseFloat(val) || 0;
    window._checkoutAutoFilled = false;
  }

  window.checkoutModalCents = Math.round(valor * 100);

  const inputValor = document.getElementById('checkout-modal-valor');
  if (inputValor) {
    inputValor.value = 'R$ ' + valor.toFixed(2).replace('.', ',');
    inputValor.style.borderColor = '#16a34a';
    inputValor.style.background = '#f0fdf4';
    setTimeout(() => {
      inputValor.style.borderColor = '';
      inputValor.style.background = '';
    }, 600);
  }

  if (typeof window.checkoutModalUpdateTouchVisor === 'function') {
    window.checkoutModalUpdateTouchVisor();
  }
  if (typeof window.calcRestante === 'function') window.calcRestante();
};

// ── ✂️ DIVISÃO INTELIGENTE POR N PESSOAS ──────────────────────────────
window.checkoutModalCalcularDivisaoExpressa = function (n) {
  if (!n || n < 2) n = 2;
  window._checkoutSplitN = n;

  const totalBase = (typeof window.mesaTotalComTaxa === 'number' && window.mesaTotalComTaxa > 0)
    ? window.mesaTotalComTaxa
    : ((window.mesaAtual && (window.mesaAtual.totalBruto || window.mesaAtual.total)) || window.mesaFaltaPagar || 0);

  const share = totalBase > 0 ? (totalBase / n) : ((window.mesaFaltaPagar || 0) / n);
  window._checkoutSplitShare = share;

  const inputValor = document.getElementById('checkout-modal-valor');
  if (inputValor) {
    inputValor.value = 'R$ ' + share.toFixed(2).replace('.', ',');
    inputValor.style.borderColor = '#16a34a';
    inputValor.style.background = '#f0fdf4';
    setTimeout(() => {
      inputValor.style.borderColor = '';
      inputValor.style.background = '';
    }, 600);
  }

  window.checkoutModalCents = Math.round(share * 100);
  if (typeof window.checkoutModalUpdateTouchVisor === 'function') {
    window.checkoutModalUpdateTouchVisor();
  }

  const inputParts = document.getElementById('checkout-modal-split-parts');
  if (inputParts) inputParts.value = String(n);

  const labelParts = document.getElementById('checkout-modal-split-counter-label');
  if (labelParts) labelParts.innerText = \`÷ \${n}\`;

  const statusBox = document.getElementById('checkout-modal-split-status');
  const statusTxt = document.getElementById('checkout-modal-split-status-txt');
  if (statusBox) statusBox.style.display = 'flex';
  if (statusTxt) statusTxt.innerHTML = \`<b>\${n} pessoas:</b> R$ \${share.toFixed(2).replace('.', ',')} cada\`;

  document.querySelectorAll('.btn-split-chip').forEach(btn => {
    const match = (btn.getAttribute('onclick') || '').match(/\\((\\d+)\\)/);
    const isActive = match && parseInt(match[1], 10) === n;
    btn.classList.toggle('active', isActive);
    btn.style.background = isActive ? '#16a34a' : 'white';
    btn.style.color = isActive ? 'white' : '#166534';
    btn.style.borderColor = isActive ? '#16a34a' : '#86efac';
  });

  window.checkoutModalAtualizarSplitTracker();
  if (typeof window.calcRestante === 'function') window.calcRestante();
};

window.checkoutModalSplitStep = function (delta) {
  let curr = window._checkoutSplitN || 2;
  let next = Math.max(2, Math.min(50, curr + delta));
  window.checkoutModalCalcularDivisaoExpressa(next);
};

window.checkoutModalPreencherCota = function () {
  const share = window._checkoutSplitShare || 0;
  if (share <= 0) return;
  const inputValor = document.getElementById('checkout-modal-valor');
  if (inputValor) {
    inputValor.value = 'R$ ' + share.toFixed(2).replace('.', ',');
    inputValor.style.borderColor = '#16a34a';
    inputValor.style.background = '#f0fdf4';
    setTimeout(() => {
      inputValor.style.borderColor = '';
      inputValor.style.background = '';
    }, 600);
    inputValor.focus();
    inputValor.select();
  }
  window.checkoutModalCents = Math.round(share * 100);
  if (typeof window.checkoutModalUpdateTouchVisor === 'function') {
    window.checkoutModalUpdateTouchVisor();
  }
};

window.checkoutModalAtualizarSplitTracker = function () {
  const tracker = document.getElementById('checkout-modal-split-tracker');
  if (!tracker) return;
  const n = window._checkoutSplitN;
  const share = window._checkoutSplitShare;
  if (!n || !share || share <= 0) {
    tracker.style.display = 'none';
    return;
  }
  const totalBase = (typeof window.mesaTotalComTaxa === 'number' && window.mesaTotalComTaxa > 0)
    ? window.mesaTotalComTaxa
    : ((window.mesaAtual && (window.mesaAtual.totalBruto || window.mesaAtual.total)) || window.mesaFaltaPagar || 0);
  const totalPago = Math.max(0, totalBase - (window.mesaFaltaPagar || 0));
  const cotasPagas = Math.min(n, Math.max(0, Math.round(totalPago / share)));
  tracker.innerText = \`\${cotasPagas} de \${n} cotas pagas\`;
  tracker.style.display = 'inline-block';
};

window.checkoutModalCancelarDivisao = function () {
  window._checkoutSplitN = null;
  window._checkoutSplitShare = null;
  const inputParts = document.getElementById('checkout-modal-split-parts');
  if (inputParts) inputParts.value = '2';

  const labelParts = document.getElementById('checkout-modal-split-counter-label');
  if (labelParts) labelParts.innerText = '÷ N';

  const statusBox = document.getElementById('checkout-modal-split-status');
  if (statusBox) statusBox.style.display = 'none';

  const tracker = document.getElementById('checkout-modal-split-tracker');
  if (tracker) tracker.style.display = 'none';

  document.querySelectorAll('.btn-split-chip').forEach(btn => {
    btn.classList.remove('active');
    btn.style.background = 'white';
    btn.style.color = '#166534';
    btn.style.borderColor = '#86efac';
  });

  const falta = window.mesaFaltaPagar || 0;
  const inputValor = document.getElementById('checkout-modal-valor');
  if (inputValor) {
    inputValor.value = 'R$ ' + falta.toFixed(2).replace('.', ',');
  }
  window.checkoutModalCents = Math.round(falta * 100);
  if (typeof window.checkoutModalUpdateTouchVisor === 'function') {
    window.checkoutModalUpdateTouchVisor();
  }
  if (typeof window.calcRestante === 'function') window.calcRestante();
};

window.customNfceConfig = null;`;

if (quickCashBlockRegex.test(mainContent)) {
  mainContent = mainContent.replace(quickCashBlockRegex, newQuickCashAndMethodsSuite);
  console.log('Replaced quick cash and split suite in main.js');
} else {
  console.warn('Could not match quickCashBlockRegex in main.js');
}

fs.writeFileSync(mainPath, mainContent, 'utf8');
console.log('main.js patch complete.');

// 5. Update shortcuts.js for keyboard shortcuts in checkout modal
const shortcutsPath = path.join(__dirname, '..', 'shortcuts.js');
let shortcutsContent = fs.readFileSync(shortcutsPath, 'utf8');

const oldShortcutsSelectMethod = `    if (!isInputActive) {
      const keyUpper = e.key.toUpperCase();
      let selectMethod = null;
      if (e.key === '1' || keyUpper === 'D') selectMethod = 'Dinheiro';
      else if (e.key === '2' || keyUpper === 'P') selectMethod = 'Pix';
      else if (e.key === '3' || keyUpper === 'C') selectMethod = 'Cartão de Crédito';
      else if (e.key === '4' || keyUpper === 'V') selectMethod = 'Cartão de Débito';
      else if (e.key === '5' || keyUpper === 'F') selectMethod = 'Fiado / Conta';

      if (selectMethod) {
        e.preventDefault();
        const sel = document.getElementById('checkout-modal-metodo');
        if (sel) {
          sel.value = selectMethod;
        }
        if (typeof window.checkoutModalSelectTouchMethod === 'function') {
          window.checkoutModalSelectTouchMethod(selectMethod);
        }
        if (window.checkoutModalAddPagamento) window.checkoutModalAddPagamento();
      }
    }`;

const newShortcutsSelectMethod = `    // ESC fecha o modal de checkout
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
    }`;

if (shortcutsContent.includes(oldShortcutsSelectMethod)) {
  shortcutsContent = shortcutsContent.replace(oldShortcutsSelectMethod, newShortcutsSelectMethod);
  fs.writeFileSync(shortcutsPath, shortcutsContent, 'utf8');
  console.log('shortcuts.js updated with new checkout shortcuts.');
} else {
  console.warn('Could not find oldShortcutsSelectMethod in shortcuts.js');
}
