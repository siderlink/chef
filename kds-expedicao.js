/**
 * Maestro KDS - Agrupador de Produção e Tela de Expedição (Pass)
 * Trazendo inteligência de lote e velocidade para o fluxo da cozinha.
 */

const socket = io();
let pedidosCache = [];

const DONE_STATUSES = ['Finalizado', 'Cancelado', 'Entregue', 'Pago', 'Fracionado'];

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  startClock();
  fetchPedidos();

  // Escutar atualizações via Socket.io
  socket.on('pedidos_atualizados', (data) => {
    pedidosCache = Array.isArray(data) ? data : [];
    renderAllViews();
  });

  socket.on('pedido_adicionado', (pedido) => {
    if (!DONE_STATUSES.includes(pedido.status)) {
      pedidosCache.push(pedido);
      renderAllViews();
    }
  });

  socket.on('pedido_status_alterado', ({ id, status }) => {
    const p = pedidosCache.find(x => x.id == id);
    if (p) {
      p.status = status;
      if (DONE_STATUSES.includes(status)) {
        pedidosCache = pedidosCache.filter(x => x.id != id);
      }
      renderAllViews();
    }
  });
});

// Inicializar navegação entre abas
function initTabs() {
  document.querySelectorAll('.kds-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.kds-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.kds-view').forEach(v => v.classList.remove('active'));

      const target = e.currentTarget;
      target.classList.add('active');
      document.getElementById(target.dataset.target).classList.add('active');
    });
  });
}

function startClock() {
  const clockEl = document.getElementById('kds-clock');
  setInterval(() => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('pt-BR');
  }, 1000);
}

// Buscar pedidos iniciais da API
function fetchPedidos() {
  const restId = localStorage.getItem('restaurante_id') || '1';
  fetch(`/api/pedidos?restaurante_id=${encodeURIComponent(restId)}`)
    .then(r => r.json())
    .then(data => {
      pedidosCache = data.filter(p => !DONE_STATUSES.includes(p.status));
      renderAllViews();
    })
    .catch(err => console.error('Erro ao buscar pedidos:', err));
}

function renderAllViews() {
  renderProducaoLote();
  renderExpedicao();
}

// ==========================================
// VIEW: AGRUPADOR DE PRODUÇÃO (LOTE)
// ==========================================
function renderProducaoLote() {
  const grid = document.getElementById('production-grid');
  
  // Agrupar por nome do produto
  const lote = {};
  pedidosCache.forEach(p => {
    // Filtrar apenas pedidos que NÃO estão "Pronto"
    if (p.status === 'Pronto' || p.status === 'Prontos') return;

    const nome = (p.productName || p.nome || 'Produto Sem Nome').trim();
    const qty = parseFloat(p.quantity || p.quantidade || 1);
    
    if (!lote[nome]) {
      lote[nome] = { count: 0, items: [] };
    }
    lote[nome].count += qty;
    lote[nome].items.push(p);
  });

  // Ordenar por quantidade decrescente
  const sortedLote = Object.entries(lote).sort((a, b) => b[1].count - a[1].count);

  if (sortedLote.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--kds-muted);">Nenhum item pendente para produção.</div>`;
    return;
  }

  grid.innerHTML = sortedLote.map(([nome, data]) => `
    <div class="prod-card">
      <div class="prod-info">
        <h3>${nome}</h3>
        <p>${data.items.length} pedidos pendentes</p>
      </div>
      <div class="prod-qty">${data.count}</div>
    </div>
  `).join('');
}


// ==========================================
// VIEW: TELA DE EXPEDIÇÃO (PASS)
// ==========================================
function renderExpedicao() {
  const grid = document.getElementById('pass-grid');

  // Agrupar por Mesa ou Local
  const tickets = {};
  pedidosCache.forEach(p => {
    const local = (p.localName || p.mesa_comanda || `Pedido #${p.id || '?'}`).trim();
    if (!tickets[local]) {
      tickets[local] = {
        localName: local,
        items: [],
        timestamp: p.timestamp || p.created_at || Date.now()
      };
    }
    tickets[local].items.push(p);
  });

  // Ordenar tickets pelo mais antigo
  const sortedTickets = Object.values(tickets).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  if (sortedTickets.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--kds-muted);">Nenhum pedido na fila de expedição.</div>`;
    return;
  }

  grid.innerHTML = sortedTickets.map(ticket => {
    const totalItems = ticket.items.length;
    const readyItems = ticket.items.filter(i => i.status === 'Pronto' || i.status === 'Prontos').length;
    const isTicketReady = (totalItems === readyItems) && totalItems > 0;
    
    // Calcular tempo decorrido
    const tStart = new Date(ticket.timestamp).getTime();
    const diffMin = Math.floor((Date.now() - tStart) / 60000);
    const isUrgent = diffMin > 20; // 20 minutos

    return `
      <div class="ticket ${isTicketReady ? 'ready' : ''}" data-local="${ticket.localName}">
        <div class="ticket-header">
          <div>
            <h2 class="ticket-title">${ticket.localName}</h2>
            <div class="ticket-meta">
              <i class="ph-bold ph-shopping-bag"></i> ${readyItems} / ${totalItems} Prontos
            </div>
          </div>
          <div class="ticket-timer ${isUrgent ? 'urgent' : ''}">${diffMin}m</div>
        </div>
        
        <div class="ticket-items">
          ${ticket.items.map(item => {
            const isPronto = item.status === 'Pronto' || item.status === 'Prontos';
            return `
              <div class="ticket-item ${isPronto ? 'done' : ''}" onclick="toggleStatus(${item.id}, '${isPronto ? 'Em preparo' : 'Pronto'}')">
                <div class="item-name">
                  <i class="ph-bold ${isPronto ? 'ph-check-circle' : 'ph-circle'}"></i>
                  <span>${item.productName || item.nome || 'Item'}</span>
                </div>
                <div class="item-qty">x${item.quantity || 1}</div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="ticket-footer">
          <button class="btn-despachar" onclick="despacharTicket('${ticket.localName}')">
            <i class="ph-bold ph-paper-plane-tilt"></i> Despachar
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Alterar status de um item específico
window.toggleStatus = function(id, novoStatus) {
  // Otimista (UX instantâneo)
  const p = pedidosCache.find(x => x.id == id);
  if (p) p.status = novoStatus;
  renderAllViews();

  // Enviar ao servidor
  socket.emit('atualizar_status', { id, status: novoStatus });
};

// Despachar todos os itens de um ticket
window.despacharTicket = function(localName) {
  const items = pedidosCache.filter(p => {
    const local = (p.localName || p.mesa_comanda || `Pedido #${p.id || '?'}`).trim();
    return local === localName;
  });

  items.forEach(item => {
    // Remover localmente para UX rápido
    pedidosCache = pedidosCache.filter(x => x.id !== item.id);
    // Enviar ao servidor como Finalizado/Entregue
    socket.emit('atualizar_status', { id: item.id, status: 'Entregue' });
  });

  renderAllViews();
};
