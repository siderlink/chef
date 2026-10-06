      // --- CÁLCULO E DIVISÃO POR COMANDA ---
      if (typeof window.renderRachaComandas === 'function') window.renderRachaComandas(item);

      updateSummaryValue('resumo-produtos', item.totalBruto || item.total);
      updateSummaryValue('resumo-comissao', item.total * 0.1);
      updateSummaryValue('resumo-subtotal', item.totalBruto || item.total);

      const taxaCheckbox = document.getElementById('taxa-servico');
      window.calcularTotal = () => {
        // Base de cálculo da taxa: todos os itens menos os marcados "sem taxa";
        // se o caixa definiu um valor manual (R$), ele tem prioridade.
        const itens = (window.mesaAtual && window.mesaAtual.items) || [];
        const brutoTodos = itens.reduce((s, it) => s + (parseFloat(String(it.total).replace(',', '.')) || 0), 0);
        const isentoTodos = itens.reduce((s, it) => {
          if (it.status === 'Pago') return s;
          return (window._checkoutItensSemTaxa && it.id != null && window._checkoutItensSemTaxa.has(it.id))
            ? s + (parseFloat(String(it.total).replace(',', '.')) || 0) : s;
        }, 0);

        let totalComTaxa = brutoTodos + window.servicoAdicional - window.descontoAdicional;
        let valorServicos = window.servicoAdicional;

        if (taxaCheckbox && taxaCheckbox.checked) {
          let taxaCalc;
          if (window._checkoutTaxaManual != null) {
            taxaCalc = window._checkoutTaxaManual;
          } else {
            const baseParaTaxa = Math.max(0, brutoTodos - isentoTodos - window.descontoAdicional);
            taxaCalc = baseParaTaxa * 0.10;
          }
          valorServicos += taxaCalc;
          totalComTaxa += taxaCalc;
        }

        updateSummaryValue('resumo-taxas', valorServicos);

        const descEl = document.getElementById('resumo-descontos');
        if (descEl) descEl.innerText = `R$ ${window.descontoAdicional.toFixed(2).replace('.', ',')}`;

        const formattedTotal = `R$ ${Math.max(0, totalComTaxa).toFixed(2).replace('.', ',')}`;
        document.getElementById('total-pagar-text').innerText = formattedTotal;
        const mobTotal = document.getElementById('mobile-info-total');
        if (mobTotal) mobTotal.innerText = formattedTotal;
        return totalComTaxa;
      };

      window.calcularTotal();
      const modalTaxaCheckbox = document.getElementById('checkout-modal-taxa');
      if (modalTaxaCheckbox && taxaCheckbox) {
        modalTaxaCheckbox.checked = taxaCheckbox.checked;
        modalTaxaCheckbox.onchange = () => {
          taxaCheckbox.checked = modalTaxaCheckbox.checked;
          window.calcRestante();
        };
        taxaCheckbox.onchange = () => { window.calcRestante(); };
      }

      window.pagamentosParciais = item.pagamentosParciais || [];
      window.calcRestante = () => {
        const finalTotal = window.calcularTotal();
        const aplicarTaxa = taxaCheckbox && taxaCheckbox.checked;

        // 1. Calcular soma dos itens da mesa que ainda NÃO foram pagos (status != 'Pago')
        let pendenteItensBruto = 0;
        let isentoAberto = 0;
        let consumoTodos = 0;
        if (window.mesaAtual && window.mesaAtual.items) {
          window.mesaAtual.items.forEach(it => {
            const v = parseFloat(String(it.total).replace(',', '.')) || 0;
            if (v >= 0) consumoTodos += v;
            if (it.status !== 'Pago') {
              pendenteItensBruto += v;
              if (window._checkoutItensSemTaxa && it.id != null && window._checkoutItensSemTaxa.has(it.id)) {
                isentoAberto += v;
              }
            }
          });
        }
        // Taxa proporcional ao pendente — espelha o servidor (aditiva com manual)
        let taxaPendente;
        if (!aplicarTaxa) taxaPendente = 0;
        else if (window._checkoutTaxaManual != null) taxaPendente = consumoTodos > 0 ? window._checkoutTaxaManual * (pendenteItensBruto / consumoTodos) : 0;
        else taxaPendente = Math.max(0, pendenteItensBruto - isentoAberto) * 0.10;
        const pendenteItensComTaxa = pendenteItensBruto + taxaPendente + window.servicoAdicional - window.descontoAdicional;

        // 2. Pagamentos parciais avulsos (Pgto Parcial)
        const generalPartialPago = (window.pagamentosParciais || [])
          .filter(p => !p.comanda)
          .reduce((acc, curr) => acc + curr.valor, 0);

        // 3. Saldo pendente real a pagar
        const falta = Math.max(0, pendenteItensComTaxa - generalPartialPago);
        const totalEfetivoPago = Math.max(0, finalTotal - falta);

        const oldFalta = window.mesaFaltaPagar || 0;
        if (Math.abs((window.checkoutModalCents || 0) - Math.round(oldFalta * 100)) <= 1) {
          window.checkoutModalCents = Math.round(falta * 100);
          window._checkoutAutoFilled = true;
          const formatted = `R$ ${falta.toFixed(2).replace('.', ',')}`;
          const inputValor = document.getElementById('checkout-modal-valor');
          const visor = document.getElementById('checkout-modal-touch-visor');
          if (inputValor) inputValor.value = formatted;
          if (visor) visor.innerText = formatted;
        }

        // Salvar nas variáveis globais para validações
        window.mesaFaltaPagar = falta;
        window.mesaTotalComTaxa = finalTotal;

        // Calcular troco simulado para pagamento em Dinheiro apenas se houver saldo restante
        const inputValor = document.getElementById('checkout-modal-valor');
        const selectMetodo = document.getElementById('checkout-modal-metodo');
        let valorDigitado = 0;
        if (inputValor) {
          let clean = inputValor.value.trim().replace('R$', '').replace(/\s/g, '');
          if (clean.includes(',') || clean.includes('.')) {
            if (clean.indexOf('.') < clean.indexOf(',')) {
              clean = clean.replace(/\./g, '').replace(',', '.');
            } else {
              clean = clean.replace(/,/g, '');
            }
          } else if (clean.includes(',')) {
            clean = clean.replace(',', '.');
          }
          const parsed = parseFloat(clean);
          if (!isNaN(parsed) && parsed > 0) valorDigitado = parsed;
        }
        if (window.checkoutModalTouchModeActive) {
          valorDigitado = (window.checkoutModalCents || 0) / 100;
        }
        const metodo = selectMetodo ? selectMetodo.value : 'Dinheiro';
        let trocoSimulado = 0;
        if (falta > 0.01 && metodo === 'Dinheiro' && valorDigitado > falta) {
          trocoSimulado = valorDigitado - falta;
        }

        // Se a conta já estiver 100% paga, zerar o visor de pagamento
        if (falta <= 0.01 && valorDigitado > 0 && !window.checkoutModalTouchModeActive) {
          window.checkoutModalCents = 0;
        }

        // Atualizar textos antigos (se existirem)
        const elTot = document.getElementById('total-pagar-text');
        if (elTot) elTot.innerText = `R$ ${Math.max(0, finalTotal).toFixed(2).replace('.', ',')}`;
        const elPago = document.getElementById('total-pago-text');
        if (elPago) elPago.innerText = `R$ ${Math.max(0, totalEfetivoPago).toFixed(2).replace('.', ',')}`;
        const elFalta = document.getElementById('falta-pagar-text');
        if (elFalta) elFalta.innerText = `R$ ${falta > 0 ? falta.toFixed(2).replace('.', ',') : '0,00'}`;

        const acoesTotal = document.getElementById('acoes-info-total');
        if (acoesTotal) acoesTotal.innerText = `R$ ${Math.max(0, finalTotal).toFixed(2).replace('.', ',')}`;
        const acoesFalta = document.getElementById('acoes-info-falta');
        if (acoesFalta) acoesFalta.innerText = `Falta: R$ ${falta > 0 ? falta.toFixed(2).replace('.', ',') : '0,00'}`;

        // Atualizar textos do Modal Novo
        const subtotal = window.mesaAtual.totalBruto || window.mesaAtual.total || 0;
        const desc = window.descontoAdicional || 0;
        const valorServicos = (taxaCheckbox && taxaCheckbox.checked) ? Math.max(0, subtotal - desc) * 0.10 : 0;

        const modSubtotal = document.getElementById('checkout-modal-subtotal');
        if (modSubtotal) modSubtotal.innerText = `R$ ${Math.max(0, subtotal).toFixed(2).replace('.', ',')}`;
        const modDesc = document.getElementById('checkout-modal-descontos');
        if (modDesc) modDesc.innerText = `R$ ${desc.toFixed(2).replace('.', ',')}`;
        const modTaxasVal = document.getElementById('checkout-modal-taxas-val');
        if (modTaxasVal) modTaxasVal.innerText = `R$ ${valorServicos.toFixed(2).replace('.', ',')}`;

        const modTotal = document.getElementById('checkout-modal-total-pagar');
        if (modTotal) modTotal.innerText = `R$ ${Math.max(0, finalTotal).toFixed(2).replace('.', ',')}`;
        const modPago = document.getElementById('checkout-modal-pago');
        if (modPago) modPago.innerText = `R$ ${Math.max(0, totalEfetivoPago).toFixed(2).replace('.', ',')}`;

        const modRest = document.getElementById('checkout-modal-restante');
        const modRestLabel = document.getElementById('checkout-modal-restante-label');
        const statusBox = document.getElementById('checkout-modal-status-box');
        if (modRestLabel && modRest) {
          if (falta > 0.01 && trocoSimulado > 0) {
            modRestLabel.innerText = 'Troco Previsto:';
            modRest.style.color = '#27ae60';
            modRest.innerText = `R$ ${trocoSimulado.toFixed(2).replace('.', ',')}`;
            if (statusBox) {
              statusBox.style.background = '#f0fff4';
              statusBox.style.borderColor = '#c6f6d5';
            }
          } else if (falta <= 0.01) {
            const trocoEfetivo = totalEfetivoPago > (finalTotal + 0.01) ? (totalEfetivoPago - finalTotal) : 0;
            if (trocoEfetivo > 0.01) {
              modRestLabel.innerText = 'Troco Devolvido:';
              modRest.style.color = '#27ae60';
              modRest.innerText = `R$ ${trocoEfetivo.toFixed(2).replace('.', ',')}`;
            } else {
              modRestLabel.innerText = 'Faltando:';
              modRest.style.color = '#27ae60';
              modRest.innerText = 'R$ 0,00';
            }
            if (statusBox) {
              statusBox.style.background = '#f0fff4';
              statusBox.style.borderColor = '#c6f6d5';
            }
          } else {
            modRestLabel.innerText = 'Faltando:';
            modRest.style.color = '#e53e3e';
            modRest.innerText = `R$ ${falta.toFixed(2).replace('.', ',')}`;
            if (statusBox) {
              statusBox.style.background = '#fff5f5';
              statusBox.style.borderColor = '#fed7d7';
            }
          }
        }


        // Renderizar itens no tbody do modal de checkout
        let itemsToRender = window.mesaAtual.items || [];
        if (window.agruparItens) {
          const grouped = {};
          itemsToRender.forEach(order => {
            const key = order.productName;
            if (!grouped[key]) grouped[key] = { ...order, quantity: 0, totalVal: 0 };
            const totalVal = parseFloat(String(order.total).replace(',', '.'));
            grouped[key].quantity += (order.quantity || 1);
            grouped[key].totalVal += totalVal;
          });
          itemsToRender = Object.values(grouped).map(g => ({ ...g, total: g.totalVal }));
        }

        let modalItemsHTML = '';
        itemsToRender.forEach((order) => {
          const totalVal = parseFloat(String(order.total).replace(',', '.'));
          const isPaid = order.status === 'Pago';
          const semTaxa = window._checkoutItensSemTaxa && order.id != null && window._checkoutItensSemTaxa.has(order.id);
          const isFracionado = order.status === 'Fracionado' || (order.productName && order.productName.includes('/'));
          const nomeLimpo = (order.productName || 'Produto').replace(/"/g, '&quot;');
          const canSelect = !isPaid && order.id != null;

          modalItemsHTML += `
                 <tr style="${isPaid ? 'opacity: 0.6; background: var(--bg-secondary);' : ''}">
                   <td style="padding: 8px 4px; text-align: center;">
                     ${canSelect ? `
                       <input type="checkbox" class="chk-checkout-item" data-id="${order.id}" data-nome="${nomeLimpo}" data-emoji="${order.productEmoji || '🍽️'}" data-total="${totalVal}" data-qtd="${order.quantity || 1}" onchange="window.onCheckoutItemSelectionChange()" style="width: 15px; height: 15px; accent-color: #ea580c; cursor: pointer;">
                     ` : '—'}
                   </td>
                   <td style="padding: 8px 4px; ${isPaid ? 'text-decoration: line-through;' : ''}">
                     <div style="font-weight: 600; color: var(--text-primary);">${order.productEmoji || ''} ${order.productName || 'Produto'} ${isPaid ? '<strong style="color: #10b981; margin-left: 6px; font-size:11px; background:rgba(16,185,129,0.1); padding:2px 6px; border-radius:4px;">(PAGO)</strong>' : (semTaxa ? '<span style="color:#e53e3e;font-size:10px;margin-left:6px;">(s/ taxa)</span>' : '')}</div>
                     ${order.mesa_comanda ? `<span style="font-size: 10.5px; background: rgba(37,99,235,0.1); color: #2563eb; padding: 1px 6px; border-radius: 4px; font-weight: 700;">👤 ${order.mesa_comanda}</span>` : ''}
                     ${isFracionado && !isPaid ? `
                       <div style="margin-top:4px; display:flex; align-items:center; gap:6px;">
                         <div style="flex:1; height:5px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                           <div style="width:50%; height:100%; background:linear-gradient(90deg, #10b981, #059669); border-radius:3px;"></div>
                         </div>
                         <span style="font-size:10px; font-weight:700; color:#10b981;">50% Pago (1/2)</span>
                       </div>
                     ` : ''}
                   </td>
                   <td style="padding: 8px 4px; text-align: center;">${order.quantity || 1}</td>
                   <td style="padding: 8px 4px; text-align: center;">${canSelect ? `<input type="checkbox" ${semTaxa ? '' : 'checked'} title="Cobrar taxa de serviço neste item?" onchange="window.checkoutItemTaxaToggle(${order.id}, this.checked)" style="width:15px;height:15px;accent-color:#fc4b15;cursor:pointer;">` : '—'}</td>
                   <td style="padding: 8px 4px; text-align: right; font-weight: 700; color: #3ab55b;">R$ ${Math.max(0, totalVal).toFixed(2).replace('.', ',')}</td>
                   <td style="padding: 8px 4px; text-align: center;">
                     ${canSelect ? `
                       <button type="button" onclick="window.abrirSubmodalFracionamentoCheckout(${order.id})" title="Fracionar este item em frações (½, ⅓, etc.)" style="background: rgba(234,88,12,0.12); color: #ea580c; border: 1px solid rgba(234,88,12,0.35); border-radius: 7px; padding: 3px 7px; font-size: 11.5px; cursor: pointer; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s;">
                         <i class="ph-bold ph-scissors"></i>
                       </button>
                     ` : '—'}
                   </td>
                 </tr>
               `;
        });
        const tbodyModal = document.getElementById('checkout-modal-items-tbody');
        if (tbodyModal) tbodyModal.innerHTML = modalItemsHTML;

        // Atualizar lista de pagamentos no Modal (e no antigo se precisar)
        const htmlLista = window.pagamentosParciais.map((p, idx) => {
          const targetId = p.id !== undefined ? p.id : idx;
          return `
                  <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px dashed #ccc; padding-bottom: 8px;">
                    <span style="font-size: 16px;">${p.metodo}</span>
                    <span style="font-size: 18px; font-weight: bold;">R$ ${p.valor.toFixed(2).replace('.', ',')} 
                      <i class="ph ph-trash" title="Estornar / Remover este pagamento" style="color:#e74c3c; cursor:pointer; margin-left: 12px;" onclick="window.removerPagamento(${targetId})"></i>
                    </span>
                  </div>
                `;
        }).join('');

        const listaElModal = document.getElementById('checkout-modal-lista-pagamentos');
        if (listaElModal) listaElModal.innerHTML = htmlLista;
        const listaElAntiga = document.getElementById('lista-pagamentos-parciais');
        if (listaElAntiga) listaElAntiga.innerHTML = htmlLista;

        // Habilitar ou desabilitar botões de envio baseados no saldo devedor
        const btnFinalizar = document.getElementById('btn-finalizar-venda');
        const submitBtnModal = document.getElementById('checkout-modal-submit-btn');
        const isQuted = falta <= 0.01 && (window.pagamentosParciais.length > 0 || finalTotal === 0);

        if (btnFinalizar) {
          btnFinalizar.style.opacity = '1';
          btnFinalizar.style.pointerEvents = 'auto';
          btnFinalizar.onclick = () => {
            window.abrirCheckoutModal();
          };
          btnFinalizar.innerHTML = '<i class="ph ph-check-circle" style="font-size: 20px;"></i> Finalizar Venda';
        }

        if (submitBtnModal) {
          if (isQuted) {
            submitBtnModal.style.opacity = '1';
            submitBtnModal.style.pointerEvents = 'auto';
          } else {
            submitBtnModal.style.opacity = '0.5';
            submitBtnModal.style.pointerEvents = 'none';
          }
        }

        return finalTotal;
      };

      window.calcRestante();
      const tbodyModal_check = document.getElementById('checkout-modal-items-tbody');
      if (tbodyModal_check && window.mesaAtual && window.calcRestante) {
        window.calcRestante();
      }
    });
  });

  /* Removido o card.click() daqui para evitar loop infinito de seleção durante o render */
  /*
  allRenderedItems.forEach(item => {
    if (window.mesaAtual && (item.mesaName || item.nome) === (window.mesaAtual.mesaName || window.mesaAtual.nome)) {
      const card = Array.from(document.querySelectorAll('.mesa-item')).find(c => c.querySelector('.mesa-id') && c.querySelector('.mesa-id').innerText === window.mesaAtual.mesaName || c.querySelector('.mesa-id') && c.querySelector('.mesa-id').innerText === window.mesaAtual.nome);
      if (card) card.click();
    }
  });
  */

  // Clique nos cards de comanda dentro das mesas (delegação no grid -> funciona mesmo após re-render)
  if (grid) {
    grid.onclick = (e) => {
      const comandaCard = e.target.closest('.comanda-inside-card');
      if (comandaCard && !comandaCard.classList.contains('nova-comanda-card')) {
        const mesaName = comandaCard.getAttribute('data-mesa');
        const comanda = comandaCard.getAttribute('data-comanda');
        if (typeof window.abrirComandaNaMesa === 'function') window.abrirComandaNaMesa(mesaName, comanda);
        return;
      }
      if (e.target.closest('.nova-comanda-card')) {
        if (typeof window.abrirModalNovaComanda === 'function') window.abrirModalNovaComanda();
      }
    };
  }

  if (typeof window.updateTimers === 'function') window.updateTimers();

  // Reaplica filtros de busca/setor/categoria do caixa após re-render (morphdom
  // substitui o DOM e apagaria o display:none aplicado pelo filtrarMesasBusca)
  if (typeof window.aplicarFiltrosCaixa === 'function') {
    const buscaInput = document.getElementById('caixa-ux-search');
    const term = ((buscaInput && buscaInput.value) || '').trim();
    if (term || window._setorAtivoCaixa || window._categoriaAtivaCaixa) window.aplicarFiltrosCaixa();
  }

  // Garante que a mesa selecionada mantenha o destaque visual e sincronia de painel em tempo real
  if (window.mesaAtual && typeof window.atualizarPainelMesaSelecionada === 'function') {
    try { window.atualizarPainelMesaSelecionada(); } catch (e) { }
  }
}


window.removerItemPedido = (id) => {
  window.solicitarAutorizacaoAdmin('Excluir Item', 'Informe a senha de administrador para confirmar a exclusão.', (senha, motivo) => {
    socket.emit('remover_pedido_item', { id, senha, userName: window.loggedInUser || 'Caixa' });
  });
};

window.removerPagamento = async (paymentId) => {
  if (paymentId === undefined || paymentId === null || paymentId === '') return;

  const pObj = (window.pagamentosParciais || []).find(p => p.id === paymentId || p === paymentId);
  const targetId = pObj ? pObj.id : paymentId;
  const infoTxt = pObj ? `R$ ${pObj.valor.toFixed(2).replace('.', ',')} (${pObj.metodo})` : 'este pagamento';
  const mesaName = window.mesaAtual ? (window.mesaAtual.nome || window.mesaAtual.mesaName) : 'Mesa';

  const executeEstorno = (motivo) => {
    window.pagamentosParciais = (window.pagamentosParciais || []).filter(p => (p.id !== undefined ? p.id !== targetId : p !== targetId));
    if (typeof window.calcRestante === 'function') window.calcRestante();

    socket.emit('remover_pedido_item', targetId);
    socket.emit('remover_item_pedido', {
      orderId: targetId,
      mesaName: mesaName,
      usuario: window.loggedInUser || 'Caixa',
      motivo: motivo || 'Estorno manual'
    });

    if (typeof window.registrarLogAuditoria === 'function') {
      window.registrarLogAuditoria('CANCELAMENTO_PAGAMENTO_PARCIAL', `Estornado pagamento de ${infoTxt} da ${mesaName}`, motivo || 'Estorno manual', 'ALTO');
    }
  };

  if (typeof window.solicitarAutorizacaoAdmin === 'function') {
    window.solicitarAutorizacaoAdmin(
      'Estornar / Cancelar Pagamento',
      `Remover o pagamento de ${infoTxt} da ${mesaName} exige senha de gerente e justificativa.`,
      (senha, motivo) => {
        window.pagamentosParciais = (window.pagamentosParciais || []).filter(p => (p.id !== undefined ? p.id !== targetId : p !== targetId));
        if (typeof window.calcRestante === 'function') window.calcRestante();

        socket.emit('remover_pedido_item', { id: targetId, senha, userName: window.loggedInUser || 'Caixa' });
        socket.emit('remover_item_pedido', {
          orderId: targetId,
          mesaName: mesaName,
          usuario: window.loggedInUser || 'Caixa',
          motivo: motivo || 'Estorno manual',
          senha
        });

        if (typeof window.registrarLogAuditoria === 'function') {
          window.registrarLogAuditoria('CANCELAMENTO_PAGAMENTO_PARCIAL', `Estornado pagamento de ${infoTxt} da ${mesaName}`, motivo || 'Estorno manual', 'ALTO');
        }
      }
    );
  } else {
    if (await chefConfirm('Estornar item', `Deseja estornar ${infoTxt}?`, { danger: true, okText: 'Estornar' })) {
      executeEstorno('Confirmação simples');
    }
  }
};

setInterval(() => {
  const now = new Date();
  const clk = document.getElementById('status-clock');
  const dt = document.getElementById('status-date');
  if (clk) clk.innerText = (typeof chefFormatTime === 'function') ? chefFormatTime(now.toISOString()) : now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (dt) dt.innerText = (typeof chefFormatDate === 'function') ? chefFormatDate(now.toISOString()) : now.toLocaleDateString('pt-BR');
}, 1000);

window.updateTimers = () => {
  document.querySelectorAll('.time-badge[data-created]').forEach(el => {
    const createdStr = el.getAttribute('data-created');
    if (!createdStr || createdStr === 'undefined') return;
    const createdAt = new Date(createdStr);
    const diffMins = Math.floor((new Date() - createdAt) / 60000);
    el.innerHTML = `<i class="ph ph-clock"></i> ${diffMins} min`;
    if (diffMins >= 60) {
      el.style.color = '#eb5757';
      el.style.backgroundColor = '#fce8e8';
    }
  });
};
setInterval(window.updateTimers, 30000);

function updateSummaryValue(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.innerText = `R$ ${value.toFixed(2).replace('.', ',')}`;
  }
}

// ─── FALLBACK HTTP: Carrega mesas imediatamente via REST ao abrir a página ───
(function carregarMesasImediato() {
  fetch('/api/mesas')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data || !data.pedidos) return;
      if (!ordersData || ordersData.length === 0) {
        ordersData = data.pedidos;
        window.ordersData = ordersData;
        if (typeof renderOrders === 'function') renderOrders();
      }
    })
    .catch(() => {});
})();

// ── RENDER REUTILIZÁVEL: Produtos do pedido (painel central) ──
window.renderItensPainelMesa = function (item) {
  const tbody = document.getElementById('panel-items-tbody');
  if (!tbody || !item || !Array.isArray(item.items)) return;

  const isMergedMesa = item.isGroup && item.items.length > 0 && item.mesaName && item.mesaName.includes(' + ');
  const originalMesas = isMergedMesa ? [...new Set(item.items.map(o => o.localName).filter(Boolean))] : [];

  let itemsToRender = item.items;
  if (window.agruparItens) {
    const grouped = {};
    item.items.forEach(order => {
      const key = order.productName;
      if (!grouped[key]) grouped[key] = { ...order, quantity: 0, totalVal: 0 };
      const totalVal = parseFloat(String(order.total).replace(',', '.'));
      grouped[key].quantity += (order.quantity || 1);
      grouped[key].totalVal += totalVal;
    });
    itemsToRender = Object.values(grouped).map(g => ({ ...g, total: g.totalVal }));
  }

  let itemsHTML = '';
  itemsToRender.forEach((order, idx) => {
    const totalVal = parseFloat(String(order.total).replace(',', '.'));
    const isPaid = order.status === 'Pago';
    const comandaTag = order.mesa_comanda
      ? `<span class="comanda-badge" title="Clique para alterar ou remover da comanda (${order.mesa_comanda})" onclick="event.stopPropagation(); window.alterarComandaItemDirect(${order.id}, '${order.mesa_comanda}')">(${order.mesa_comanda}) <i class="ph ph-x" style="font-size:10px; margin-left:2px;"></i></span>`
      : `<span class="shared-badge" title="Clique para atribuir este item a uma comanda" onclick="event.stopPropagation(); window.alterarComandaItemDirect(${order.id}, '')">[Mesa]</span>`;

    const mesaOrigemBadge = isMergedMesa && order.localName
      ? `<span style="display:inline-block; font-size:10px; font-weight:700; padding:1px 6px; border-radius:4px; background:${order.localName === originalMesas[0] ? '#e3f2fd' : '#fff3e0'}; color:${order.localName === originalMesas[0] ? '#1565c0' : '#e65100'}; margin-left:6px;">${order.localName}</span>`
      : '';

    itemsHTML += `
       <tr style="${isPaid ? 'opacity: 0.5;' : ''}" draggable="true" ondragstart="window.onDragStartItem(event, ${order.id}, '${order.mesa_comanda || ''}')" class="product-item-row" data-item-id="${order.id}" data-item-name="${(order.productName || 'Produto').replace(/"/g, '&quot;')}" data-item-status="${order.status || ''}">
         <td>${String(idx + 1).padStart(3, '0')}</td>
         <td style="${isPaid ? 'text-decoration: line-through;' : ''}">
           ${order.productEmoji || ''} ${order.productName || 'Produto'}
           ${mesaOrigemBadge}
           ${comandaTag}
           ${!isPaid && order.status ? `<span class="item-status-badge item-status-${order.status.toLowerCase().replace(/[^a-z0-9]+/g, '-')}" title="Clique com o botão direito para alterar o status de preparo">${order.status}</span>` : ''}
           ${isPaid ? '<strong style="color: #3ab55b; margin-left: 8px;">(PAGO)</strong>' : ''}
         </td>
         <td>R$ ${(totalVal / (order.quantity || 1)).toFixed(2).replace('.', ',')}</td>
         <td>${order.quantity || 1}</td>
         <td style="font-weight: 600; color: #3ab55b;">R$ ${Math.max(0, totalVal).toFixed(2).replace('.', ',')}</td>
         <td>${order.userName || 'Caixa'}</td>
         <td>
            ${isPaid ? '' : `
               <i class="ph-bold ph-divide" style="color: #ea580c; cursor: pointer; margin-right: 8px; font-size: 16px;" title="Dividir este item em frações (½, ⅓, ¼, etc.) e atribuir a comandas" onclick="window.abrirModalDividirItemFracao(${order.id}, '${(order.productName || 'Produto').replace(/'/g, "\\'")}', '${order.productEmoji || '🍽️'}', ${totalVal}, ${(order.quantity || 1)})"></i>
               <i class="ph ph-user-switch" style="color: #2b5c9e; cursor: pointer; margin-right: 8px; font-size: 16px;" title="Atribuir / Mover Comanda" onclick="window.alterarComandaItemDirect(${order.id}, '${order.mesa_comanda || ''}')"></i>
               <i class="ph ph-trash" style="color: #eb5757; cursor: pointer; font-size: 16px;" title="Remover item do pedido" onclick="window.removerItemPedido('${order.id}')"></i>
            `}
         </td>
       </tr>
     `;
  });
  tbody.innerHTML = itemsHTML;
};

// ── RENDER REUTILIZÁVEL: Divisão por Comanda ──
window.renderRachaComandas = function (item) {
  const divRacha = document.getElementById('div-racha-comandas');
  const listRacha = document.getElementById('racha-comandas-list');
  const chkRachaShared = document.getElementById('chk-racha-compartilhados');
  if (!divRacha || !listRacha || !item || !Array.isArray(item.items)) return;

  const unpaidItems = item.items.filter(o => o.status !== 'Pago');

  const comandaSums = {};
  let sharedTotal = 0;

  // Para mesas juntadas, agrupar por localName (mesa original) como comanda
  const isMergedMesaRacha = item.isGroup && item.mesaName && item.mesaName.includes(' + ');

  unpaidItems.forEach(order => {
    const val = parseFloat(String(order.total).replace(',', '.'));
    let comanda;
    if (isMergedMesaRacha && order.localName) {
      comanda = order.localName;
    } else {
      comanda = order.mesa_comanda ? order.mesa_comanda.trim() : '';
    }
    if (comanda) {
      comandaSums[comanda] = (comandaSums[comanda] || 0) + val;
    } else {
      sharedTotal += val;
    }
  });

  divRacha.style.display = 'block';

  const activeComandaNames = Object.keys(comandaSums);
  const numComandas = activeComandaNames.length;

  const isSharedSplit = chkRachaShared && chkRachaShared.checked;
  const sharePerComanda = (isSharedSplit && numComandas > 0) ? (sharedTotal / numComandas) : 0;

  let rachaHTML = '';

  // 1. Renderiza cada comanda ativa com suporte a Drop
  const mesaIcon = isMergedMesaRacha ? 'ph-armchair' : 'ph-user';
  const mesaLabel = isMergedMesaRacha ? 'Mesa' : 'Comanda';
  activeComandaNames.forEach(cName => {
    let total = comandaSums[cName] + sharePerComanda;

    const serviceCheckbox = document.getElementById('taxa-servico');
    if (serviceCheckbox && serviceCheckbox.checked) {
      total *= 1.1;
    }

    rachaHTML += `
           <div class="comanda-racha-row" 
                onclick="window.cobrarComanda('${cName}', ${total})" 
                ondragover="window.onDragOverComandaRow(event)" 
                ondragleave="window.onDragLeaveComandaRow(event)" 
                ondrop="window.onDropItemOnComanda(event, '${cName}')"
                title="Clique para cobrar ${mesaLabel.toLowerCase()} '${cName}' ou Arraste um produto aqui para colocá-lo nesta ${mesaLabel.toLowerCase()}">
               <span style="font-weight:600; color:#fc4b15;"><i class="ph ${mesaIcon}"></i> ${cName}</span>
               <span style="font-weight:700; color:#3ab55b;">R$ ${Math.max(0, total).toFixed(2).replace('.', ',')}</span>
           </div>
        `;
  });

  // 2. Renderiza os Itens Compartilhados da Mesa (Alvo de Drop para remover de comanda)
  let sharedVal = sharedTotal;
  const serviceCheckbox = document.getElementById('taxa-servico');
  if (serviceCheckbox && serviceCheckbox.checked) {
    sharedVal *= 1.1;
  }

  rachaHTML += `
        <div class="comanda-racha-row shared-target-row" 
             onclick="window.cobrarComanda('', ${sharedVal})" 
             ondragover="window.onDragOverComandaRow(event)" 
             ondragleave="window.onDragLeaveComandaRow(event)" 
             ondrop="window.onDropItemOnComanda(event, '')"
             title="Clique para cobrar os Itens Compartilhados ou Arraste um produto aqui para REMOVER da comanda e deixar na Mesa">
           <span><i class="ph ph-squares-four"></i> Itens Compartilhados</span>
           <span style="font-weight:700;">R$ ${sharedVal.toFixed(2).replace('.', ',')}</span>
        </div>
     `;

  // 3. Renderiza zona para criar/mover para Nova Comanda via Arraste
  rachaHTML += `
        <div class="comanda-racha-row add-comanda-target-row" 
             ondragover="window.onDragOverComandaRow(event)" 
             ondragleave="window.onDragLeaveComandaRow(event)" 
             ondrop="window.onDropItemOnNovaComanda(event)"
             onclick="window.onDropItemOnNovaComanda(event)"
             title="Arraste qualquer produto aqui para mover/atribuir a uma NOVA comanda">
           <span style="color:#2b5c9e; font-size:12px; font-weight:600;"><i class="ph ph-plus-circle"></i> + Criar / Mover para Nova Comanda</span>
           <span style="font-size:10px; color:#888; font-style:italic;">(Arrastar produto aqui)</span>
        </div>
     `;

  listRacha.innerHTML = rachaHTML;
};

// ── REFRESH EM TEMPO REAL da mesa selecionada (pagamentos parciais) ──
window.atualizarPainelMesaSelecionada = function () {
  const atual = window.mesaAtual;
  if (!atual) return;
  const nome = String(atual.mesaName || atual.nome || '').trim();
  if (!nome) return;

  // reencontra o grupo fresco correspondente em ordersData
  const grupos = new Map();
  (Array.isArray(ordersData) ? ordersData : []).forEach(order => {
    const key = String(order.mesa_grupo || order.localName || `Pedido Avulso #${order.id}`).trim();
    let g = grupos.get(key);
    if (!g) {
      g = { isGroup: true, mesaName: key, localName: key, nome: key, items: [], userName: order.userName || 'Avulso', status: order.status, createdAt: order.createdAt, time: order.time, id: order.id, total: 0, totalBruto: 0, pagamentosParciais: [] };
      grupos.set(key, g);
    }
    const v = parseFloat(String(order.total).replace(',', '.')) || 0;
    if (order.productName && (order.productName.includes('Pagamento') || order.productName.includes('Pgto Parcial'))) {
      let metodo = 'Dinheiro';
      if (order.productName.includes('(')) metodo = order.productName.split('(')[1].replace(')', '');
      const isComanda = order.productName.includes('Comanda');
      g.pagamentosParciais.push({ valor: Math.abs(v), metodo, id: order.id, comanda: isComanda });
    } else {
      g.items.push(order);
      g.totalBruto = (g.totalBruto || 0) + v;
      if (order.status !== 'Pago') g.total = (g.total || 0) + v;
    }
    if (!g.userName || g.userName === 'Avulso') g.userName = order.userName || 'Avulso';
  });
  const grupo = grupos.get(nome);
  if (!grupo) {
    if (atual.isGroup === false) {
      document.querySelectorAll('.mesa-item.selected').forEach(c => c.classList.remove('selected'));
      const cardEl = Array.from(document.querySelectorAll('.mesa-item')).find(c => (c.getAttribute('data-mesa') || '').trim() === nome);
      if (cardEl) cardEl.classList.add('selected');
      return;
    }
    window.mesaAtual = null;
    document.body.classList.remove('mesa-selecionada');
    const tbody = document.getElementById('panel-items-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">Mesa não encontrada</td></tr>`;
    return;
  }

  const nonPaymentItems = grupo.items.filter(i => i.status !== 'Pago');
  grupo.status = nonPaymentItems.length > 0 ? ((nonPaymentItems.every(i => i.status === 'Pronto' || i.status === 'Concluido')) ? 'Pronto' : nonPaymentItems[0].status) : undefined;

  // reativa o destaque .selected no card correspondente (renderOrders recria os cards)
  document.querySelectorAll('.mesa-item.selected').forEach(c => c.classList.remove('selected'));
  const cardEl = Array.from(document.querySelectorAll('.mesa-item')).find(c => (c.getAttribute('data-mesa') || '').trim() === nome);
  if (cardEl) cardEl.classList.add('selected');

  window.mesaAtual = grupo;
  const btnFinalizar = document.getElementById('btn-finalizar-venda');
  if (btnFinalizar) {
    btnFinalizar.style.opacity = '1';
    btnFinalizar.style.pointerEvents = 'auto';
  }
  const infoAtendente = document.getElementById('info-atendente-nome');
  if (infoAtendente) infoAtendente.innerText = grupo.userName || '-';
  const mobCliente = document.getElementById('mobile-info-cliente');
  if (mobCliente) mobCliente.innerText = grupo.userName || '-';
  if (typeof window.renderItensRecolhidosMesas === 'function') {
    try { window.renderItensRecolhidosMesas(); } catch (e) { }
  }
  try { window.renderItensPainelMesa(grupo); } catch (e) { }
  try { window.renderRachaComandas(grupo); } catch (e) { }

  const updateSummaryValue = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = `R$ ${val.toFixed(2).replace('.', ',')}`;
  };
  updateSummaryValue('resumo-produtos', grupo.totalBruto);
  updateSummaryValue('resumo-comissao', grupo.total * 0.1);
  updateSummaryValue('resumo-subtotal', grupo.totalBruto);

  if (typeof window.recalcularPagamentosParciais === 'function') window.recalcularPagamentosParciais(nome);
  if (typeof window.calcularTotal === 'function') { try { window.calcularTotal(); } catch (e) { } }
  if (typeof window.calcRestante === 'function') { try { window.calcRestante(); } catch (e) { } }

  // permanência (primeiro item)
  const firstTimeStr = grupo.items[0] && grupo.items[0].time;
  if (firstTimeStr && firstTimeStr.includes(':')) {
    const [h, m] = firstTimeStr.split(':').map(Number);
    const now = new Date();
    let orderDate = new Date();
    orderDate.setHours(h, m, 0, 0);
    if (orderDate > now) orderDate.setDate(orderDate.getDate() - 1);
    const diffMin = Math.floor((now - orderDate) / 60000);
    const f = document.getElementById('info-permanencia');
    if (f) f.innerText = diffMin + 'min';
    const fm = document.getElementById('mobile-info-permanencia');
    if (fm) fm.innerText = diffMin + 'min';
  }

  // modal parcial aberto desta mesa
  if (window._mesaPagamentoParcial === nome && typeof window.atualizarModalPagamentoParcialDesagrupado === 'function') {
    try { window.atualizarModalPagamentoParcialDesagrupado(); } catch (e) { }
  }
};

// WebSocket Events
window._caixaFeedCompleto = !!window._caixaFeedCompleto;

// O caixa usa o feed COMPLETO (itens Pago/Fracionado incluídos) para o fluxo
// financeiro: itens recebidos pela comanda mobile não podem sumir da tela e
// os pagamentos parciais devem refletir imediatamente nos modais.
function _setPedidosCaixa(rows, completo) {
  if (!Array.isArray(rows)) rows = [];
  if (completo) window._caixaFeedCompleto = true;
  else if (window._caixaFeedCompleto) return; // feeds filtrados ignorados depois do feed completo
  ordersData = rows;
  window.ordersData = rows;
  renderOrders();
  if (typeof window.atualizarPainelMesaSelecionada === 'function') {
    try { window.atualizarPainelMesaSelecionada(); } catch (e) { }
  }
}

// Feed completo (inclui itens Pago/Fracionado), exclusivo do caixa
socket.on('pedidos_caixa_completos', (data) => _setPedidosCaixa(data, true));

// Server emits 'initial_data' on connect
socket.on('initial_data', (data) => _setPedidosCaixa(data, false));

// Alias legacy name just in case
socket.on('initial_data_caixa', (data) => _setPedidosCaixa(data, false));

// Feed de atualização de pedidos (nome real do evento no servidor)
socket.on('pedidos_atualizados', (pedidos) => _setPedidosCaixa(pedidos, false));

// Alias legacy
socket.on('pedidos_caixa_atualizados', (pedidos) => _setPedidosCaixa(pedidos, false));

function _upsertPedidoCaixa(novoPedido) {
  if (!novoPedido) return;
  const items = Array.isArray(novoPedido) ? novoPedido : [novoPedido];
  if (!Array.isArray(ordersData)) ordersData = [];
  let changed = false;

  items.forEach(item => {
    if (!item) return;
    const itemId = item.id;
    if (itemId !== undefined && itemId !== null) {
      const idx = ordersData.findIndex(o => o.id === itemId);
      if (idx !== -1) {
        ordersData[idx] = { ...ordersData[idx], ...item };
        changed = true;
      } else {
        ordersData.push(item);
        changed = true;
      }
    } else {
      ordersData.push(item);
      changed = true;
    }
  });

  if (changed) {
    window.ordersData = ordersData;
    renderOrders();
    if (typeof window.atualizarPainelMesaSelecionada === 'function') {
      try { window.atualizarPainelMesaSelecionada(); } catch (e) { }
    }
  }
}

// Escuta eventos de novos pedidos em tempo real (garçom, totem, delivery, app)
socket.on('pedido_adicionado', (novoPedido) => {
  _upsertPedidoCaixa(novoPedido);
});

socket.on('novo_pedido', (novoPedido) => {
  _upsertPedidoCaixa(novoPedido);
});

socket.on('novo_pedido_sync', (pedidos) => {
  _upsertPedidoCaixa(pedidos);
});

socket.on('status_atualizado', (pedidoAtualizado) => {
  if (!pedidoAtualizado || pedidoAtualizado.id === undefined) return;
  if (!Array.isArray(ordersData)) ordersData = [];
  if (pedidoAtualizado.status === 'Cancelado' || pedidoAtualizado.status === 'Finalizado') {
    ordersData = ordersData.filter(o => o.id !== pedidoAtualizado.id);
  } else {
    const index = ordersData.findIndex(o => o.id === pedidoAtualizado.id);
    if (index !== -1) {
      ordersData[index] = { ...ordersData[index], ...pedidoAtualizado };
    } else {
      ordersData.push(pedidoAtualizado);
    }
  }
  window.ordersData = ordersData;
  renderOrders();
  if (typeof window.atualizarPainelMesaSelecionada === 'function') {
    try { window.atualizarPainelMesaSelecionada(); } catch (e) { }
  }
});

// ── PAGAMENTO PARCIAL EM TEMPO REAL (caixa ↔ garçom) ──
window.tocarSomPagamento = function () {
  try {
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
  } catch (e) { }
};

window.notificarPagamentoParcial = function (data) {
  const valor = (typeof data.valor === 'number' ? data.valor : parseFloat(String(data.valor).replace(',', '.'))) || 0;
  const mesaNome = data.mesaName || '';
  const metodo = data.metodo || 'dinheiro';
  const operador = data.userName || 'Garçom';
  const origemSplit = data.origem === 'split';
  const msg = origemSplit
    ? `✨ ${operador} separou a conta e pagou R$ ${valor.toFixed(2).replace('.', ',')} (${metodo}) na ${mesaNome}${data.excedenteTipo === 'gorjeta' ? ' + gorjeta' : ''}`
    : `💰 Pgto Parcial de R$ ${valor.toFixed(2).replace('.', ',')} (${metodo}) na ${mesaNome} — ${operador}`;

  try {
    if (typeof showToastIA === 'function') showToastIA(msg, '#10b981');
    else if (typeof window.showToast === 'function') window.showToast(msg, 'success');
  } catch (e) { }
  try { window.tocarSomPagamento(); } catch (e) { }
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(`${origemSplit ? '✨ Separar Conta' : '💰 Pagamento Parcial'} — ${mesaNome}`, {
        body: `R$ ${valor.toFixed(2).replace('.', ',')} (${metodo}) por ${operador}`,
        icon: '/icons/icon.ico'
      });
    } catch (e) { }
  }
};

// Recalcula os pagamentos parciais avulsos da mesa direto de ordersData (fonte única)
window.recalcularPagamentosParciais = function (nomeMesa) {
  if (!Array.isArray(ordersData) || !nomeMesa) return;
  const pgtos = ordersData.filter(o =>
    (o.localName === nomeMesa || o.mesa_grupo === nomeMesa) &&
    o.productName && (o.productName.includes('Pagamento') || o.productName.includes('Pgto Parcial')) &&
    o.status !== 'Finalizado' && o.status !== 'Cancelado'
  ).map(o => {
    let metodo = 'Dinheiro';
    if (o.productName.includes('(')) {
      metodo = o.productName.split('(')[1].replace(')', '');
    }
    return {
      valor: Math.abs(parseFloat(String(o.total).replace(',', '.')) || 0),
      metodo: metodo,
      id: o.id,
      comanda: o.productName.includes('Comanda')
    };
  });
  window.pagamentosParciais = pgtos;
  if (window.mesaAtual && (window.mesaAtual.nome || window.mesaAtual.mesaName) === nomeMesa) {
    window.mesaAtual.pagamentosParciais = pgtos;
  }
};

socket.on('pagamento_parcial_registrado', (data) => {
  if (!data || !data.mesaName) return;
  const isSelf = !!(data.originSocket && socket.id && data.originSocket === socket.id);

  // Grid, painel e dados já atualizam via pedidos_atualizados (broadcast). Aqui:
  // 1) notifica quem está com o caixa aberto quando OUTRO operador recebe o pagamento;
  if (!isSelf) window.notificarPagamentoParcial(data);

  // 2) atualiza na hora o modal de Pagamento Parcial/Divisão aberto desta mesa;
  if (window._mesaPagamentoParcial && window._mesaPagamentoParcial === data.mesaName &&
    typeof window.atualizarModalPagamentoParcialDesagrupado === 'function') {
    window.atualizarModalPagamentoParcialDesagrupado();
  }

  // 3) recalcula o checkout modal aberto desta mesa (total pago / falta a pagar).
  // Quando o feed completo já chegou com o pagamento, o refresh integral da mesa
  // garante itens Pago visíveis + lista de pagamentos atualizada.
  const nomeMesaAtual = window.mesaAtual && (window.mesaAtual.nome || window.mesaAtual.mesaName);
  if (nomeMesaAtual === data.mesaName) {
    const jaTemNoFeed = Array.isArray(ordersData) && ordersData.some(o =>
      (o.localName === data.mesaName || o.mesa_grupo === data.mesaName) &&
      o.productName && (o.productName.includes('Pagamento') || o.productName.includes('Pgto Parcial')));
    if (jaTemNoFeed && typeof window.atualizarPainelMesaSelecionada === 'function') {
      window.atualizarPainelMesaSelecionada();
    } else {
      window.recalcularPagamentosParciais(data.mesaName);
      if (typeof window.calcRestante === 'function') window.calcRestante();
    }
  }
});

socket.on('comanda_status_mesa_result', (data) => {
  if (!data || !data.success) return;
  window._renderComandaModalStatus(data.movimentos, window.comandaCobrarNome);
});

socket.on('comanda_creditos_atualizado', (data) => {
  if (!data || !data.mesaName) return;
  const nome = window.mesaAtual && (window.mesaAtual.nome || window.mesaAtual.mesaName);
  if (nome === data.mesaName) {
    window.refreshComandaModalStatus();
  }
});

socket.on('item_fracionado_sucesso', (data) => {
  if (data && data.itemId && typeof window.removerItemDividido === 'function') {
    window.removerItemDividido(data.itemId);
  }
});

// ── COMANDA PRONTA (cliente envia → caixa aprova) ──
window._comandasProntasPendentes = window._comandasProntasPendentes || 0;

function escCP(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtBrlCP(v) {
  const n = Number(v) || 0;
  return 'R$ ' + n.toFixed(2).replace('.', ',');
}
function nomeItemPorIdCP(itemId) {
  const id = String(itemId);
  const all = (window.ordersData && window.ordersData.length) ? window.ordersData : [];
  for (let i = 0; i < all.length; i++) {
    if (String(all[i].id) === id) return all[i].productName || ('Item #' + id);
  }
  return 'Item #' + id;
}
function atualizaBadgeComandasProntas() {
  const badge = document.getElementById('comandas-prontas-badge');
  if (!badge) return;
  const n = window._comandasProntasPendentes || 0;
  if (n > 0) { badge.style.display = 'inline-flex'; badge.textContent = n > 99 ? '99+' : n; }
  else { badge.style.display = 'none'; }
}

window.abrirComandasProntas = function () {
  const overlay = document.getElementById('comandas-prontas-overlay');
  if (!overlay || !window.socket) return;
  overlay.style.display = 'flex';
  const list = document.getElementById('comandas-prontas-list');
  if (list) list.innerHTML = '<p style="font-size:14px;color:var(--text-muted);text-align:center;padding:20px;">Carregando...</p>';
  window.socket.emit('listar_comandas_prontas');
};
window.fecharComandasProntas = function () {
  const overlay = document.getElementById('comandas-prontas-overlay');
  if (overlay) overlay.style.display = 'none';
};

function renderComandasProntas(lista) {
  const list = document.getElementById('comandas-prontas-list');
  if (!list) return;
  const arr = Array.isArray(lista) ? lista : [];
  window._comandasProntasPendentes = arr.length;
  atualizaBadgeComandasProntas();
  if (arr.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:30px 10px;color:var(--text-muted);font-size:14px;"><i class="ph ph-check-circle" style="font-size:34px;color:#3ab55b;display:block;margin-bottom:10px;"></i>Nenhuma comanda pendente de aprovação.</div>';
    return;
  }
  list.innerHTML = arr.map((c) => {
    const nomes = (c.itens || []).map(i => nomeItemPorIdCP(i.itemId) + ' ×' + i.qtd).join(', ') || '—';
    return `<div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:12px;padding:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <b style="font-size:15px;">${escCP(c.mesa || 'Mesa')}${c.comanda ? ' · Comanda ' + escCP(c.comanda) : ''}</b>
        <span style="background:#fc4b1522;color:#fc4b15;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:700;">${escCP(c.metodo)}</span>
      </div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">Cliente: <b style="color:var(--text-primary);">${escCP(c.clienteNome || 'Cliente')}</b></div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;"><b>Itens:</b> ${escCP(nomes)}</div>
      <div style="display:flex;gap:10px;font-size:13px;flex-wrap:wrap;margin-bottom:12px;color:var(--text-secondary);">
        <span>Itens <b>${fmtBrlCP(c.valorItens)}</b></span>
        <span>Serviço <b>${fmtBrlCP(c.valorServico)}</b></span>
        <span>Agradecer <b>${fmtBrlCP(c.valorGorjeta)}</b></span>
        <span style="font-weight:800;color:#27ae60;">Total <b>${fmtBrlCP(c.valorTotal)}</b></span>
      </div>
      <div style="display:flex;gap:10px;">
        <button onclick="window.aprovarComandaPronta(${c.id})" style="flex:1;padding:11px;background:#3ab55b;color:#fff;border:none;border-radius:9px;font-weight:700;cursor:pointer;"><i class="ph ph-check"></i> Aprovar</button>
        <button onclick="window.recusarComandaPronta(${c.id})" style="flex:1;padding:11px;background:transparent;color:#e74c3c;border:1px solid #e74c3c;border-radius:9px;font-weight:700;cursor:pointer;"><i class="ph ph-x"></i> Recusar</button>
      </div>
    </div>`;
  }).join('');
}

window.aprovarComandaPronta = function (id) {
  const nome = (window.operadorAtual && window.operadorAtual.nome) || 'Caixa';
  window.socket.emit('aproveitar_comanda_pronta', { id, operador: nome });
};
window.recusarComandaPronta = function (id) {
  const nome = (window.operadorAtual && window.operadorAtual.nome) || 'Caixa';
  if (confirm('Recusar esta comanda pronta? O cliente poderá revisar e reenviar.')) {
    window.socket.emit('recusar_comanda_pronta', { id, operador: nome });
  }
};

socket.on('comandas_prontas_lista', (data) => {
  if (data && data.success) renderComandasProntas(data.itens);
});
socket.on('comanda_pronta_nova', () => { window.socket.emit('listar_comandas_prontas'); });
socket.on('comanda_pronta_atualizada', () => {
  window.socket.emit('listar_comandas_prontas');
  setTimeout(() => window.socket.emit('atualizacao_caixa'), 400);
});
socket.on('comanda_pronta_resposta', () => { window.socket.emit('listar_comandas_prontas'); });

// ── CAIXINHA (gorjetas "agradecer" divididas entre funcionários ativos) ──
window.abrirCaixinhaRelatorio = function () {
  const overlay = document.getElementById('caixinha-overlay');
  if (!overlay || !window.socket) return;
  overlay.style.display = 'flex';
  const content = document.getElementById('caixinha-content');
  if (content) content.innerHTML = '<p style="font-size:14px;color:var(--text-muted);text-align:center;padding:20px;">Carregando...</p>';
  window.socket.emit('caixinha_relatorio');
};
window.fecharCaixinhaRelatorio = function () {
  const overlay = document.getElementById('caixinha-overlay');
  if (overlay) overlay.style.display = 'none';
};
socket.on('caixinha_relatorio_result', (data) => {
  const content = document.getElementById('caixinha-content');
  if (!content || !data || !data.success) return;
  const funcs = Array.isArray(data.funcionarios) ? data.funcionarios : [];
  const regs = Array.isArray(data.registros) ? data.registros : [];
  const funcsHtml = funcs.length
    ? funcs.map(f => `<div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;font-size:13px;"><span>${escCP(f.nome)} <small style="color:var(--text-muted);">${escCP(f.cargo || '')}</small></span><b style="color:#27ae60;">${fmtBrlCP(data.divisao)}</b></div>`).join('')
    : '<p style="font-size:13px;color:var(--text-muted);">Nenhum funcionário ativo para dividir.</p>';
  const regsHtml = regs.length
    ? regs.map(r => `<div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--text-secondary);">
        <span>${escCP(r.cliente_nome || 'Cliente')} · ${escCP(r.mesa || '')}${r.comanda ? ' · ' + escCP(r.comanda) : ''}</span>
        <b>${fmtBrlCP(r.valor)}</b></div>`).join('')
    : '<p style="font-size:13px;color:var(--text-muted);">Nenhuma gorjeta registrada ainda.</p>';
  content.innerHTML =
    `<div style="background:rgba(60,181,91,0.1);border:1px solid rgba(60,181,91,0.35);border-radius:14px;padding:16px;text-align:center;">
       <div style="font-size:13px;color:var(--text-muted);">Total na caixinha</div>
       <div style="font-size:28px;font-weight:800;color:#27ae60;">${fmtBrlCP(data.total)}</div>
       <div style="font-size:12.5px;color:var(--text-muted);margin-top:4px;">${funcs.length} funcionários ativos · ${fmtBrlCP(data.divisao)} cada</div>
     </div>
     <div>
       <div style="font-size:13px;font-weight:700;margin-bottom:8px;">Divisão igual (mensal)</div>
       <div style="display:flex;flex-direction:column;gap:6px;">${funcsHtml}</div>
     </div>
     <div>
       <div style="font-size:13px;font-weight:700;margin-bottom:8px;">Últimas gorjetas</div>
       <div style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto;border-top:1px solid var(--border-color);padding-top:8px;">${regsHtml}</div>
     </div>`;
});

socket.on('mesa_finalizada', ({ mesaName, targetNames }) => {
  const namesToClear = new Set([mesaName]);
  if (Array.isArray(targetNames)) targetNames.forEach(n => namesToClear.add(n));
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/^mesa\s*/i, '');
  const mNorm = norm(mesaName);

  // 1. Atualiza imediatamente o status da mesa no cache local window.allMesas
  if (Array.isArray(window.allMesas)) {
    window.allMesas.forEach(m => {
      const mn = norm(m.nome || m.mesaName);
      if (namesToClear.has(m.nome) || namesToClear.has(m.mesaName) || mn === mNorm) {
        m.status = 'Disponível';
        m.observacao = '';
        m.taxa_manual = null;
      }
    });
  }

  // 2. Remove os itens finalizados de ordersData
  ordersData = ordersData.filter(o => {
    const loc = String(o.localName || '').trim();
    const grp = String(o.mesa_grupo || '').trim();
    const cmd = String(o.mesa_comanda || '').trim();
    return !namesToClear.has(loc) && !namesToClear.has(grp) && !namesToClear.has(cmd) &&
           norm(loc) !== mNorm && norm(grp) !== mNorm;
  });
  window.ordersData = ordersData;

  // 3. Captura estado do modal e botões antes de re-renderizar
  const checkoutOverlay = document.getElementById('checkout-modal-overlay');
  const btnFinalizarModal = document.getElementById('btn-finalizar-venda');
  const newBtnSubmit = document.getElementById('checkout-modal-submit-btn');
  const modalAberto = checkoutOverlay && (checkoutOverlay.style.display !== 'none' || window.getComputedStyle(checkoutOverlay).display !== 'none');
  const isProcessing = (btnFinalizarModal && btnFinalizarModal.innerHTML.includes('Processando')) ||
                       (newBtnSubmit && newBtnSubmit.innerHTML.includes('Processando'));

  const mesaAtualNome = window.mesaAtual ? (window.mesaAtual.nome || window.mesaAtual.mesaName) : '';
  const eraMesaAtual = mesaAtualNome && (namesToClear.has(mesaAtualNome) || norm(mesaAtualNome) === mNorm);

  if (isProcessing || (modalAberto && eraMesaAtual)) {
    // Efeito de Confete
    if (typeof confetti === 'function') {
      try {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#3ab55b', '#ffffff', '#2D9CDB']
        });
      } catch (eConf) { }
    }

    // Tocar som de sucesso (Cha-Ching)
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);
        osc.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      }
    } catch (e) { }

    // Atualiza visual do botão para sucesso
    if (btnFinalizarModal) {
      btnFinalizarModal.style.background = '#27ae60';
      btnFinalizarModal.innerHTML = '<i class="ph ph-check-circle" style="font-size: 28px;"></i> VENDA CONCLUÍDA!';
    }
    if (newBtnSubmit) {
      newBtnSubmit.style.background = '#27ae60';
      newBtnSubmit.innerHTML = '<i class="ph ph-check-circle" style="font-size: 24px;"></i> CONTA FECHADA COM SUCESSO!';
    }

    // Fecha o modal de checkout após confirmação visual de sucesso (1.4s)
    setTimeout(() => {
      if (typeof window.fecharCheckoutModal === 'function') {
        window.fecharCheckoutModal();
      } else if (checkoutOverlay) {
        checkoutOverlay.style.display = 'none';
      }
      const modalPagamento = document.getElementById('pagamento-overlay');
      if (modalPagamento) modalPagamento.style.display = 'none';

      window.mesaAtual = null;
      document.body.classList.remove('mesa-selecionada');
      const acoesSummary = document.getElementById('mobile-acoes-summary');
      if (acoesSummary) acoesSummary.style.display = 'none';

      renderOrders();
    }, 1400);
  } else {
    // Se o modal estava aberto ou pertencia a esta mesa fechada por outro terminal
    if (modalAberto && eraMesaAtual) {
      if (typeof window.fecharCheckoutModal === 'function') window.fecharCheckoutModal();
      else if (checkoutOverlay) checkoutOverlay.style.display = 'none';
    }
    if (eraMesaAtual) {
      window.mesaAtual = null;
      document.body.classList.remove('mesa-selecionada');
      const acoesSummary = document.getElementById('mobile-acoes-summary');
      if (acoesSummary) acoesSummary.style.display = 'none';
    }
  }

  renderOrders();

  const rightPanel = document.querySelector('.right-panel');
  if (rightPanel && eraMesaAtual) {
    const itemsContainer = document.getElementById('panel-items');
    if (itemsContainer) itemsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Mesa Paga / Finalizada</div>';

    const panelHeader = document.querySelector('.panel-header h2');
    if (panelHeader) panelHeader.innerText = 'Mesa Paga';

    const paymentVal = document.querySelector('.payment-val');
    if (paymentVal) paymentVal.innerText = 'R$ 0,00';

    const btnFinalizar = document.getElementById('btn-finalizar');
    if (btnFinalizar) {
      btnFinalizar.innerHTML = '<i class="ph ph-check-circle" style="font-size: 20px;"></i> Finalizada';
      btnFinalizar.disabled = true;
    }
  }
});

// Caixa Logic
socket.on('erro_caixa', (msg) => {
  alert(msg);
  const btnFinalizar = document.getElementById('btn-finalizar-venda');
  if (btnFinalizar) btnFinalizar.innerHTML = 'FINALIZAR VENDA';
  const submitBtnModal = document.getElementById('checkout-modal-submit-btn');
  if (submitBtnModal) {
    submitBtnModal.innerHTML = '<i class="ph ph-check-circle" style="font-size: 24px;"></i> CONCLUIR E FECHAR MESA';
    submitBtnModal.style.opacity = '1';
    submitBtnModal.style.pointerEvents = 'auto';
  }
});

socket.on('atualizacao_caixa', () => {
  socket.emit('get_estado_caixa');
  socket.emit('get_financeiro');
  socket.emit('get_relatorios');
});

socket.on('caixa_aberto_sucesso', () => {
  const overlay = document.getElementById('caixa-overlay');
  const span = document.getElementById('status-caixa-name');
  if (overlay) overlay.style.display = 'none';
  if (span) span.innerText = 'Caixa Aberto';
  socket.emit('get_mesas');
});

let _ultimoEstadoCaixa = null;
socket.on('estado_caixa', (turno) => {
  // Esconde o splash de boot assim que o estado real chega do servidor
  if (typeof window.chefEsconderBootSplash === 'function') window.chefEsconderBootSplash();
  const overlay = document.getElementById('caixa-overlay');
  const span = document.getElementById('status-caixa-name');
  const aberto = turno && (turno.status === 'Aberto' || turno.id || !turno.data_fechamento);
  if (aberto) {
    if (overlay) overlay.style.display = 'none';
    if (span) span.innerText = 'Caixa Aberto';
    if (_ultimoEstadoCaixa !== 'aberto') {
      _ultimoEstadoCaixa = 'aberto';
      console.log("Caixa está aberto:", turno);
    }
  } else {
    // Só exibe o modal de abertura DEPOIS que o splash já saiu da tela
    const mostrarOverlay = () => {
      if (overlay) overlay.style.display = 'flex';
      if (span) span.innerText = 'Caixa Fechado';
    };
    const splash = document.getElementById('chef-boot-splash');
    if (splash && !splash._oculto) {
      setTimeout(mostrarOverlay, 550); // aguarda o fade-out do splash
    } else {
      mostrarOverlay();
    }
    if (_ultimoEstadoCaixa !== 'fechado') {
      _ultimoEstadoCaixa = 'fechado';
      console.log("Caixa está fechado.");
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // Inicialização essencial de dados (evita chamadas duplicadas ao backend)
  socket.emit('get_mesas');
  socket.emit('get_estado_caixa');
  socket.emit('get_produtos');
  socket.emit('get_funcionarios');
  socket.emit('get_promocoes');

  // Checagem HTTP imediata para desbloquear a interface sem depender exclusivamente do websocket
  fetch('/api/caixa/estado')
    .then(r => r.json())
    .then(data => {
      if (data && data.aberto) {
        const overlay = document.getElementById('caixa-overlay');
        const span = document.getElementById('status-caixa-name');
        if (overlay) overlay.style.display = 'none';
        if (span) span.innerText = 'Caixa Aberto';
        if (typeof socket !== 'undefined' && socket) socket.emit('get_mesas');
      }
    }).catch(() => {});

  // Fallback imediato via HTTP para popular mesas e comandas sem esperar resposta de socket
  fetch('/api/mesas')
    .then(r => r.json())
    .then(mesas => {
      if (Array.isArray(mesas) && mesas.length > 0) {
        window.allMesas = mesas;
        if (typeof renderOrders === 'function') renderOrders();
      }
    }).catch(() => {});

  // Watchdog de abertura: se o estado do caixa não chegar (conexão instável,
  // servidor reiniciando etc.), re-solicita para destravar a tela.
  setTimeout(() => {
    const splash = document.getElementById('chef-boot-splash');
    const overlayCx = document.getElementById('caixa-overlay');
    const pendente = (splash && splash.style.display !== 'none' && !splash._oculto) ||
      (overlayCx && overlayCx.style.display === 'flex');
    if (pendente) {
      console.warn('[Watchdog] Estado inicial não recebeu resposta — re-solicitando caixa e mesas.');
      socket.emit('get_estado_caixa');
      socket.emit('get_mesas');
    }
  }, 6000);

  const btnAbrir = document.getElementById('btn-abrir-caixa');
  if (btnAbrir) {
    btnAbrir.onclick = () => {
      let valInput = document.getElementById('fundo-troco') ? document.getElementById('fundo-troco').value : '0';
      const fundo = parseFloat(String(valInput || '0').replace(',', '.'));
      const operador = (window.crmPerfil && window.crmPerfil.nome) || localStorage.getItem('usuario_logado') || 'Caixa';
      
      btnAbrir.disabled = true;
      btnAbrir.innerText = 'Abrindo...';

      const fecharOverlayCaixa = () => {
        const overlay = document.getElementById('caixa-overlay');
        const span = document.getElementById('status-caixa-name');
        if (overlay) overlay.style.display = 'none';
        if (span) span.innerText = 'Caixa Aberto';
        btnAbrir.disabled = false;
        btnAbrir.innerText = 'ABRIR CAIXA';
        if (typeof showToast === 'function') showToast('Caixa aberto com sucesso!', 'success');
        if (typeof socket !== 'undefined' && socket) {
          socket.emit('get_estado_caixa');
          socket.emit('get_mesas');
        }
      };

      if (typeof socket !== 'undefined' && socket.connected) {
        socket.emit('abrir_caixa', { fundo_troco: isNaN(fundo) ? 0 : fundo, operador: operador });
        setTimeout(fecharOverlayCaixa, 300);
      }

      // Fallback via HTTP API
      fetch('/api/caixa/abrir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(typeof authHeaders === 'function' ? authHeaders() : {}) },
        body: JSON.stringify({ fundo_troco: isNaN(fundo) ? 0 : fundo, operador: operador })
      }).then(() => {
        fecharOverlayCaixa();
      }).catch(() => {
        fecharOverlayCaixa();
      });
    };
  }

  const btnNovo = document.getElementById('btn-adicionar-produtos');
  const pdvOverlay = document.getElementById('pdv-overlay');

  window.pdvCart = [];
  window.pdvCurrentCategory = 'Todas';
  window.pdvConfigs = {};

  window.selectedOnboardingModality = null;

  const MODALITY_LABELS = {
    'a_la_carte': { name: 'À La Carte', icon: 'ph-bowl-food' },
    'pizzaria': { name: 'Pizzaria', icon: 'ph-pizza' },
    'a_kilo': { name: 'Restaurante À Kilo', icon: 'ph-scales' },
    'buffet': { name: 'Buffet', icon: 'ph-cooking-pot' },
    'lanchonete': { name: 'Lanchonete', icon: 'ph-hamburger' },
    'bar': { name: 'Bar / Pub', icon: 'ph-beer-bottle' },
    'balada': { name: 'Balada / Club', icon: 'ph-music-notes' },
    'quiosque': { name: 'Quiosque', icon: 'ph-storefront' },
    'eventos': { name: 'Eventos / Festas', icon: 'ph-ticket' }
  };

  window.onModalityLoaded = function(modality) {
    const badgeText = document.getElementById('modality-badge-text');
    const badge = document.getElementById('modality-indicator-badge');
    if (badgeText && badge) {
      const info = MODALITY_LABELS[modality] || { name: 'Restaurante', icon: 'ph-storefront' };
      badgeText.innerText = info.name;
      const iconEl = badge.querySelector('i');
      if (iconEl) {
        iconEl.className = 'ph-bold ' + info.icon;
      }
    }
  };
  window.selectOnboardingModality = function(el) {
    document.querySelectorAll('.onboarding-item-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    window.selectedOnboardingModality = el.getAttribute('data-modalidade');
    document.getElementById('btn-onboarding-confirm').removeAttribute('disabled');

    /* Busca e exibe módulos sugeridos para a modalidade */
    const preview = document.getElementById('onboarding-modulos-preview');
    const list = document.getElementById('onboarding-modulos-list');
    if (preview && list && window.selectedOnboardingModality) {
      fetch('/api/modalidade-modulos?modalidade=' + encodeURIComponent(window.selectedOnboardingModality))
        .then(r => r.json())
        .then(d => {
          if (d.ok && d.modulos && d.modulos.length) {
            const nomes = {
              reservas:'Reservas', fidelidade:'Fidelidade', montaveis:'Itens Montáveis',
              delivery:'Delivery', totem:'Totem', balanca:'Balança', comandas:'Comandas Digitais',
              cardapio_foto:'Cardápio Fotográfico', producao:'Painel de Produção',
              fila_senhas:'Fila & Senhas', formas_pagamento:'Formas de Pagamento',
            };
            list.innerHTML = d.modulos.map(m => {
              const nome = nomes[m] || m.replace(/_/g, ' ');
              return '<span style="display:inline-flex; align-items:center; gap:4px; padding:4px 10px; background:rgba(252,75,21,0.12); border:1px solid rgba(252,75,21,0.3); border-radius:20px; font-size:11px; font-weight:600; color:#fc4b15;"><i class="ph-bold ph-check" style="font-size:12px;"></i>' + nome + '</span>';
            }).join('');
            preview.style.display = 'block';
          } else {
            preview.style.display = 'none';
          }
        }).catch(() => { preview.style.display = 'none'; });
    }
  };

  window.confirmOnboardingModality = function() {
    if (!window.selectedOnboardingModality) return;
    const btn = document.getElementById('btn-onboarding-confirm');
    if (btn) {
      btn.setAttribute('disabled', 'true');
      btn.innerHTML = '<i class="ph-bold ph-spinner-gap animate-spin"></i> Salvando...';
    }
    
    if (typeof socket !== 'undefined' && socket) {
      socket.emit('save_restaurante_config', {
        'rest_modalidade': window.selectedOnboardingModality
      });
    }

    fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(typeof authHeaders === 'function' ? authHeaders() : {})
      },
      body: JSON.stringify({
        'rest_modalidade': window.selectedOnboardingModality
      })
    }).then(r => r.json()).then(() => {
      /* Auto-ativa módulos da modalidade escolhida */
      fetch('/api/config/modalidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(typeof authHeaders === 'function' ? authHeaders() : {}) },
        body: JSON.stringify({ modalidade: window.selectedOnboardingModality })
      }).catch(() => {});

      /* Atualiza pdvConfigs local para o wizard usar a modalidade correta */
      window.pdvConfigs = window.pdvConfigs || {};
      window.pdvConfigs.rest_modalidade = window.selectedOnboardingModality;

      const modal = document.getElementById('onboarding-modal');
      if (modal) modal.classList.add('hidden');
      if (window.onModalityLoaded) window.onModalityLoaded(window.selectedOnboardingModality);
      /* Abre o wizard de configuração após selecionar modalidade */
      setTimeout(() => window.showWizard(), 400);
    }).catch(() => {
      /* Auto-ativa módulos mesmo em caso de erro do config */
      fetch('/api/config/modalidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(typeof authHeaders === 'function' ? authHeaders() : {}) },
        body: JSON.stringify({ modalidade: window.selectedOnboardingModality })
      }).catch(() => {});

      window.pdvConfigs = window.pdvConfigs || {};
      window.pdvConfigs.rest_modalidade = window.selectedOnboardingModality;

      const modal = document.getElementById('onboarding-modal');
      if (modal) modal.classList.add('hidden');
      setTimeout(() => window.showWizard(), 400);
    });
  };

  function fetchPdvConfigs() {
    fetch('/api/config', { headers: authHeaders() })
      .then(r => r.json())
      .then(conf => {
        window.pdvConfigs = conf;
        const modal = document.getElementById('onboarding-modal');
        if (modal) {
          if (!conf.rest_modalidade) {
            modal.classList.remove('hidden');
          } else {
            modal.classList.add('hidden');
            if (window.onModalityLoaded) window.onModalityLoaded(conf.rest_modalidade);
            /* Mostra wizard na primeira vez */
            if (!conf.onboarding_completo) {
              setTimeout(() => window.showWizard(), 500);
            }
          }
        }
        if (typeof window.renderPdvMenu === 'function') window.renderPdvMenu();
      })
      .catch(e => console.error("Erro fetch configs:", e));
  }
  fetchPdvConfigs();
  socket.on('configuracoes_atualizadas', function () {
    if (typeof fetchPdvConfigs === 'function') fetchPdvConfigs();
    if (typeof window.carregarFuncsModulos === 'function') window.carregarFuncsModulos();
  });

  /* ═══════════════════════════════════════════════════════════════ */
  /* MÓDULOS / FUNÇÕES — liberados pelo super admin e ativados       */
  /* pelo restaurante. Itens do caixa só aparecem quando ATIVOS.     */
  /* ═══════════════════════════════════════════════════════════════ */
  window.chefFuncs = null;
  window.carregarFuncsModulos = async function () {
    try {
      const r = await fetch('/api/funcoes', { headers: authHeaders() });
      const d = await r.json();
      const map = {};
      (d.features || []).forEach(function (f) { map[f.chave] = f; });
      window.chefFuncs = map;
      if (typeof window.aplicarVisibilidadeModulos === 'function') window.aplicarVisibilidadeModulos();
    } catch (e) {}
  };

  // true se o restaurante liberou E ativou o módulo
  window.isFuncModAtiva = function (chave) {
    var f = window.chefFuncs && window.chefFuncs[chave];
    if (!f) return true; // antes de carregar, nada é escondido (evita sumiço indevido)
    return !!(f.available && f.enabled);
  };

  window.aplicarVisibilidadeModulos = function () {
    var regras = {
      hub_delivery: ['menu-hub-delivery', 'menu-mob-hub-delivery'],
      fila_espera: ['btn-status-fila', 'menu-mob-fila-espera'],
      reservas: ['btn-reservar-mesa']
    };
    Object.keys(regras).forEach(function (chave) {
      var ativa = window.isFuncModAtiva(chave);
      regras[chave].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = ativa ? '' : 'none';
      });
    });
  };

  socket.on('funcao_aprovada', function (data) {
    if (data && data.feature && window.carregarFuncsModulos) window.carregarFuncsModulos();
  });
  window.carregarFuncsModulos();

    
  // ─── CRONÔMETRO REGRESSIVO E CONTROLE DE 60 MINUTOS DO MODO DEMO ───
  let _demoTimerInterval = null;
  function _iniciarContadorDemo(expiraEmMs) {
    if (!expiraEmMs) {
      expiraEmMs = parseInt(localStorage.getItem('demo_expira_em_timestamp'), 10);
    }
    if (!expiraEmMs) {
      expiraEmMs = Date.now() + 60 * 60 * 1000;
      localStorage.setItem('demo_expira_em_timestamp', expiraEmMs);
    }

    clearInterval(_demoTimerInterval);
    _demoTimerInterval = setInterval(function () {
      const agora = Date.now();
      const restanteMs = expiraEmMs - agora;

      if (restanteMs <= 0) {
        clearInterval(_demoTimerInterval);
        _encerrarSessaoDemoExpirada();
        return;
      }

      const min = Math.floor(restanteMs / 60000);
      const seg = Math.floor((restanteMs % 60000) / 1000);
      const strTempo = String(min).padStart(2, '0') + ':' + String(seg).padStart(2, '0');

      const elTimer = document.getElementById('demo-countdown-timer');
      if (elTimer) elTimer.textContent = strTempo;
    }, 1000);
  }

  function _encerrarSessaoDemoExpirada() {
    alert('⏱️ Seu período de demonstração de 60 minutos encerrou! Configure o seu restaurante oficial para continuar aproveitando todos os recursos.');
    window.sairModoDemoEIniciarSetup();
  }

  // ─── DIÁLOGO INTELIGENTE DE DEMO ATIVA NO MESMO LOCAL / IP ───
  window.wizardSkip = function () {
    const lat = document.getElementById('wiz-geo-lat')?.value;
    const lng = document.getElementById('wiz-geo-lng')?.value;
    const restNome = document.getElementById('wiz-rest-nome')?.value;

    // 1. Checa se já existe uma demonstração ativa neste local
    fetch('/api/auth/verificar-demo-ativa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: lat, lng: lng })
    })
      .then(r => r.json())
      .then(data => {
        if (data && data.ok && data.existe_demo) {
          _exibirModalDecisaoDemo(data.demo);
        } else {
          _iniciarModoDemoDireto(false);
        }
      })
      .catch(() => _iniciarModoDemoDireto(false));
  };

  function _exibirModalDecisaoDemo(demoInfo) {
    const modalId = 'modal-decisao-demo-ativa';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); z-index:999999; display:flex; align-items:center; justify-content:center; padding:20px;';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:#0f172a; border:2px solid #3b82f6; border-radius:18px; max-width:480px; width:100%; padding:24px; color:#f8fafc; box-shadow:0 20px 50px rgba(0,0,0,0.8); text-align:center;">
        <div style="width:52px; height:52px; border-radius:16px; background:rgba(59,130,246,0.15); color:#3b82f6; display:flex; align-items:center; justify-content:center; font-size:26px; margin:0 auto 14px;">
          <i class="ph-bold ph-users-three"></i>
        </div>
        <h3 style="font-size:18px; font-weight:800; margin:0 0 8px;">Demonstração Ativa Detectada!</h3>
        <p style="color:#94a3b8; font-size:13px; line-height:1.5; margin:0 0 20px;">
          Já existe uma sessão de demonstração em andamento neste mesmo local criada recentemente. Como você deseja proceder?
        </p>

        <div style="display:flex; flex-direction:column; gap:10px;">
          <button type="button" onclick="_concluirDecisaoDemo('compartilhada')" style="background:#3b82f6; color:white; border:none; padding:12px; border-radius:10px; font-weight:700; font-size:13.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
            <i class="ph-bold ph-handshake"></i> <span>Entrar Junto na Demonstração Ativa</span>
          </button>

          <button type="button" onclick="_concluirDecisaoDemo('nova')" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); color:#f8fafc; padding:12px; border-radius:10px; font-weight:700; font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
            <i class="ph-bold ph-sparkle"></i> <span>Abrir Minha Própria Demo (60 Minutos)</span>
          </button>
        </div>
      </div>
    `;
    modal.style.display = 'flex';
  }

  window._concluirDecisaoDemo = function(opcao) {
    const modal = document.getElementById('modal-decisao-demo-ativa');
    if (modal) modal.style.display = 'none';
    _iniciarModoDemoDireto(opcao === 'nova');
  };

  function _iniciarModoDemoDireto(forcarNova) {
    const lat = document.getElementById('wiz-geo-lat')?.value;
    const lng = document.getElementById('wiz-geo-lng')?.value;
    const restNome = document.getElementById('wiz-rest-nome')?.value;

    fetch('/api/auth/entrar-modo-demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: lat, lng: lng, restaurante_nome: restNome, forcar_nova: forcarNova })
    })
    .then(r => r.json())
    .then(data => {
      if (data && data.ok && data.token) {
        localStorage.setItem('chef_token', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        localStorage.setItem('userRole', 'admin');
        localStorage.setItem('is_dono', 'true');
        localStorage.setItem('is_demo_mode', 'true');
        localStorage.setItem('restaurante_id', '999');
        localStorage.setItem('demo_expira_em_timestamp', data.expira_em_timestamp || (Date.now() + 60 * 60 * 1000));

        _iniciarContadorDemo(data.expira_em_timestamp);
        _exibirBannerModoDemo();

        if (typeof window.showToast === 'function') {
          window.showToast('🧪 Demonstração de 60 minutos iniciada!', 'info');
        }
        _finishWizard();
      }
    })
    .catch(err => {
      console.error('[Demo Mode Error]', err);
      _finishWizard();
    });
  }

  function _exibirBannerModoDemo() {
    if (document.getElementById('demo-mode-top-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'demo-mode-top-banner';
    banner.style.cssText = 'position:fixed; top:0; left:0; right:0; z-index:99999; background:linear-gradient(90deg, #1e293b, #0f172a); border-bottom:2px solid #3b82f6; color:#f8fafc; padding:7px 16px; font-size:12px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; box-shadow:0 4px 12px rgba(0,0,0,0.5);';
    banner.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="background:#3b82f6; color:white; font-size:10px; font-weight:800; padding:2px 8px; border-radius:12px; text-transform:uppercase;">🧪 Modo Demo</span>
        <span>Tempo Restante: <strong id="demo-countdown-timer" style="color:#60a5fa; font-family:monospace; font-size:13px; letter-spacing:1px;">59:59</strong></span>
      </div>
      <button type="button" onclick="window.sairModoDemoEIniciarSetup()" style="background:#fc4b15; color:white; border:none; padding:4px 12px; border-radius:6px; font-size:11.5px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px;">
        <span>Configurar meu Restaurante Oficial</span> <i class="ph-bold ph-arrow-right"></i>
      </button>
    `;
    document.body.prepend(banner);
  }


  window.sairModoDemoEIniciarSetup = function() {
    localStorage.removeItem('chef_token');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userRole');
    localStorage.removeItem('is_dono');
    localStorage.removeItem('is_demo_mode');
    localStorage.removeItem('restaurante_id');
    window.location.reload();
  };

  // Se estiver em modo demo ao carregar, exibe o banner
  if (localStorage.getItem('is_demo_mode') === 'true') {
    setTimeout(_exibirBannerModoDemo, 600);
  }


  window.wizardFinish = function() {
    _finishWizard();
  };

  function _saveWizRestaurantData() {
    const nome = document.getElementById('wiz-rest-nome')?.value.trim();
    const tel = document.getElementById('wiz-rest-tel')?.value.trim();
    const endereco = document.getElementById('wiz-rest-endereco')?.value.trim();
    const payload = {};
    if (nome) payload.nome_restaurante = nome;
    if (tel) payload.telefone_restaurante = tel;
    if (endereco) payload.endereco_restaurante = endereco;
    if (Object.keys(payload).length > 0) {
      socket.emit('save_restaurante_config', payload);
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(typeof authHeaders === 'function' ? authHeaders() : {}) },
        body: JSON.stringify(payload)
      }).catch(() => {});
    }
  }

  function _saveWizMesas() {
    const modo = window.wizardGetModoMesas ? window.wizardGetModoMesas() : 'exemplos';
    if (modo === 'exemplos') {
      /* Pacote de exemplos já vem semeado no banco — nada a criar, sem risco de duplicar */
      return;
    }
    /* Modo do zero: substitui as mesas de exemplo pela lista exata (servidor protege contra perda) */
    const qtd = parseInt(document.getElementById('wiz-qtd-mesas')?.value) || 0;
    const addDelivery = document.getElementById('wiz-add-delivery')?.checked;
    const addBalcao = document.getElementById('wiz-add-balcao')?.checked;
    const nomes = [];
    for (let i = 1; i <= qtd; i++) nomes.push('Mesa ' + i);
    if (addDelivery) nomes.push('Delivery');
    if (addBalcao) nomes.push('Balcão');
    if (nomes.length) socket.emit('setup_redefinir_mesas', nomes);
  }

  function _saveWizProdutos() {
    const semExemplos = document.getElementById('wiz-sem-exemplos')?.checked;
    if (semExemplos) socket.emit('setup_limpar_produtos_exemplo');
    _wizardProdutos.forEach(p => {
      if (p.nome && p.nome.trim()) {
        socket.emit('add_produto', {
          categoria: p.categoria || 'Geral',
          nome: p.nome.trim(),
          preco: p.preco || 0,
          emoji: p.emoji || '🍽️',
          hasAddons: false,
          setor: 'Cozinha 1',
          status_inicial: 'Em espera',
          status: 'ativo',
          categoria_fiscal: 'Alimentacao',
          descricao: '',
          codigo_barras: null,
          visibilidade: 'todos'
        });
      }
    });
  }

  function _finishWizard() {
    _wizardActive = false;
    /* Salva flag de onboarding completo */
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(typeof authHeaders === 'function' ? authHeaders() : {}) },
      body: JSON.stringify({ onboarding_completo: 'true' })
    }).catch(() => {});
    socket.emit('save_restaurante_config', { onboarding_completo: 'true' });

    const el = document.getElementById('onboarding-wizard');
    if (el) el.classList.add('hidden');
    window.showToast && window.showToast('Configuração inicial concluída! 🎉', 'success');
  }

  window._saveWizMesas = _saveWizMesas;
  window._saveWizProdutos = _saveWizProdutos;
  window._finishWizard = _finishWizard;

  /* Atualiza preview de mesas ao digitar */
  document.addEventListener('input', function(e) {
    if (e.target.id === 'wiz-qtd-mesas' || e.target.id === 'wiz-add-delivery' || e.target.id === 'wiz-add-balcao') {
      if (typeof window._updateMesasPreview === 'function') window._updateMesasPreview();
    }
  });
  document.addEventListener('change', function(e) {
    if (e.target.id === 'wiz-add-delivery' || e.target.id === 'wiz-add-balcao') {
      if (typeof window._updateMesasPreview === 'function') window._updateMesasPreview();
    }
  });

