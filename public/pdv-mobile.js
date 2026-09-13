let socket;
let mesasData = [];
let produtosData = [];
let categoriasData = [];
let pedidosData = [];
let activeFilter = 'all';
let activeCategoria = 'all';
let searchQuery = '';
let currentMesa = null;
let listaFormasPagamento = [];
let checkoutCents = 0;
let aplicarTaxaServico = true;

// (Segurança) Escapa valor para string JS dentro de atributo HTML (aspas como entidade).
function escJs(v) {
  const s = (v === null || v === undefined) ? '' : String(v);
  return JSON.stringify(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
// (Segurança) Escapa valor para conteúdo HTML.
function escHtml(v) {
  return (v === null || v === undefined) ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {
  setupBottomNav();
  initSocket();
  setupMesaFilters();
  setupSearch();
});

function initSocket() {
  if (typeof io === 'undefined') return;
  socket = io({ query: { token: localStorage.getItem('chef_token'), restaurante_id: localStorage.getItem('restaurante_id') || '1' } });
  window.socket = socket;
  if (typeof initChefTz === 'function') initChefTz(socket);

  socket.on('erro_servidor', (msg) => showToast(msg, 'error'));

  socket.on('update_ponto_token', (data) => {
      _pontoUrlMobile = data && data.url ? data.url : '';
      renderQrPontoMobile();
    });
    socket.on('connect', () => {
    socket.emit('registrar_sessao', { nome: 'Caixa Mobile', cargo: 'Operador' });
    socket.emit('get_mesas');
    socket.emit('get_produtos');
    socket.emit('get_formas_pagamento');
    socket.emit('get_pedidos');
  });

  socket.on('mesas_atualizadas', (mesas) => {
    mesasData = mesas;
    renderMesas();
  });

  socket.on('produtos_atualizados', (prods) => {
    produtosData = prods;
    extractCategorias();
    renderCategorias();
    renderProdutos();
  });

  socket.on('initial_data', (pedidos) => {
    pedidosData = pedidos;
    renderMesas();
    renderComanda();
  });

  socket.on('pedidos_atualizados', (pedidos) => {
    pedidosData = pedidos;
    renderMesas();
    renderComanda();
  });

  socket.on('formas_pagamento_atualizadas', (formas) => {
    if (Array.isArray(formas)) {
      listaFormasPagamento = formas.filter(f => f.ativo === 1 || f.ativo === true);
      renderCheckoutMethods();
    }
  });

  socket.on('ia_manobra_sugerida', (data) => {
    const { mesa, produto, minutos } = data;
    showToast(`🔥 Manobra: Mesa ${mesa} aguardando "${produto}" há ${minutos}min`, '#ff6b35');
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`🔥 Manobra - Mesa ${mesa}`, { body: `Oferecer entrada cortesia`, icon: '/favicon.ico' });
    }
  });

  socket.on('ia_manobra_executada', (data) => {
    showToast(`✅ ${data.mensagem}`, '#22c55e');
  });
}

// --- HELPERS ---
function getMesaOrders(mesaName) {
  return pedidosData.filter(p => p.localName === mesaName);
}

function getMesaPendingOrders(mesaName) {
  return pedidosData.filter(p => p.localName === mesaName && p.status !== 'Pago');
}

function getMesaBruto(mesaName) {
  return getMesaOrders(mesaName)
    .reduce((acc, p) => acc + (parseFloat(String(p.total).replace(',', '.')) || 0), 0);
}

function getMesaPendente(mesaName) {
  return getMesaPendingOrders(mesaName)
    .filter(p => {
      const t = parseFloat(String(p.total).replace(',', '.')) || 0;
      return t >= 0;
    })
    .reduce((acc, p) => acc + (parseFloat(String(p.total).replace(',', '.')) || 0), 0);
}

function getMesaPagamentos(mesaName) {
  return getMesaPendingOrders(mesaName)
    .filter(p => {
      const t = parseFloat(String(p.total).replace(',', '.')) || 0;
      return t < 0;
    })
    .reduce((acc, p) => acc + Math.abs(parseFloat(String(p.total).replace(',', '.')) || 0), 0);
}

function getMesaTotalComTaxa(mesaName) {
  const bruto = getMesaBruto(mesaName);
  return aplicarTaxaServico ? bruto * 1.10 : bruto;
}

function getMesaPendenteComTaxa(mesaName) {
  const pendenteBruto = getMesaPendente(mesaName);
  const jaPago = getMesaPagamentos(mesaName);
  if (pendenteBruto <= 0) return 0;
  const mult = aplicarTaxaServico ? 1.10 : 1.0;
  return Math.max(0, pendenteBruto * mult - jaPago);
}

function getMesaCliente(mesaName) {
  const orders = getMesaOrders(mesaName);
  if (orders.length > 0 && orders[0].userName) return orders[0].userName;
  const mesa = mesasData.find(m => m.nome === mesaName);
  if (mesa && mesa.observacao) {
    try { const o = JSON.parse(mesa.observacao); if (o.cliente) return o.cliente; } catch(e) {}
  }
  return '-';
}

function showToast(msg, type = 'info') {
  const existing = document.querySelector('.toast-msg');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast-msg';
  const bgColor = type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#1e293b';
  el.style.cssText = `position:fixed;top:60px;left:50%;transform:translateX(-50%);background:${bgColor};color:white;padding:10px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;max-width:90%;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:slideToast 0.2s ease-out;`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }, 2500);
  setTimeout(() => el.remove(), 3000);
}

const metodosCores = {
  'dinheiro': { icon: 'ph-currency-dollar', color: '#22c55e', bg: '#f0fdf4' },
  'credito': { icon: 'ph-credit-card', color: '#9c27b0', bg: '#faf5ff' },
  'debito': { icon: 'ph-credit-card', color: '#e67e22', bg: '#fffbeb' },
  'pix': { icon: 'ph-qr-code', color: '#00b0ff', bg: '#eff6ff' },
  'ticket': { icon: 'ph-ticket', color: '#ef4444', bg: '#fef2f2' },
  'carteira': { icon: 'ph-notebook', color: '#3b82f6', bg: '#eff6ff' },
  'fiado': { icon: 'ph-notebook', color: '#ef4444', bg: '#fef2f2' },
  'outros': { icon: 'ph-wallet', color: '#64748b', bg: '#f8fafc' }
};

function getMetodoStyle(tipo) {
  return metodosCores[(tipo || '').toLowerCase()] || metodosCores['outros'];
}

// --- MESAS ---
function renderMesas() {
  const grid = document.querySelector('.mesas-grid');
  if (!grid) return;

  const totalOcupadas = mesasData.filter(m => {
    const s = (m.status || '').toLowerCase();
    return s === 'ocupada' || s === 'fechando' || s === 'solicitada';
  }).length;
  const totalFechando = mesasData.filter(m => (m.status || '').toLowerCase() === 'fechando').length;
  const totalLivres = mesasData.filter(m => (m.status || '').toLowerCase() !== 'ocupada' && (m.status || '').toLowerCase() !== 'fechando' && (m.status || '').toLowerCase() !== 'solicitada' && (m.status || '').toLowerCase() !== 'reservada').length;

  const chipAll = document.querySelector('.filter-chip[data-filter="all"]');
  const chipOcup = document.querySelector('.filter-chip[data-filter="ocupada"]');
  const chipLiv = document.querySelector('.filter-chip[data-filter="livre"]');
  const chipFech = document.querySelector('.filter-chip[data-filter="fechando"]');
  if (chipAll) chipAll.textContent = `Todas (${mesasData.length})`;
  if (chipOcup) chipOcup.textContent = `Ocupadas (${totalOcupadas})`;
  if (chipLiv) chipLiv.textContent = `Livres (${totalLivres})`;
  if (chipFech) chipFech.textContent = `Fechando (${totalFechando})`;

  const filtered = mesasData.filter(mesa => {
    const s = (mesa.status || '').toLowerCase();
    const hasOrders = getMesaOrders(mesa.nome).length > 0;
    if (activeFilter === 'all') return true;
    if (activeFilter === 'livre') return !hasOrders && s !== 'ocupada' && s !== 'fechando' && s !== 'solicitada';
    if (activeFilter === 'ocupada') return hasOrders || s === 'ocupada' || s === 'fechando' || s === 'solicitada';
    if (activeFilter === 'fechando') return s === 'fechando';
    return true;
  });

  let html = `
    <div class="mesa-card" style="border-style:dashed;border-color:var(--primary);background:transparent;align-items:center;justify-content:center;min-height:120px;" onclick="abrirBalcao()">
      <i class="ph ph-plus-circle" style="font-size:32px;color:var(--primary);"></i>
      <span style="color:var(--primary);font-weight:600;margin-top:8px;">Venda Balcao</span>
    </div>`;

  filtered.forEach(mesa => {
    const s = (mesa.status || '').toLowerCase();
    const orders = getMesaOrders(mesa.nome);
    const hasOrders = orders.length > 0;
    const isOcupada = hasOrders || s === 'ocupada' || s === 'fechando' || s === 'solicitada';
    const statusClass = isOcupada ? 'ocupada' : 'livre';
    const total = getMesaTotalComTaxa(mesa.nome);
    const cliente = getMesaCliente(mesa.nome);

    html += `
      <div class="mesa-card ${statusClass}" onclick="window.abrirModalItensMesa(${escJs(mesa.nome)})" oncontextmenu="event.preventDefault(); window.abrirContextMenuPdvMobile(event, ${escJs(mesa.nome)});" data-mesa-nome="${escHtml(mesa.nome)}">
        <div class="mesa-card-header">
          <span>${escHtml(mesa.nome)}</span>
          <i class="ph ${isOcupada ? 'ph-users' : 'ph-armchair'}"></i>
        </div>
        <div class="mesa-card-cliente">${escHtml(cliente)}</div>
        <div class="mesa-card-info">${orders.length} pedido(s)</div>
        <div class="mesa-card-total">R$ ${total.toFixed(2).replace('.', ',')}</div>
        ${isOcupada ? `<button onclick="event.stopPropagation();abrirCheckoutMesa(${escJs(mesa.nome)})" style="margin-top:8px;width:100%;padding:8px;background:var(--success);color:white;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
          <i class="ph ph-currency-dollar" style="margin-right:4px;"></i> Pagar
        </button>` : ''}
      </div>`;
  });

  grid.innerHTML = html;
}

window.abrirMesa = (nomeMesa) => {
  currentMesa = nomeMesa;
  document.querySelector('.nav-item[data-target="view-cardapio"]').click();
};

window.abrirCheckoutMesa = (nomeMesa) => {
  currentMesa = nomeMesa;
  abrirCheckout();
};

window.abrirBalcao = () => {
  currentMesa = 'Balcão';
  renderComanda();
  document.querySelector('.nav-item[data-target="view-cardapio"]').click();
};

function setupMesaFilters() {
  const chips = document.querySelectorAll('.filter-chip[data-filter]');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.getAttribute('data-filter');
      renderMesas();
    });
  });
}

// --- COMANDA / FILA ---
let comandaFilter = 'Em preparo';
let filaTipoFilter = 'Todos';
let filaSortBy = 'antigos';

const EQUIPAMENTOS = {
  'Fritadeiras': ['frit', 'isca', 'pastel', 'croquete', 'bolinho', 'mandioca', 'batata', 'onion'],
  'Chapas': ['chapa', 'grelh', 'costela', 'picanha', 'aldente'],
  'Bocas': ['refog', 'molho', 'arroz', 'feijão', 'feijao', 'massa', 'risoto', 'macarrao']
};

function getEquipamento(pedido) {
  const nome = (pedido.productName || '').toLowerCase();
  for (const [equip, keywords] of Object.entries(EQUIPAMENTOS)) {
    if (keywords.some(k => nome.includes(k))) return equip;
  }
  return null;
}

function renderComanda() {
  const container = document.getElementById('view-comanda');
  if (!container) return;
  if (!filaSectorSelecionado) {
    mostrarSelecaoSetor();
    return;
  }

  let pendingOrders = pedidosData.filter(p =>
    p.status !== 'Finalizado' && p.status !== 'Cancelado' && p.status !== 'Pago' && p.status !== 'Entregue'
  );

  if (filaSectorSelecionado !== 'Todos') {
    pendingOrders = pendingOrders.filter(p => {
      const sector = (p.sector || '').trim();
      return sector === filaSectorSelecionado;
    });
  }

  if (filaTipoFilter === 'A la carte') {
    pendingOrders = pendingOrders.filter(p => {
      const nome = (p.productName || '').toLowerCase();
      return !nome.includes('porção') && !nome.includes('porcao');
    });
  } else if (filaTipoFilter === 'Porções') {
    pendingOrders = pendingOrders.filter(p => {
      const nome = (p.productName || '').toLowerCase();
      return nome.includes('porção') || nome.includes('porcao');
    });
  }

  const statusCounts = {
    'Em preparo': pendingOrders.filter(p => p.status === 'Em preparo' || p.status === 'Em Preparo').length,
    'Pronto': pendingOrders.filter(p => p.status === 'Pronto' || p.status === 'Prontos').length,
    'Em espera': pendingOrders.filter(p => p.status === 'Em espera' || p.status === 'Pendente').length,
  };

  let filtered;
  if (comandaFilter === 'Todos') {
    filtered = [...pendingOrders];
  } else if (comandaFilter === 'Em preparo') {
    filtered = pendingOrders.filter(p => p.status === 'Em preparo' || p.status === 'Em Preparo');
  } else if (comandaFilter === 'Pronto') {
    filtered = pendingOrders.filter(p => p.status === 'Pronto' || p.status === 'Prontos');
  } else if (comandaFilter === 'Em espera') {
    filtered = pendingOrders.filter(p => p.status === 'Em espera' || p.status === 'Pendente');
  } else {
    filtered = [...pendingOrders];
  }

  if (filaSortBy === 'antigos') {
    filtered.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  } else if (filaSortBy === 'atrasados') {
    filtered.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }

  const statusColors = {
    'Em preparo': '#f59e0b', 'Em Preparo': '#f59e0b',
    'Em espera': '#94a3b8', 'Pendente': '#94a3b8',
    'Pronto': '#22c55e', 'Prontos': '#22c55e',
  };

  const nextStatus = {
    'Em preparo': 'Pronto', 'Em Preparo': 'Pronto',
    'Em espera': 'Em preparo', 'Pendente': 'Em preparo',
  };

  const sectorIcons = { 'Todos': 'ph-stack', 'Cozinha 1': 'ph-cooking-pot', 'Cozinha 2': 'ph-cooking-pot', 'Bar': 'ph-wine' };

  let itemsHtml = filtered.length === 0
    ? `<div style="text-align:center;padding:40px 16px;color:var(--text-muted);">
        <i class="ph ph-check-circle" style="font-size:40px;color:#22c55e;margin-bottom:12px;display:block;"></i>
        <h3>Fila vazia</h3>
        <p style="margin-top:6px;font-size:13px;">Nenhum pedido "${comandaFilter}" em ${filaSectorSelecionado}.</p>
       </div>`
    : filtered.map(pedido => {
      const timeCreated = pedido.createdAt ? new Date(pedido.createdAt).getTime() : Date.now();
      const diffMins = Math.floor((Date.now() - timeCreated) / 60000);
      const status = pedido.status;
      const cor = statusColors[status] || '#94a3b8';
      const nxt = nextStatus[status];
      const val = parseFloat(String(pedido.total).replace(',', '.')) || 0;
      const urgencia = diffMins >= 40 ? '#ef4444' : diffMins >= 25 ? '#f59e0b' : null;
      const equip = getEquipamento(pedido);

      return `
        <div class="comanda-order-card" style="background:white;border-radius:12px;padding:14px;margin-bottom:10px;border-left:4px solid ${urgencia || cor};box-shadow:0 1px 4px rgba(0,0,0,0.06);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <div style="flex:1;">
              <div style="font-weight:700;font-size:15px;color:var(--text-main);">${pedido.quantity}x ${pedido.productName}</div>
              ${pedido.obs ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Obs: ${pedido.obs}</div>` : ''}
            </div>
            <span style="font-weight:700;color:var(--primary);font-size:14px;white-space:nowrap;">R$ ${val.toFixed(2).replace('.',',')}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="background:${cor}22;color:${cor};padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;">${escHtml(status)}</span>
              <span style="font-size:11px;color:${urgencia || 'var(--text-muted)'};font-weight:${urgencia ? '700' : '500'};">
                <i class="ph ph-clock" style="margin-right:2px;"></i>${diffMins}min
              </span>
              ${equip ? `<span style="background:#f0f9ff;color:#0284c7;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">${escHtml(equip)}</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:12px;font-weight:600;color:var(--text-main);">
                <i class="ph ph-table" style="margin-right:2px;"></i>${escHtml(pedido.localName || '-')}
              </span>
            </div>
          </div>
          ${nxt ? `
          <div style="margin-top:10px;display:flex;gap:6px;">
            <button onclick="avancarStatusPedido(${pedido.id}, '${nxt}')" style="flex:1;padding:10px;background:${nxt === 'Pronto' ? 'var(--success)' : 'var(--primary)'};color:white;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
              <i class="ph ${nxt === 'Pronto' ? 'ph-check-circle' : 'ph-fire'}" style="margin-right:4px;"></i>${nxt}
            </button>
          </div>` : ''}
        </div>`;
    }).join('');

  container.innerHTML = `
    <div style="padding:10px 16px;background:var(--white);border-bottom:1px solid var(--border-color);position:sticky;top:0;z-index:5;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <button onclick="voltarSelecaoSetor()" style="background:#f1f5f9;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;">
            <i class="ph ph-arrow-left" style="font-size:14px;color:var(--text-muted);"></i>
          </button>
          <div>
            <h3 style="color:var(--text-main);font-size:15px;font-weight:700;">${filaSectorSelecionado}</h3>
            <span style="font-size:11px;color:var(--text-muted);">${pendingOrders.length} pendente(s)</span>
          </div>
        </div>
        <div style="display:flex;gap:4px;">
          <button onclick="setFilaSortBy('antigos')" style="padding:5px 8px;border-radius:6px;border:none;font-size:11px;font-weight:600;cursor:pointer;background:${filaSortBy === 'antigos' ? 'var(--primary)' : '#f1f5f9'};color:${filaSortBy === 'antigos' ? 'white' : 'var(--text-muted)'};">
            <i class="ph ph-clock"></i> Antigos
          </button>
          <button onclick="setFilaSortBy('atrasados')" style="padding:5px 8px;border-radius:6px;border:none;font-size:11px;font-weight:600;cursor:pointer;background:${filaSortBy === 'atrasados' ? '#ef4444' : '#f1f5f9'};color:${filaSortBy === 'atrasados' ? 'white' : 'var(--text-muted)'};">
            <i class="ph ph-warning"></i> Atrasados
          </button>
        </div>
      </div>
      <div style="display:flex;gap:4px;margin-bottom:6px;overflow-x:auto;">
        <button onclick="setComandaFilter('Em preparo')" style="flex-shrink:0;padding:5px 10px;border-radius:12px;border:none;font-size:11px;font-weight:700;cursor:pointer;background:${comandaFilter === 'Em preparo' ? '#f59e0b' : '#f1f5f9'};color:${comandaFilter === 'Em preparo' ? 'white' : 'var(--text-muted)'};">
          Em Preparo (${statusCounts['Em preparo']})
        </button>
        <button onclick="setComandaFilter('Pronto')" style="flex-shrink:0;padding:5px 10px;border-radius:12px;border:none;font-size:11px;font-weight:700;cursor:pointer;background:${comandaFilter === 'Pronto' ? '#22c55e' : '#f1f5f9'};color:${comandaFilter === 'Pronto' ? 'white' : 'var(--text-muted)'};">
          Pronto (${statusCounts['Pronto']})
        </button>
        <button onclick="setComandaFilter('Em espera')" style="flex-shrink:0;padding:5px 10px;border-radius:12px;border:none;font-size:11px;font-weight:700;cursor:pointer;background:${comandaFilter === 'Em espera' ? '#94a3b8' : '#f1f5f9'};color:${comandaFilter === 'Em espera' ? 'white' : 'var(--text-muted)'};">
          Espera (${statusCounts['Em espera']})
        </button>
        <button onclick="setComandaFilter('Todos')" style="flex-shrink:0;padding:5px 10px;border-radius:12px;border:none;font-size:11px;font-weight:700;cursor:pointer;background:${comandaFilter === 'Todos' ? '#1e293b' : '#f1f5f9'};color:${comandaFilter === 'Todos' ? 'white' : 'var(--text-muted)'};">
          Todos
        </button>
      </div>
      <div style="display:flex;gap:4px;overflow-x:auto;">
        <button onclick="setFilaTipoFilter('Todos')" style="flex-shrink:0;padding:4px 8px;border-radius:8px;border:1px solid ${filaTipoFilter === 'Todos' ? 'var(--primary)' : 'var(--border-color)'};font-size:10px;font-weight:600;cursor:pointer;background:${filaTipoFilter === 'Todos' ? 'var(--primary)15' : 'transparent'};color:${filaTipoFilter === 'Todos' ? 'var(--primary)' : 'var(--text-muted)'};">
          Todos
        </button>
        <button onclick="setFilaTipoFilter('A la carte')" style="flex-shrink:0;padding:4px 8px;border-radius:8px;border:1px solid ${filaTipoFilter === 'A la carte' ? 'var(--primary)' : 'var(--border-color)'};font-size:10px;font-weight:600;cursor:pointer;background:${filaTipoFilter === 'A la carte' ? 'var(--primary)15' : 'transparent'};color:${filaTipoFilter === 'A la carte' ? 'var(--primary)' : 'var(--text-muted)'};">
          A la carte
        </button>
        <button onclick="setFilaTipoFilter('Porções')" style="flex-shrink:0;padding:4px 8px;border-radius:8px;border:1px solid ${filaTipoFilter === 'Porções' ? 'var(--primary)' : 'var(--border-color)'};font-size:10px;font-weight:600;cursor:pointer;background:${filaTipoFilter === 'Porções' ? 'var(--primary)15' : 'transparent'};color:${filaTipoFilter === 'Porções' ? 'var(--primary)' : 'var(--text-muted)'};">
          Porções
        </button>
      </div>
    </div>
    <div style="padding:12px 16px;flex:1;overflow-y:auto;">
      ${itemsHtml}
    </div>`;
}

window.setComandaFilter = (f) => {
  comandaFilter = f;
  renderComanda();
};

window.setFilaTipoFilter = (f) => {
  filaTipoFilter = f;
  renderComanda();
};

window.setFilaSortBy = (s) => {
  filaSortBy = s;
  renderComanda();
};

window.avancarStatusPedido = (id, status) => {
  socket.emit('atualizar_status', { id, status });
  const pedido = pedidosData.find(p => p.id === id);
  if (pedido) pedido.status = status;
  renderComanda();
  showToast(`Pedido #${id} -> ${status}`, 'success');
};

window.toggleTaxaServico = () => {
  aplicarTaxaServico = !aplicarTaxaServico;
  renderMesas();
};

// --- DIVIDIR CONTA ---
window.abrirDivisao = () => {
  if (!currentMesa) return;
  const pending = getMesaPendingOrders(currentMesa);
  if (pending.length === 0) {
    showToast('Nenhum item pendente para dividir.', 'error');
    return;
  }

  const bruto = getMesaBruto(currentMesa);
  const taxaVal = aplicarTaxaServico ? bruto * 0.10 : 0;
  const total = bruto + taxaVal;

  const overlay = document.getElementById('modal-divisao');
  overlay.classList.add('active');

  const itemsDiv = document.getElementById('divisao-items');
  const totalDiv = document.getElementById('divisao-total');

  totalDiv.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;

  itemsDiv.innerHTML = pending.map(p => {
    const val = parseFloat(String(p.total).replace(',', '.')) || 0;
    const valComTaxa = aplicarTaxaServico ? val * 1.10 : val;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-color);">
        <span style="font-size:13px;font-weight:500;flex:1;">${p.quantity}x ${p.productName}</span>
        <span style="font-size:13px;font-weight:700;color:var(--primary);">R$ ${valComTaxa.toFixed(2).replace('.', ',')}</span>
      </div>`;
  }).join('');

  document.getElementById('divisao-pessoas').value = '2';
  atualizarDivisaoPreview();
};

window.fecharDivisao = (e) => {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modal-divisao').classList.remove('active');
};

window.atualizarDivisaoPreview = () => {
  const num = parseInt(document.getElementById('divisao-pessoas').value) || 2;
  const bruto = getMesaBruto(currentMesa);
  const taxaVal = aplicarTaxaServico ? bruto * 0.10 : 0;
  const total = bruto + taxaVal;
  const porPessoa = total / num;

  const preview = document.getElementById('divisao-preview');
  if (preview) {
    preview.innerHTML = `
      <div style="text-align:center;padding:16px;background:#f0fdf4;border-radius:12px;margin-top:12px;">
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px;">${num} pessoas</div>
        <div style="font-size:28px;font-weight:800;color:var(--success);">R$ ${porPessoa.toFixed(2).replace('.', ',')}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">por pessoa</div>
      </div>`;
  }
};

window.confirmarDivisao = () => {
  const num = parseInt(document.getElementById('divisao-pessoas').value) || 2;
  const bruto = getMesaBruto(currentMesa);
  const taxaVal = aplicarTaxaServico ? bruto * 0.10 : 0;
  const total = bruto + taxaVal;
  const porPessoa = total / num;

  showToast(`${num} pessoas x R$ ${porPessoa.toFixed(2).replace('.', ',')}`, 'success');
  fecharDivisao();
};

// --- CARDÁPIO ---
function extractCategorias() {
  const cats = new Set();
  produtosData.forEach(p => { if (p.categoria) cats.add(p.categoria); });
  categoriasData = Array.from(cats).sort();
}

function renderCategorias() {
  const container = document.getElementById('categorias-container');
  if (!container) return;

  let html = `<button class="filter-chip ${activeCategoria === 'all' ? 'active' : ''}" data-categoria="all">Todos</button>`;
  categoriasData.forEach(cat => {
    html += `<button class="filter-chip ${activeCategoria === cat ? 'active' : ''}" data-categoria="${cat}">${cat}</button>`;
  });
  container.innerHTML = html;

  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeCategoria = chip.getAttribute('data-categoria');
      renderCategorias();
      renderProdutos();
      setTimeout(() => {
        const active = container.querySelector('.filter-chip.active');
        if (active) {
          const cw = container.clientWidth;
          const ol = active.offsetLeft;
          const ow = active.offsetWidth;
          container.scrollTo({ left: Math.max(0, ol - cw / 2 + ow / 2), behavior: 'smooth' });
        }
      }, 30);
    });
  });
}

function setupSearch() {
  const input = document.getElementById('search-produto');
  if (input) {
    input.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      renderProdutos();
    });
  }
}

function renderProdutos() {
  const container = document.getElementById('produtos-container');
  if (!container) return;

  let filtered = produtosData;
  if (activeCategoria !== 'all') {
    filtered = filtered.filter(p => p.categoria === activeCategoria);
  }
  if (searchQuery) {
    filtered = window.FuzzySearch.filter(filtered, searchQuery.trim(), (p) => [p.nome, String(p.codigo || '')]);
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);"><p>Nenhum produto encontrado.</p></div>`;
    return;
  }

  container.innerHTML = filtered.map(p => {
    const price = typeof p.preco === 'number' ? p.preco.toFixed(2).replace('.', ',') : p.preco;
    const emoji = p.emoji || '';
    return `
      <div class="produto-card" onclick="adicionarProduto(${p.id})">
        <div class="produto-img">${emoji ? `<span style="font-size:36px;">${emoji}</span>` : '<i class="ph ph-image"></i>'}</div>
        <div class="produto-info">
          <div class="produto-nome">${p.nome}</div>
          <div class="produto-preco">R$ ${price}</div>
        </div>
      </div>`;
  }).join('');
}

// --- ADICIONAR PRODUTO ---
let selectedProduto = null;
let selectedQtd = 1;

window.adicionarProduto = (id) => {
  if (!currentMesa) {
    showToast('Selecione uma mesa primeiro!', 'error');
    document.querySelector('.nav-item[data-target="view-mesas"]').click();
    return;
  }
  const prod = produtosData.find(p => String(p.id) === String(id));
  if (!prod) return;

  selectedProduto = prod;
  selectedQtd = 1;

  document.getElementById('modal-produto-nome').textContent = prod.nome;
  document.getElementById('modal-produto-preco').textContent = `R$ ${prod.preco.toFixed(2).replace('.', ',')}`;
  document.getElementById('modal-produto-qtd').textContent = selectedQtd;
  document.getElementById('modal-produto-obs').value = '';
  document.getElementById('modal-produto').classList.add('active');
};

window.fecharModalProduto = (e) => {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modal-produto').classList.remove('active');
  selectedProduto = null;
};

window.alterarQtd = (num) => {
  if (selectedQtd + num >= 1 && selectedProduto) {
    selectedQtd += num;
    document.getElementById('modal-produto-qtd').textContent = selectedQtd;
    const total = selectedProduto.preco * selectedQtd;
    document.getElementById('modal-produto-preco').textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
  }
};

window.confirmarAdicionarProduto = () => {
  if (!selectedProduto || !currentMesa) return;

  const obs = document.getElementById('modal-produto-obs').value.trim();

  socket.emit('novo_pedido', {
    productName: selectedProduto.nome,
    productEmoji: selectedProduto.emoji || '',
    quantity: selectedQtd,
    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    localName: currentMesa,
    userName: 'Caixa Mobile',
    total: (selectedProduto.preco * selectedQtd).toFixed(2).replace('.', ','),
    status: 'Recebido',
    status_inicial: selectedProduto.status_inicial || 'Em espera',
    sector: selectedProduto.setor || 'Cozinha 1',
    mesa_comanda: currentMesa,
    obs: obs
  });

  showToast(`${selectedQtd}x ${selectedProduto.nome} lancado!`, 'success');
  fecharModalProduto();
};

// --- CHECKOUT ---
window.abrirCheckout = () => {
  if (!currentMesa) return;
  checkoutCents = 0;
  document.getElementById('modal-checkout').classList.add('active');
  renderCheckoutMethods();
  renderCheckoutSummary();
};

window.fecharModalCheckout = (e) => {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modal-checkout').classList.remove('active');
  checkoutCents = 0;
};

function getMesaTotalCheckout() {
  return getMesaPendenteComTaxa(currentMesa);
}

function renderCheckoutSummary() {
  const bruto = getMesaPendente(currentMesa);
  const taxaVal = aplicarTaxaServico ? bruto * 0.10 : 0;
  const total = bruto + taxaVal;

  const summaryEl = document.getElementById('checkout-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="checkout-summary-row"><span>Mesa</span><span>${currentMesa}</span></div>
      <div class="checkout-summary-row"><span>Subtotal</span><span>R$ ${bruto.toFixed(2).replace('.', ',')}</span></div>
      ${aplicarTaxaServico ? `<div class="checkout-summary-row"><span>Servico (10%)</span><span>R$ ${taxaVal.toFixed(2).replace('.', ',')}</span></div>` : ''}
      <div class="checkout-summary-row total"><span>Total</span><span>R$ ${total.toFixed(2).replace('.', ',')}</span></div>`;
  }
}

function renderCheckoutMethods() {
  const container = document.getElementById('checkout-methods-grid');
  if (!container) return;

  const filtrados = listaFormasPagamento.filter(f => {
    const n = (f.nome || '').toLowerCase();
    return !n.includes('múltiplo') && !n.includes('multiplo') && !n.includes('multiple') && !n.includes('dividir');
  });

  if (filtrados.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:16px;color:var(--text-muted);">Nenhum metodo disponivel</div>`;
    return;
  }

  container.innerHTML = filtrados.map(f => {
    const estilo = getMetodoStyle(f.tipo);
    const icone = f.icone || estilo.icon;
    const cor = estilo.color;
    const bg = estilo.bg;
    return `
      <button class="pay-method-btn" style="background:${bg};border:2px solid ${cor}22;border-radius:12px;padding:14px 8px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;font-size:11px;font-weight:700;color:${cor};">
        <i class="ph ${icone}" style="font-size:22px;color:${cor};"></i>
        ${f.nome}
      </button>`;
  }).join('');

  container.querySelectorAll('.pay-method-btn').forEach((btn, i) => {
    btn.addEventListener('click', () => processarPagamento(filtrados[i].nome));
  });
}

// Touch numpad
window.checkoutNumpadPress = (val) => {
  if (val === 'BACKSPACE') {
    const str = String(checkoutCents);
    checkoutCents = str.length <= 1 ? 0 : parseInt(str.slice(0, -1), 10) || 0;
  } else if (val === '00') {
    if (checkoutCents > 0) checkoutCents = parseInt(String(checkoutCents) + '00', 10) || 0;
  } else {
    checkoutCents = checkoutCents === 0 ? parseInt(val, 10) : parseInt(String(checkoutCents) + val, 10) || 0;
  }
  updateCheckoutVisor();
};

window.checkoutNumpadClear = () => { checkoutCents = 0; updateCheckoutVisor(); };

window.checkoutNumpadTotal = () => {
  checkoutCents = Math.round(getMesaTotalCheckout() * 100);
  updateCheckoutVisor();
};

function updateCheckoutVisor() {
  const visor = document.getElementById('checkout-visor');
  if (visor) visor.textContent = `R$ ${(checkoutCents / 100).toFixed(2).replace('.', ',')}`;
}

// --- PAGAMENTO ---
window.processarPagamento = (metodo) => {
  const total = getMesaTotalCheckout();
  const valor = checkoutCents > 0 ? checkoutCents / 100 : total;

  if (valor <= 0) {
    showToast('Nao ha nada a pagar nesta mesa.', 'error');
    return;
  }

  socket.emit('pagamento_parcial_valor', {
    mesaName: currentMesa,
    valor: valor,
    metodo: metodo,
    comTaxa: aplicarTaxaServico,
    userName: 'Caixa Mobile'
  });

  // movimentacao_caixa REMOVED — pagamento_parcial_valor already inserts into movimentacoes via socket-financeiro.js

  showToast(`R$ ${valor.toFixed(2).replace('.', ',')} via ${metodo}`, 'success');
  fecharModalCheckout();
  checkoutCents = 0;
  renderComanda();
  renderMesas();
};

// --- SANGRIA / SUPRIMENTO ---
let sangriaTipo = 'Sangria';

window.abrirSangriaSuprimento = function(tipo) {
  sangriaTipo = tipo;
  const modal = document.getElementById('modal-sangria');
  const titulo = document.getElementById('sangria-titulo');
  const valorInput = document.getElementById('sangria-valor');
  const descInput = document.getElementById('sangria-desc');
  if (titulo) titulo.textContent = tipo;
  if (valorInput) valorInput.value = '';
  if (descInput) descInput.value = '';
  if (modal) modal.classList.add('active');
};

window.fecharSangria = function(e) {
  if (e && e.target !== e.currentTarget) return;
  const modal = document.getElementById('modal-sangria');
  if (modal) modal.classList.remove('active');
};

window.confirmarSangriaSuprimento = function() {
  const valor = parseFloat(document.getElementById('sangria-valor').value) || 0;
  const desc = (document.getElementById('sangria-desc').value || '').trim();
  if (valor <= 0) {
    showToast('Informe um valor valido.', 'error');
    return;
  }
  socket.emit('movimentacao_caixa', {
    tipo: sangriaTipo,
    valor: valor,
    descricao: desc || `${sangriaTipo} via Mobile`,
    forma_pagamento: 'Dinheiro',
    operador: 'Caixa Mobile'
  });
  showToast(`${sangriaTipo} de R$ ${valor.toFixed(2).replace('.', ',')} registrada!`, 'success');
  fecharSangria();
};

// --- CHAMAR GARÇOM ---
window.chamarGarcom = function() {
  socket.emit('chamar_garcom', { nome: 'Caixa Mobile', mensagem: 'Garçom chamado via PDV Mobile' });
  showToast('Garçom chamado!', 'success');
};

// --- BOTTOM NAV ---
let filaSectorSelecionado = null;

function setupBottomNav() {
  const navItems = document.querySelectorAll('.nav-item');
  const viewSections = document.querySelectorAll('.view-section');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = item.getAttribute('data-target');

      if (targetId === 'view-comanda') {
        if (!filaSectorSelecionado) {
          mostrarSelecaoSetor();
          return;
        }
      }

      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      viewSections.forEach(section => {
        section.classList.toggle('active', section.id === targetId);
      });

      if (targetId === 'view-comanda') {
        renderComanda();
      }
    });
  });
}

function mostrarSelecaoSetor() {
  const container = document.getElementById('view-comanda');
  if (!container) return;

  const setoresBase = ['Todos', 'Cozinha 1', 'Cozinha 2', 'Bar'];
  const setoresProdutos = [...new Set(produtosData.map(p => p.setor).filter(Boolean))];
  const setoresExtras = setoresProdutos.filter(s => !setoresBase.includes(s));
  const todosSetores = [...setoresBase, ...setoresExtras];

  container.innerHTML = `
    <div style="padding:20px 16px;display:flex;flex-direction:column;gap:12px;">
      <div style="text-align:center;margin-bottom:8px;">
        <i class="ph ph-funnel" style="font-size:36px;color:var(--primary);margin-bottom:8px;display:block;"></i>
        <h3 style="font-size:17px;font-weight:700;color:var(--text-main);margin-bottom:4px;">Qual fila deseja acessar?</h3>
        <p style="font-size:13px;color:var(--text-muted);">Escolha o setor para visualizar os pedidos</p>
      </div>
      ${todosSetores.map(setor => {
        const icons = { 'Todos': 'ph-stack', 'Cozinha 1': 'ph-cooking-pot', 'Cozinha 2': 'ph-cooking-pot', 'Bar': 'ph-wine' };
        const colors = { 'Todos': '#1e293b', 'Cozinha 1': '#16a34a', 'Cozinha 2': '#ea580c', 'Bar': '#3b82f6' };
        const icon = icons[setor] || 'ph-house';
        const color = colors[setor] || '#64748b';
        return `
          <button onclick="selecionarSetorFila(${escJs(setor)})" style="display:flex;align-items:center;gap:14px;background:white;border:2px solid var(--border-color);border-radius:12px;padding:16px;cursor:pointer;text-align:left;transition:all 0.15s;">
            <div style="width:44px;height:44px;border-radius:10px;background:${color}15;display:flex;align-items:center;justify-content:center;">
              <i class="ph ${icon}" style="font-size:22px;color:${color};"></i>
            </div>
            <div style="flex:1;">
              <div style="font-weight:700;font-size:15px;color:var(--text-main);">${escHtml(setor)}</div>
              <div style="font-size:12px;color:var(--text-muted);">${setor === 'Todos' ? 'Todas as filas' : 'Pedidos de ' + setor}</div>
            </div>
            <i class="ph ph-caret-right" style="font-size:16px;color:var(--text-muted);"></i>
          </button>`;
      }).join('')}
    </div>`;

  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(nav => {
    nav.classList.toggle('active', nav.getAttribute('data-target') === 'view-comanda');
  });
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.toggle('active', section.id === 'view-comanda');
  });
}

window.selecionarSetorFila = (setor) => {
  filaSectorSelecionado = setor;
  renderComanda();
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(nav => {
    nav.classList.toggle('active', nav.getAttribute('data-target') === 'view-comanda');
  });
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.toggle('active', section.id === 'view-comanda');
  });
};

window.voltarSelecaoSetor = () => {
  filaSectorSelecionado = null;
  mostrarSelecaoSetor();
};


  // ─── MODAL DE DETALHES DOS ITENS DA MESA (PDV MOBILE) ───
  window.abrirModalItensMesa = function (nomeMesa) {
    const orders = getMesaOrders(nomeMesa);
    const total = getMesaTotalComTaxa(nomeMesa);
    const cliente = getMesaCliente(nomeMesa);

    let modal = document.getElementById('modal-detalhes-mesa-pdv-mobile');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'modal-detalhes-mesa-pdv-mobile';
      modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); backdrop-filter:blur(6px); z-index:999999; display:flex; align-items:flex-end; justify-content:center; padding:0; animation:fadeIn 0.2s ease;';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:#ffffff; border-radius:24px 24px 0 0; width:100%; max-width:500px; max-height:85vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 -10px 40px rgba(0,0,0,0.3); color:#0f172a;">
        <div style="padding:16px 20px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0; font-size:18px; font-weight:800; color:#fc4b15;">${nomeMesa}</h3>
            <span style="font-size:12px; color:#64748b;">${cliente ? 'Cliente: ' + cliente : 'Consumo da mesa'}</span>
          </div>
          <button type="button" onclick="document.getElementById('modal-detalhes-mesa-pdv-mobile').style.display='none'" style="background:#f1f5f9; border:none; width:34px; height:34px; border-radius:50%; color:#64748b; font-size:18px; cursor:pointer;">&times;</button>
        </div>

        <div style="padding:16px 20px; overflow-y:auto; flex:1;">
          ${orders.length === 0 ? `
            <div style="text-align:center; padding:30px 10px; color:#94a3b8;">
              <i class="ph ph-shopping-bag" style="font-size:36px; display:block; margin-bottom:8px;"></i>
              Nenhum item lançado nesta mesa ainda.
            </div>
          ` : `
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${orders.map(o => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span style="background:#fc4b15; color:white; font-weight:800; font-size:13px; padding:2px 8px; border-radius:8px;">${o.quantity || 1}x</span>
                    <div>
                      <strong style="font-size:14px; color:#0f172a; display:block;">${o.productName || o.nome}</strong>
                      <span style="font-size:11.5px; color:#64748b;">R$ ${(parseFloat(o.price || o.preco || 0)).toFixed(2).replace('.', ',')} un</span>
                    </div>
                  </div>
                  <span style="font-size:14px; font-weight:800; color:#10b981;">R$ ${((parseFloat(o.price || o.preco || 0)) * (o.quantity || 1)).toFixed(2).replace('.', ',')}</span>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <div style="padding:16px 20px; background:#f8fafc; border-top:1px solid #e2e8f0;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-size:14px; font-weight:700; color:#64748b;">Total com Taxa:</span>
            <strong style="font-size:20px; font-weight:900; color:#10b981;">R$ ${total.toFixed(2).replace('.', ',')}</strong>
          </div>
          
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <button onclick="document.getElementById('modal-detalhes-mesa-pdv-mobile').style.display='none'; abrirCardapioComMesa('${nomeMesa}')" style="padding:12px; background:#fc4b15; color:white; border:none; border-radius:12px; font-weight:800; font-size:13px; cursor:pointer;">
              <i class="ph-bold ph-plus-circle"></i> Lançar Itens
            </button>
            <button onclick="document.getElementById('modal-detalhes-mesa-pdv-mobile').style.display='none'; abrirCheckoutMesa('${nomeMesa}')" style="padding:12px; background:#10b981; color:white; border:none; border-radius:12px; font-weight:800; font-size:13px; cursor:pointer;">
              <i class="ph-bold ph-check-circle"></i> Pagar / Fechar
            </button>
          </div>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
  };

  window.abrirCardapioComMesa = function (nomeMesa) {
    currentMesa = nomeMesa;
    const navCardapio = document.querySelector('.nav-item[data-target="view-cardapio"]');
    if (navCardapio) navCardapio.click();
  };

  // ─── CONTEXT MENU & LONG PRESS (PDV MOBILE) ───
  window.abrirContextMenuPdvMobile = function (e, nomeMesa) {
    if (e && e.preventDefault) e.preventDefault();
    const x = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 150);
    const y = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 150);

    let popup = document.getElementById('pdv-mobile-context-menu');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'pdv-mobile-context-menu';
      popup.style.cssText = 'position:fixed; z-index:999999; background:#ffffff; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,0.25); border:1px solid #e2e8f0; padding:8px; display:flex; flex-direction:column; gap:4px; min-width:180px;';
      document.body.appendChild(popup);
      document.addEventListener('click', () => { if (popup) popup.style.display = 'none'; });
    }

    popup.innerHTML = `
      <button onclick="window.abrirModalItensMesa('${nomeMesa}')" style="display:flex; align-items:center; gap:8px; padding:10px 12px; border:none; background:transparent; font-size:13px; font-weight:700; color:#0f172a; cursor:pointer; border-radius:8px; text-align:left;">
        <i class="ph-bold ph-receipt" style="color:#fc4b15; font-size:16px;"></i> Ver Itens da Mesa
      </button>
      <button onclick="window.abrirCardapioComMesa('${nomeMesa}')" style="display:flex; align-items:center; gap:8px; padding:10px 12px; border:none; background:transparent; font-size:13px; font-weight:700; color:#0f172a; cursor:pointer; border-radius:8px; text-align:left;">
        <i class="ph-bold ph-plus-circle" style="color:#6366f1; font-size:16px;"></i> Lançar Itens
      </button>
      <button onclick="window.abrirModalPagamentoParcial('${nomeMesa}')" style="display:flex; align-items:center; gap:8px; padding:10px 12px; border:none; background:transparent; font-size:13px; font-weight:700; color:#0f172a; cursor:pointer; border-radius:8px; text-align:left;">
        <i class="ph-bold ph-currency-dollar" style="color:#10b981; font-size:16px;"></i> Pagamento Parcial
      </button>
      <button onclick="window.abrirCheckoutMesa('${nomeMesa}')" style="display:flex; align-items:center; gap:8px; padding:10px 12px; border:none; background:transparent; font-size:13px; font-weight:700; color:#0f172a; cursor:pointer; border-radius:8px; text-align:left;">
        <i class="ph-bold ph-check-circle" style="color:#10b981; font-size:16px;"></i> Fechar Conta
      </button>
    `;

    popup.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    popup.style.top = Math.min(y, window.innerHeight - 200) + 'px';
    popup.style.display = 'flex';
  };
  