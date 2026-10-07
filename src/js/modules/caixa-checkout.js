/**
 * caixa-checkout.js
 * Módulo especializado de Checkout, Pagamento, Troco Rápido (Quick Cash) e Divisão de Contas
 * Integrado ao PDV Chef Cozinha
 */

'use strict';

// ── Estado do Módulo de Checkout ──
let checkoutModalCents = 0;
let _checkoutAutoFilled = false;
let comandaCobrarNome = '';
let comandaModalSharedCredit = false;
let comandaModalTotalVal = 0;
let isComandaPaymentProcessing = false;
let customNfceConfig = null;
const _checkoutItensSemTaxa = new Set();
let _checkoutTaxaManual = null;
let _checkoutClienteId = null;

// Garante que o estado compartilhado esteja acessível no window
if (typeof window !== 'undefined') {
  window.checkoutModalCents = checkoutModalCents;
  window._checkoutAutoFilled = _checkoutAutoFilled;
  window.comandaCobrarNome = comandaCobrarNome;
  window.comandaModalSharedCredit = comandaModalSharedCredit;
  window.comandaModalTotalVal = comandaModalTotalVal;
  window.isComandaPaymentProcessing = isComandaPaymentProcessing;
  window.customNfceConfig = customNfceConfig;
  window._checkoutItensSemTaxa = _checkoutItensSemTaxa;
  window._checkoutTaxaManual = _checkoutTaxaManual;
  window._checkoutClienteId = _checkoutClienteId;
}

/**
 * Quick Cash (Rush Mode): preenche o valor exato ou cédula e calcula troco.
 * @param {string|number} val
 */
function checkoutModalSetQuickCash(val) {
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
}

/**
 * Divisão Expressa da conta em N partes iguais com 1 clique.
 * @param {number} n Número de pessoas/partes
 */
function checkoutModalCalcularDivisaoExpressa(n) {
  const falta = (typeof window !== 'undefined' ? window.mesaFaltaPagar : 0) || 0;
  if (!falta || falta <= 0) return;

  const share = falta / n;
  const inputValor = typeof document !== 'undefined' ? document.getElementById('checkout-modal-valor') : null;
  if (inputValor) {
    inputValor.value = 'R$ ' + share.toFixed(2).replace('.', ',');
    inputValor.style.borderColor = '#3b82f6';
    inputValor.style.background = '#eff6ff';
    setTimeout(() => {
      inputValor.style.borderColor = '';
      inputValor.style.background = '';
    }, 600);
  }

  if (typeof window !== 'undefined') {
    window.checkoutModalCents = Math.round(share * 100);
    if (typeof window.checkoutModalUpdateTouchVisor === 'function') {
      window.checkoutModalUpdateTouchVisor();
    }
  }

  const inputParts = typeof document !== 'undefined' ? document.getElementById('checkout-modal-split-parts') : null;
  if (inputParts) inputParts.value = String(n);

  const statusBox = typeof document !== 'undefined' ? document.getElementById('checkout-modal-split-status') : null;
  const statusTxt = typeof document !== 'undefined' ? document.getElementById('checkout-modal-split-status-txt') : null;
  if (statusBox) statusBox.style.display = 'flex';
  if (statusTxt) statusTxt.textContent = `Dividido em ${n}x de R$ ${share.toFixed(2).replace('.', ',')}`;

  if (typeof document !== 'undefined') {
    document.querySelectorAll('[onclick^="window.checkoutModalCalcularDivisaoExpressa"]').forEach(btn => {
      const match = (btn.getAttribute('onclick') || '').match(/\((\d+)\)/);
      const isActive = match && parseInt(match[1], 10) === n;
      btn.style.background = isActive ? '#1d4ed8' : 'white';
      btn.style.color = isActive ? 'white' : '#1d4ed8';
      btn.style.borderColor = isActive ? '#1d4ed8' : '#93c5fd';
    });
  }

  if (typeof window !== 'undefined' && typeof window.calcRestante === 'function') {
    window.calcRestante();
  }
}

/**
 * Cancela a divisão ativa e restaura o saldo total da mesa.
 */
function checkoutModalCancelarDivisao() {
  const inputParts = typeof document !== 'undefined' ? document.getElementById('checkout-modal-split-parts') : null;
  if (inputParts) inputParts.value = '2';

  const statusBox = typeof document !== 'undefined' ? document.getElementById('checkout-modal-split-status') : null;
  if (statusBox) statusBox.style.display = 'none';

  if (typeof document !== 'undefined') {
    document.querySelectorAll('[onclick^="window.checkoutModalCalcularDivisaoExpressa"]').forEach(btn => {
      btn.style.background = 'white';
      btn.style.color = '#1d4ed8';
      btn.style.borderColor = '#93c5fd';
    });
  }

  const falta = (typeof window !== 'undefined' ? window.mesaFaltaPagar : 0) || 0;
  const inputValor = typeof document !== 'undefined' ? document.getElementById('checkout-modal-valor') : null;
  if (inputValor) {
    inputValor.value = 'R$ ' + falta.toFixed(2).replace('.', ',');
  }
  if (typeof window !== 'undefined') {
    window.checkoutModalCents = Math.round(falta * 100);
    if (typeof window.checkoutModalUpdateTouchVisor === 'function') window.checkoutModalUpdateTouchVisor();
    if (typeof window.calcRestante === 'function') window.calcRestante();
  }
}

/**
 * Abre o modal de cobrança segmentada por comanda individual ou itens compartilhados.
 * @param {string} comandaName
 * @param {number} totalVal
 */
function cobrarComanda(comandaName, totalVal) {
  if (typeof window === 'undefined' || !window.mesaAtual || !window.mesaAtual.items) return;

  window.comandaCobrarNome = comandaName;
  const modalOverlay = document.getElementById('comanda-checkout-overlay');
  const modalTitle = document.getElementById('comanda-modal-title');
  const itemsContainer = document.getElementById('comanda-modal-items');
  const splitChk = document.getElementById('comanda-modal-split-shared');
  const splitValSpan = document.getElementById('comanda-modal-split-value');
  const sharedList = document.getElementById('comanda-modal-shared-list');

  if (!modalOverlay) return;

  if (modalTitle) {
    modalTitle.innerText = comandaName ? `Cobrar Comanda: ${comandaName}` : 'Cobrar Itens Compartilhados';
  }

  const unpaidItems = window.mesaAtual.items.filter(o => o.status !== 'Pago');
  const comandaItems = comandaName
    ? unpaidItems.filter(o => (o.mesa_comanda || '').trim() === comandaName)
    : unpaidItems.filter(o => !(o.mesa_comanda || '').trim());

  if (itemsContainer) {
    if (comandaItems.length === 0) {
      itemsContainer.innerHTML = '<span style="color:#27ae60; font-weight:600;"><i class="ph ph-check-circle"></i> Todos os itens desta comanda já foram pagos!</span>';
    } else {
      itemsContainer.innerHTML = comandaItems.map(it => `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>${it.quantity || it.quantidade || 1}x ${it.productName || it.nome || it.descricao || 'Produto'}</span>
          <span style="font-weight:bold;">R$ ${parseFloat(String(it.total).replace(',', '.')).toFixed(2).replace('.', ',')}</span>
        </div>
      `).join('');
    }
  }

  const numComandas = new Set(unpaidItems.map(o => (o.mesa_comanda || '').trim()).filter(Boolean)).size || 1;
  const sharedItems = unpaidItems.filter(o => !(o.mesa_comanda || '').trim());
  let sharedSum = 0;
  sharedItems.forEach(it => { sharedSum += parseFloat(String(it.total).replace(',', '.')); });

  const sharePerComanda = comandaName && numComandas > 0 ? (sharedSum / numComandas) : 0;
  if (splitValSpan) {
    splitValSpan.innerText = `R$ ${sharePerComanda.toFixed(2).replace('.', ',')}`;
  }
  if (splitChk) splitChk.checked = false;

  if (sharedList && sharedList.parentElement) {
    if (!comandaName || sharedItems.length === 0) {
      sharedList.parentElement.style.display = 'none';
    } else {
      sharedList.parentElement.style.display = 'block';
      sharedList.innerHTML = sharedItems.map(it => `
        <label style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
          <span style="display:flex; align-items:center; gap:6px;">
            <input type="checkbox" class="chk-shared-item" data-id="${it.id}" data-price="${parseFloat(String(it.total).replace(',', '.'))}" onchange="window.recalcComandaModal()">
            ${it.quantity || it.quantidade || 1}x ${it.productName || it.nome || it.descricao || 'Produto'}
          </span>
          <span>R$ ${parseFloat(String(it.total).replace(',', '.')).toFixed(2).replace('.', ',')}</span>
        </label>
      `).join('');
    }
  }

  const partialInput = document.getElementById('comanda-modal-partial-value');
  if (partialInput) partialInput.value = '0';

  modalOverlay.style.display = 'flex';
  if (typeof window.recalcComandaModal === 'function') window.recalcComandaModal();
  refreshComandaModalStatus();
}

/**
 * Consulta em tempo real o status de pagamentos parciais da comanda via Socket
 */
function refreshComandaModalStatus() {
  if (typeof document === 'undefined') return;
  const section = document.getElementById('comanda-modal-status-section');
  const listEl = document.getElementById('comanda-modal-status-list');
  if (!section || !listEl) return;
  const mesaName = (typeof window !== 'undefined' && window.mesaAtual) ? (window.mesaAtual.nome || window.mesaAtual.mesaName) : '';
  if (!mesaName) return;

  if (typeof window !== 'undefined' && typeof window.socket !== 'undefined' && window.socket) {
    window.socket.emit('comanda_status_mesa', { mesaName });
  } else {
    section.style.display = 'none';
  }
}

/**
 * Renderiza o histórico de pagamentos parciais da comanda
 */
function _renderComandaModalStatus(movimentos, cName) {
  if (typeof document === 'undefined') return;
  const section = document.getElementById('comanda-modal-status-section');
  const listEl = document.getElementById('comanda-modal-status-list');
  if (!section || !listEl) return;

  if (!movimentos || movimentos.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  listEl.innerHTML = movimentos.map(m => `
    <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:3px 0; border-bottom:1px dashed #e2e8f0;">
      <span><b>${m.metodo || 'Pagamento'}</b> (${m.comanda_nome || 'Mesa'}):</span>
      <span style="color:#27ae60; font-weight:700;">R$ ${parseFloat(m.valor || 0).toFixed(2).replace('.', ',')}</span>
    </div>
  `).join('');
}

/**
 * Recalcula totais da comanda considerando itens selecionados e taxa de serviço
 */
function recalcComandaModal() {
  if (typeof window === 'undefined' || !window.mesaAtual) return;
  const cName = window.comandaCobrarNome;
  const unpaidItems = (window.mesaAtual && window.mesaAtual.items) ? window.mesaAtual.items.filter(o => o.status !== 'Pago') : [];
  let baseTotal = 0;

  if (cName) {
    unpaidItems.filter(o => (o.mesa_comanda || '').trim() === cName).forEach(it => {
      baseTotal += parseFloat(String(it.total).replace(',', '.'));
    });
  } else {
    unpaidItems.filter(o => !(o.mesa_comanda || '').trim()).forEach(it => {
      baseTotal += parseFloat(String(it.total).replace(',', '.'));
    });
  }

  // Adiciona itens compartilhados marcados individualmente
  if (typeof document !== 'undefined') {
    document.querySelectorAll('.chk-shared-item:checked').forEach(chk => {
      baseTotal += parseFloat(chk.getAttribute('data-price') || '0');
    });

    const splitChk = document.getElementById('comanda-modal-split-shared');
    const partialInput = document.getElementById('comanda-modal-partial-value');
    const partialVal = partialInput ? (parseFloat(partialInput.value) || 0) : 0;

    let useSharedCredit = false;
    if (splitChk && splitChk.checked && cName) {
      baseTotal += partialVal;
      useSharedCredit = true;
    }
    window.comandaModalSharedCredit = useSharedCredit;

    const serviceCheckbox = document.getElementById('taxa-servico');
    if (serviceCheckbox && serviceCheckbox.checked && !window.comandaModalSharedCredit) {
      baseTotal *= 1.1;
    }

    window.comandaModalTotalVal = baseTotal;
    const totalEl = document.getElementById('comanda-modal-total');
    if (totalEl) {
      totalEl.innerText = `R$ ${Math.max(0, baseTotal).toFixed(2).replace('.', ',')}`;
    }
  }
}

/**
 * Conclui a cobrança da comanda e emite evento ao servidor Socket
 */
function finalizarComandaModal() {
  if (typeof window === 'undefined') return;
  if (window.isComandaPaymentProcessing) return;

  const val = window.comandaModalTotalVal || 0;
  if (val <= 0) {
    alert('Esta comanda já foi totalmente paga ou o valor a cobrar é zerado.');
    return;
  }

  const methodEl = typeof document !== 'undefined' ? document.getElementById('comanda-modal-method') : null;
  const method = methodEl ? methodEl.value : 'Dinheiro';
  const cName = window.comandaCobrarNome;
  const mesaName = window.mesaAtual ? (window.mesaAtual.nome || window.mesaAtual.mesaName) : '';

  const unpaidItems = (window.mesaAtual && window.mesaAtual.items) ? window.mesaAtual.items.filter(o => o.status !== 'Pago') : [];
  let itemsToPay = cName
    ? unpaidItems.filter(o => (o.mesa_comanda || '').trim() === cName)
    : unpaidItems.filter(o => !(o.mesa_comanda || '').trim());

  const checkedSharedIds = typeof document !== 'undefined'
    ? Array.from(document.querySelectorAll('.chk-shared-item:checked')).map(chk => parseInt(chk.getAttribute('data-id'), 10)).filter(Boolean)
    : [];

  const itemIds = [...new Set([...itemsToPay.map(i => i.id), ...checkedSharedIds])];

  // Baixa otimista na memória da tela
  itemIds.forEach(id => {
    const found = window.mesaAtual.items.find(it => it.id === id);
    if (found) found.status = 'Pago';
  });
  window.comandaModalTotalVal = 0;
  window.isComandaPaymentProcessing = true;

  const modalOverlay = typeof document !== 'undefined' ? document.getElementById('comanda-checkout-overlay') : null;
  const btns = modalOverlay ? modalOverlay.querySelectorAll('button') : [];
  btns.forEach(b => { b.style.pointerEvents = 'none'; });

  if (typeof window.socket !== 'undefined' && window.socket) {
    const serviceCheckboxComanda = typeof document !== 'undefined' ? document.getElementById('taxa-servico') : null;
    const partialInput = typeof document !== 'undefined' ? document.getElementById('comanda-modal-partial-value') : null;
    const partialVal = partialInput ? (parseFloat(partialInput.value) || 0) : 0;

    if (window.comandaModalSharedCredit && cName) {
      const valorComanda = itemsToPay.reduce((s, it) => s + (parseFloat(String(it.total).replace(',', '.')) || 0), 0);
      window.socket.emit('comanda_cobrar_compartilhados', {
        mesaName,
        comandaName: cName,
        valorComanda: Math.round(valorComanda * 100) / 100,
        valorCompartilhado: Math.round(partialVal * 100) / 100,
        itemIdsComanda: itemsToPay.map(i => i.id),
        itemIdCompartilhado: null,
        metodo: method,
        comTaxa: false,
        userName: window.loggedInUser || 'Caixa',
        observacao: `Pagamento da comanda ${cName} + crédito parcial de compartilhados`
      });
    } else {
      window.socket.emit('pagamento_parcial_valor', {
        mesaName,
        valor: val,
        metodo: method,
        comTaxa: serviceCheckboxComanda ? serviceCheckboxComanda.checked : true,
        desconto: window.descontoAdicional || 0,
        comandaName: cName,
        itemIds,
        userName: window.loggedInUser || 'Caixa'
      });
    }
  }

  tocarSomPagamento();

  setTimeout(() => {
    window.isComandaPaymentProcessing = false;
    btns.forEach(b => { b.style.pointerEvents = 'auto'; });
    if (modalOverlay) modalOverlay.style.display = 'none';
    alert(`Pagamento de R$ ${val.toFixed(2).replace('.', ',')} (${method}) recebido com sucesso para ${cName ? 'Comanda ' + cName : 'Itens Compartilhados'}!`);
    window.comandaModalSharedCredit = false;
  }, 1000);
}

/**
 * Sintetizador Web Audio nativo para confirmação sonora de pagamento
 */
function tocarSomPagamento() {
  try {
    if (typeof window === 'undefined') return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const play = (freq, t, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + t);
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + dur + 0.05);
    };
    play(988, 0, 0.25); // B5
    play(1319, 0.18, 0.3); // E6
  } catch (_) { }
}

/**
 * Alterna a cobrança de taxa de serviço por item individual
 */
function checkoutItemTaxaToggle(itemId, cobrar) {
  if (itemId == null || typeof window === 'undefined') return;
  if (cobrar) _checkoutItensSemTaxa.delete(itemId);
  else _checkoutItensSemTaxa.add(itemId);

  const itens = (window.mesaAtual && window.mesaAtual.items) || [];
  const brutoTodos = itens.reduce((s, it) => s + (parseFloat(String(it.total).replace(',', '.')) || 0), 0);
  const isentoTodos = itens.reduce((s, it) => {
    if (it.status === 'Pago') return s;
    return _checkoutItensSemTaxa.has(it.id) ? s + (parseFloat(String(it.total).replace(',', '.')) || 0) : s;
  }, 0);

  const novaTaxa = Math.round((Math.max(0, brutoTodos - isentoTodos) * 0.10) * 100) / 100;
  window._checkoutTaxaManual = novaTaxa;
  const nomeMesa = window.mesaAtual ? (window.mesaAtual.mesaName || window.mesaAtual.nome) : null;
  if (nomeMesa && typeof window.socket !== 'undefined' && window.socket) {
    window.socket.emit('definir_taxa_mesa', { mesaName: nomeMesa, valor: novaTaxa });
  }
  if (typeof window.calcRestante === 'function') window.calcRestante();
}

/**
 * Abre/fecha a linha de edição manual de taxa de serviço
 */
function checkoutTaxaToggleManual() {
  if (typeof document === 'undefined') return;
  const row = document.getElementById('checkout-modal-taxa-manual-row');
  if (row) {
    row.style.display = (row.style.display === 'none' || !row.style.display) ? 'flex' : 'none';
  }
}

// ── Exposição no window global para compatibilidade com HTML legada ──
if (typeof window !== 'undefined') {
  window.checkoutModalSetQuickCash = checkoutModalSetQuickCash;
  window.checkoutModalCalcularDivisaoExpressa = checkoutModalCalcularDivisaoExpressa;
  window.checkoutModalCancelarDivisao = checkoutModalCancelarDivisao;
  window.cobrarComanda = cobrarComanda;
  window.refreshComandaModalStatus = refreshComandaModalStatus;
  window._renderComandaModalStatus = _renderComandaModalStatus;
  window.recalcComandaModal = recalcComandaModal;
  window.finalizarComandaModal = finalizarComandaModal;
  window.tocarSomPagamento = tocarSomPagamento;
  window.checkoutItemTaxaToggle = checkoutItemTaxaToggle;
  window.checkoutTaxaToggleManual = checkoutTaxaToggleManual;
}

// Suporte para ES Modules
export {
  checkoutModalSetQuickCash,
  checkoutModalCalcularDivisaoExpressa,
  checkoutModalCancelarDivisao,
  cobrarComanda,
  refreshComandaModalStatus,
  _renderComandaModalStatus,
  recalcComandaModal,
  finalizarComandaModal,
  tocarSomPagamento,
  checkoutItemTaxaToggle,
  checkoutTaxaToggleManual
};
