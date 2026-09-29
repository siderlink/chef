/**
 * caixa-mesas.js
 * Módulo especializado na Gestão de Mesas, Comandas, Transferências e Visualização em Grade
 * Integrado ao PDV Chef Cozinha
 */

'use strict';

// ── Estado do Módulo de Mesas ──
let viewFilter = 'Todos';
let mesaGridCols = '2';
let chefMesasOrientation = 'horizontal';
let chefMesasAgrupado = true;

if (typeof window !== 'undefined') {
  try { viewFilter = localStorage.getItem('chef_mesa_view_filter') || 'Todos'; } catch (_) {}
  try { mesaGridCols = localStorage.getItem('chef_mesa_grid_cols') || '2'; } catch (_) {}
  try { chefMesasOrientation = localStorage.getItem('chef_mesas_orientation') || 'horizontal'; } catch (_) {}
  try { chefMesasAgrupado = (localStorage.getItem('chef_mesas_agrupado') || '1') === '1'; } catch (_) {}

  window.viewFilter = viewFilter;
  window.mesaGridCols = mesaGridCols;
  window.chefMesasOrientation = chefMesasOrientation;
  window.chefMesasAgrupado = chefMesasAgrupado;
}

/**
 * Obtém o elemento .mesa-item ancestral mais próximo
 * @param {HTMLElement} el
 */
function getMesaItem(el) {
  return el ? el.closest('.mesa-item') : null;
}

/**
 * Verifica se um elemento card representa uma mesa real do salão
 * @param {HTMLElement} card
 */
function ehMesaReal(card) {
  return !!(card && card.getAttribute('data-status') && card.id && card.id.indexOf('mesa-card-') === 0);
}

/**
 * Obtém o identificador nominal da mesa a partir do card
 * @param {HTMLElement} card
 */
function getMesaName(card) {
  if (!card) return null;
  return card.getAttribute('data-mesa') || card.getAttribute('data-nome');
}

/**
 * Retorna o objeto mesa correspondente ou um objeto com a propriedade nome
 * @param {HTMLElement} card
 */
function getMesaItemName(card) {
  const nome = getMesaName(card);
  if (!nome) return null;
  if (typeof window !== 'undefined' && window.mesasData) {
    const found = window.mesasData.find(m => m.nome === nome || m.mesaName === nome);
    if (found) return found;
  }
  return { nome };
}

/**
 * Abre o modal de transferência rápida de pedidos entre mesas
 * @param {string} mesaOrigem
 */
function abrirModalTransferirMesa(mesaOrigem) {
  if (typeof window === 'undefined') return;
  if (!mesaOrigem) {
    mesaOrigem = window.currentSelectedMesa || 'Mesa 1';
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
}

/**
 * Mostra o QR Code para clientes separarem a conta da mesa pelo celular
 * @param {string} nomeMesa
 */
function mostrarQrSepararContaMesa(nomeMesa) {
  if (!nomeMesa || typeof window === 'undefined') return;
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
    if (window.socket) window.socket.on('split_token_criado', window._splitTokenCallback);
  }
  window._splitMesaAtual = nomeMesa;
  if (window.socket) window.socket.emit('criar_split_mesa', { mesa: nomeMesa });
}

/**
 * Executa a transferência de todos os pedidos da mesa de origem para a de destino
 * @param {string} origem
 * @param {string} destino
 */
function executarTransferenciaMesa(origem, destino) {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modal-transferir-mesa-pro');
  if (modal) modal.style.display = 'none';

  if (confirm(`Deseja realmente transferir todos os pedidos da ${origem} para a ${destino}?`)) {
    if (typeof window.socket !== 'undefined' && window.socket) {
      window.socket.emit('transferir_mesa', {
        mesaAtual: origem,
        novaMesa: destino,
        operador: (window.operadorAtual && window.operadorAtual.nome) || 'Caixa'
      });
      if (typeof window.showToast === 'function') {
        window.showToast(`Transferência da ${origem} para a ${destino} enviada com sucesso!`, 'success');
      }
    }
  }
}

/**
 * Define o filtro de visualização das mesas (Todos, Ocupadas, Livres, Comandas)
 * @param {string} filter
 */
function setMesaViewFilter(filter) {
  if (typeof window === 'undefined') return;
  window.viewFilter = filter;
  try { localStorage.setItem('chef_mesa_view_filter', filter); } catch (_) {}

  if (typeof document !== 'undefined') {
    document.querySelectorAll('.chip-view-btn').forEach(b => {
      b.style.background = 'transparent';
      b.style.color = 'var(--text-main)';
    });
    const activeBtn = document.getElementById('chip-view-' + filter.toLowerCase());
    if (activeBtn) {
      activeBtn.style.background = 'var(--primary, #fc4b15)';
      activeBtn.style.color = '#fff';
    }

    const btnMesas = document.getElementById('toolbar-mesas');
    const btnComandas = document.getElementById('toolbar-comandas');
    if (filter === 'Comandas') {
      if (btnMesas) btnMesas.classList.remove('active');
      if (btnComandas) btnComandas.classList.add('active');
    } else {
      if (btnMesas) btnMesas.classList.add('active');
      if (btnComandas) btnComandas.classList.remove('active');
    }
  }

  if (typeof window.renderOrders === 'function') window.renderOrders();
}

/**
 * Define o número de colunas da grade de mesas (1, 2, 3 ou compact)
 * @param {number|string} cols
 */
function setMesaGridCols(cols) {
  if (typeof window === 'undefined') return;
  window.mesaGridCols = cols;
  try { localStorage.setItem('chef_mesa_grid_cols', String(cols)); } catch (_) {}

  const container = document.getElementById('orders-grid');
  if (container) {
    container.classList.remove('grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-compact');
    if (cols === 1 || cols === '1') container.classList.add('grid-cols-1');
    else if (cols === 3 || cols === '3') container.classList.add('grid-cols-3');
    else if (cols === 'compact') container.classList.add('grid-compact');
    else container.classList.add('grid-cols-2');
  }

  ['3', '2', '1', 'compact'].forEach(c => {
    const b = document.getElementById('btn-grid-cols-' + c);
    if (b) {
      if (String(cols) === c) {
        b.style.background = 'var(--bg-card)';
        b.style.color = 'var(--text-main)';
        b.style.fontWeight = '800';
      } else {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted)';
        b.style.fontWeight = '700';
      }
    }
  });
}

/**
 * Define a orientação visual dos cards de mesas (horizontal ou vertical)
 * @param {'horizontal'|'vertical'} orient
 */
function setMesasOrientation(orient) {
  if (typeof window === 'undefined') return;
  window.chefMesasOrientation = orient;
  try { localStorage.setItem('chef_mesas_orientation', orient); } catch (_) {}

  const grid = document.getElementById('orders-grid');
  if (grid) {
    grid.classList.toggle('orientation-vertical', orient === 'vertical');
  }

  ['horizontal', 'vertical'].forEach(o => {
    const btn = document.getElementById('btn-orient-' + o);
    if (!btn) return;
    if (o === orient) {
      btn.style.background = 'var(--bg-card)';
      btn.style.color = 'var(--text-main)';
      btn.style.fontWeight = '800';
    } else {
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-muted)';
      btn.style.fontWeight = '700';
    }
  });
}

/**
 * Alterna o agrupamento das mesas por status (ocupada, livre, etc)
 */
function toggleMesasAgrupado() {
  if (typeof window === 'undefined') return;
  window.chefMesasAgrupado = !window.chefMesasAgrupado;
  try { localStorage.setItem('chef_mesas_agrupado', window.chefMesasAgrupado ? '1' : '0'); } catch (_) {}
  if (typeof window.renderOrders === 'function') window.renderOrders();
  syncMesasAgrupadoBtn();
}

/**
 * Atualiza o estado visual do botão de agrupamento
 */
function syncMesasAgrupadoBtn() {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById('btn-toggle-mesas-agrupado');
  if (!btn) return;
  btn.style.background = window.chefMesasAgrupado ? 'var(--bg-card)' : 'transparent';
  btn.style.color = window.chefMesasAgrupado ? 'var(--text-main)' : 'var(--text-muted)';
  btn.style.fontWeight = window.chefMesasAgrupado ? '800' : '700';
}

// ── Exposição no window global para compatibilidade com HTML legada ──
if (typeof window !== 'undefined') {
  window.getMesaItem = getMesaItem;
  window.ehMesaReal = ehMesaReal;
  window.getMesaName = getMesaName;
  window.getMesaItemName = getMesaItemName;
  window.abrirModalTransferirMesa = abrirModalTransferirMesa;
  window.mostrarQrSepararContaMesa = mostrarQrSepararContaMesa;
  window.executarTransferenciaMesa = executarTransferenciaMesa;
  window.setMesaViewFilter = setMesaViewFilter;
  window.setMesaGridCols = setMesaGridCols;
  window.setMesasOrientation = setMesasOrientation;
  window.toggleMesasAgrupado = toggleMesasAgrupado;
  window.syncMesasAgrupadoBtn = syncMesasAgrupadoBtn;
}

// Suporte para ES Modules
export {
  getMesaItem,
  ehMesaReal,
  getMesaName,
  getMesaItemName,
  abrirModalTransferirMesa,
  mostrarQrSepararContaMesa,
  executarTransferenciaMesa,
  setMesaViewFilter,
  setMesaGridCols,
  setMesasOrientation,
  toggleMesasAgrupado,
  syncMesasAgrupadoBtn
};
