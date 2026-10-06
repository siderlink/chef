// --- FUNÇÕES DE COBRANÇA POR COMANDA ---
window.comandaCobrarNome = '';
window.comandaModalTotalVal = 0;

window.cobrarComanda = function (comandaName, totalVal) {
  if (!window.mesaAtual || !window.mesaAtual.items) return;

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
  window.recalcComandaModal();
  window.refreshComandaModalStatus();
};

// Status atual do pagamento (movimentações financeiras por comanda) desta mesa
window.refreshComandaModalStatus = function () {
  const section = document.getElementById('comanda-modal-status-section');
  const listEl = document.getElementById('comanda-modal-status-list');
  if (!section || !listEl) return;
  const mesaName = window.mesaAtual ? (window.mesaAtual.nome || window.mesaAtual.mesaName) : '';
  const cName = window.comandaCobrarNome;
  if (!mesaName) return;
  if (typeof socket !== 'undefined' && socket) {
    socket.emit('comanda_status_mesa', { mesaName });
  } else {
    section.style.display = 'none';
  }
};

window._renderComandaModalStatus = function (movimentos, cName) {
  const section = document.getElementById('comanda-modal-status-section');
  const listEl = document.getElementById('comanda-modal-status-list');
  if (!section || !listEl) return;
  const rows = (movimentos || []).filter(m => !cName || !m.comanda || String(m.comanda).trim() === String(cName).trim());
  if (!rows || rows.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  const fmt = v => 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');
  listEl.innerHTML = rows.map(m => {
    const tipoLabel = m.tipo === 'comanda' ? 'Comanda' : 'Compartilhados';
    const comandaTag = m.comanda ? `<span style="opacity:.7;">(${m.comanda})</span>` : '';
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(39,174,96,0.08); border:1px solid rgba(39,174,96,0.25); border-radius:8px; padding:6px 8px;">
        <div style="display:flex; flex-direction:column; gap:2px;">
          <span style="font-weight:600;">${tipoLabel} ${comandaTag} - ${m.metodo}</span>
          <span style="font-size:11px; color:#888;">${m.criado_em || ''} &middot; ${m.operador}${m.observacao ? ' &middot; ' + m.observacao : ''}</span>
        </div>
        <span style="font-weight:700; color:#27ae60;">${fmt(m.valor)}</span>
      </div>`;
  }).join('');
};

window.recalcComandaModal = function () {
  if (!window.mesaAtual || !window.mesaAtual.items) return;
  const cName = window.comandaCobrarNome;
  const unpaidItems = window.mesaAtual.items.filter(o => o.status !== 'Pago');

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

  const splitChk = document.getElementById('comanda-modal-split-shared');
  if (splitChk && splitChk.checked && cName) {
    const sharedItems = unpaidItems.filter(o => !(o.mesa_comanda || '').trim());
    let sharedSum = 0;
    sharedItems.forEach(it => { sharedSum += parseFloat(String(it.total).replace(',', '.')); });
    const numComandas = new Set(unpaidItems.map(o => (o.mesa_comanda || '').trim()).filter(Boolean)).size || 1;
    baseTotal += (sharedSum / numComandas);
  } else {
    document.querySelectorAll('.chk-shared-item:checked').forEach(chk => {
      baseTotal += parseFloat(chk.getAttribute('data-price') || 0);
    });
  }

  const partialInput = document.getElementById('comanda-modal-partial-value');
  if (partialInput) {
    baseTotal += (parseFloat(partialInput.value) || 0);
  }

  let useSharedCreditFlag = false;
  if (partialInput) {
    useSharedCreditFlag = (parseFloat(partialInput.value) || 0) > 0;
  }
  window.comandaModalSharedCredit = useSharedCreditFlag;

  const serviceCheckbox = document.getElementById('taxa-servico');
  if (serviceCheckbox && serviceCheckbox.checked && !window.comandaModalSharedCredit) {
    baseTotal *= 1.1;
  }

  window.comandaModalTotalVal = baseTotal;
  const totalEl = document.getElementById('comanda-modal-total');
  if (totalEl) {
    totalEl.innerText = `R$ ${Math.max(0, baseTotal).toFixed(2).replace('.', ',')}`;
  }
};

window.finalizarComandaModal = function () {
  if (window.isComandaPaymentProcessing) return;

  const val = window.comandaModalTotalVal || 0;
  if (val <= 0) {
    alert('Esta comanda já foi totalmente paga ou o valor a cobrar é zerado.');
    return;
  }
  const methodEl = document.getElementById('comanda-modal-method');
  const method = methodEl ? methodEl.value : 'Dinheiro';
  const cName = window.comandaCobrarNome;
  const mesaName = window.mesaAtual ? (window.mesaAtual.nome || window.mesaAtual.mesaName) : '';

  // Obter os IDs dos itens desta comanda que serão marcados como 'Pago'
  const unpaidItems = (window.mesaAtual && window.mesaAtual.items) ? window.mesaAtual.items.filter(o => o.status !== 'Pago') : [];
  let itemsToPay = [];
  if (cName) {
    itemsToPay = unpaidItems.filter(o => (o.mesa_comanda || '').trim() === cName);
  } else {
    itemsToPay = unpaidItems.filter(o => !(o.mesa_comanda || '').trim());
  }

  const checkedSharedIds = Array.from(document.querySelectorAll('.chk-shared-item:checked'))
    .map(chk => parseInt(chk.getAttribute('data-id'), 10))
    .filter(Boolean);

  const itemIds = [...new Set([...itemsToPay.map(i => i.id), ...checkedSharedIds])];

  // Marcar itens na memória imediatamente (baixa otimista)
  itemIds.forEach(id => {
    const found = window.mesaAtual.items.find(it => it.id === id);
    if (found) found.status = 'Pago';
  });
  window.comandaModalTotalVal = 0;

  window.isComandaPaymentProcessing = true;
  const modalOverlay = document.getElementById('comanda-checkout-overlay');
  const btns = modalOverlay ? modalOverlay.querySelectorAll('button') : [];
  btns.forEach(b => b.style.pointerEvents = 'none');

  if (typeof socket !== 'undefined' && socket) {
    const serviceCheckboxComanda = document.getElementById('taxa-servico');
    const partialInput = document.getElementById('comanda-modal-partial-value');
    const partialVal = partialInput ? (parseFloat(partialInput.value) || 0) : 0;

    if (window.comandaModalSharedCredit && cName) {
      // Crédito parcial de compartilhados: cobra a comanda + valor parcial
      // dos compartilhados como crédito financeiro (não consome a quantidade).
      const valorComanda = itemsToPay.reduce((s, it) => s + (parseFloat(String(it.total).replace(',', '.')) || 0), 0);
      const valorCompartilhado = partialVal;
      socket.emit('comanda_cobrar_compartilhados', {
        mesaName: mesaName,
        comandaName: cName,
        valorComanda: Math.round(valorComanda * 100) / 100,
        valorCompartilhado: Math.round(valorCompartilhado * 100) / 100,
        itemIdsComanda: itemsToPay.map(i => i.id),
        itemIdCompartilhado: null,
        metodo: method,
        comTaxa: false,
        userName: window.loggedInUser || 'Caixa',
        observacao: cName ? `Pagamento da comanda ${cName} + crédito parcial de itens compartilhados` : 'Crédito parcial de itens compartilhados'
      });
    } else {
      socket.emit('pagamento_parcial_valor', {
        mesaName: mesaName,
        valor: val,
        metodo: method,
        comTaxa: serviceCheckboxComanda ? serviceCheckboxComanda.checked : true,
        desconto: window.descontoAdicional || 0,
        comandaName: cName,
        itemIds: itemIds,
        userName: window.loggedInUser || 'Caixa'
      });
    }
  }

  setTimeout(() => {
    window.isComandaPaymentProcessing = false;
    btns.forEach(b => b.style.pointerEvents = 'auto');
    if (modalOverlay) modalOverlay.style.display = 'none';
    if (window.comandaModalSharedCredit) {
      const pInput = document.getElementById('comanda-modal-partial-value');
      const pVal = pInput ? (parseFloat(pInput.value) || 0) : 0;
      alert(`Pagamento de R$ ${val.toFixed(2).replace('.', ',')} (${method}) recebido para ${cName ? 'Comanda ' + cName : 'Itens Compartilhados'} (inclui R$ ${pVal.toFixed(2).replace('.', ',')} de crédito de itens compartilhados).`);
    } else {
      alert(`Pagamento de R$ ${val.toFixed(2).replace('.', ',')} (${method}) recebido com sucesso para ${cName ? 'Comanda ' + cName : 'Itens Compartilhados'}!`);
    }
    window.comandaModalSharedCredit = false;
  }, 1000);
};

/* ═══════════ TAXA DE SERVIÇO MANUAL + ITENS SEM TAXA + PIX + CLIENTE ═══════════ */
window._checkoutItensSemTaxa = new Set();   // ids de itens fora da base da taxa
window._checkoutTaxaManual = null;          // R$ definido para a mesa (null = padrão 10%)
window._checkoutClienteId = null;           // cliente fidelizado escolhido no fechamento

const _parseValorBRL = (txt) => {
  let clean = String(txt || '').replace('R$', '').replace(/\s/g, '');
  if (!clean) return NaN;
  if (clean.includes(',')) {
    clean = clean.indexOf('.') < clean.lastIndexOf(',') ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, '.');
  }
  return parseFloat(clean);
};

window.checkoutItemTaxaToggle = (itemId, cobrar) => {
  if (itemId == null) return;
  if (cobrar) window._checkoutItensSemTaxa.delete(itemId);
  else window._checkoutItensSemTaxa.add(itemId);
  // Exclusão por item converte a mesa para taxa manual (valor exato salvo no servidor)
  const itens = (window.mesaAtual && window.mesaAtual.items) || [];
  const brutoTodos = itens.reduce((s, it) => s + (parseFloat(String(it.total).replace(',', '.')) || 0), 0);
  const isentoTodos = itens.reduce((s, it) => {
    if (it.status === 'Pago') return s;
    return window._checkoutItensSemTaxa.has(it.id) ? s + (parseFloat(String(it.total).replace(',', '.')) || 0) : s;
  }, 0);
  const novaTaxa = Math.round((Math.max(0, brutoTodos - isentoTodos) * 0.10) * 100) / 100;
  window._checkoutTaxaManual = novaTaxa;
  const nomeMesa = window.mesaAtual ? (window.mesaAtual.mesaName || window.mesaAtual.nome) : null;
  if (nomeMesa && typeof socket !== 'undefined' && socket) {
    socket.emit('definir_taxa_mesa', { mesaName: nomeMesa, valor: novaTaxa });
  }
  if (window.calcRestante) window.calcRestante();
};

window.checkoutTaxaToggleManual = () => {
  const row = document.getElementById('checkout-modal-taxa-manual-row');
  if (!row) return;
  row.style.display = row.style.display === 'none' || !row.style.display ? 'block' : 'none';
  if (row.style.display === 'block') {
    const inp = document.getElementById('checkout-modal-taxa-manual');
    if (inp && window._checkoutTaxaManual != null && !document.activeElement.isSameNode(inp)) {
      inp.value = window._checkoutTaxaManual.toFixed(2).replace('.', ',');
    }
  }
};

window.checkoutTaxaSalvarManual = () => {
  const inp = document.getElementById('checkout-modal-taxa-manual');
  if (!inp || !window.mesaAtual) return;
  const v = _parseValorBRL(inp.value);
  window._checkoutTaxaManual = (!isNaN(v) && v > 0) ? Math.round(v * 100) / 100 : null;
  const nomeMesa = window.mesaAtual.mesaName || window.mesaAtual.nome;
  if (typeof socket !== 'undefined' && socket) {
    socket.emit('definir_taxa_mesa', { mesaName: nomeMesa, valor: window._checkoutTaxaManual });
  }
  if (window.calcRestante) window.calcRestante();
};

window.checkoutTaxaLimparManual = () => {
  window._checkoutTaxaManual = null;
  window._checkoutItensSemTaxa.clear();
  const inp = document.getElementById('checkout-modal-taxa-manual');
  if (inp) inp.value = '';
  const nomeMesa = window.mesaAtual ? (window.mesaAtual.mesaName || window.mesaAtual.nome) : null;
  if (nomeMesa && typeof socket !== 'undefined' && socket) {
    socket.emit('definir_taxa_mesa', { mesaName: nomeMesa, valor: null });
  }
  if (window.calcRestante) window.calcRestante();
};

if (typeof socket !== 'undefined') {
  socket.on('taxa_mesa_definida', ({ mesaName, valor }) => {
    const atual = window.mesaAtual ? (window.mesaAtual.mesaName || window.mesaAtual.nome) : null;
    if (atual && atual === mesaName) {
      window._checkoutTaxaManual = valor;
      if (window.calcRestante) window.calcRestante();
    }
  });
  socket.on('taxa_mesa_valor', ({ mesaName, valor }) => {
    const atual = window.mesaAtual ? (window.mesaAtual.mesaName || window.mesaAtual.nome) : null;
    if (atual && atual === mesaName) {
      window._checkoutTaxaManual = valor;
      const inp = document.getElementById('checkout-modal-taxa-manual');
      if (inp && valor != null && document.activeElement !== inp) inp.value = valor.toFixed(2).replace('.', ',');
      if (window.calcRestante) window.calcRestante();
    }
  });
}

/* ── PIX COPIA E COLA NO FECHAMENTO ── */
window.checkoutModalAtualizarPix = () => {
  const panel = document.getElementById('checkout-modal-pix-panel');
  const sel = document.getElementById('checkout-modal-metodo');
  if (!panel || !sel) return;
  if (sel.value !== 'Pix' || !(window.mesaFaltaPagar > 0.01)) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  const falta = window.mesaFaltaPagar;
  document.getElementById('pix-valor-label').innerText = `R$ ${falta.toFixed(2).replace('.', ',')}`;
  const nomeMesa = window.mesaAtual ? (window.mesaAtual.mesaName || window.mesaAtual.nome) : '';
  fetch(`/api/pix/copiacola?valor=${falta.toFixed(2)}&mesa=${encodeURIComponent(nomeMesa)}&ref=M${Date.now().toString(36).toUpperCase()}`)
    .then(r => r.json())
    .then(d => {
      const img = document.getElementById('pix-qr-img');
      const txt = document.getElementById('pix-copia-texto');
      if (d.ok) {
        if (typeof gerarQrDataUrl === 'function') gerarQrDataUrl(d.payload, 170, url => { img.src = url; img.style.display = ''; });
        txt.value = d.payload;
        window._pixPayloadAtual = d.payload;
        txt.style.color = '';
      } else {
        img.style.display = 'none';
        txt.value = d.erro || 'Erro ao gerar Pix.';
        txt.style.color = '#e53e3e';
        window._pixPayloadAtual = null;
      }
    })
    .catch(() => { });
};

window.checkoutPixCopiar = () => {
  const payload = window._pixPayloadAtual || document.getElementById('pix-copia-texto').value;
  if (!payload) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(payload).then(() => alert('Código Pix copiado!'));
  } else {
    const ta = document.getElementById('pix-copia-texto');
    ta.select();
    document.execCommand('copy');
    alert('Código Pix copiado!');
  }
};

(function bindPixPanel() {
  const sel = document.getElementById('checkout-modal-metodo');
  if (sel) sel.addEventListener('change', () => { if (window.checkoutModalAtualizarPix) window.checkoutModalAtualizarPix(); });
})();

/* ── BUSCA DE CLIENTE FIDELIZADO POR CPF/TELEFONE/NOME ── */
let _buscaClienteTimer = null;

window.checkoutBuscarCliente = (termo) => {
  const input = document.getElementById('checkout-modal-busca-cliente');
  const q = termo != null ? String(termo) : (input ? input.value : '');
  if (q.replace(/\D/g, '').length < 3 && q.trim().length < 3) return;
  fetch(`/api/clientes/buscar-doc?q=${encodeURIComponent(q.trim())}`)
    .then(r => r.json())
    .then(d => {
      const box = document.getElementById('checkout-modal-busca-resultados');
      if (!box) return;
      if (!d.ok || !d.clientes || d.clientes.length === 0) {
        box.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--text-muted);">Nenhum cliente fidelizado encontrado.</div>';
        box.style.display = 'block';
        return;
      }
      box.innerHTML = d.clientes.map(c => `
        <div onclick='window.checkoutEscolherCliente(${JSON.stringify(JSON.stringify(c)).replace(/'/g, "&#39;")})'
          style="padding:7px 9px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:11.5px;"
          onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background=''">
          <strong>${c.nome || 'Sem nome'}</strong>
          <span style="color:var(--text-muted);">· ${c.telefone || 'sem fone'}${c.cpf ? ' · CPF ' + c.cpf : ''}</span>
          <span style="float:right;color:#0077c8;font-weight:700;">${c.pontos || 0} pts · ${c.nivel || 'Bronze'}</span>
        </div>`).join('');
      box.style.display = 'block';
    })
    .catch(() => { });
};

window.checkoutEscolherCliente = (cliente) => {
  let c = cliente;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { return; } }
  window._checkoutClienteId = c.id || null;
  const telInput = document.getElementById('checkout-modal-telefone-cliente');
  if (telInput && c.telefone) telInput.value = c.telefone;
  const badge = document.getElementById('checkout-modal-cliente-badge');
  if (badge) {
    badge.innerHTML = `<i class="ph ph-user-circle-check"></i> ${c.nome || 'Cliente'} · ${c.pontos || 0} pontos · ${c.nivel || 'Bronze'} — os pontos desta conta vão para este cadastro`;
    badge.style.display = 'block';
  }
  const box = document.getElementById('checkout-modal-busca-resultados');
  if (box) box.style.display = 'none';
};

(function bindBuscaCliente() {
  const input = document.getElementById('checkout-modal-busca-cliente');
  if (!input) return;
  input.addEventListener('input', () => {
    clearTimeout(_buscaClienteTimer);
    _buscaClienteTimer = setTimeout(() => window.checkoutBuscarCliente(), 350);
  });
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); window.checkoutBuscarCliente(); } });
})();

