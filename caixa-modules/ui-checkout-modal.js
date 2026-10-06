// --- CHECKOUT MODAL LIFECYCLE CONTROLS ---
window.abrirCheckoutModal = () => {
  if (!window.mesaAtual || window.mesaAtual.isGroup === false) return alert('Selecione uma mesa ocupada primeiro.');

  const nomeMesaAtual = window.mesaAtual.nome || window.mesaAtual.mesaName;

  // Sincroniza pagamentos parciais diretamente de ordersData para garantir integridade com o banco
  window.recalcularPagamentosParciais(nomeMesaAtual);

  // RESET CUSTOM NFCE
  window.customNfceConfig = null;
  const btnNfce = document.getElementById('btn-customizar-nfce');
  if (btnNfce) {
    btnNfce.innerHTML = `<i class="ph ph-faders"></i> Personalizar Itens da NFC-e`;
    btnNfce.style.background = '#e0f2fe';
    btnNfce.style.color = '#0369a1';
    btnNfce.style.border = '1px solid #bae6fd';
  }

  const titleEl = document.getElementById('checkout-modal-mesa-title');
  if (titleEl) {
    titleEl.innerText = window.mesaAtual.nome || window.mesaAtual.mesaName;
  }

  const overlay = document.getElementById('checkout-modal-overlay');
  if (overlay) overlay.style.display = 'flex';

  // Reset dos estados da sessão de fechamento (taxa manual, itens, cliente, Pix)
  window._checkoutItensSemTaxa = new Set();
  window._checkoutTaxaManual = null;
  window._checkoutClienteId = null;
  const buscaInput = document.getElementById('checkout-modal-busca-cliente');
  if (buscaInput) buscaInput.value = '';
  const buscaBox = document.getElementById('checkout-modal-busca-resultados');
  if (buscaBox) { buscaBox.style.display = 'none'; buscaBox.innerHTML = ''; }
  const clienteBadge = document.getElementById('checkout-modal-cliente-badge');
  if (clienteBadge) clienteBadge.style.display = 'none';
  const taxaManualRow = document.getElementById('checkout-modal-taxa-manual-row');
  if (taxaManualRow) taxaManualRow.style.display = 'none';
  const taxaManualInput = document.getElementById('checkout-modal-taxa-manual');
  if (taxaManualInput) taxaManualInput.value = '';
  if (typeof socket !== 'undefined' && socket) {
    const nomeMesaAtual = window.mesaAtual.nome || window.mesaAtual.mesaName;
    socket.emit('get_taxa_mesa', { mesaName: nomeMesaAtual });
  }

  const inputSplitParts = document.getElementById('checkout-modal-split-parts');
  if (inputSplitParts) inputSplitParts.value = '';

  // Configurar o Modo Touch padrão baseado nas configurações
  const defaultTouch = window.pdvConfigs && (window.pdvConfigs.modo_touch === 'true' || window.pdvConfigs.modo_touch === true);
  window.checkoutModalToggleTouchMode(defaultTouch);

  if (window.calcRestante) window.calcRestante();

  // Setar o valor do pagamento diretamente para o saldo restante da mesa (evitando clique extra)
  const falta = window.mesaFaltaPagar || 0;
  const inputValor = document.getElementById('checkout-modal-valor');
  const visor = document.getElementById('checkout-modal-touch-visor');
  if (falta > 0) {
    const formatted = `R$ ${falta.toFixed(2).replace('.', ',')}`;
    if (inputValor) inputValor.value = formatted;
    if (visor) visor.innerText = formatted;
    window.checkoutModalCents = Math.round(falta * 100);
    window._checkoutAutoFilled = true;
  } else {
    if (inputValor) inputValor.value = '';
    if (visor) visor.innerText = 'R$ 0,00';
    window.checkoutModalCents = 0;
    window._checkoutAutoFilled = false;
  }

  // Focar e selecionar automaticamente o input de valor para facilitar digitação de outro valor
  setTimeout(() => {
    const inputValor = document.getElementById('checkout-modal-valor');
    if (inputValor && !window.checkoutModalTouchModeActive) {
      inputValor.focus();
      inputValor.select();
    }
  }, 100);

  // Exibir ou ocultar o botão de pagamento por maquininha integrada
  const btnMpStandard = document.getElementById('btn-checkout-pagar-maquininha');
  const btnMpTouch = document.getElementById('btn-checkout-pagar-maquininha-touch');
  const activeProvider = window.pdvConfigs && window.pdvConfigs.mp_provider;
  const hasMp = activeProvider && activeProvider !== 'none';

  if (btnMpStandard) btnMpStandard.style.display = hasMp ? 'flex' : 'none';
  if (btnMpTouch) btnMpTouch.style.display = hasMp ? 'flex' : 'none';

  // Atualiza label do botão com ícone do provedor
  const providerLabels = { mercadopago: '🔵 Maquininha MP', stone: '🟢 Maquininha Stone', pagbank: '🟠 Maquininha PagBank', sitef: '⚙️ Maquininha TEF' };
  const btnLabel = providerLabels[activeProvider] || '💳 Maquininha';
  if (btnMpStandard) btnMpStandard.textContent = btnLabel;
  if (btnMpTouch) btnMpTouch.textContent = btnLabel;

  // Painel Pix (se o método já estiver em Pix)
  if (window.checkoutModalAtualizarPix) window.checkoutModalAtualizarPix();
};

window.fecharCheckoutModal = () => {
  const overlay = document.getElementById('checkout-modal-overlay');
  if (overlay) overlay.style.display = 'none';
  const submodal = document.getElementById('submodal-checkout-fracionamento');
  if (submodal) submodal.style.display = 'none';

  // Reseta estado e estilos dos botões
  const btnSubmit = document.getElementById('checkout-modal-submit-btn');
  if (btnSubmit) {
    btnSubmit.innerHTML = '<i class="ph ph-check-circle" style="font-size: 24px;"></i> CONCLUIR E FECHAR MESA';
    btnSubmit.style.background = '#3ab55b';
    btnSubmit.style.opacity = '0.5';
    btnSubmit.style.pointerEvents = 'none';
  }
  const btnFinalizarModal = document.getElementById('btn-finalizar-venda');
  if (btnFinalizarModal) {
    btnFinalizarModal.innerHTML = '<i class="ph ph-check-circle" style="font-size: 28px;"></i> FINALIZAR VENDA';
    btnFinalizarModal.style.background = '#3ab55b';
  }
};

// ═════════════════════════════════════════════════════════════════════
// ✂️ SUBMODAL DE FRACIONAMENTO E ALOCAÇÃO DE ITENS NO MODAL DE CHECKOUT
// ═════════════════════════════════════════════════════════════════════
let submodalModoAtivo = 'fracionar'; // 'fracionar' | 'alocar'
let submodalItemFracaoAtual = null;
let submodalPresetFracoesAtual = 2;

window.onCheckoutItemSelectionChange = () => {
  const checkboxes = document.querySelectorAll('#checkout-modal-items-tbody .chk-checkout-item');
  const checked = document.querySelectorAll('#checkout-modal-items-tbody .chk-checkout-item:checked');
  const badge = document.getElementById('badge-checkout-sel-count');
  const chkAll = document.getElementById('chk-checkout-select-all');

  if (badge) {
    if (checked.length > 0) {
      badge.innerText = checked.length;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  if (chkAll && checkboxes.length > 0) {
    chkAll.checked = (checked.length === checkboxes.length);
  }
};

window.toggleCheckoutSelectAll = (checkedState) => {
  const checkboxes = document.querySelectorAll('#checkout-modal-items-tbody .chk-checkout-item');
  checkboxes.forEach(chk => {
    chk.checked = !!checkedState;
  });
  window.onCheckoutItemSelectionChange();
};

window.abrirSubmodalFracionamentoCheckout = (itemIdOpcional) => {
  const submodal = document.getElementById('submodal-checkout-fracionamento');
  if (!submodal) return;

  if (!window.mesaAtual || !Array.isArray(window.mesaAtual.items)) {
    return alert('Nenhum item encontrado na conta ativa.');
  }

  // Obter itens não pagos da mesa atual
  const itensNaoPagos = window.mesaAtual.items.filter(o => o.status !== 'Pago');
  if (itensNaoPagos.length === 0) {
    return alert('Todos os itens desta conta já estão pagos.');
  }

  // Preencher dropdown de seleção de item para o Modo Fracionar
  const selectItemFracionar = document.getElementById('submodal-select-item-fracionar');
  if (selectItemFracionar) {
    selectItemFracionar.innerHTML = itensNaoPagos.map(o => {
      const tot = parseFloat(String(o.total || 0).replace(',', '.'));
      return `<option value="${o.id}">${o.productEmoji || '🍽️'} ${o.productName || 'Item'} - R$ ${tot.toFixed(2).replace('.', ',')} (${o.quantity || 1}x)</option>`;
    }).join('');
  }

  // Extrair comandas ativas na mesa atual
  const comandasAtivas = [];
  window.mesaAtual.items.forEach(o => {
    const c = (o.mesa_comanda || '').trim();
    if (c && !comandasAtivas.includes(c)) comandasAtivas.push(c);
  });

  // Preencher dropdown de comanda destino do Modo Alocar
  const selectAlocarDestino = document.getElementById('submodal-alocar-comanda-destino');
  if (selectAlocarDestino) {
    selectAlocarDestino.innerHTML = `
      <option value="">🪑 Compartilhado na Mesa</option>
      ${comandasAtivas.map(c => `<option value="${c}">👤 Comanda: ${c}</option>`).join('')}
      <option value="__NOVA__">➕ Criar Nova Comanda...</option>
    `;
  }
  const inputNovaAlocar = document.getElementById('submodal-alocar-nova-comanda-input');
  if (inputNovaAlocar) {
    inputNovaAlocar.style.display = 'none';
    inputNovaAlocar.value = '';
  }

  // Se passou itemId específico pelo botão na linha
  if (itemIdOpcional) {
    const chks = document.querySelectorAll('#checkout-modal-items-tbody .chk-checkout-item');
    chks.forEach(c => {
      c.checked = (String(c.getAttribute('data-id')) === String(itemIdOpcional));
    });
    window.onCheckoutItemSelectionChange();
    if (selectItemFracionar) selectItemFracionar.value = String(itemIdOpcional);
    window.onSubmodalItemFracionarChange(itemIdOpcional);
    window.alternarModoSubmodalCheckout('fracionar');
  } else {
    // Verifica quais checkboxes estão marcados
    const checked = Array.from(document.querySelectorAll('#checkout-modal-items-tbody .chk-checkout-item:checked'));
    if (checked.length > 1) {
      window.carregarGrupoSubmodalAlocar(checked);
      window.alternarModoSubmodalCheckout('alocar');
    } else if (checked.length === 1) {
      const singleId = checked[0].getAttribute('data-id');
      if (selectItemFracionar) selectItemFracionar.value = singleId;
      window.onSubmodalItemFracionarChange(singleId);
      window.alternarModoSubmodalCheckout('fracionar');
    } else {
      // Nenhum marcado: seleciona o primeiro item disponível
      const primeiroItem = itensNaoPagos[0];
      if (selectItemFracionar && primeiroItem) {
        selectItemFracionar.value = String(primeiroItem.id);
        window.onSubmodalItemFracionarChange(primeiroItem.id);
      }
      window.alternarModoSubmodalCheckout('fracionar');
    }
  }

  submodal.style.display = 'flex';
};

window.fecharSubmodalFracionamentoCheckout = () => {
  const submodal = document.getElementById('submodal-checkout-fracionamento');
  if (submodal) submodal.style.display = 'none';
};

window.alternarModoSubmodalCheckout = (modo) => {
  submodalModoAtivo = modo;
  const btnFrac = document.getElementById('tab-btn-submodal-fracionar');
  const btnAloc = document.getElementById('tab-btn-submodal-alocar');
  const corpoFrac = document.getElementById('corpo-submodal-fracionar');
  const corpoAloc = document.getElementById('corpo-submodal-alocar');

  if (modo === 'fracionar') {
    if (btnFrac) {
      btnFrac.style.background = 'var(--bg-card, #fff)';
      btnFrac.style.color = '#ea580c';
      btnFrac.style.fontWeight = '800';
    }
    if (btnAloc) {
      btnAloc.style.background = 'transparent';
      btnAloc.style.color = 'var(--text-secondary, #64748b)';
      btnAloc.style.fontWeight = '600';
    }
    if (corpoFrac) corpoFrac.style.display = 'flex';
    if (corpoAloc) corpoAloc.style.display = 'none';
  } else {
    if (btnAloc) {
      btnAloc.style.background = 'var(--bg-card, #fff)';
      btnAloc.style.color = '#2563eb';
      btnAloc.style.fontWeight = '800';
    }
    if (btnFrac) {
      btnFrac.style.background = 'transparent';
      btnFrac.style.color = 'var(--text-secondary, #64748b)';
      btnFrac.style.fontWeight = '600';
    }
    if (corpoFrac) corpoFrac.style.display = 'none';
    if (corpoAloc) corpoAloc.style.display = 'flex';

    // Recarregar itens marcados para alocar
    const checked = Array.from(document.querySelectorAll('#checkout-modal-items-tbody .chk-checkout-item:checked'));
    window.carregarGrupoSubmodalAlocar(checked);
  }
};

window.onSubmodalItemFracionarChange = (itemId) => {
  if (!window.mesaAtual || !Array.isArray(window.mesaAtual.items)) return;
  const item = window.mesaAtual.items.find(o => String(o.id) === String(itemId));
  if (!item) return;

  const totalVal = parseFloat(String(item.total || 0).replace(',', '.'));
  const qty = parseFloat(String(item.quantity || 1).replace(',', '.'));

  submodalItemFracaoAtual = {
    id: item.id,
    nome: item.productName || 'Item',
    emoji: item.productEmoji || '🍽️',
    total: totalVal,
    qty: qty
  };

  const emojiEl = document.getElementById('submodal-fracao-emoji');
  if (emojiEl) emojiEl.innerText = submodalItemFracaoAtual.emoji;
  const nomeEl = document.getElementById('submodal-fracao-nome');
  if (nomeEl) nomeEl.innerText = submodalItemFracaoAtual.nome;
  const qtdEl = document.getElementById('submodal-fracao-qtd');
  if (qtdEl) qtdEl.innerText = `Qtd: ${submodalItemFracaoAtual.qty} un`;
  const totalEl = document.getElementById('submodal-fracao-total');
  if (totalEl) totalEl.innerText = `R$ ${Math.max(0, submodalItemFracaoAtual.total).toFixed(2).replace('.', ',')}`;

  window.selecionarSubmodalPresetFracao(submodalPresetFracoesAtual || 2);
};

window.selecionarSubmodalPresetFracao = (qtd) => {
  const isCustom = qtd === 'custom';
  submodalPresetFracoesAtual = isCustom ? parseInt(document.getElementById('submodal-custom-num-fracoes').value || 5, 10) : qtd;

  document.querySelectorAll('#grid-submodal-preset-fracoes .btn-submodal-preset').forEach(btn => {
    btn.style.borderColor = 'var(--border-color, #cbd5e1)';
    btn.style.background = 'var(--bg-card, #ffffff)';
    btn.style.color = 'var(--text-primary, #0f172a)';
    btn.classList.remove('active');
  });

  const activeBtnId = isCustom ? 'btn-sub-preset-custom' : `btn-sub-preset-${qtd}`;
  const activeBtn = document.getElementById(activeBtnId);
  if (activeBtn) {
    activeBtn.style.borderColor = '#ea580c';
    activeBtn.style.background = 'rgba(252,75,21,0.1)';
    activeBtn.style.color = '#ea580c';
    activeBtn.classList.add('active');
  }

  const customBox = document.getElementById('submodal-custom-qtd-box');
  if (customBox) customBox.style.display = isCustom ? 'block' : 'none';

  window.gerarSubmodalCamposFracoes(submodalPresetFracoesAtual);
};

window.gerarSubmodalCamposFracoes = (numPartes) => {
  const container = document.getElementById('submodal-container-lista-fracoes');
  if (!container || !submodalItemFracaoAtual) return;

  const n = Math.max(2, Math.min(20, numPartes || 2));
  submodalPresetFracoesAtual = n;

  const totalItem = submodalItemFracaoAtual.total;
  const valorBase = Math.floor((totalItem / n) * 100) / 100;
  const diferencaCentavos = Math.round((totalItem - (valorBase * n)) * 100) / 100;
  const qtdPorParte = parseFloat((submodalItemFracaoAtual.qty / n).toFixed(2));

  // Extrair comandas ativas
  const comandasAtivas = [];
  if (window.mesaAtual && Array.isArray(window.mesaAtual.items)) {
    window.mesaAtual.items.forEach(o => {
      const c = (o.mesa_comanda || '').trim();
      if (c && !comandasAtivas.includes(c)) comandasAtivas.push(c);
    });
  }

  let html = '';
  for (let i = 0; i < n; i++) {
    const fracaoStr = n === 2 ? '½' : (n === 3 ? '⅓' : (n === 4 ? '¼' : `${i + 1}/${n}`));
    // Ajusta o centavo de sobra na última fração para garantir precisão
    const valorEstaFracao = (i === n - 1) ? (valorBase + diferencaCentavos) : valorBase;
    const suggestedComanda = comandasAtivas[i] || '';

    html += `
      <div style="background: var(--bg-card, #ffffff); border: 1.5px solid var(--border-color, #e2e8f0); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 800; font-size: 13px; color: var(--text-primary, #0f172a); display: flex; align-items: center; gap: 6px;">
            <span style="background: #ea580c; color: white; border-radius: 6px; padding: 2px 7px; font-size: 11.5px; font-weight: 800;">${fracaoStr}</span>
            Fração ${i + 1} de ${n}
          </span>
          <strong style="color: #10b981; font-size: 14px;">R$ ${valorEstaFracao.toFixed(2).replace('.', ',')}</strong>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <select class="submodal-select-fracao-comanda" data-index="${i}" data-fracao="${fracaoStr}" data-valor="${valorEstaFracao}" data-qtd="${qtdPorParte}" onchange="window.onSubmodalFracaoComandaChange(this, ${i})" style="flex: 1; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border-color, #cbd5e1); font-size: 12.5px; font-weight: 600; background: var(--bg-secondary, #f8fafc); color: var(--text-primary, #0f172a);">
            <option value="" ${!suggestedComanda ? 'selected' : ''}>🪑 Manter Compartilhado na Mesa</option>
            ${comandasAtivas.map(c => `<option value="${c}" ${c === suggestedComanda ? 'selected' : ''}>👤 Comanda: ${c}</option>`).join('')}
            <option value="__NOVA__">➕ Criar Nova Comanda...</option>
          </select>
          <input type="text" class="submodal-input-nova-comanda" id="submodal-nova-comanda-${i}" placeholder="Nome do cliente/comanda" style="display: none; flex: 1; padding: 7px 10px; border-radius: 8px; border: 1.5px solid #ea580c; font-size: 12.5px; font-weight: 700; color: #ea580c; background: #fff7ed;">
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
};

window.onSubmodalFracaoComandaChange = (sel, idx) => {
  const inp = document.getElementById(`submodal-nova-comanda-${idx}`);
  if (!inp) return;
  if (sel.value === '__NOVA__') {
    inp.style.display = 'block';
    setTimeout(() => inp.focus(), 50);
  } else {
    inp.style.display = 'none';
  }
};

window.carregarGrupoSubmodalAlocar = (checkedCheckboxes) => {
  const containerLista = document.getElementById('submodal-alocar-lista-itens');
  const txtQtd = document.getElementById('submodal-alocar-qtd-txt');
  const txtTotal = document.getElementById('submodal-alocar-total-txt');

  if (!checkedCheckboxes || checkedCheckboxes.length === 0) {
    if (txtQtd) txtQtd.innerText = '0 itens selecionados';
    if (txtTotal) txtTotal.innerText = 'R$ 0,00';
    if (containerLista) containerLista.innerHTML = '<div style="color: var(--text-secondary); font-size: 12px; text-align: center; padding: 12px;">Selecione um ou mais itens na tabela de consumo.</div>';
    return;
  }

  let totalGrupo = 0;
  let htmlItens = '';

  checkedCheckboxes.forEach(chk => {
    const nome = chk.getAttribute('data-nome') || 'Produto';
    const emoji = chk.getAttribute('data-emoji') || '🍽️';
    const totalVal = parseFloat(chk.getAttribute('data-total') || 0);
    const qtd = chk.getAttribute('data-qtd') || 1;
    totalGrupo += totalVal;

    htmlItens += `
      <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-card, #fff); padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); font-size: 12.5px;">
        <span style="display: flex; align-items: center; gap: 6px; font-weight: 600;">
          <span>${emoji}</span>
          <span>${nome} (${qtd}x)</span>
        </span>
        <strong style="color: #2563eb; font-weight: 700;">R$ ${Math.max(0, totalVal).toFixed(2).replace('.', ',')}</strong>
      </div>
    `;
  });

  if (txtQtd) txtQtd.innerText = `${checkedCheckboxes.length} itens marcados`;
  if (txtTotal) txtTotal.innerText = `R$ ${Math.max(0, totalGrupo).toFixed(2).replace('.', ',')}`;
  if (containerLista) containerLista.innerHTML = htmlItens;
};

window.onSubmodalAlocarDestinoChange = (val) => {
  const inp = document.getElementById('submodal-alocar-nova-comanda-input');
  if (!inp) return;
  if (val === '__NOVA__') {
    inp.style.display = 'block';
    setTimeout(() => inp.focus(), 50);
  } else {
    inp.style.display = 'none';
  }
};

window.confirmarSubmodalFracionamentoCheckout = () => {
  if (!window.mesaAtual) return;
  const mesaNome = window.mesaAtual.nome || window.mesaAtual.mesaName;
  const operadorNome = window.crmPerfil ? window.crmPerfil.nome : 'Caixa';

  // 1. MODO FRACIONAR ITEM ÚNICO
  if (submodalModoAtivo === 'fracionar') {
    if (!submodalItemFracaoAtual) return alert('Selecione um item para fracionar.');

    const rows = document.querySelectorAll('#submodal-container-lista-fracoes .submodal-select-fracao-comanda');
    if (rows.length < 2) return alert('É necessário dividir em pelo menos 2 frações.');

    const fracoes = [];
    for (let i = 0; i < rows.length; i++) {
      const sel = rows[i];
      const fracaoStr = sel.getAttribute('data-fracao') || `${i + 1}/${rows.length}`;
      const valor = parseFloat(sel.getAttribute('data-valor') || 0);
      const qtd = parseFloat(sel.getAttribute('data-qtd') || 1);

      let comanda = sel.value;
      if (comanda === '__NOVA__') {
        const inp = document.getElementById(`submodal-nova-comanda-${i}`);
        comanda = (inp && inp.value) ? inp.value.trim() : `Comanda ${i + 1}`;
      }

      fracoes.push({
        fracaoStr,
        valor,
        qtd,
        comandaName: comanda || null
      });
    }

    if (typeof socket !== 'undefined' && socket) {
      socket.emit('dividir_item_fracoes', {
        itemId: submodalItemFracaoAtual.id,
        fracoes,
        operador: operadorNome,
        mesaName: mesaNome
      });
    }

    window.fecharSubmodalFracionamentoCheckout();
    if (typeof showToast === 'function') {
      showToast('✨ Item fracionado e comandas atualizadas!', '#10b981');
    }
  }
  // 2. MODO ALOCAR GRUPO DE ITENS SELECIONADOS
  else {
    const checked = Array.from(document.querySelectorAll('#checkout-modal-items-tbody .chk-checkout-item:checked'));
    if (checked.length === 0) return alert('Selecione ao menos 1 item para alocar.');

    const selDestino = document.getElementById('submodal-alocar-comanda-destino');
    let comandaAlvo = selDestino ? selDestino.value : '';
    if (comandaAlvo === '__NOVA__') {
      const inp = document.getElementById('submodal-alocar-nova-comanda-input');
      comandaAlvo = inp ? inp.value.trim() : '';
      if (!comandaAlvo) return alert('Por favor, informe o nome da nova comanda.');
    }

    const itemIds = checked.map(c => parseInt(c.getAttribute('data-id'))).filter(id => !isNaN(id));

    if (typeof socket !== 'undefined' && socket) {
      socket.emit('atribuir_comanda_itens_lote', {
        itemIds,
        comandaName: comandaAlvo || null,
        operador: operadorNome,
        mesaName: mesaNome
      });
    }

    window.fecharSubmodalFracionamentoCheckout();
    if (typeof showToast === 'function') {
      showToast(`📦 ${itemIds.length} itens alocados para "${comandaAlvo || 'Mesa Compartilhada'}"!`, '#2563eb');
    }
  }

  // Recalcular saldo da conta imediatamente
  setTimeout(() => {
    if (window.calcRestante) window.calcRestante();
  }, 120);
};

window.checkoutModalAddPagamento = () => {
  if (!window.mesaAtual) return alert('Selecione uma mesa primeiro.');
  const inputValor = document.getElementById('checkout-modal-valor');
  const selectMetodo = document.getElementById('checkout-modal-metodo');
  if (!inputValor || !selectMetodo) return;

  const parseCurrencyInput = (valStr) => {
    let clean = (valStr || '').trim().replace('R$', '').replace(/\s/g, '');
    if (clean.includes('.') && clean.includes(',')) {
      if (clean.indexOf('.') < clean.indexOf(',')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
      } else {
        clean = clean.replace(/,/g, '');
      }
    } else if (clean.includes(',')) {
      clean = clean.replace(',', '.');
    } else if (clean.includes('.')) {
      const parts = clean.split('.');
      if (parts[1].length !== 3 || parseInt(parts[0]) === 0) {
        // Treat dot as decimal separator
      } else {
        clean = clean.replace(/\./g, '');
      }
    }
    return parseFloat(clean);
  };

  if (window.isAddingPaymentProcessing) return;

  let valor = parseCurrencyInput(inputValor.value);
  if (window.checkoutModalTouchModeActive) {
    valor = (window.checkoutModalCents || 0) / 100;
  }

  if (isNaN(valor) || valor <= 0) {
    return alert('Digite ou selecione um valor de pagamento válido maior que zero.');
  }

  const metodo = selectMetodo.value;
  const mesaName = window.mesaAtual.nome || window.mesaAtual.mesaName;
  const taxaCheckbox = document.getElementById('taxa-servico');
  const modalTaxaCheckbox = document.getElementById('checkout-modal-taxa');

  // Recalcular saldo restante em tempo real para ter o valor mais recente
  if (typeof window.calcRestante === 'function') {
    window.calcRestante();
  }
  const falta = typeof window.mesaFaltaPagar === 'number' ? window.mesaFaltaPagar : 0;

  if (falta <= 0.01) {
    return alert('⛔ Esta mesa/comanda já está totalmente paga!\n\nPara alterar os valores recebidos, remova um pagamento existente na lista ao lado.');
  }

  // REGRA RIGOROSA DE CAIXA:
  // Pagamentos eletrônicos (Cartão de Crédito, Cartão de Débito, Pix, Fiado/Conta) NÃO PODEM ser lançados com valor maior que o saldo restante da conta!
  // Troco é permitido EXCLUSIVAMENTE para pagamento em DINHEIRO.
  if (metodo !== 'Dinheiro') {
    if (valor > falta + 0.05) {
      return alert(`⛔ OPERAÇÃO BLOQUEADA PELO SISTEMA:\n\nPagamentos em ${metodo} não podem exceder o saldo restante da conta (R$ ${falta.toFixed(2).replace('.', ',')})!\n\nO valor inserido foi R$ ${valor.toFixed(2).replace('.', ',')}.\n\nPara pagamentos eletrônicos com valor maior que a conta, cancele ou ajuste o valor no terminal/máquina do cartão, pois o troco só é permitido em DINHEIRO.`);
    }
  }

  let valorRegistrado = valor;
  if (metodo === 'Dinheiro' && valor > falta + 0.01) {
    valorRegistrado = falta;
    const troco = valor - falta;
    alert(`✅ Pagamento em Dinheiro registrado.\n\nDEVOLVER DE TROCO AO CLIENTE: R$ ${troco.toFixed(2).replace('.', ',')}`);
  }

  // Travar botões e flag global para prevenir envios duplicados por cliques rápidos
  window.isAddingPaymentProcessing = true;
  const btns = document.querySelectorAll('#checkout-modal-overlay button');
  btns.forEach(b => b.style.pointerEvents = 'none');

  // Abater valor otimisticamente na memória para impedir cliques subsequentes instantâneos
  window.mesaFaltaPagar = Math.max(0, falta - valorRegistrado);

  setTimeout(() => {
    window.isAddingPaymentProcessing = false;
    btns.forEach(b => b.style.pointerEvents = 'auto');
  }, 2000);

  const isTaxaChecked = modalTaxaCheckbox ? modalTaxaCheckbox.checked : (taxaCheckbox ? taxaCheckbox.checked : true);

  // Register partial payment - only via pagamento_parcial_valor to avoid duplicate in movimentacoes
  socket.emit('pagamento_parcial_valor', {
    mesaName: mesaName,
    valor: valorRegistrado,
    metodo: metodo,
    comTaxa: isTaxaChecked,
    desconto: window.descontoAdicional || 0,
    userName: window.loggedInUser || 'Caixa'
  });

  inputValor.value = '';
  window.checkoutModalCents = 0;
  if (typeof window.checkoutModalUpdateTouchVisor === 'function') {
    window.checkoutModalUpdateTouchVisor();
  }
  setTimeout(() => { if (window.checkoutModalAtualizarPix) window.checkoutModalAtualizarPix(); }, 600);
};

window.checkoutModalPagarMaquininha = () => {
  if (!window.mesaAtual) return alert('Selecione uma mesa primeiro.');

  let metodo = 'Cartão de Crédito';
  if (window.checkoutModalTouchModeActive) {
    const activeBtn = document.querySelector('.touch-method-btn.active');
    if (activeBtn) {
      metodo = activeBtn.dataset.method || 'Cartão de Crédito';
    }
  } else {
    const selectMetodo = document.getElementById('checkout-modal-metodo');
    if (selectMetodo) {
      metodo = selectMetodo.value;
    }
  }

  if (metodo !== 'Cartão de Crédito' && metodo !== 'Cartão de Débito') {
    return alert('A maquininha integrada aceita apenas pagamentos com Cartão (Crédito ou Débito). Selecione Cartão de Crédito ou Cartão de Débito.');
  }

  let valor = 0;
  if (window.checkoutModalTouchModeActive) {
    valor = (window.checkoutModalCents || 0) / 100;
  } else {
    const inputValor = document.getElementById('checkout-modal-valor');
    if (inputValor) {
      let clean = (inputValor.value || '').trim().replace('R$', '').replace(/\s/g, '');
      if (clean.includes('.') && clean.includes(',')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
      } else if (clean.includes(',')) {
        clean = clean.replace(',', '.');
      }
      valor = parseFloat(clean);
    }
  }

  if (isNaN(valor) || valor <= 0) {
    return alert('Insira um valor de pagamento válido.');
  }

  // Verificar se o valor não excede o saldo restante da mesa (regra estrita)
  if (typeof window.calcRestante === 'function') {
    window.calcRestante();
  }
  const falta = typeof window.mesaFaltaPagar === 'number' ? window.mesaFaltaPagar : 0;
  if (falta <= 0.01) {
    return alert('⛔ Esta mesa/comanda já está totalmente paga!');
  }
  if (valor > falta + 0.05) {
    return alert(`⛔ OPERAÇÃO BLOQUEADA:\n\nPagamentos em ${metodo} não podem exceder o saldo restante da conta (R$ ${falta.toFixed(2).replace('.', ',')})!`);
  }

  // Exibir overlay de processamento
  const overlay = document.getElementById('modal-mp-pagamento');
  const amountEl = document.getElementById('mp-payment-amount');
  const statusEl = document.getElementById('mp-payment-status');
  const titleEl = document.getElementById('mp-payment-title');
  const spinner = document.getElementById('mp-payment-spinner');
  const successIcon = document.getElementById('mp-payment-success-icon');

  if (overlay) {
    overlay.style.display = 'flex';
    if (amountEl) amountEl.innerText = `R$ ${valor.toFixed(2).replace('.', ',')}`;
    if (statusEl) statusEl.innerText = 'Enviando cobrança para a maquininha. Aguarde...';
    if (titleEl) titleEl.innerText = 'Iniciando Transação';
    if (spinner) spinner.style.display = 'flex';
    if (successIcon) successIcon.style.display = 'none';
  }

  socket.emit('mp_iniciar_pagamento', { valor, metodo });
  window.pendingMpPayment = { valor, metodo };
};

window.checkoutModalCalcularDivisao = () => {
  const inputParts = document.getElementById('checkout-modal-split-parts');
  if (!inputParts) return;
  const parts = parseInt(inputParts.value, 10);
  if (isNaN(parts) || parts < 2) {
    return alert('Por favor, informe uma quantidade válida de pessoas (mínimo 2).');
  }

  const falta = window.mesaFaltaPagar;
  if (falta <= 0) {
    return alert('Não há saldo restante para dividir.');
  }

  const share = falta / parts;
  const inputValor = document.getElementById('checkout-modal-valor');
  if (inputValor) {
    inputValor.value = "R$ " + share.toFixed(2).replace('.', ',');
  }

  window.checkoutModalCents = Math.round(share * 100);
  if (typeof window.checkoutModalUpdateTouchVisor === 'function') {
    window.checkoutModalUpdateTouchVisor();
  }

  const statusBox = document.getElementById('checkout-modal-split-status');
  const statusTxt = document.getElementById('checkout-modal-split-status-txt');
  if (statusBox) statusBox.style.display = 'flex';
  if (statusTxt) statusTxt.textContent = `Dividido em ${parts}x de R$ ${share.toFixed(2).replace('.', ',')}`;
};

// ── 🖨️ IMPRESSÃO SILENCIOSA ESC/POS (sem dialog) ──────────────────────────
window.imprimirCupomSilencioso = async function ({ mesa, items, total, subtotal, conteudo, impressora } = {}) {
  try {
    const token = localStorage.getItem('authToken') || window.authToken || '';
    const payload = { mesa, items, total, subtotal, conteudo, impressora };
    const resp = await fetch('/api/imprimir/cupom-raw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const r = await resp.json();
    if (r && r.ok === false) {
      console.warn('[Impressão Silenciosa] Erro:', r.erro || r);
    }
    return r;
  } catch (e) {
    console.warn('[Impressão Silenciosa] Falha na requisição:', e);
    return { ok: false, erro: String(e) };
  }
};

// ── 💰 QUICK CASH (Rush Mode) ──────────────────────────────────────────
// 'exato' = preenche exatamente o saldo restante (sem troco)
// número = preenche o valor da cédula; se for maior que o saldo, o troco
//          é calculado e exibido no campo "Restante"
window.checkoutModalSetQuickCash = function (val) {
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
    // Efeito visual de confirmação
    inputValor.style.borderColor = '#3ab55b';
    inputValor.style.background = '#f0fff4';
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

// ── ✂️ DIVISÃO EXPRESSA (um clique = N partes iguais) ────────────────
window.checkoutModalCalcularDivisaoExpressa = function (n) {
  const falta = window.mesaFaltaPagar;
  if (!falta || falta <= 0) return;

  const share = falta / n;

  const inputValor = document.getElementById('checkout-modal-valor');
  if (inputValor) {
    inputValor.value = 'R$ ' + share.toFixed(2).replace('.', ',');
    inputValor.style.borderColor = '#3b82f6';
    inputValor.style.background = '#eff6ff';
    setTimeout(() => {
      inputValor.style.borderColor = '';
      inputValor.style.background = '';
    }, 600);
  }

  window.checkoutModalCents = Math.round(share * 100);
  if (typeof window.checkoutModalUpdateTouchVisor === 'function') {
    window.checkoutModalUpdateTouchVisor();
  }

  // Atualiza o hidden input de partes (para manter compat com checkoutModalCalcularDivisao)
  const inputParts = document.getElementById('checkout-modal-split-parts');
  if (inputParts) inputParts.value = String(n);

  // Mostra o status de divisão
  const statusBox = document.getElementById('checkout-modal-split-status');
  const statusTxt = document.getElementById('checkout-modal-split-status-txt');
  if (statusBox) statusBox.style.display = 'flex';
  if (statusTxt) statusTxt.textContent = `Dividido em ${n}x de R$ ${share.toFixed(2).replace('.', ',')}`;

  // Destaca o chip ativo
  document.querySelectorAll('[onclick^="window.checkoutModalCalcularDivisaoExpressa"]').forEach(btn => {
    const match = btn.getAttribute('onclick').match(/\((\d+)\)/);
    const isActive = match && parseInt(match[1]) === n;
    btn.style.background = isActive ? '#1d4ed8' : 'white';
    btn.style.color = isActive ? 'white' : '#1d4ed8';
    btn.style.borderColor = isActive ? '#1d4ed8' : '#93c5fd';
  });

  if (typeof window.calcRestante === 'function') window.calcRestante();
};

window.checkoutModalCancelarDivisao = () => {
  const inputParts = document.getElementById('checkout-modal-split-parts');
  if (inputParts) inputParts.value = '2';

  const statusBox = document.getElementById('checkout-modal-split-status');
  if (statusBox) statusBox.style.display = 'none';

  // Reset chip styles
  document.querySelectorAll('[onclick^="window.checkoutModalCalcularDivisaoExpressa"]').forEach(btn => {
    btn.style.background = 'white';
    btn.style.color = '#1d4ed8';
    btn.style.borderColor = '#93c5fd';
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

window.customNfceConfig = null;



window.abrirModalCustomNfce = () => {
  const modal = document.getElementById('modal-custom-nfce');
  if (modal) modal.style.display = 'flex';

  if (!window.customNfceConfig) {
    const itemsSrc = window.mesaAtual && window.mesaAtual.items ? window.mesaAtual.items : (window.currentPanelItems || []);
    let itemsBase = [];
    if (itemsSrc.length > 0) {
      itemsBase = itemsSrc.map(it => ({
        nome: it.produto_nome || it.nome || 'Produto',
        quantidade: parseFloat(String(it.quantidade).replace(',', '.')) || 1,
        preco: parseFloat(String(it.preco).replace(',', '.')) || 0
      }));
    } else {
      itemsBase = [];
    }

    window.customNfceConfig = {
      agrupar: false,
      totalAgrupado: window.mesaFaltaPagar > 0 ? window.mesaFaltaPagar : (window.mesaTotalComTaxa || 0),
      items: itemsBase
    };
  }

  const chkAgrupar = document.getElementById('custom-nfce-agrupar');
  if (chkAgrupar) {
    chkAgrupar.checked = window.customNfceConfig.agrupar;
  }

  const inpTotal = document.getElementById('custom-nfce-total-agrupado');
  if (inpTotal) {
    inpTotal.value = Math.max(0, window.customNfceConfig.totalAgrupado).toFixed(2).replace('.', ',');
  }

  window.toggleAgruparNfce();
};

window.toggleAgruparNfce = () => {
  const chk = document.getElementById('custom-nfce-agrupar');
  const agruparContainer = document.getElementById('custom-nfce-agrupar-container');
  const tabelaContainer = document.getElementById('custom-nfce-tabela-container');

  const isAgrupado = chk ? chk.checked : false;
  if (window.customNfceConfig) window.customNfceConfig.agrupar = isAgrupado;

  if (isAgrupado) {
    if (agruparContainer) agruparContainer.style.display = 'block';
    if (tabelaContainer) tabelaContainer.style.display = 'none';
  } else {
    if (agruparContainer) agruparContainer.style.display = 'none';
    if (tabelaContainer) tabelaContainer.style.display = 'block';
    window.renderCustomNfceTable();
  }
};

window.renderCustomNfceTable = () => {
  const tbody = document.getElementById('custom-nfce-tbody');
  if (!tbody || !window.customNfceConfig) return;

  tbody.innerHTML = '';
  let totalCalc = 0;

  window.customNfceConfig.items.forEach((item, index) => {
    const totalItem = item.quantidade * item.preco;
    totalCalc += totalItem;

    tbody.innerHTML += `
      <tr>
        <td style="padding: 6px; border-bottom: 1px solid var(--border-color);">
          <input type="text" value="${item.nome}" onchange="window.editarItemCustomNfce(${index}, 'nome', this.value)" style="width: 100%; padding: 4px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px;">
        </td>
        <td style="padding: 6px; text-align: center; border-bottom: 1px solid var(--border-color);">
          <input type="number" step="0.01" value="${item.quantidade}" onchange="window.editarItemCustomNfce(${index}, 'quantidade', this.value)" style="width: 100%; padding: 4px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; text-align: center;">
        </td>
        <td style="padding: 6px; text-align: right; border-bottom: 1px solid var(--border-color);">
          <input type="number" step="0.01" value="${item.preco.toFixed(2)}" onchange="window.editarItemCustomNfce(${index}, 'preco', this.value)" style="width: 100%; padding: 4px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 11px; text-align: right;">
        </td>
        <td style="padding: 6px; text-align: right; border-bottom: 1px solid var(--border-color);">
          R$ ${Math.max(0, totalItem).toFixed(2).replace('.', ',')}
        </td>
        <td style="padding: 6px; text-align: center; border-bottom: 1px solid var(--border-color);">
          <button onclick="window.removerItemCustomNfce(${index})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 14px;"><i class="ph ph-trash"></i></button>
        </td>
      </tr>
    `;
  });

  const spanTotal = document.getElementById('custom-nfce-total-calculado');
  if (spanTotal) {
    spanTotal.innerText = 'R$ ' + Math.max(0, totalCalc).toFixed(2).replace('.', ',');
  }
};

window.editarItemCustomNfce = (index, campo, valor) => {
  if (!window.customNfceConfig || !window.customNfceConfig.items[index]) return;
  if (campo === 'nome') {
    window.customNfceConfig.items[index].nome = valor;
  } else if (campo === 'quantidade') {
    window.customNfceConfig.items[index].quantidade = parseFloat(valor) || 1;
  } else if (campo === 'preco') {
    window.customNfceConfig.items[index].preco = parseFloat(valor) || 0;
  }
  window.renderCustomNfceTable();
};

window.adicionarItemCustomNfce = () => {
  if (!window.customNfceConfig) return;
  window.customNfceConfig.items.push({
    nome: 'Novo Produto',
    quantidade: 1,
    preco: 0
  });
  window.renderCustomNfceTable();
};

window.removerItemCustomNfce = (index) => {
  if (!window.customNfceConfig) return;
  window.customNfceConfig.items.splice(index, 1);
  window.renderCustomNfceTable();
};

window.atualizarTotalAgrupadoNfce = () => {
  const inp = document.getElementById('custom-nfce-total-agrupado');
  if (!inp || !window.customNfceConfig) return;
  let val = parseFloat(inp.value.replace('R$', '').replace('.', '').replace(',', '.').trim());
  if (isNaN(val)) val = 0;
  window.customNfceConfig.totalAgrupado = val;
  inp.value = val.toFixed(2).replace('.', ',');
};

window.salvarCustomNfce = () => {
  if (!window.customNfceConfig) return;

  window.atualizarTotalAgrupadoNfce();

  if (window.customNfceConfig.agrupar) {
    window.customNfceConfig.finalItems = [{
      produto_nome: '1 Refeição',
      quantidade: 1,
      preco: window.customNfceConfig.totalAgrupado,
      total: window.customNfceConfig.totalAgrupado
    }];
    window.customNfceConfig.finalTotal = window.customNfceConfig.totalAgrupado;
  } else {
    window.customNfceConfig.finalItems = window.customNfceConfig.items.map(it => ({
      produto_nome: it.nome,
      quantidade: it.quantidade,
      preco: it.preco,
      total: it.quantidade * it.preco
    }));
    window.customNfceConfig.finalTotal = window.customNfceConfig.finalItems.reduce((acc, curr) => acc + curr.total, 0);
  }

  const chkNfce = document.getElementById('checkout-modal-emitir-nfce');
  if (chkNfce) chkNfce.checked = true; // Força emissão

  const btn = document.getElementById('btn-customizar-nfce');
  if (btn) {
    btn.innerHTML = `<i class="ph ph-check-circle"></i> Configuração Salva (R$ ${Math.max(0, window.customNfceConfig.finalTotal).toFixed(2).replace('.', ',')})`;
    btn.style.background = '#dcfce7';
    btn.style.color = '#166534';
    btn.style.border = '1px solid #86efac';
  }

  const modal = document.getElementById('modal-custom-nfce');
  if (modal) modal.style.display = 'none';
};

window.emitirCustomNfceAgora = (event) => {
  if (!window.customNfceConfig) return;

  window.atualizarTotalAgrupadoNfce();

  if (window.customNfceConfig.agrupar) {
    window.customNfceConfig.finalItems = [{
      produto_nome: '1 Refeição',
      quantidade: 1,
      preco: window.customNfceConfig.totalAgrupado,
      total: window.customNfceConfig.totalAgrupado
    }];
    window.customNfceConfig.finalTotal = window.customNfceConfig.totalAgrupado;
  } else {
    window.customNfceConfig.finalItems = window.customNfceConfig.items.map(it => ({
      produto_nome: it.nome,
      quantidade: it.quantidade,
      preco: it.preco,
      total: it.quantidade * it.preco
    }));
    window.customNfceConfig.finalTotal = window.customNfceConfig.finalItems.reduce((acc, curr) => acc + curr.total, 0);
  }

  const cpfCnpj = document.getElementById('checkout-modal-cpf-cnpj') ? document.getElementById('checkout-modal-cpf-cnpj').value : '';
  const btn = event.currentTarget;
  const oldText = btn.innerHTML;
  btn.innerHTML = '<i class="ph ph-spinner-gap"></i> Emitindo...';

  socket.emit('emitir_nfce', {
    pedidoId: null,
    mesaName: window.mesaAtual ? window.mesaAtual.nome || window.mesaAtual.mesaName : 'Avulsa',
    items: window.customNfceConfig.finalItems,
    totalValue: window.customNfceConfig.finalTotal,
    cpfCnpj: cpfCnpj,
    paymentMethods: 'Diversos'
  });

  setTimeout(() => {
    btn.innerHTML = oldText;
    const modal = document.getElementById('modal-custom-nfce');
    if (modal) modal.style.display = 'none';
    alert('A requisição de NFC-e Avulsa foi enviada à Sefaz!');
  }, 2000);
};

window.checkoutModalConfirmarFechamento = () => {
  if (!window.mesaAtual) return alert('Selecione uma mesa primeiro.');
  const falta = window.mesaFaltaPagar;
  const total = window.mesaTotalComTaxa;

  if (falta > 0.01) {
    return alert('Pagamento incompleto! A mesa não pode ser fechada sem o pagamento total.');
  }

  const chkNfce = document.getElementById('checkout-modal-emitir-nfce');
  const inputCpf = document.getElementById('checkout-modal-cpf-cnpj');
  const inputTelefone = document.getElementById('checkout-modal-telefone-cliente');
  const emitirNfce = chkNfce ? chkNfce.checked : true;
  const cpfCnpj = inputCpf ? inputCpf.value.trim() : '';
  const telefoneCliente = inputTelefone ? inputTelefone.value.replace(/\D/g, '') : '';

  const btnConfirm = document.getElementById('checkout-modal-submit-btn');
  if (btnConfirm) {
    btnConfirm.innerHTML = '<i class="ph ph-spinner-gap"></i> Processando...';
    btnConfirm.style.pointerEvents = 'none';
  }

  socket.emit('finalizar_mesa', {
    mesaName: window.mesaAtual.nome || window.mesaAtual.mesaName,
    payments: window.pagamentosParciais,
    totalValue: total,
    desconto: window.descontoAdicional || 0,
    emitirNfce: emitirNfce,
    cpfCnpj: cpfCnpj,
    customNfceConfig: window.customNfceConfig,
    telefoneCliente: telefoneCliente,
    cliente_id: window._checkoutClienteId || null
  });
};

