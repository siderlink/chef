// --- LONG PRESS + SWIPE + ARRASTE NO CARD DA MESA / ITEM ---
// Toque rápido = selecionar | Segurar curto (soltar ~0,5s) = menu de contexto
// Segurar 1s sem soltar = modo arraste (mesa→mesa ou item→mesa)
// ── BLOQUEIO GLOBAL DO MENU DE CONTEXTO NATIVO DO NAVEGADOR ──

// ─── STATUS DE PREPARO DOS ITENS (EM ESPERA / PENDENTE / EM PREPARO / PRONTO) ───
window.mudarStatusItemPedido = function(id, status) {
  try {
    if (typeof socket !== 'undefined' && socket) socket.emit('atualizar_status', { id: id, status: status });
    if (typeof showToast === 'function') showToast('Pedido #' + id + ' → ' + status, 'success');
    else if (typeof window.showToast === 'function') window.showToast('Pedido #' + id + ' → ' + status, 'success');
  } catch (err) { }
};

window.montarMenuItemPedido = function(itemRow) {
  const idAttr = itemRow.getAttribute('data-item-id');
  const id = idAttr ? parseInt(idAttr, 10) : null;
  if (!id) return null;
  const STATUSES = ['Pendente', 'Em espera', 'Em preparo', 'Pronto'];
  const statusAtual = itemRow.getAttribute('data-item-status') || 'Pendente';
  const actions = [];
  actions.push({ id: 'st-info', icon: 'ph-chef-hat', label: 'Status: ' + statusAtual, cls: 'info' });
  STATUSES.filter(s => s !== statusAtual).forEach(s => {
    const cls = s === 'Pronto' ? 'success' : s === 'Em preparo' ? 'primary' : '';
    const icon = s === 'Pronto' ? 'ph-check-circle' : s === 'Em preparo' ? 'ph-fire' : 'ph-clock';
    actions.push({ id: 'st-' + s, icon: icon, label: 'Marcar como ' + s, cls: cls, fn: () => window.mudarStatusItemPedido(id, s) });
  });
  actions.push({ id: 'sep-item-1', sep: true });
  actions.push({ id: 'comanda', icon: 'ph-user-switch', label: 'Mover Comanda', cls: 'primary', fn: () => { if (typeof window.alterarComandaItemDirect === 'function') window.alterarComandaItemDirect(id, ''); } });
  actions.push({ id: 'mover-item', icon: 'ph-arrows-out-cardinal', label: 'Mover para outra mesa…', cls: '', fn: () => { if (typeof window.armaModoArraste === 'function') window.armaModoArraste(); } });
  actions.push({ id: 'excluir-item', icon: 'ph-trash', label: 'Excluir Item', cls: 'danger', fn: () => { if (typeof window.removerItemPedido === 'function') window.removerItemPedido(id); } });
  return actions;
};

// ─── DELEGAÇÃO GLOBAL DE MENU DE CONTEXTO & LONG-PRESS PARA MESAS ───
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const itemRow = e.target.closest('.product-item-row');
  if (itemRow) {
    const actions = window.montarMenuItemPedido(itemRow);
    if (actions) showActionPopup(actions, e.clientX || 150, e.clientY || 150);
    return;
  }
  const card = e.target.closest('.mesa-item');
  if (card) {
    const nomeMesa = card.getAttribute('data-mesa') || card.getAttribute('data-nome') || (card.querySelector('.mesa-id') ? card.querySelector('.mesa-id').innerText.trim() : 'Mesa');
    const isOcupada = card.classList.contains('ocupada') || card.getAttribute('data-status') === 'Ocupada' || card.getAttribute('data-status') === 'ocupada';

    card.classList.add('selected');

    const actions = [
{ id: 'qr', icon: 'ph-qr-code', label: 'Exibir QR Code', cls: 'info', fn: () => { window.mostrarQrCodeMesa(nomeMesa); } },
      { id: 'splitqr', icon: 'ph-equalizer', label: 'QR Separar Conta', cls: 'info', fn: () => { window.mostrarQrSepararContaMesa(nomeMesa); } },
      { id: 'lancar', icon: 'ph-plus-circle', label: 'Lançar Itens', cls: 'primary', fn: () => { card.click(); setTimeout(() => { const b = document.getElementById('btn-adicionar-produtos'); if (b) b.click(); }, 150); } },
      { id: 'parcial', icon: 'ph-currency-dollar', label: 'Pagamento Parcial', cls: 'success', fn: () => { if (typeof window.abrirModalPagamentoParcialDesagrupado === 'function') { window.abrirModalPagamentoParcialDesagrupado(nomeMesa); } else { card.click(); } } },
      { id: 'fechar', icon: 'ph-check-circle', label: 'Fechar Conta', cls: '', fn: () => { card.click(); setTimeout(() => { const b = document.getElementById('btn-movimento-concluir'); if (b) b.click(); }, 150); } },
      { id: 'sep1', sep: true },
      { id: 'mover', icon: 'ph-arrows-out-cardinal', label: 'Mover / Transferir', cls: '', fn: () => { if (typeof window.armaModoArraste === 'function') window.armaModoArraste(); } },
      {
        id: 'cancelar', icon: 'ph-x-circle', label: 'Cancelar Mesa', cls: 'danger', fn: () => {
          if (typeof window.solicitarAutorizacaoAdmin === 'function') {
            window.solicitarAutorizacaoAdmin(
              'Cancelar Mesa',
              `Deseja cancelar todos os pedidos da mesa ${nomeMesa}? Esta ação irá marcar todos os pedidos como Cancelado e liberar a mesa.`,
              (senha, motivo) => {
                if (typeof socket !== 'undefined') socket.emit('cancelar_mesa', { mesaName: nomeMesa, motivo, senha });
              }
            );
          }
        }
      }
    ];

    showActionPopup(actions, e.clientX || 150, e.clientY || 150);
  }
});


(function initGestures() {
  let menuTimer = null;
  let dragTimer = null;
  let menuReady = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let didMove = false;
  let menuAbertoPeloToque = false;
  let cardAtivo = null;
  let itemRowAtivo = null;

  /* ── Estado do arraste por toque ── */
  const drag = { ativo: false, tipo: null, nome: null, itemId: null, origem: null, ghost: null, alvo: null };
  window._chefArrastarArmado = false;
  let armadoExpira = null;

  function getMesaItem(el) {
    return el.closest('.mesa-item');
  }

  function ehMesaReal(card) {
    return !!(card && card.getAttribute('data-status') && card.id && card.id.indexOf('mesa-card-') === 0);
  }

  function getMesaName(card) {
    if (!card) return null;
    return card.getAttribute('data-mesa') || card.getAttribute('data-nome');
  }

  function getMesaItemName(card) {
    const nome = getMesaName(card);
    if (!nome) return null;
    if (window.mesasData) {
      const found = window.mesasData.find(m => m.nome === nome || m.mesaName === nome);
      if (found) return found;
    }
    return { nome: nome };
  }

  function grupoStatus(st) {
    if (st === 'reservada') return 'reservada';
    if (st === 'ocupada' || st === 'fechamento' || st === 'solicitada') return 'ocupada';
    return 'livre';
  }

  function clickDepoisDoCard(card, btnId) {
    card.click();
    setTimeout(() => { const b = document.getElementById(btnId); if (b) b.click(); }, 250);
  }

  /* ══════════ ARRASTE POR TOQUE (1s de pressão) ══════════ */

  function criarGhost(origem, x, y) {
    let g;
    if (origem.tagName === 'TR') {
      g = document.createElement('div');
      const txt = (origem.cells && origem.cells[1] ? origem.cells[1].innerText : origem.innerText).trim().split('\n')[0];
      g.style.cssText = 'background:#1e293b;color:#f8fafc;padding:8px 14px;border-radius:999px;font-size:13px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.45);max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      g.textContent = txt;
    } else {
      g = origem.cloneNode(true);
      g.removeAttribute('id');
      const r = origem.getBoundingClientRect();
      g.style.cssText += `position:fixed;z-index:99999;width:${r.width}px;margin:0;pointer-events:none;opacity:.92;transform:scale(1.04);box-shadow:0 12px 32px rgba(0,0,0,.5);transition:none;`;
    }
    g.style.left = (x - 30) + 'px';
    g.style.top = (y - 30) + 'px';
    document.body.appendChild(g);
    return g;
  }

  function iniciarArraste(origem, tipo, nome, itemId, x, y) {
    if (drag.ativo) return;
    drag.ativo = true;
    drag.tipo = tipo;               // 'table' | 'item'
    drag.nome = nome || null;
    drag.itemId = itemId || null;
    drag.origem = origem;
    origem.classList.add('dragging-chef');
    if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
    drag.ghost = criarGhost(origem, x, y);
    document.body.style.userSelect = 'none';
  }

  function marcarAlvo(el, x, y) {
    const under = document.elementFromPoint(x, y);
    const alvo = under ? under.closest('.mesa-item[data-status]') : null;
    const valido = alvo && !(drag.tipo === 'table' && alvo === drag.origem) && alvo.id !== 'nova-comanda-card';
    if (drag.alvo && drag.alvo !== valido) drag.alvo.classList.remove('drag-over');
    drag.alvo = valido ? alvo : null;
    if (drag.alvo) drag.alvo.classList.add('drag-over');
  }

  async function finalizarArraste(x, y) {
    if (!drag.ativo) return;
    const { tipo, nome, itemId, origem } = drag;
    const alvoEl = drag.alvo;
    if (alvoEl) alvoEl.classList.remove('drag-over');
    if (drag.ghost) drag.ghost.remove();
    if (origem) origem.classList.remove('dragging-chef');
    document.body.style.userSelect = 'none';
    Object.assign(drag, { ativo: false, tipo: null, nome: null, itemId: null, origem: null, ghost: null, alvo: null });

    if (!alvoEl) return;
    const alvoNome = getMesaName(alvoEl);
    if (!alvoNome) return;
    const operador = window.crmPerfil ? window.crmPerfil.nome : 'Desconhecido';

    try {
      if (tipo === 'table') {
        if (alvoNome === nome) return;
        const isOccupied = window.ordersData && window.ordersData.some(o =>
          (o.mesa_grupo === alvoNome || o.localName === alvoNome) && o.status !== 'Finalizado' && o.status !== 'Cancelado' && o.status !== 'Pago'
        );
        if (isOccupied) {
          if (await chefConfirm('Mover para Comanda', `A ${alvoNome} já está ocupada. Deseja mover os pedidos da ${nome} para uma comanda na ${alvoNome} e liberar a ${nome}?`)) {
            socket.emit('transferir_mesa', { mesaAtual: nome, novaMesa: alvoNome, operador });
          }
        } else {
          if (await chefConfirm('Transferir mesa', 'Mover ' + nome + ' para ' + alvoNome + '?')) {
            socket.emit('transferir_mesa', { mesaAtual: nome, novaMesa: alvoNome, operador });
          }
        }
      } else if (tipo === 'item') {
        if (await chefConfirm('Transferir item', 'Mover este item para ' + alvoNome + '?')) {
          socket.emit('transferir_item', { itemId: itemId, novaMesa: alvoNome, operador: operador });
        }
      }
    } catch (e) { }
  }

  /* Menu de contexto → opção Mover arma o próximo toque como arraste */
  
  // ── MODAL PROFISSIONAL DE TRANSFERIR / MOVER MESA ──
  window.abrirModalTransferirMesa = function(mesaOrigem) {
    if (!mesaOrigem) {
      mesaOrigem = currentSelectedMesa || 'Mesa 1';
    }

    const mesasDisponiveis = (window.mesas || []).filter(m => (m.nome || m) !== mesaOrigem);

    let modal = document.getElementById('modal-transferir-mesa-pro');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-transferir-mesa-pro';
      modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); backdrop-filter:blur(6px); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px; animation:fadeIn 0.2s ease;';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:#ffffff; border-radius:20px; width:100%; max-width:440px; box-shadow:0 20px 50px rgba(0,0,0,0.3); overflow:hidden; color:#0f172a;">
        <div style="padding:18px 20px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#f8fafc;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:36px; height:36px; border-radius:10px; background:rgba(252,75,21,0.1); color:#fc4b15; display:flex; align-items:center; justify-content:center; font-size:18px;">
              <i class="ph-bold ph-arrows-out-cardinal"></i>
            </div>
            <div>
              <h3 style="margin:0; font-size:16px; font-weight:800;">Transferir Mesa</h3>
              <span style="font-size:12px; color:#64748b;">Mover pedidos de ${mesaOrigem}</span>
            </div>
          </div>
          <button type="button" onclick="document.getElementById('modal-transferir-mesa-pro').style.display='none'" style="background:none; border:none; width:32px; height:32px; border-radius:50%; color:#64748b; font-size:18px; cursor:pointer;">&times;</button>
        </div>

        <div style="padding:20px;">
          <label style="display:block; font-size:13px; font-weight:700; margin-bottom:8px;">Selecione a Mesa de Destino:</label>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(90px, 1fr)); gap:8px; max-height:240px; overflow-y:auto; padding:4px;">
            ${mesasDisponiveis.map(m => {
              const nome = typeof m === 'object' ? (m.nome || m.id) : m;
              const isOcup = typeof m === 'object' && ((m.status || '').toLowerCase() === 'ocupada');
              return `
                <button type="button" class="btn-destino-mesa" onclick="window.executarTransferenciaMesa('${mesaOrigem}', '${nome}')" style="padding:12px 8px; border:2px solid ${isOcup ? '#fecaca' : '#e2e8f0'}; background:${isOcup ? '#fff1f2' : '#ffffff'}; border-radius:12px; font-weight:800; font-size:13px; color:${isOcup ? '#b91c1c' : '#0f172a'}; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px; transition:all 0.15s;">
                  <i class="ph ${isOcup ? 'ph-users' : 'ph-chair'}" style="font-size:18px;"></i>
                  <span>${nome}</span>
                  <small style="font-size:10px; font-weight:600; opacity:0.8;">${isOcup ? 'Ocupada' : 'Livre'}</small>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div style="padding:14px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end;">
          <button type="button" onclick="document.getElementById('modal-transferir-mesa-pro').style.display='none'" style="padding:10px 18px; background:#e2e8f0; border:none; border-radius:10px; font-weight:700; font-size:13px; cursor:pointer;">Cancelar</button>
        </div>
      </div>
    `;

modal.style.display = 'flex';
};

window.mostrarQrSepararContaMesa = function(nomeMesa) {
  if (!nomeMesa) return;
  let modal = document.getElementById('modal-qr-separar-conta-caixa');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-qr-separar-conta-caixa';
    modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); z-index:999999; justify-content:center; align-items:center;';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:white; border-radius:24px; padding:24px 20px; max-width:360px; width:100%; text-align:center; box-shadow:0 20px 50px rgba(0,0,0,0.3); border:1px solid #e2e8f0; position:relative; margin:16px;">
      <button onclick="document.getElementById('modal-qr-separar-conta-caixa').style.display='none'" style="position:absolute; top:14px; right:14px; background:#f1f5f9; border:none; width:32px; height:32px; border-radius:50%; font-size:18px; color:#64748b; cursor:pointer;">&times;</button>
      <div style="display:flex; align-items:center; gap:8px; justify-content:center; margin-bottom:8px;">
        <i class="ph-bold ph-qr-code" style="color:#8b5cf6; font-size:24px;"></i>
        <h3 style="margin:0; font-size:18px; color:#0f172a;">Clientes separam a conta</h3>
      </div>
      <p style="font-size:12.5px; color:#64748b; margin:0 0 6px;">Mesa ${nomeMesa}</p>
      <p style="font-size:12.5px; color:#64748b; margin:0 0 12px;">Cada cliente lê o QR, escolhe os itens dele e faz o pagamento parcial.</p>
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:18px; padding:16px; margin:12px 0; display:flex; justify-content:center; align-items:center; min-height:230px;">
        <img id="split-qr-img-caixa" src="" alt="QR Separar Conta" style="width:220px; height:220px; border-radius:8px; display:block;">
      </div>
      <p id="split-qr-status-caixa" style="font-size:12.5px; color:#64748b; margin:6px 0 14px 0;">Gerando QR Code...</p>
      <div style="display:flex; gap:8px;">
        <button onclick="navigator.clipboard.writeText(window._splitUrlCaixa||'').then(()=>alert('Link copiado!'));" id="btn-split-copiar-caixa" style="flex:1; padding:11px; border-radius:12px; background:#f1f5f9; border:1px solid #cbd5e1; font-weight:700; font-size:13px; cursor:pointer;" disabled>Copiar Link</button>
        <button onclick="window.open(window._splitUrlCaixa||'', '_blank');" id="btn-split-abrir-caixa" style="flex:1; padding:11px; border-radius:12px; background:#fc4b15; border:none; color:white; font-weight:800; font-size:13px; cursor:pointer;" disabled>Abrir</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';

  window._splitUrlCaixa = null;
  if (!window._splitTokenCallback) {
    window._splitTokenCallback = (d) => {
      const mesaAtual = window._splitMesaAtual;
      if (!d || !d.success || !mesaAtual) return;
      const rid = encodeURIComponent(localStorage.getItem('restaurante_id') || '1');
      const url = `${location.protocol}//${location.host}/separar-conta.html?restaurante_id=${rid}&token=${encodeURIComponent(d.token)}`;
      window._splitUrlCaixa = url;
      const status = document.getElementById('split-qr-status-caixa');
      const qrImg = document.getElementById('split-qr-img-caixa');
      if (status) status.innerText = 'Pronto! Cada cliente pode escanear e separar os itens.';
      if (typeof window.qrImg === 'function') {
        window.qrImg(qrImg, url, 240);
      } else {
        qrImg.src = (window.location.origin || '') + '/api/qr?size=240&data=' + encodeURIComponent(url);
      }
      const b1 = document.getElementById('btn-split-copiar-caixa');
      const b2 = document.getElementById('btn-split-abrir-caixa');
      if (b1) b1.disabled = false;
      if (b2) b2.disabled = false;
    };
    if (socket) socket.on('split_token_criado', window._splitTokenCallback);
  }
  window._splitMesaAtual = nomeMesa;
  if (socket) socket.emit('criar_split_mesa', { mesa: nomeMesa });
};

  window.executarTransferenciaMesa = function(origem, destino) {
    const modal = document.getElementById('modal-transferir-mesa-pro');
    if (modal) modal.style.display = 'none';

    if (confirm(`Deseja realmente transferir todos os pedidos da ${origem} para a ${destino}?`)) {
      if (typeof socket !== 'undefined' && socket) {
        socket.emit('transferir_mesa', {
          mesaAtual: origem,
          novaMesa: destino,
          operador: (window.operadorAtual && window.operadorAtual.nome) || 'Caixa'
        });
        if (typeof showToast === 'function') {
          showToast(`Transferência da ${origem} para a ${destino} enviada com sucesso!`, 'success');
        }
      }
    }
  };

  window.armaModoArraste = function () {
    const selMesa = currentSelectedMesa || "Mesa 1";
    window.abrirModalTransferirMesa(selMesa);
    return;
    window._chefArrastarArmado = true;
    clearTimeout(armadoExpira);
    armadoExpira = setTimeout(() => { window._chefArrastarArmado = false; }, 8000);
    if (window.showToastIA) showToastIA('Agora toque e segure o que deseja mover — ou apenas toque na mesa de destino', '#fc4b15');
  };

  /* ══════════ MENU DE CONTEXTO POR STATUS ══════════ */

  function montarMenuMesa(card) {
    const st = grupoStatus((card.getAttribute('data-status') || '').toLowerCase());
    const actions = [];

    if (st === 'reservada') {
      actions.push({ id: 'editar-reserva', icon: 'ph-pencil-simple', label: 'Editar Reserva', cls: 'primary', fn: () => clickDepoisDoCard(card, 'btn-reservar-mesa') });
      actions.push({
        id: 'cancelar-reserva', icon: 'ph-x-circle', label: 'Cancelar Reserva', cls: 'danger', fn: async () => {
          const nomeM = getMesaName(card);
          if (await chefConfirm('Cancelar reserva', 'Liberar a ' + nomeM + '?')) {
            socket.emit('cancelar_reserva', { mesaName: nomeM });
          }
        }
      });
      actions.push({ id: 'lancar', icon: 'ph-plus-circle', label: 'Ocupar Agora', cls: '', fn: () => clickDepoisDoCard(card, 'btn-adicionar-produtos') });
    } else if (st === 'ocupada') {
      actions.push({ id: 'lancar', icon: 'ph-plus-circle', label: 'Lançar Itens', cls: 'primary', fn: () => clickDepoisDoCard(card, 'btn-adicionar-produtos') });
      actions.push({ id: 'parcial', icon: 'ph-currency-dollar', label: 'Pagamento Parcial', cls: 'success', fn: () => clickDepoisDoCard(card, 'btn-movimento-parcial') });
      actions.push({ id: 'fechar', icon: 'ph-check-circle', label: 'Fechar Conta', cls: '', fn: () => clickDepoisDoCard(card, 'btn-movimento-concluir') });
      actions.push({ id: 'sep-a', sep: true });
      actions.push({ id: 'avisar-cliente', icon: 'ph-megaphone', label: 'Avisar Cliente', cls: '', fn: () => window.avisarClienteDaMesa(item.localName || item.name) });
      actions.push({ id: 'qr', icon: 'ph-qr-code', label: 'QR Code Mesa', cls: '', fn: () => clickDepoisDoCard(card, 'btn-qr-mesa') });
      actions.push({ id: 'cancelar', icon: 'ph-x-circle', label: 'Cancelar Mesa', cls: 'danger', fn: () => clickDepoisDoCard(card, 'btn-cancelar-mesa-direct') });
    } else {
      actions.push({ id: 'lancar', icon: 'ph-plus-circle', label: 'Ocupar Mesa', cls: 'primary', fn: () => clickDepoisDoCard(card, 'btn-adicionar-produtos') });
      actions.push({ id: 'reservar', icon: 'ph-bookmark-simple', label: 'Reservar Mesa', cls: 'purple', fn: () => clickDepoisDoCard(card, 'btn-reservar-mesa') });
      actions.push({ id: 'qr', icon: 'ph-qr-code', label: 'QR Code', cls: '', fn: () => clickDepoisDoCard(card, 'btn-qr-mesa') });
    }

    actions.push({ id: 'sep-b', sep: true });
    actions.push({ id: 'mover', icon: 'ph-arrows-out-cardinal', label: 'Mover / Transferir…', cls: '', fn: () => { window.armaModoArraste(); } });
    return actions;
  }

  function mostrarMenuMesaOuItem(card, itemRow, x, y) {
    let actions;
    const rect = (card || itemRow).getBoundingClientRect();
    if (card) {
      actions = montarMenuMesa(card);
    } else {
      const itemActions = window.montarMenuItemPedido ? window.montarMenuItemPedido(itemRow) : null;
      if (!itemActions) return;
      actions = itemActions;
    }
    showActionPopup(actions, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function limparTimers() {
    clearTimeout(menuTimer); clearTimeout(dragTimer);
    menuTimer = null; dragTimer = null;
  }

  /* ══════════ LISTENERS GLOBAIS COM TRANSIÇÃO MENU -> ARRASTE ══════════ */

  function fecharPopupAcoesImediato() {
    const popup = document.getElementById('mobile-action-popup');
    if (popup) popup.classList.remove('show');
  }

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    if (e.target.closest('button, a, input, select, .btn-action, .btn-pronto, .btn-chamar, .btn-reverter, .mobile-float-btn, .action-popup-btn')) return;
    
    let card = getMesaItem(e.target);
    const itemRow = e.target.closest('.product-item-row');
    if (card && !ehMesaReal(card)) card = null;
    if (!card && !itemRow) return;

    cardAtivo = card;
    itemRowAtivo = itemRow;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    didMove = false;
    menuAbertoPeloToque = false;

    /* Modo armado pelo menu ("Mover / Transferir"): arrasta no toque direto */
    if (window._chefArrastarArmado) {
      window._chefArrastarArmado = false;
      clearTimeout(armadoExpira);
      const x = touchStartX, y = touchStartY;
      if (card) iniciarArraste(card, 'table', getMesaName(card), null, x, y);
      else if (itemRow) iniciarArraste(itemRow, 'item', null, parseInt(itemRow.getAttribute('data-item-id')), x, y);
      return;
    }

    // Long press rápido (360ms) para exibir menu de contexto do sistema
    clearTimeout(menuTimer);
    menuTimer = setTimeout(() => {
      if (didMove || drag.ativo) return;
      if (navigator.vibrate) try { navigator.vibrate(20); } catch(err){}
      menuAbertoPeloToque = true;
      mostrarMenuMesaOuItem(cardAtivo, itemRowAtivo, touchStartX, touchStartY);
    }, 360);
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    const dx = Math.abs(x - touchStartX);
    const dy = Math.abs(y - touchStartY);

    if (drag.ativo) {
      if (e.cancelable) e.preventDefault();
      if (drag.ghost) {
        drag.ghost.style.left = (x - 30) + 'px';
        drag.ghost.style.top = (y - 30) + 'px';
      }
      marcarAlvo(null, x, y);
      return;
    }

    // Se o dedo moveu mais que 8px enquanto mantinha pressionado
    if (dx > 8 || dy > 8) {
      didMove = true;
      clearTimeout(menuTimer);

      // Se o menu estava aberto ou estava segurando, faz o menu sumir e assume a função de arrastar!
      if (cardAtivo || itemRowAtivo) {
        fecharPopupAcoesImediato();
        if (!drag.ativo && (Date.now() - touchStartTime > 250)) {
          if (e.cancelable) e.preventDefault();
          if (cardAtivo) iniciarArraste(cardAtivo, 'table', getMesaName(cardAtivo), null, x, y);
          else if (itemRowAtivo) iniciarArraste(itemRowAtivo, 'item', null, parseInt(itemRowAtivo.getAttribute('data-item-id')), x, y);
        }
      }
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    clearTimeout(menuTimer);
    if (drag.ativo) {
      const t = e.changedTouches[0];
      finalizarArraste(t.clientX, t.clientY);
      didMove = false;
      cardAtivo = null;
      itemRowAtivo = null;
      return;
    }

    const segurouParaMenu = menuReady;
    limparTimers();

    if (segurouParaMenu) {
      const card0 = getMesaItem(e.target);
      const card = ehMesaReal(card0) ? card0 : null;
      const itemRow = e.target.closest('.product-item-row');
      if (card || itemRow) {
        const rect = (card || itemRow).getBoundingClientRect();
        mostrarMenuMesaOuItem(card, itemRow, rect.left + rect.width / 2, rect.top + rect.height / 2);
        didMove = false;
        return;
      }
    }

    if (didMove) return;
    const elapsed = Date.now() - touchStartTime;
    if (elapsed > 400) return;

    const mesaCard0 = getMesaItem(e.target);
    const mesaCard = ehMesaReal(mesaCard0) ? mesaCard0 : null;
    if (mesaCard) {
      const touchEndX = e.changedTouches[0].clientX;
      const dx = touchEndX - touchStartX;

      if (Math.abs(dx) > 60) {
        if (navigator.vibrate) navigator.vibrate(20);
        if (dx > 0) {
          mesaCard.click();
          setTimeout(() => { const b = document.getElementById('btn-adicionar-produtos'); if (b) b.click(); }, 200);
        } else {
          mesaCard.click();
          setTimeout(() => { const b = document.getElementById('btn-movimento-concluir'); if (b) b.click(); }, 200);
        }
      }
      return;
    }

    const itemRow = e.target.closest('.product-item-row');
    if (itemRow && !didMove && elapsed < 400) {
      const touchEndX = e.changedTouches[0].clientX;
      const dx = touchEndX - touchStartX;
      if (Math.abs(dx) > 60) {
        if (navigator.vibrate) navigator.vibrate(20);
        const orderId = itemRow.getAttribute('data-item-id');
        if (orderId) {
          if (dx > 0) {
            window.alterarComandaItemDirect && window.alterarComandaItemDirect(parseInt(orderId), '');
          } else {
            window.removerItemPedido && window.removerItemPedido(parseInt(orderId));
          }
        }
      }
    }
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    limparTimers();
    menuReady = false;
    if (drag.ativo) finalizarArraste(-100, -100);
  }, { passive: true });
})();

const HOST = window.location.hostname || 'localhost';
const socket = io({ query: { token: localStorage.getItem('chef_token'), restaurante_id: localStorage.getItem('restaurante_id') || '1' } });
window.socket = socket;
socket.on('connect', () => {
  socket.emit('get_mesas');
  socket.emit('get_estado_caixa');
});
if (socket.connected) {
  socket.emit('get_mesas');
  socket.emit('get_estado_caixa');
}
if (typeof initChefTz === 'function') initChefTz(socket);

// Inicializar plugins client-side
if (window.ChefPluginLoader) window.ChefPluginLoader.init(socket, { currentPage: 'caixa' });

// Modo Totem remoto (quiosque): registra aqui, pois o socket já existe neste ponto.
socket.on('modo_dispositivo', (data) => window.aplicarModoTotem(data && data.modo));
socket.emit('get_modo_dispositivo', { serial: window.obterSerialDispositivo() });

socket.on('tenant_atualizado', (data) => {
  if (data && data.restaurante_id) {
    localStorage.setItem('restaurante_id', data.restaurante_id);
  }
  if (data && data.token) {
    localStorage.setItem('chef_token', data.token);
  }
  // Reconecta o socket com as novas credenciais do tenant
  socket.disconnect();
  socket.io.opts.query = { token: data.token, restaurante_id: String(data.restaurante_id) };
  socket.connect();
});

let serverIp = HOST;
let restCustomDomain = '';
let qrConfig = { qr_protocol: '', qr_port: '' };
fetch('/api/config', { headers: authHeaders() }).then(r => r.json()).then(c => { qrConfig = c || {}; }).catch(() => {});

function buildAppUrl(page, mesaNome) {
  const proto = (qrConfig.qr_protocol === 'https' || qrConfig.qr_protocol === 'http')
    ? qrConfig.qr_protocol
    : (window.location.protocol === 'https:' ? 'https' : 'http');
  /* Preferir custom_domain sobre IP do servidor */
  const host = (restCustomDomain && restCustomDomain.trim()) || serverIp || window.location.hostname;
  const isDomain = host.indexOf('.') !== -1 && !host.match(/^\d+\.\d+\.\d+\.\d+$/);
  const port = isDomain ? '' : (String(qrConfig.qr_port || '').trim() || window.location.port);
  const q = mesaNome ? `?mesa=${encodeURIComponent(mesaNome)}` : '';
  const tenantId = encodeURIComponent(localStorage.getItem('restaurante_id') || '1');
  const url = `${proto}://${host}${port ? ':' + port : ''}/${page}${q}`;
  return url + (url.indexOf('?') !== -1 ? '&' : '?') + 'restaurante_id=' + tenantId;
}

function updateQrCode() {
  const qrImg = document.getElementById('qr-code-img');
  if (qrImg) {
    const appUrl = buildAppUrl('cadastro.html');
    if (typeof window.qrImg === 'function') {
      window.qrImg(qrImg, appUrl, 150);
    } else {
      qrImg.src = (window.location.origin || '') + '/api/qr?size=150&data=' + encodeURIComponent(appUrl);
    }
  }
}

socket.on('server_ip', (ip) => {
  if (ip && ip !== 'localhost') {
    /* Se o cliente está via túnel, não sobrescreve o hostname — mantém a URL do túnel */
    const _hostname = window.location.hostname;
    const _isTunnel = /\.(trycloudflare\.com|ngrok-free\.app|ngrok\.app|loca\.lt|lhr\.life)$/.test(_hostname);
    if (!_isTunnel) {
      serverIp = ip;
      /* Se o servidor enviou um domínio (não-IP), armazenar como restCustomDomain */
      const _isIp = /^\d+\.\d+\.\d+\.\d+$/.test(ip);
      if (!_isIp && ip.indexOf('.') !== -1) restCustomDomain = ip;
    }
    updateQrCode();
    const qrFilaModal = document.getElementById('modal-qr-fila-espera');
    if (qrFilaModal && qrFilaModal.style.display !== 'none') window.abrirQrFilaEsperaModal();
  }
});

// Nome do restaurante (via licença)
socket.on('restaurant_name', (nome) => {
  const el = document.getElementById('restaurant-name');
  if (el && nome && nome !== 'Chef Cozinha' && nome !== 'Dev Mode') {
    el.textContent = '🍳 ' + nome;
    document.title = nome + ' — Chef Cozinha';
  }
});

// Status da licença e updates
socket.on('license_status', (state) => {
  if (state && state.pendingUpdate) {
    const banner = document.getElementById('update-banner');
    const textEl = document.getElementById('update-banner-text');
    const linkEl = document.getElementById('btn-update-download');

    if (banner && textEl && linkEl) {
      const up = state.pendingUpdate;
      textEl.textContent = `🚀 Versão ${up.version} disponível! ${up.message ? `— ${up.message}` : ''}`;
      linkEl.href = up.url || '#';
      banner.style.display = 'flex';
    }
  }
});

socket.on('erro_pagamento', (msg) => {
  alert('⛔ ' + (msg || 'Erro ao processar o pagamento.'));
});

document.addEventListener('DOMContentLoaded', updateQrCode);

/* ─── INICIALIZAÇÃO IMEDIATA DO QR PONTO (boot fallback) ───────────
   Popula #qr-ponto-img com a URL pública de /painel-funcionario.html
   assim que o DOM carrega, sem esperar pelo evento update_ponto_token.
   Quando o socket emitir o token real, a imagem será sobrescrita. */
document.addEventListener('DOMContentLoaded', function () {
  const img = document.getElementById('qr-ponto-img');
  const zoomedImg = document.getElementById('qr-ponto-img-zoomed');
  if (!img || img.src) return; // já tem src → socket chegou antes
  try {
    const origin = window.location.origin || '';
    const rid = encodeURIComponent(localStorage.getItem('restaurante_id') || '1');
    const fallbackUrl = `${origin}/painel-funcionario.html?restaurante_id=${rid}`;
    const qrSrc = `${origin}/api/qr?size=300&data=${encodeURIComponent(fallbackUrl)}`;
    if (typeof window.qrImg === 'function') {
      window.qrImg(img, fallbackUrl, 300);
      if (zoomedImg) window.qrImg(zoomedImg, fallbackUrl, 300);
    } else {
      img.src = qrSrc;
      if (zoomedImg) zoomedImg.src = qrSrc;
    }
  } catch (e) { /* silêncio */ }
});

/* ─── TEMA DA TELA DO CAIXA (Pro UX / Clássico / Modular v1.1) ──
   Se o restaurante escolheu o painel v1.1 nas configurações,
   a tela clássica redireciona automaticamente para /caixa-v11.html.
   Os demais temas respeitam o valor exato escolhido (pro_ux ou classico). */
(function () {
  try {
    const ehTelaCaixa = window.location.pathname === '/' || /\/index\.html$/i.test(window.location.pathname);
    if (!ehTelaCaixa) return;
    fetch('/api/config', { headers: authHeaders() })
      .then(r => r.json())
      .then(c => {
        const tema = c && c.caixa_tema;
        let valorLocal = 'pro_ux'; // padrão: Caixa Moderno UX Pro
        if (tema === 'v11') {
          valorLocal = 'v11';
          try { localStorage.setItem('chef_caixa_tema', 'v11'); } catch (e) { }
          window.location.replace('/caixa-v11.html');
          return;
        }
        if (tema === 'classico') valorLocal = 'classico';
        else if (tema === 'pro_ux') valorLocal = 'pro_ux';
        try { localStorage.setItem('chef_caixa_tema', valorLocal); } catch (e) { }
      })
      .catch(() => {
        try {
          const lo = localStorage.getItem('chef_caixa_tema');
          if (lo !== 'v11' && lo !== 'classico') localStorage.setItem('chef_caixa_tema', 'pro_ux');
        } catch (e) { }
      });
  } catch (e) { }
})();

let ordersData = [];
window.ordersData = ordersData;

window.onDropMesa = async (e, targetMesa) => {
  if (e) {
    e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }

  let type = '';
  let draggedMesa = '';
  let itemId = '';

  if (e && e.dataTransfer) {
    try { type = e.dataTransfer.getData('type'); } catch(err) {}
    try { draggedMesa = e.dataTransfer.getData('mesa'); } catch(err) {}
    if (!draggedMesa) {
      try { draggedMesa = e.dataTransfer.getData('Text'); } catch(err) {}
    }
    if (!draggedMesa) {
      try { draggedMesa = e.dataTransfer.getData('text/plain'); } catch(err) {}
    }
    try { itemId = e.dataTransfer.getData('itemId'); } catch(err) {}
  }

  if (!targetMesa && e && e.target) {
    const card = e.target.closest('.mesa-item');
    if (card) targetMesa = card.getAttribute('data-mesa') || card.getAttribute('data-nome');
  }

  if (type === 'table' || (!type && draggedMesa)) {
    if (!draggedMesa || !targetMesa || draggedMesa === targetMesa) return;

    const isOccupied = window.ordersData && window.ordersData.some(o =>
      (o.mesa_grupo === targetMesa || o.localName === targetMesa) && o.status !== 'Finalizado' && o.status !== 'Cancelado' && o.status !== 'Pago'
    );

    const isSrcOccupied = window.ordersData && window.ordersData.some(o =>
      (o.mesa_grupo === draggedMesa || o.localName === draggedMesa) && o.status !== 'Finalizado' && o.status !== 'Cancelado' && o.status !== 'Pago'
    );

    const operador = (window.crmPerfil && window.crmPerfil.nome) || localStorage.getItem('chef_operador_nome') || 'Caixa';

    // Mesa de origem está livre (vazia): não é possível "mover" nada.
    // Nesse caso, se o alvo também estiver livre, perguntar se quer JUNTAR as mesas.
    if (!isSrcOccupied && !isOccupied) {
      if (await chefConfirm('Juntar mesas', `Juntar a ${draggedMesa} com a ${targetMesa} em uma única mesa?`)) {
        if (typeof socket !== 'undefined' && socket) socket.emit('juntar_mesas', { mesaA: draggedMesa, mesaB: targetMesa, operador });
      }
      return;
    }

    if (isOccupied) {
      if (await chefConfirm(
        'Mover para Comanda',
        `A ${targetMesa} já está ocupada. Deseja mover os pedidos da ${draggedMesa} para uma comanda na ${targetMesa} e liberar a ${draggedMesa}?`
      )) {
        if (typeof socket !== 'undefined' && socket) socket.emit('transferir_mesa', { mesaAtual: draggedMesa, novaMesa: targetMesa, operador });
      }
    } else {
      if (await chefConfirm('Transferir mesa', 'Mover ' + draggedMesa + ' para ' + targetMesa + '?')) {
        if (typeof socket !== 'undefined' && socket) socket.emit('transferir_mesa', { mesaAtual: draggedMesa, novaMesa: targetMesa, operador });
      }
    }
  } else if (type === 'item') {
    const itemId = (e && e.dataTransfer ? e.dataTransfer.getData('itemId') : '') || (e && e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
    if (itemId && targetMesa) {
      const operador = (window.crmPerfil && window.crmPerfil.nome) || localStorage.getItem('chef_operador_nome') || 'Caixa';
      if (await chefConfirm('Transferir item', 'Mover este item para ' + targetMesa + '?')) {
        if (typeof socket !== 'undefined' && socket) socket.emit('transferir_item', { itemId: itemId, novaMesa: targetMesa, operador });
      }
    }
  }
};

window.getPrecoAtivo = (productName, originalPrice) => {
  const promocoesList = window.PROMOCOES || [];
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

  for (const p of promocoesList) {
    if (!p.ativo) continue;
    let cfg = {};
    try { cfg = JSON.parse(p.config || '{}'); } catch (e) { }

    if (cfg.tipo_promocao === 'preco_fixo' && cfg.produto_alvo_nome === productName) {
      if (cfg.dias_semana && cfg.dias_semana.length > 0 && !cfg.dias_semana.includes(dayOfWeek)) continue;
      if (cfg.horario_inicio && currentTime < cfg.horario_inicio) continue;
      if (cfg.horario_fim && currentTime > cfg.horario_fim) continue;
      return parseFloat(cfg.novo_preco);
    }
  }
  return originalPrice;
};

window.getDescontoAtivo = (subtotal) => {
  const promocoesList = window.PROMOCOES || [];
  const now = new Date();
  const dayOfWeek = now.getDay();
  const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  let bestDesconto = 0;
  let bestTipo = null;

  for (const p of promocoesList) {
    if (!p.ativo) continue;
    let cfg = {};
    try { cfg = JSON.parse(p.config || '{}'); } catch (e) { }

    if (cfg.dias_semana && cfg.dias_semana.length > 0 && !cfg.dias_semana.includes(dayOfWeek)) continue;
    if (cfg.horario_inicio && currentTime < cfg.horario_inicio) continue;
    if (cfg.horario_fim && currentTime > cfg.horario_fim) continue;

    if (cfg.tipo_promocao === 'desconto_fixo' && (cfg.desconto || 0) > bestDesconto) {
      bestDesconto = cfg.desconto;
      bestTipo = 'fixo';
    } else if (cfg.tipo_promocao === 'desconto_pct' && (cfg.desconto_pct || 0) > 0) {
      const valorDesconto = subtotal * (cfg.desconto_pct / 100);
      if (valorDesconto > bestDesconto) {
        bestDesconto = valorDesconto;
        bestTipo = 'pct';
      }
    }
  }
  return { valor: bestDesconto, tipo: bestTipo };
};

const contasSolicitadas = new Set();
socket.on('sync_mesas_fechando', (list) => {
  contasSolicitadas.clear();
  list.forEach(m => contasSolicitadas.add(m));
  if (typeof renderOrders === 'function') renderOrders();
});
socket.on('toque_pedir_conta', (mesaName) => {
  contasSolicitadas.add(mesaName);
  if (typeof renderOrders === 'function') renderOrders();
});

function renderOrders() {
  const grid = document.getElementById('orders-grid');
  if (!grid) return;
  grid.innerHTML = '';

  let totalRevenue = 0;
  let totalCost = 0;

  const groupedOrders = {};

  ordersData.forEach(order => {
    // LOG DE SEGURANÇA para entender porque os itens estão sumindo
    if (!order.total) console.log("🔍 Pedido recebido sem valor (ignorado):", order);
    
    const val = order.total ? parseFloat(String(order.total).replace(',', '.')) : 0;
    totalRevenue += val;
    totalCost += val * 0.3;

    const mesaName = order.mesa_grupo || order.localName || `Pedido Avulso #${order.id}`;
    if (!groupedOrders[mesaName]) {
      groupedOrders[mesaName] = {
        mesaName,
        items: [],
        total: 0,
        pagamentosParciais: [],
        status: order.status,
        createdAt: order.createdAt,
        time: order.time,
        id: order.id,
        userName: order.userName || 'Avulso'
      };
    }
    if (order.productName && (order.productName.includes('Pagamento') || order.productName.includes('Pgto Parcial'))) {
      let metodo = 'Dinheiro';
      if (order.productName.includes('(')) {
        metodo = order.productName.split('(')[1].replace(')', '');
      }
      const isComanda = order.productName.includes('Comanda');
      groupedOrders[mesaName].pagamentosParciais.push({ valor: Math.abs(val), metodo, id: order.id, comanda: isComanda });
    } else {
      groupedOrders[mesaName].items.push(order);
      groupedOrders[mesaName].totalBruto = (groupedOrders[mesaName].totalBruto || 0) + val;
      if (order.status !== 'Pago') {
        groupedOrders[mesaName].total += val;
      }
    }
  });

  Object.keys(groupedOrders).forEach(key => {
    const group = groupedOrders[key];
    const nonPaymentItems = group.items.filter(i => i.status !== 'Pago');
    if (nonPaymentItems.length > 0) {
      const allReady = nonPaymentItems.every(i => i.status === 'Pronto' || i.status === 'Concluido');
      group.status = allReady ? 'Pronto' : nonPaymentItems[0].status;
    }
  });

  const contasPedidas = [];
  const mesasDisponiveis = [];
  const mesasOcupadas = [];
  const mesasEmFechamento = [];
  const mesasReservadas = [];

  // Deduplicar mesas da lista mestra
  const uniqueAllMesas = [];
  const seenAllMesas = new Set();
  if (window.allMesas && Array.isArray(window.allMesas)) {
    window.allMesas.forEach(m => {
      const nm = String(m.nome || m.mesaName || '').trim();
      if (nm && !seenAllMesas.has(nm.toLowerCase())) {
        seenAllMesas.add(nm.toLowerCase());
        uniqueAllMesas.push(m);
      }
    });
  }

  // Rastrear todas as mesas/grupos já alocadas para evitar qualquer duplicata
  const mesasAlocadas = new Set();

  function alocarMesa(item, categoria) {
    if (!item) return;
    const nome = String(item.mesaName || item.nome || '').trim();
    if (!nome) return;

    // Verificar se a mesa ou qualquer uma das mesas do grupo já foi alocada
    const partes = nome.split(/\s*\+\s*/).map(p => p.trim().toLowerCase());
    const jaAlocada = partes.some(p => mesasAlocadas.has(p));
    if (jaAlocada) return;

    // Registrar todas as partes como alocadas
    partes.forEach(p => mesasAlocadas.add(p));
    mesasAlocadas.add(nome.toLowerCase());

    if (categoria === 'pedida') contasPedidas.push(item);
    else if (categoria === 'fechamento') mesasEmFechamento.push(item);
    else if (categoria === 'ocupada') mesasOcupadas.push(item);
    else if (categoria === 'reservada') mesasReservadas.push(item);
    else if (categoria === 'disponivel') mesasDisponiveis.push(item);
  }

  // 1. Processar primeiro pedidos agrupados (mesas ocupadas / com consumo real)
  Object.keys(groupedOrders).forEach(groupKey => {
    const group = groupedOrders[groupKey];
    const nome = String(group.mesaName || groupKey).trim();
    if (!nome || nome.includes('Delivery')) return;

    if (contasSolicitadas.has(nome) || groupKey.split(/\s*\+\s*/).some(p => contasSolicitadas.has(p.trim()))) {
      alocarMesa({ ...group, isGroup: true }, 'pedida');
    } else if (group.status === 'Concluído' || group.status === 'Pronto') {
      alocarMesa({ ...group, isGroup: true }, 'fechamento');
    } else {
      alocarMesa({ ...group, isGroup: true }, 'ocupada');
    }
  });

  // 2. Processar mesas cadastradas no sistema que ainda não foram alocadas
  uniqueAllMesas.forEach(mesa => {
    const nome = String(mesa.nome || '').trim();
    if (!nome || nome.includes('Delivery')) return;
    if (mesasAlocadas.has(nome.toLowerCase())) return;

    if (mesa.status === 'Reservada') {
      alocarMesa({ ...mesa, isGroup: false }, 'reservada');
    } else if (mesa.status === 'Ocupada') {
      alocarMesa({
        mesaName: mesa.nome,
        nome: mesa.nome,
        isGroup: true,
        status: 'Aberto',
        items: [],
        total: 0,
        totalBruto: 0,
        userName: 'Caixa',
        observacao: mesa.observacao,
        originalMesa: mesa
      }, 'ocupada');
    } else {
      alocarMesa({ ...mesa, isGroup: false }, 'disponivel');
    }
  });

  const elOcupadas = document.getElementById('info-mesas-ocupadas');
  const elLivres = document.getElementById('info-mesas-livres');
  const elFechando = document.getElementById('info-mesas-fechando');
  const elReservadas = document.getElementById('info-mesas-reservadas');

  let ped = contasPedidas;
  let disp = mesasDisponiveis;
  let ocup = mesasOcupadas;
  let fech = mesasEmFechamento;
  let reser = mesasReservadas;

  if (window.viewFilter === 'Comandas') {
    ped = ped.filter(m => (m.nome || m.mesaName || '').toLowerCase().includes('comanda'));
    disp = disp.filter(m => (m.nome || m.mesaName || '').toLowerCase().includes('comanda'));
    ocup = ocup.filter(m => (m.nome || m.mesaName || '').toLowerCase().includes('comanda'));
    fech = fech.filter(m => (m.nome || m.mesaName || '').toLowerCase().includes('comanda'));
    reser = reser.filter(m => (m.nome || m.mesaName || '').toLowerCase().includes('comanda'));
  } else {
    ped = ped.filter(m => !(m.nome || m.mesaName || '').toLowerCase().includes('comanda'));
    disp = disp.filter(m => !(m.nome || m.mesaName || '').toLowerCase().includes('comanda'));
    ocup = ocup.filter(m => !(m.nome || m.mesaName || '').toLowerCase().includes('comanda'));
    fech = fech.filter(m => !(m.nome || m.mesaName || '').toLowerCase().includes('comanda'));
    reser = reser.filter(m => !(m.nome || m.mesaName || '').toLowerCase().includes('comanda'));
  }

