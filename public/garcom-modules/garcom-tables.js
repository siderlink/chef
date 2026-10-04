// --- CONTEXT MENU (MANTER PRESSIONADO) ---
let garcomLongPressFiredAt = 0;

function garcomWasLongPress() {
  return (Date.now() - garcomLongPressFiredAt) < 500;
}

function showGarcomContextMenu(x, y, items) {
  hideGarcomContextMenu();
  let menu = document.getElementById('garcom-context-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'garcom-context-menu';
    document.body.appendChild(menu);
  }

  const isDark = document.body.classList.contains('dark-mode');
  menu.style.cssText = `display:none; position:fixed; z-index:10050; background:${isDark ? '#1a1f2e' : '#ffffff'}; border-radius:16px; box-shadow:0 16px 40px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.1); border:1px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0'}; min-width:240px; max-width:300px; overflow:hidden; padding:6px; user-select:none; font-family:inherit; color:${isDark ? '#f8fafc' : '#0f172a'};`;

  const borderSub = isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9';
  const textMuted = isDark ? '#94a3b8' : '#334155';
  const hoverBg = isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9';

  menu.innerHTML = items.map((it, i) => {
    if (it.sep) return `<div style="border-top:1px solid ${borderSub}; margin:4px 0;"></div>`;
    return `<button data-idx="${i}" style="width:100%; text-align:left; padding:10px 12px; background:none; border:none; border-radius:8px; font-size:13.5px; font-weight:600; color:${it.color || textMuted}; cursor:pointer; display:flex; align-items:center; gap:10px; transition:0.15s;"
                    onmouseenter="this.style.background='${hoverBg}'" onmouseleave="this.style.background='none'">
      <i class="ph ${it.icon || 'ph-circle'}" style="color:${it.color || textMuted}; font-size:18px;"></i> ${it.label}
    </button>`;
  }).join('');

  const menuW = 260;
  const menuH = Math.min(items.length, 12) * 44 + 12;
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - menuW - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - menuH - 8)) + 'px';
  menu.style.display = 'block';

  menu.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = items[+btn.dataset.idx];
      hideGarcomContextMenu();
      if (item && item.callback) item.callback();
    });
  });

  setTimeout(() => {
    const close = (e) => {
      if (e.target && menu.contains(e.target)) return;
      if (Date.now() - garcomLongPressFiredAt < 700) return;
      hideGarcomContextMenu();
      document.removeEventListener('touchstart', close);
      document.removeEventListener('click', close);
      document.removeEventListener('scroll', close, true);
    };
    document.addEventListener('touchstart', close, { passive: true });
    document.addEventListener('click', close);
    document.addEventListener('scroll', close, true);
  }, 50);
}

function hideGarcomContextMenu() {
  const menu = document.getElementById('garcom-context-menu');
  if (menu) menu.style.display = 'none';
}

function bindLongPressDelegated(containerEl, targetSelector, handler, duration = 450) {
  if (!containerEl || containerEl._garcomLpBound) return;
  containerEl._garcomLpBound = true;
  let timer = null;
  let startX = 0, startY = 0;
  const start = (e) => {
    if (e.target && e.target.closest && e.target.closest('button')) return;
    const el = (e.target && e.target.closest) ? e.target.closest(targetSelector) : null;
    if (!el || !containerEl.contains(el)) return;
    const t = (e.touches && e.touches[0]) || e;
    startX = t.clientX;
    startY = t.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      garcomLongPressFiredAt = Date.now();
      handler(el, t.clientX, t.clientY, e);
    }, duration);
  };
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const move = (e) => {
    if (!timer) return;
    const t = (e.touches && e.touches[0]) || e;
    if (Math.abs(t.clientX - startX) > 12 || Math.abs(t.clientY - startY) > 12) {
      clearTimeout(timer);
      timer = null;
    }
  };
  containerEl.addEventListener('touchstart', start, { passive: true });
  containerEl.addEventListener('touchend', cancel);
  containerEl.addEventListener('touchmove', move, { passive: true });
  containerEl.addEventListener('touchcancel', cancel);
  containerEl.addEventListener('mousedown', start);
  containerEl.addEventListener('mousemove', move);
  containerEl.addEventListener('mouseup', cancel);
  containerEl.addEventListener('mouseleave', cancel);

  containerEl.addEventListener('contextmenu', (e) => {
    if (e.target && e.target.closest && e.target.closest('button')) return;
    const el = (e.target && e.target.closest) ? e.target.closest(targetSelector) : null;
    if (!el || !containerEl.contains(el)) return;
    e.preventDefault();
    if (Date.now() - garcomLongPressFiredAt < 700) return;
    const t = (e.touches && e.touches[0]) || e;
    garcomLongPressFiredAt = Date.now();
    handler(el, t.clientX, t.clientY, e);
  }, { passive: false });
}

function garcomOperador() {
  return loggedUser ? (loggedUser.nome || 'Garçom') : 'Garçom';
}

let pickMesaCallback = null;
function openPickMesaModal(title, excludeName, cb) {
  pickMesaCallback = cb;
  const modal = document.getElementById('pick-mesa-modal');
  if (!modal) return;
  document.getElementById('pick-mesa-title').innerText = title;
  const list = document.getElementById('pick-mesa-list');
  const others = MESAS.filter(m => m.nome !== excludeName);
  if (others.length === 0) {
    list.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:24px 8px; font-weight:600;">Nenhuma outra mesa disponível.</div>';
  } else {
    list.innerHTML = others.map((m, i) => {
      const isOcupada = m.status === 'Ocupada';
      const isReservada = m.status === 'Reservada';
      const color = isOcupada ? '#dc2626' : (isReservada ? '#2563eb' : '#16a34a');
      const label = isOcupada ? 'Ocupada' : (isReservada ? 'Reservada' : 'Livre');
      return `<button data-idx="${i}" style="width:100%; display:flex; justify-content:space-between; align-items:center; padding:14px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; cursor:pointer;">
        <span style="font-weight:800; font-size:16px; color:#0f172a;">${escHtml(m.nome)}</span>
        <span style="font-size:12px; font-weight:700; color:${color};">${label}</span>
      </button>`;
    }).join('');
    list.querySelectorAll('button[data-idx]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mesa = others[+btn.dataset.idx];
        const cb = pickMesaCallback;
        window.closePickMesaModal();
        if (mesa && cb) cb(mesa.nome);
      });
    });
  }
  modal.style.display = 'flex';
}

window.closePickMesaModal = () => {
  pickMesaCallback = null;
  const modal = document.getElementById('pick-mesa-modal');
  if (modal) modal.style.display = 'none';
};

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

window.openTableContextMenu = (mesa, x, y) => {
  const isReserved = mesa.status === 'Reservada';
  const isOccupied = mesa.status === 'Ocupada';
  const items = [];

  items.push({
    label: 'Ver Conta Parcial',
    icon: 'ph-receipt',
    color: '#fc4b15',
    callback: () => {
      window.pendingShowBill = true;
      currentTable = mesa.nome;
      localStorage.setItem('chef_last_mesa', currentTable);
      socket.emit('get_itens_mesa', mesa.nome);
    }
  });

  items.push({
    label: 'Pedir Conta',
    icon: 'ph-calculator',
    color: '#f2a900',
    callback: () => {
      if (confirm('Solicitar fechamento da mesa no caixa?')) {
        socket.emit('alerta_pedir_conta', mesa.nome);
        showToast('Fechamento solicitado!', '#f2c94c');
      }
    }
  });

  if (isReserved) {
    items.push({
      label: 'Cancelar Reserva',
      icon: 'ph-calendar-x',
      color: '#ef4444',
      callback: () => {
        if (confirm('Cancelar a reserva e liberar a mesa?')) {
          socket.emit('cancelar_reserva', { mesaName: mesa.nome });
          showToast('Reserva cancelada', '#ef4444');
        }
      }
    });
  } else {
    items.push({
      label: 'Reservar Mesa',
      icon: 'ph-calendar-check',
      color: '#3b82f6',
      callback: () => {
        const obs = prompt(`Reservar a mesa ${mesa.nome}.\nCliente / observação:`);
        if (obs === null) return;
        socket.emit('reservar_mesa', {
          mesaName: mesa.nome,
          observacao: JSON.stringify({ cliente: obs, data: '', obs })
        });
        showToast(`Mesa ${mesa.nome} reservada!`);
      }
    });
  }

  items.push({
    label: 'Atribuir Cliente à Mesa',
    icon: 'ph-user-plus',
    color: '#0ea5e9',
    callback: () => window.openAssignClientModal(mesa)
  });

  items.push({ sep: true });

  items.push({
    label: 'Juntar Mesas',
    icon: 'ph-link-simple',
    color: '#8b5cf6',
    callback: () => {
      openPickMesaModal(`Juntar a mesa ${mesa.nome} com:`, mesa.nome, (target) => {
        if (confirm(`Juntar a mesa ${mesa.nome} com a ${target}?`)) {
          socket.emit('juntar_mesas', { mesaA: mesa.nome, mesaB: target, operador: garcomOperador() });
          showToast(`Mesas ${mesa.nome} e ${target} unidas`);
        }
      });
    }
  });

  items.push({
    label: 'Transferir Itens',
    icon: 'ph-arrows-left-right',
    color: '#f97316',
    callback: () => {
      openPickMesaModal(`Mover itens da mesa ${mesa.nome} para:`, mesa.nome, (target) => {
        if (confirm(`Mover TODOS os itens da mesa ${mesa.nome} para a ${target}? (mesa ficará livre)`)) {
          socket.emit('transferir_mesas_itens', { mesaA: mesa.nome, mesaB: target, operador: garcomOperador() });
          showToast(`Itens movidos para a ${target}`);
        }
      });
    }
  });

  if (isOccupied) {
    items.push({
      label: 'Transferir Mesa',
      icon: 'ph-swap',
      color: '#ef4444',
      callback: () => {
        openPickMesaModal(`Transferir a ocupação da mesa ${mesa.nome} para:`, mesa.nome, (target) => {
          if (confirm(`Transferir a ocupação da mesa ${mesa.nome} para a ${target}?`)) {
            socket.emit('transferir_mesa', { mesaAtual: mesa.nome, novaMesa: target, operador: garcomOperador() });
            showToast(`Mesa transferida para a ${target}`);
          }
        });
      }
    });
  }

  showGarcomContextMenu(x, y, items);
};

window.openBillItemContextMenu = (item, x, y) => {
  const isPaid = item.status === 'Pago';
  const fraction = billSelectedItems.get(item.id) || 0;
  const items = [];

  if (!isPaid) {
    items.push({
      label: fraction === 0.5 ? 'Voltar ao Total' : 'Rachar Metade',
      icon: 'ph-scissors',
      color: '#8b5cf6',
      callback: () => splitItemFraction(item.id)
    });
    items.push({
      label: fraction > 0 ? 'Desmarcar da Seleção' : 'Selecionar p/ Pagamento',
      icon: 'ph-check-square-offset',
      color: '#fc4b15',
      callback: () => toggleBillItem(item.id)
    });
    items.push({
      label: 'Marcar como Entregue',
      icon: 'ph-check-circle',
      color: '#16a34a',
      callback: () => {
        socket.emit('marcar_entregue', { id: item.id, userName: garcomOperador() });
        socket.emit('get_itens_mesa', currentTable);
        showToast('Item marcado como entregue!', '#16a34a');
      }
    });
  }

  items.push({
    label: 'Mover para Comanda',
    icon: 'ph-user',
    color: '#3b82f6',
    callback: () => {
      const nome = prompt('Digite o nome da comanda (deixe vazio para consumo da mesa):');
      if (nome === null) return;
      socket.emit('atribuir_comanda_item', { itemId: item.id, comandaName: nome.trim() || null, operador: garcomOperador() });
      socket.emit('get_itens_mesa', currentTable);
      showToast('Item movido para comanda');
    }
  });

  items.push({
    label: 'Transferir p/ Outra Mesa',
    icon: 'ph-arrows-left-right',
    color: '#f97316',
    callback: () => {
      openPickMesaModal('Transferir este item para:', currentTable, (target) => {
        if (confirm(`Transferir este item para a ${target}?`)) {
          socket.emit('transferir_item', { itemId: item.id, novaMesa: target, operador: garcomOperador() });
          showToast(`Item transferido para a ${target}`);
        }
      });
    }
  });

  if (!isPaid) {
    items.push({ sep: true });
    items.push({
      label: 'Estornar / Remover Item',
      icon: 'ph-trash',
      color: '#ef4444',
      callback: () => {
        if (confirm('Remover este item da conta da mesa?\nAção exige senha de gerente no caixa e não pode ser desfeita.')) {
          socket.emit('remover_item_pedido', {
            orderId: item.id,
            mesaName: currentTable,
            usuario: garcomOperador(),
            motivo: 'Removido pelo garçom (Comanda Mobile)'
          });
          showToast('Item removido!', '#ef4444');
        }
      }
    });
  }

  showGarcomContextMenu(x, y, items);
};

window.openProductContextMenu = (prod, x, y) => {
  showGarcomContextMenu(x, y, [
    {
      label: 'Ver Detalhes',
      icon: 'ph-eye',
      color: '#3b82f6',
      callback: () => openDetails(prod.id)
    },
    {
      label: 'Adicionar 1 ao Pedido',
      icon: 'ph-plus-circle',
      color: '#16a34a',
      callback: () => addDirectToCart(prod.id)
    }
  ]);
};

// --- ATRIBUIR CLIENTE À MESA ---
window.openAssignClientModal = (mesa) => {
  window._assignClientMesa = mesa.nome;
  document.getElementById('assign-client-table').innerText = mesa.nome;
  document.getElementById('assign-client-name').value = '';
  document.getElementById('assign-client-phone').value = '';
  document.getElementById('assign-client-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('assign-client-name').focus(), 100);
};

window.closeAssignClientModal = () => {
  document.getElementById('assign-client-modal').style.display = 'none';
  window._assignClientMesa = null;
};

window.submitAssignClient = () => {
  const mesa = window._assignClientMesa;
  const nome = document.getElementById('assign-client-name').value.trim();
  const telefone = document.getElementById('assign-client-phone').value.trim();
  if (!mesa) return;
  if (!nome) {
    alert('Digite o nome do cliente.');
    return;
  }
  socket.emit('cliente_entrou_mesa', { mesa, cliente: { id: null, nome, telefone } });
  showToast(`Cliente ${nome} atribuído à mesa ${mesa}`);
  window.closeAssignClientModal();
};

// --- BIND DE MANTER PRESSIONADO ---
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('tables-grid');
  if (grid) bindLongPressDelegated(grid, '.table-card', (el, x, y) => {
    const idx = [...grid.children].indexOf(el);
    const mesa = MESAS[idx];
    if (mesa) window.openTableContextMenu(mesa, x, y);
  });

  const billList = document.getElementById('bill-items-list');
  if (billList) bindLongPressDelegated(billList, '.bill-item-row', (el, x, y) => {
    const id = el.getAttribute('data-item-id');
    const item = billItems.find(i => String(i.id) === String(id));
    if (item) window.openBillItemContextMenu(item, x, y);
  });

  const pessoasList = document.getElementById('bill-pessoas-items-list');
  if (pessoasList) bindLongPressDelegated(pessoasList, '[data-item-id]', (el, x, y) => {
    const id = el.getAttribute('data-item-id');
    const item = billItems.find(i => String(i.id) === String(id));
    if (item) window.openBillItemContextMenu(item, x, y);
  });

  const menuList = document.getElementById('menu-list');
  if (menuList) bindLongPressDelegated(menuList, '.menu-item', (el, x, y) => {
    const id = el.getAttribute('data-menu-id');
    const prod = MENU.find(m => String(m.id) === String(id));
    if (prod) window.openProductContextMenu(prod, x, y);
  });
});

// --- Tables Logic & Fast Search/Sector Filters ---
window.mesaSearchTerm = '';
window.mesaCurrentSector = 'todas';

window.filtrarMesasPorTermo = function(termo) {
  window.mesaSearchTerm = (termo || '').toLowerCase().trim();
  const btnLimpar = document.getElementById('btn-limpar-busca-mesas');
  if (btnLimpar) btnLimpar.style.display = window.mesaSearchTerm ? 'block' : 'none';
  renderTables();
};

window.limparBuscaMesas = function() {
  window.mesaSearchTerm = '';
  const input = document.getElementById('input-busca-mesas');
  if (input) input.value = '';
  const btnLimpar = document.getElementById('btn-limpar-busca-mesas');
  if (btnLimpar) btnLimpar.style.display = 'none';
  renderTables();
};

window.filtrarSetorMesa = function(setor) {
  window.mesaCurrentSector = setor || 'todas';
  document.querySelectorAll('#garcom-sector-pills .sector-pill').forEach(btn => {
    if (btn.getAttribute('data-sector') === window.mesaCurrentSector) {
      btn.classList.add('active');
      btn.style.background = '#fc4b15';
      btn.style.color = '#ffffff';
      btn.style.borderColor = '#fc4b15';
    } else {
      btn.classList.remove('active');
      btn.style.background = 'var(--g-card-bg, #ffffff)';
      btn.style.color = 'var(--g-text, #475569)';
      btn.style.borderColor = 'var(--g-border, #e2e8f0)';
    }
  });
  renderTables();
};

function atualizarPillsSetoresMesas() {
  const container = document.getElementById('garcom-sector-pills');
  if (!container || !Array.isArray(MESAS)) return;
  
  const salasSet = new Set();
  MESAS.forEach(m => {
    if (m.sala && m.sala.trim() && m.sala.trim() !== 'Salão principal') {
      salasSet.add(m.sala.trim());
    }
  });

  const totalMesas = MESAS.length;
  const totalOcupadas = MESAS.filter(m => m.status === 'Ocupada').length;
  const totalLivres = MESAS.filter(m => m.status === 'Disponível' || m.status === 'Livre').length;

  let html = `
    <button type="button" class="sector-pill ${window.mesaCurrentSector === 'todas' ? 'active' : ''}" onclick="window.filtrarSetorMesa('todas')" data-sector="todas"
      style="white-space:nowrap; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:700; border:1.5px solid ${window.mesaCurrentSector === 'todas' ? '#fc4b15' : 'var(--g-border, #e2e8f0)'}; background:${window.mesaCurrentSector === 'todas' ? '#fc4b15' : 'var(--g-card-bg, #ffffff)'}; color:${window.mesaCurrentSector === 'todas' ? '#ffffff' : 'var(--g-text, #475569)'}; cursor:pointer;">
      Todas (${totalMesas})
    </button>
    <button type="button" class="sector-pill ${window.mesaCurrentSector === 'ocupadas' ? 'active' : ''}" onclick="window.filtrarSetorMesa('ocupadas')" data-sector="ocupadas"
      style="white-space:nowrap; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:700; border:1.5px solid ${window.mesaCurrentSector === 'ocupadas' ? '#fc4b15' : 'var(--g-border, #e2e8f0)'}; background:${window.mesaCurrentSector === 'ocupadas' ? '#fc4b15' : 'var(--g-card-bg, #ffffff)'}; color:${window.mesaCurrentSector === 'ocupadas' ? '#ffffff' : 'var(--g-text, #475569)'}; cursor:pointer;">
      Ocupadas (${totalOcupadas})
    </button>
    <button type="button" class="sector-pill ${window.mesaCurrentSector === 'livres' ? 'active' : ''}" onclick="window.filtrarSetorMesa('livres')" data-sector="livres"
      style="white-space:nowrap; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:700; border:1.5px solid ${window.mesaCurrentSector === 'livres' ? '#fc4b15' : 'var(--g-border, #e2e8f0)'}; background:${window.mesaCurrentSector === 'livres' ? '#fc4b15' : 'var(--g-card-bg, #ffffff)'}; color:${window.mesaCurrentSector === 'livres' ? '#ffffff' : 'var(--g-text, #475569)'}; cursor:pointer;">
      Livres (${totalLivres})
    </button>
  `;

  salasSet.forEach(sala => {
    const isAct = window.mesaCurrentSector === sala;
    const countSala = MESAS.filter(m => m.sala === sala).length;
    html += `
      <button type="button" class="sector-pill ${isAct ? 'active' : ''}" onclick="window.filtrarSetorMesa('${escHtml(sala)}')" data-sector="${escHtml(sala)}"
        style="white-space:nowrap; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:700; border:1.5px solid ${isAct ? '#fc4b15' : 'var(--g-border, #e2e8f0)'}; background:${isAct ? '#fc4b15' : 'var(--g-card-bg, #ffffff)'}; color:${isAct ? '#ffffff' : 'var(--g-text, #475569)'}; cursor:pointer;">
        ${escHtml(sala)} (${countSala})
      </button>
    `;
  });

  container.innerHTML = html;
}

function renderTables() {
  const grid = document.getElementById('tables-grid');
  const empty = document.getElementById('tables-empty');
  grid.innerHTML = '';
  
  if (MESAS.length === 0) {
    grid.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  grid.style.display = '';
  if (empty) empty.style.display = 'none';

  // ─── FILTRO POR BUSCA E SETOR/SALA ───
  let mesasFiltradas = [...MESAS];
  
  if (window.mesaSearchTerm) {
    mesasFiltradas = mesasFiltradas.filter(m => {
      const nomeMatch = (m.nome || '').toLowerCase().includes(window.mesaSearchTerm);
      const obsMatch = (m.observacao || '').toLowerCase().includes(window.mesaSearchTerm);
      const salaMatch = (m.sala || '').toLowerCase().includes(window.mesaSearchTerm);
      return nomeMatch || obsMatch || salaMatch;
    });
  }

  if (window.mesaCurrentSector && window.mesaCurrentSector !== 'todas') {
    if (window.mesaCurrentSector === 'ocupadas') {
      mesasFiltradas = mesasFiltradas.filter(m => m.status === 'Ocupada');
    } else if (window.mesaCurrentSector === 'livres') {
      mesasFiltradas = mesasFiltradas.filter(m => m.status === 'Disponível' || m.status === 'Livre');
    } else {
      mesasFiltradas = mesasFiltradas.filter(m => (m.sala || 'Salão principal') === window.mesaCurrentSector);
    }
  }

  // ─── APLICAR ORDENAÇÃO SALVA ───
  let mesasOrdenadas = mesasFiltradas;
  const sortType = (function() { try { return localStorage.getItem('garcom_mesa_sort') || 'num_asc'; } catch(e) { return 'num_asc'; } })();
  
  if (sortType === 'status_ocupadas' || sortType === 'status') {
    const ordem = { 'Ocupada': 0, 'Reservada': 1, 'Disponível': 2, 'Livre': 2 };
    mesasOrdenadas.sort((a, b) => (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9));
  } else if (sortType === 'status_livres') {
    const ordem = { 'Disponível': 0, 'Livre': 0, 'Reservada': 1, 'Ocupada': 2 };
    mesasOrdenadas.sort((a, b) => (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9));
  } else if (sortType === 'valor_desc' || sortType === 'valor') {
    mesasOrdenadas.sort((a, b) => (b._total || 0) - (a._total || 0));
  } else if (sortType === 'num_desc') {
    mesasOrdenadas.sort((a, b) => {
      const na = parseInt((a.nome || '').replace(/\D/g, '')) || 0;
      const nb = parseInt((b.nome || '').replace(/\D/g, '')) || 0;
      return na !== nb ? nb - na : (b.nome || '').localeCompare(a.nome || '');
    });
  } else if (sortType === 'nome_asc') {
    mesasOrdenadas.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  } else {
    // num_asc (padrão)
    mesasOrdenadas.sort((a, b) => {
      const na = parseInt((a.nome || '').replace(/\D/g, '')) || 0;
      const nb = parseInt((b.nome || '').replace(/\D/g, '')) || 0;
      return na !== nb ? na - nb : (a.nome || '').localeCompare(b.nome || '');
    });
  }

  if (mesasOrdenadas.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #94a3b8; padding: 30px 10px; font-weight: 600;"><i class="ph ph-magnifying-glass" style="font-size: 32px; display: block; margin-bottom: 6px;"></i>Nenhuma mesa encontrada com o filtro atual.</div>';
    return;
  }

  // Aplicar layout salvo
  const layout = (function() { try { return localStorage.getItem('garcom_mesa_layout') || 'auto'; } catch(e) { return 'auto'; } })();
  if (layout === 'list') grid.style.gridTemplateColumns = '1fr';
  else if (layout === 'compacto') grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
  else grid.style.gridTemplateColumns = 'repeat(2, 1fr)';

  mesasOrdenadas.forEach(mesa => {
    const card = document.createElement('div');
    card.className = 'table-card';
    if (mesa.status === 'Ocupada') card.classList.add('ocupada');
    if (mesa.status === 'Reservada') card.classList.add('reservada');
    
    card.style.position = 'relative';
    
    let cartIndicator = '';
    try {
      const savedCartStr = localStorage.getItem(`chef_cart_${mesa.nome}`);
      if (savedCartStr) {
        const savedCart = JSON.parse(savedCartStr);
        if (Array.isArray(savedCart) && savedCart.length > 0) {
          const badgeCount = savedCart.reduce((sum, i) => sum + i.quantity, 0);
          cartIndicator = `<div class="cart-badge">${badgeCount} <i class="ph ph-shopping-cart"></i></div>`;
        }
      }
    } catch(e){}

    if (contasSolicitadas.has(mesa.nome)) {
      cartIndicator += `<div class="bill-requested-icon" title="Conta Solicitada"><i class="ph ph-receipt"></i></div>`;
    }

    card.innerHTML = `
      ${cartIndicator}
      <i class="ph ph-armchair"></i>
      <span>${escHtml(mesa.nome)}</span>
    `;
    card.onclick = () => {
      if (garcomWasLongPress()) return;
      currentTable = mesa.nome;
      localStorage.setItem('chef_last_mesa', currentTable);
      if (mesa.status === 'Ocupada' || mesa.status === 'Reservada') {
        openTableOptions(mesa);
      } else {
        loadCart(mesa.nome);
        showView('menu', `Pedido: ${mesa.nome}`);
        renderMenu();
      }
    };
    grid.appendChild(card);
  });

  // Atualizar seletor visual
  const sel = document.getElementById('select-garcom-mesa-sort');
  if (sel && sel.value !== sortType) sel.value = sortType;
}

function loadCart(mesaName) {
  try {
    const saved = localStorage.getItem(`chef_cart_${mesaName}`);
    cart = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(cart)) cart = [];
  } catch(e) { cart = []; }
  updateCartBadge();
}

function saveCart(mesaName) {
  try {
    if (Array.isArray(cart) && cart.length > 0) {
      localStorage.setItem(`chef_cart_${mesaName}`, JSON.stringify(cart));
    } else {
      localStorage.removeItem(`chef_cart_${mesaName}`);
    }
  } catch(e) { console.error('Erro ao salvar', e); }
}

window.openTableOptions = (mesa) => {
  currentTable = mesa.nome;
  localStorage.setItem('chef_last_mesa', currentTable);
  window.pendingShowBill = false;
  socket.emit('get_itens_mesa', mesa.nome);
  document.getElementById('options-table-name').innerText = mesa.nome;
  showView('table-options', 'Opções da Mesa');
  
  document.getElementById('btn-opt-add').onclick = () => {
    loadCart(mesa.nome);
    showView('menu', `Pedido: ${mesa.nome}`);
    renderMenu();
  };

  document.getElementById('btn-opt-qr').onclick = () => {
    startQRScanner(mesa.nome);
  };
  
  document.getElementById('btn-opt-view').onclick = () => {
    window.pendingShowBill = true;
    socket.emit('get_itens_mesa', mesa.nome);
  };
  
  document.getElementById('btn-opt-bill').onclick = () => {
    if(confirm('Solicitar fechamento da mesa no caixa?')) {
      socket.emit('alerta_pedir_conta', mesa.nome);
      showToast('Fechamento solicitado!', '#f2c94c');
      showView('tables', 'Comanda Mobile');
    }
  };

  const btnMostrarCliente = document.getElementById('btn-opt-mostrar-cliente');
  if (btnMostrarCliente) {
    btnMostrarCliente.onclick = () => {
      window.open('conta-cliente.html?mesa=' + encodeURIComponent(mesa.nome), '_blank');
    };
  }
};

socket.on('toque_pedir_conta', (mesaName) => {
  contasSolicitadas.add(mesaName);
  renderTables();
  showToast(`Conta solicitada: ${mesaName}`, '#f2c94c');
});

socket.on('sync_mesas_fechando', (list) => {
  contasSolicitadas.clear();
  list.forEach(m => contasSolicitadas.add(m));
  renderTables();
});

socket.on('itens_mesa_recebidos', (data) => {
  if (data.mesaName !== currentTable) return;
  const newItems = data.items.map(i => ({ ...i, totalVal: Number(i.total.replace(',','.')) }));
  window.activeComandas = [...new Set(newItems.map(i => i.mesa_comanda).filter(Boolean))];
  
  const isAlreadyInBill = document.getElementById('view-bill').classList.contains('active');
  billItems = newItems;
  
  if (isAlreadyInBill) {
    for (const [id, fraction] of billSelectedItems.entries()) {
      const found = billItems.find(i => i.id === id);
      if (!found || found.status === 'Pago') {
        billSelectedItems.delete(id);
      }
    }
    renderBillView();
  } else if (window.pendingShowBill) {
    window.pendingShowBill = false;
    billSplitCount = 1;
    billSelectedItems.clear();
    document.getElementById('bill-split-count').innerText = '1';
    document.getElementById('bill-service-fee').checked = true;
    document.getElementById('bill-table-name').innerText = currentTable;
    switchBillTab('pessoas');
    renderBillView();
    showView('bill', 'Conta Parcial');
  } else {
    // Just update items in background, do not redirect
  }
});
