// --- Bill Logic Functions ---
function getBillGrossTotal() {
  return billItems.reduce((acc, curr) => (curr.totalVal >= 0) ? acc + curr.totalVal : acc, 0);
}

function getBillSubtotal() {
  return billItems.reduce((acc, curr) => (curr.totalVal >= 0 && curr.status !== 'Pago') ? acc + curr.totalVal : acc, 0);
}

function getBillPaymentsTotal() {
  return billItems.reduce((acc, curr) => {
    if (curr.totalVal < 0) {
      const name = curr.productName || '';
      if (name.toLowerCase().includes('comanda')) {
        return acc;
      }
      return acc + Math.abs(curr.totalVal);
    }
    return acc;
  }, 0);
}

function getBillMultiplier() {
  return document.getElementById('bill-service-fee').checked ? 1.1 : 1.0;
}

window.renderBillView = () => {
  const consumedSubtotal = getBillSubtotal();
  const grossSubtotal = getBillGrossTotal();
  const multiplier = getBillMultiplier();
  const serviceFee = consumedSubtotal * (multiplier - 1.0);
  const totalPayments = getBillPaymentsTotal();
  const grandTotal = Math.max(0, consumedSubtotal + serviceFee - totalPayments);
  const totalDaMesa = grossSubtotal * multiplier;

  document.getElementById('bill-subtotal').innerText = `R$ ${Math.max(0, totalDaMesa).toFixed(2).replace('.',',')}`;
  document.getElementById('bill-grand-total').innerText = `R$ ${Math.max(0, grandTotal).toFixed(2).replace('.',',')}`;

  if (billCurrentMode === 'pessoas') {
    billActionValue = grandTotal / billSplitCount;
    document.getElementById('bill-split-value').innerText = `R$ ${billActionValue.toFixed(2).replace('.',',')}`;
    billSelectedIdsForFinalize = []; // We don't finalize items in this mode
    if (typeof renderBillPessoasItems === 'function') renderBillPessoasItems();
  } else {
    let selSubtotal = 0;
    billSelectedIdsForFinalize = [];
    billItems.forEach(item => {
      if (item.totalVal >= 0 && billSelectedItems.has(item.id)) {
        const fraction = billSelectedItems.get(item.id);
        selSubtotal += item.totalVal * fraction;
        if (fraction === 1) billSelectedIdsForFinalize.push(item.id);
      }
    });
    billActionValue = selSubtotal * multiplier;
    document.getElementById('bill-selected-count').innerText = `R$ ${billActionValue.toFixed(2).replace('.',',')}`;
    renderBillItemsList();
  }

  document.getElementById('bill-action-value').innerText = `R$ ${billActionValue.toFixed(2).replace('.',',')}`;
};

function renderBillPessoasItems() {
  const list = document.getElementById('bill-pessoas-items-list');
  if(!list) return;
  const multiplier = getBillMultiplier();
  if (billItems.length === 0) {
    list.innerHTML = '<div style="text-align: center; color: #888; font-size: 14px; padding: 12px;">Nenhum item.</div>';
    return;
  }
  
  const consumed = billItems.filter(i => i.totalVal >= 0);
  const payments = billItems.filter(i => i.totalVal < 0);

  // Group consumed items: shared vs by comanda
  const sharedGroup = consumed.filter(i => !i.mesa_comanda || i.mesa_comanda.trim() === '');
  const comandaGroups = {};
  consumed.forEach(i => {
    const cName = i.mesa_comanda ? i.mesa_comanda.trim() : '';
    if (cName !== '') {
      if (!comandaGroups[cName]) comandaGroups[cName] = [];
      comandaGroups[cName].push(i);
    }
  });

  let html = '';

  const renderGroupHTML = (title, items, isShared) => {
    if (items.length === 0) return '';
    const headerColor = isShared ? '#7f8c8d' : '#fc4b15';
    const icon = isShared ? 'ph-squares-four' : 'ph-user';
    
    let groupHtml = `
      <div style="font-weight: 700; color: ${headerColor}; font-size: 13px; margin-top: 16px; margin-bottom: 8px; border-bottom: 2px solid ${isShared ? '#bdc3c7' : '#ffd5c2'}; padding-bottom: 4px; display: flex; align-items: center; gap: 6px; text-transform: uppercase;">
        <i class="ph ${icon}"></i> ${title}
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
    `;
    
    groupHtml += items.map(item => {
      const finalVal = item.totalVal * multiplier;
      const isPaid = item.status === 'Pago';
      return `
        <div data-item-id="${item.id}" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0; ${isPaid ? 'opacity: 0.5;' : ''}">
          <div style="font-size: 14px; color: #333; ${isPaid ? 'text-decoration: line-through;' : ''}">
            <span style="font-weight: 600;">${item.quantity}x</span> ${item.productEmoji || '🍽️'} ${item.productName}
            ${isPaid ? '<span style="color:#3ab55b; font-size:12px; margin-left:4px;">(Pago)</span>' : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="font-size: 14px; font-weight: 600; color: #666;">R$ ${finalVal.toFixed(2).replace('.', ',')}</div>
            ${!isPaid ? `<button type="button" title="Pedir +1x igual" onclick="event.stopPropagation(); window.repetirItemComanda(${item.id})" style="padding: 3px 8px; border-radius: 8px; border: 1px solid #fed7aa; background: #fff7ed; color: #ea580c; font-weight: 800; font-size: 11px; cursor: pointer;">+1x</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
    
    groupHtml += `</div>`;
    return groupHtml;
  };

  html += renderGroupHTML('Consumo da Mesa (Compartilhado)', sharedGroup, true);
  
  Object.keys(comandaGroups).forEach(cName => {
    html += renderGroupHTML(`Comanda: ${cName}`, comandaGroups[cName], false);
  });

  if (payments.length > 0) {
    html += `<div style="margin-top: 20px; padding-top: 15px; border-top: 2px dashed #fc4b15;">
      <strong style="color: #fc4b15; font-size: 18px; text-transform: uppercase;">Pagamentos Já Realizados:</strong>
    </div>`;
    html += payments.map(item => {
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #fff0eb; border-radius: 8px; margin-top: 8px; border: 1px solid #fc4b15;">
          <div style="font-size: 18px; color: #fc4b15; font-weight: bold;"><i class="ph ph-money"></i> ${item.productName}</div>
          <div style="font-size: 18px; font-weight: 900; color: #fc4b15;">- R$ ${Math.abs(item.totalVal).toFixed(2).replace('.', ',')}</div>
        </div>
      `;
    }).join('');
  }
  if(typeof morphdom !== 'undefined') morphdom(list, '<div>'+html+'</div>', {childrenOnly:true}); else list.innerHTML = html;
}

function renderBillItemsList() {
  const list = document.getElementById('bill-items-list');
  const multiplier = getBillMultiplier();
  
  if (billItems.length === 0) {
    list.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">Nenhum item em andamento.</div>';
    return;
  }

  const consumed = billItems.filter(i => i.totalVal >= 0);
  const payments = billItems.filter(i => i.totalVal < 0);

  // Group consumed items: shared vs by comanda
  const sharedGroup = consumed.filter(i => !i.mesa_comanda || i.mesa_comanda.trim() === '');
  const comandaGroups = {};
  consumed.forEach(i => {
    const cName = i.mesa_comanda ? i.mesa_comanda.trim() : '';
    if (cName !== '') {
      if (!comandaGroups[cName]) comandaGroups[cName] = [];
      comandaGroups[cName].push(i);
    }
  });

  let html = '';

  const renderGroupHTML = (title, items, isShared) => {
    if (items.length === 0) return '';
    const headerColor = isShared ? '#7f8c8d' : '#fc4b15';
    
    let groupHtml = `
      <div style="font-weight: 700; color: ${headerColor}; font-size: 13px; margin-top: 16px; margin-bottom: 8px; border-bottom: 2px solid ${isShared ? '#bdc3c7' : '#ffd5c2'}; padding-bottom: 4px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; grid-column: 1 / -1;">
        <i class="ph ${isShared ? 'ph-squares-four' : 'ph-user'}"></i> ${title}
      </div>
    `;
    
    groupHtml += items.map(item => {
      const isPaid = item.status === 'Pago';
      const fraction = billSelectedItems.get(item.id) || 0;
      const isSelected = fraction > 0 && !isPaid;
      const finalVal = item.totalVal * multiplier;
      
      return `
        <div class="bill-item-row ${isSelected ? 'selected' : ''}" data-item-id="${item.id}" style="${isPaid ? 'opacity: 0.6; background: #f0f0f0;' : ''}" onclick="${isPaid ? '' : `if(!garcomWasLongPress()) toggleBillItem(${item.id});`}">
          <div class="checkbox">${isPaid ? '<i class="ph ph-check-circle" style="color:#3ab55b; font-size:16px;"></i>' : (isSelected ? (fraction === 1 ? '<i class="ph ph-check"></i>' : '<span style="font-size:10px;">1/2</span>') : '')}</div>
          <div style="flex:1; ${isPaid ? 'text-decoration: line-through;' : ''}">
            <div style="font-weight:600; color:#333;">${item.quantity}x ${item.productEmoji || '🍽️'} ${item.productName} ${isPaid ? '<span style="color:#3ab55b; font-size:12px; margin-left:8px;">(Pago)</span>' : ''}</div>
            <div style="font-size:14px; color:#666;">Total: R$ ${finalVal.toFixed(2).replace('.',',')}</div>
          </div>
          ${!isPaid ? `
            <div style="display: flex; align-items: center; gap: 6px;">
              <button type="button" title="Pedir +1x igual" onclick="event.stopPropagation(); window.repetirItemComanda(${item.id})" style="padding: 6px 10px; border-radius: 8px; border: 1px solid #fed7aa; background: #fff7ed; color: #ea580c; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <i class="ph-bold ph-plus"></i> 1x
              </button>
              <button class="btn-split-item" title="Dividir / Fracionar em Comandas" onclick="event.stopPropagation(); window.abrirModalFracionarItem(${item.id})">
                <i class="ph-bold ph-scissors"></i> Dividir
              </button>
            </div>
            <button style="display:none;" class="btn-split-item-old ${fraction === 0.5 ? 'active' : ''}" onclick="event.stopPropagation(); splitItemFraction(${item.id})">
              ${fraction === 0.5 ? 'Metade' : 'Rachar Meio'}
            </button>` : ''}
        </div>
      `;
    }).join('');
    
    return groupHtml;
  };

  html += renderGroupHTML('Consumo da Mesa (Compartilhado)', sharedGroup, true);
  
  Object.keys(comandaGroups).forEach(cName => {
    html += renderGroupHTML(`Comanda: ${cName}`, comandaGroups[cName], false);
  });

  if (payments.length > 0) {
    html += `<div style="margin-top: 20px; padding-top: 15px; border-top: 2px dashed #fc4b15; grid-column: 1 / -1;">
      <strong style="color: #fc4b15; font-size: 18px; text-transform: uppercase;">Pagamentos Já Realizados:</strong>
      <div style="font-size: 14px; color: #888;">O valor restante já está sendo calculado para fechar a conta.</div>
    </div>`;
    html += payments.map(item => {
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #fff0eb; border-radius: 8px; margin-top: 8px; border: 1px solid #fc4b15; grid-column: 1 / -1;">
          <div style="font-size: 18px; color: #fc4b15; font-weight: bold;"><i class="ph ph-money"></i> ${item.productName}</div>
          <div style="font-size: 18px; font-weight: 900; color: #fc4b15;">- R$ ${Math.abs(item.totalVal).toFixed(2).replace('.', ',')}</div>
        </div>
      `;
    }).join('');
  }
  if(typeof morphdom !== 'undefined') morphdom(list, '<div>'+html+'</div>', {childrenOnly:true}); else list.innerHTML = html;
}

window.toggleBillItem = (id) => {
  if (billSelectedItems.has(id)) {
    billSelectedItems.delete(id);
  } else {
    billSelectedItems.set(id, 1); // Select 100%
  }
  renderBillView();
};

window.splitItemFraction = (id) => {
  if (billSelectedItems.get(id) === 1) {
    billSelectedItems.set(id, 0.5); // Half
  } else if (billSelectedItems.get(id) === 0.5) {
    billSelectedItems.set(id, 1); // Back to full
  }
  renderBillView();
};

window.switchBillTab = (tab) => {
  billCurrentMode = tab;
  document.querySelectorAll('.bill-tab').forEach(t => {
    t.classList.remove('active');
    t.style.background = 'transparent'; t.style.color = '#666';
  });
  const tabEl = document.getElementById(`tab-bill-${tab}`);
  if (tabEl) {
    tabEl.classList.add('active');
    tabEl.style.color = '#fc4b15';
  }
  
  document.querySelectorAll('.bill-content').forEach(c => c.style.display = 'none');
  const contentEl = document.getElementById(`bill-content-${tab}`);
  if (contentEl) contentEl.style.display = 'block';
  
  if (tab === 'assentos' && typeof window.carregarAssentosMesaGarcom === 'function') {
    window.carregarAssentosMesaGarcom();
  }
  
  renderBillView();
};

window.changeSplitCount = (dir) => {
  billSplitCount += dir;
  if (billSplitCount < 1) billSplitCount = 1;
  document.getElementById('bill-split-count').innerText = billSplitCount;
  renderBillView();
};

window.toggleServiceFee = () => {
  const cb = document.getElementById('bill-service-fee');
  cb.checked = !cb.checked;
  const icon = document.getElementById('icon-service');
  if (cb.checked) {
    icon.classList.remove('ph');
    icon.classList.add('ph-fill');
    icon.style.color = '#fc4b15';
    showToast('Taxa de 10% adicionada', '#fc4b15');
  } else {
    icon.classList.remove('ph-fill');
    icon.classList.add('ph');
    icon.style.color = '#ccc';
    showToast('Taxa de 10% removida', '#888');
  }
  renderBillView();
};

window.updateCustomPaymentValue = (val) => {
  if (val === undefined || val === null) return;
  let num = parseFloat(String(val).replace(',', '.'));
  if (!isNaN(num) && num >= 0) billActionValue = num;
};

// --- Modal de Pagamento em Dinheiro & Calculadora de Troco ---
window.abrirModalDinheiroTroco = function(valorCobrar) {
  const modal = document.getElementById('modal-garcom-dinheiro-troco');
  if (!modal) return;
  window._valorCobrarDinheiro = (typeof valorCobrar === 'number' && valorCobrar > 0) ? valorCobrar : (billActionValue || 0);

  const displayCobrar = document.getElementById('dinheiro-valor-cobrar-display');
  if (displayCobrar) displayCobrar.innerText = 'R$ ' + window._valorCobrarDinheiro.toFixed(2).replace('.', ',');

  const btnConfVal = document.getElementById('btn-dinheiro-confirmar-val');
  if (btnConfVal) btnConfVal.innerText = window._valorCobrarDinheiro.toFixed(2).replace('.', ',');

  const inputRecebido = document.getElementById('dinheiro-input-recebido');
  if (inputRecebido) inputRecebido.value = '';

  const chkCaixinha = document.getElementById('dinheiro-chk-caixinha');
  if (chkCaixinha) chkCaixinha.checked = false;

  window.calcularTrocoDinheiro();
  modal.style.display = 'flex';
  setTimeout(() => { if (inputRecebido) inputRecebido.focus(); }, 150);
};

window.fecharModalDinheiroTroco = function() {
  const modal = document.getElementById('modal-garcom-dinheiro-troco');
  if (modal) modal.style.display = 'none';
};

window.setDinheiroValorRecebido = function(val) {
  const input = document.getElementById('dinheiro-input-recebido');
  if (!input) return;
  if (val === 'exato') {
    input.value = (window._valorCobrarDinheiro || 0).toFixed(2).replace('.', ',');
  } else {
    input.value = Number(val).toFixed(2).replace('.', ',');
  }
  window.calcularTrocoDinheiro();
};

window.calcularTrocoDinheiro = function() {
  const total = window._valorCobrarDinheiro || 0;
  const input = document.getElementById('dinheiro-input-recebido');
  const card = document.getElementById('dinheiro-card-troco');
  const label = document.getElementById('dinheiro-troco-label');
  const valor = document.getElementById('dinheiro-troco-valor');
  const boxCaixinha = document.getElementById('dinheiro-box-caixinha');
  const btnConfirmar = document.getElementById('btn-dinheiro-confirmar');

  let recebidoStr = input ? input.value.trim().replace(',', '.') : '';
  let recebido = parseFloat(recebidoStr);

  if (isNaN(recebido) || recebidoStr === '') {
    if (label) label.innerText = 'Valor Exato';
    if (valor) { valor.innerText = 'Sem troco'; valor.style.color = '#15803d'; }
    if (card) { card.style.background = '#f0fdf4'; card.style.borderColor = '#86efac'; }
    if (boxCaixinha) boxCaixinha.style.display = 'none';
    if (btnConfirmar) { btnConfirmar.disabled = false; btnConfirmar.style.opacity = '1'; }
    return;
  }

  const troco = recebido - total;

  if (troco < -0.01) {
    const falta = Math.abs(troco);
    if (label) label.innerText = 'Valor insuficiente';
    if (valor) { valor.innerText = 'Falta R$ ' + falta.toFixed(2).replace('.', ','); valor.style.color = '#dc2626'; }
    if (card) { card.style.background = '#fef2f2'; card.style.borderColor = '#fca5a5'; }
    if (boxCaixinha) boxCaixinha.style.display = 'none';
    if (btnConfirmar) { btnConfirmar.disabled = true; btnConfirmar.style.opacity = '0.5'; }
  } else if (Math.abs(troco) <= 0.01) {
    if (label) label.innerText = 'Valor Exato';
    if (valor) { valor.innerText = 'Sem troco'; valor.style.color = '#15803d'; }
    if (card) { card.style.background = '#f0fdf4'; card.style.borderColor = '#86efac'; }
    if (boxCaixinha) boxCaixinha.style.display = 'none';
    if (btnConfirmar) { btnConfirmar.disabled = false; btnConfirmar.style.opacity = '1'; }
  } else {
    if (label) label.innerText = 'Troco a Devolver';
    if (valor) { valor.innerText = 'R$ ' + troco.toFixed(2).replace('.', ','); valor.style.color = '#15803d'; }
    if (card) { card.style.background = '#f0fdf4'; card.style.borderColor = '#86efac'; }
    if (boxCaixinha) boxCaixinha.style.display = 'block';
    if (btnConfirmar) { btnConfirmar.disabled = false; btnConfirmar.style.opacity = '1'; }
  }
};

window.confirmarPagamentoDinheiro = function() {
  const total = window._valorCobrarDinheiro || 0;
  const input = document.getElementById('dinheiro-input-recebido');
  let recebido = parseFloat(input ? input.value.trim().replace(',', '.') : '');
  if (isNaN(recebido)) recebido = total;

  if (recebido < total - 0.01) {
    alert('O valor entregue é menor que o valor a cobrar!');
    return;
  }

  const troco = Math.max(0, recebido - total);
  const chkCaixinha = document.getElementById('dinheiro-chk-caixinha');
  const isCaixinha = chkCaixinha ? chkCaixinha.checked : false;

  if (troco > 0 && isCaixinha) {
    socket.emit('movimentacao_caixa', {
      tipo: 'Entrada',
      valor: troco,
      forma_pagamento: 'Dinheiro',
      descricao: `Caixinha / Gorjeta: ${currentTable}`
    });
    if (typeof trackInsertion === 'function') trackInsertion();
    showToast(`Caixinha de R$ ${troco.toFixed(2).replace('.', ',')} registrada no caixa!`, '#10b981');
  } else if (troco > 0) {
    showToast(`Lembrete: Devolver R$ ${troco.toFixed(2).replace('.', ',')} de troco ao cliente.`, '#0284c7');
  }

  window.fecharModalDinheiroTroco();
  window._dinheiroConfirmado = true;
  window.processPayment('Dinheiro');
};

// --- Payment Modal ---
window.openPaymentModal = () => {
  const inputEl = document.getElementById('payment-input-value');
  if (inputEl && inputEl.value) {
    let num = parseFloat(String(inputEl.value).replace(',', '.'));
    if (!isNaN(num) && num > 0) billActionValue = num;
  }

  if (billActionValue <= 0) return alert('O valor a receber deve ser maior que zero!');
  
  const consumedSubtotal = getBillSubtotal();
  const grossSubtotal = getBillGrossTotal();
  const multiplier = getBillMultiplier();
  const serviceFee = consumedSubtotal * (multiplier - 1.0);
  const totalPayments = getBillPaymentsTotal();
  const grandTotal = Math.max(0, consumedSubtotal + serviceFee - totalPayments);
  
  if (billActionValue > grandTotal + 0.05) {
    alert(`Atenção: O saldo restante da mesa é apenas R$ ${Math.max(0, grandTotal).toFixed(2).replace('.',',')}. O valor a pagar será ajustado para o restante da conta.`);
    billActionValue = grandTotal;
  }
  
  if (inputEl) inputEl.value = billActionValue.toFixed(2).replace('.',',');
  document.getElementById('payment-modal').style.display = 'flex';
};

window.closePaymentModal = () => {
  document.getElementById('payment-modal').style.display = 'none';
};

window.processPayment = (method) => {
  const inputEl = document.getElementById('payment-input-value');
  if (inputEl && inputEl.value) {
    let num = parseFloat(String(inputEl.value).replace(',', '.'));
    if (!isNaN(num) && num > 0) billActionValue = num;
  }

  if (!billActionValue || billActionValue <= 0) {
    return alert('O valor a receber deve ser maior que zero!');
  }

  if (method === 'Dinheiro') {
    if (!window._dinheiroConfirmado) {
      window.abrirModalDinheiroTroco(billActionValue);
      return;
    }
    window._dinheiroConfirmado = false;
  } else {
    if (!confirm(`Confirmar recebimento de R$ ${billActionValue.toFixed(2).replace('.', ',')} no ${method}?`)) return;
  }
  
  const paymentObj = { metodo: method, valor: billActionValue };
  
  const consumedSubtotal = getBillSubtotal();
  const grossSubtotal = getBillGrossTotal();
  const multiplier = getBillMultiplier();
  const serviceFee = consumedSubtotal * (multiplier - 1.0);
  const totalPayments = getBillPaymentsTotal();
  const grandTotal = Math.max(0, consumedSubtotal + serviceFee - totalPayments);
  const isFullTable = Math.abs(billActionValue - grandTotal) < 0.05;

  if (isFullTable) {
    const chkEmitir = document.getElementById('mobile-payment-emitir-nfce');
    const inputCpf = document.getElementById('mobile-payment-cpf-cnpj');
    socket.emit('finalizar_mesa', {
      mesaName: currentTable,
      payments: [paymentObj],
      totalValue: billActionValue,
      emitirNfce: chkEmitir ? chkEmitir.checked : true,
      cpfCnpj: inputCpf ? inputCpf.value.trim() : ''
    });
    if (typeof trackInsertion === 'function') trackInsertion();
    showToast('Mesa fechada com sucesso!');
    closePaymentModal();
    showView('tables', 'Comanda Mobile');
    return;
  }
  
  // Se for "Por Itens" e selecionou itens inteiros: a gente pode mandar pro servidor finalizar_parcial_mesa!
  if (billCurrentMode === 'itens' && billSelectedIdsForFinalize.length > 0) {
    // E se houver outros que foram rachados no meio? Os marcados pela metade no podem ser finalizados (o valor cobrado vai cobrir eles na gaveta)
    // Ento lanamos o recebimento e finalizamos s os itens inteiros!
    socket.emit('finalizar_parcial_mesa', {
      mesaName: currentTable,
      pedidoIds: billSelectedIdsForFinalize,
      payments: [paymentObj]
    });
    if (typeof trackInsertion === 'function') trackInsertion();
  } else {
    // movimentacao_caixa REMOVED — pagamento_parcial_valor already inserts into movimentacoes via socket-financeiro.js
    const billFeeChk = document.getElementById('bill-service-fee');
    socket.emit('pagamento_parcial_valor', {
      mesaName: currentTable,
      valor: billActionValue,
      metodo: method,
      comTaxa: billFeeChk ? billFeeChk.checked : true,
      userName: loggedUser ? loggedUser.nome : 'Sistema'
    });
    if (typeof trackInsertion === 'function') trackInsertion();
  }
  
  showToast(`R$ ${billActionValue.toFixed(2)} recebido com sucesso!`);
  closePaymentModal();
  socket.emit('get_itens_mesa', currentTable); // refresh items list
};
