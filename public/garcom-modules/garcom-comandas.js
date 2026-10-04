// --- INDIVIDUAL COMANDAS HELPERS ---
window.openNewComandaModal = () => {
  document.getElementById('new-comanda-modal').style.display = 'flex';
  document.getElementById('new-comanda-name').value = '';
  document.getElementById('new-comanda-phone').value = '';
  var hist = document.getElementById('cliente-historico');
  if (hist) { hist.style.display = 'none'; hist.innerHTML = ''; }

  // Preencher seletor de mesas
  const _sel = document.getElementById('new-comanda-mesa');
  if (_sel) {
    _sel.innerHTML = '<option value="">-- Sem mesa (comanda avulsa) --</option>';
    const _mesaAtual = (typeof currentTable !== 'undefined' ? currentTable : '') || '';
    ((typeof MESAS !== 'undefined' ? MESAS : [])).forEach(function(m) {
      const opt = document.createElement('option');
      opt.value = m.nome;
      const st = m.status === 'Ocupada' ? ' (Ocupada)' : m.status === 'Reservada' ? ' (Reservada)' : ' (Livre)';
      opt.textContent = m.nome + st;
      if (m.nome === _mesaAtual) opt.selected = true;
      _sel.appendChild(opt);
    });
  }
  setTimeout(function() { document.getElementById('new-comanda-name').focus(); }, 150);
};

window.closeNewComandaModal = () => {
  document.getElementById('new-comanda-modal').style.display = 'none';
  window.pendingComandaItemIdx = null;
};

window.submitNewComanda = () => {
  const name = document.getElementById('new-comanda-name').value.trim();
  const phone = document.getElementById('new-comanda-phone').value.trim();
  
  if (!name) {
    alert('Por favor, digite o nome do cliente ou identificador da comanda.');
    return;
  }
  // Telefone opcional para rapidez no salão; valida apenas se preenchido
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) {
      alert('Por favor, digite um telefone válido ou deixe o campo em branco.');
      return;
    }
  }
  
  window.newComandasMap = window.newComandasMap || new Map();
  window.newComandasMap.set(name, phone || '');
  
  if (window.pendingComandaItemIdx !== null && window.pendingComandaItemIdx !== undefined) {
    cart[window.pendingComandaItemIdx].mesa_comanda = name;
    saveCart(currentTable);
  }
  
  // Verificar mesa selecionada
  const _mesaSel = document.getElementById('new-comanda-mesa');
  const _mesaEscolhida = _mesaSel ? _mesaSel.value.trim() : '';

  if (window.pendingComandaItemIdx !== null && window.pendingComandaItemIdx !== undefined) {
    if (_mesaEscolhida && typeof currentTable !== 'undefined') currentTable = _mesaEscolhida;
    window.closeNewComandaModal();
    if (typeof renderCart === 'function') renderCart();
  } else if (_mesaEscolhida) {
    currentTable = _mesaEscolhida;
    try { localStorage.setItem('chef_last_mesa', currentTable); } catch(e) {}
    if (typeof loadCart === 'function') loadCart(_mesaEscolhida);
    window.closeNewComandaModal();
    if (typeof showView === 'function') showView('menu', 'Pedido: ' + _mesaEscolhida);
    if (typeof renderMenu === 'function') renderMenu();
    if (typeof showToast === 'function') showToast('Comanda aberta: ' + name + ' — ' + _mesaEscolhida, '#10b981');
  } else {
    window.closeNewComandaModal();
    if (typeof showToast === 'function') showToast('Comanda criada: ' + name, '#6366f1');
  }
};

window.changeItemComanda = (idx, value) => {
  if (value === '__NEW__') {
    window.pendingComandaItemIdx = idx;
    window.openNewComandaModal();
    renderCart();
  } else {
    cart[idx].mesa_comanda = value || null;
    saveCart(currentTable);
  }
};

// Auto-fill name when existing client's phone matches
document.addEventListener('DOMContentLoaded', () => {
  const phoneInput = document.getElementById('new-comanda-phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      const val = e.target.value;
      const digits = val.replace(/\D/g, '');
      if (digits.length >= 8) {
        socket.emit('buscar_cliente_telefone', digits);
      }
    });
  }
});

socket.on('cliente_telefone_encontrado', (data) => {
  const phoneInput = document.getElementById('new-comanda-phone');
  if (phoneInput) {
    const digits = phoneInput.value.replace(/\D/g, '');
    if (digits === data.telefone && data.nome) {
      document.getElementById('new-comanda-name').value = data.nome;
      const nameInput = document.getElementById('new-comanda-name');
      nameInput.style.borderColor = '#3ab55b';
      setTimeout(() => { nameInput.style.borderColor = '#ddd'; }, 1500);
      socket.emit('buscar_historico_cliente', { nome: data.nome, telefone: data.telefone });
    }
  }
});

socket.on('historico_cliente', (data) => {
  var container = document.getElementById('cliente-historico');
  if (!container) return;
  if (!data.historico || data.historico.length === 0) {
    container.innerHTML = '<div style="padding:8px 0;color:#999;font-size:12px;">Nenhum pedido anterior encontrado.</div>';
    container.style.display = 'block';
    return;
  }
  var html = '<div style="padding:8px 0;"><div style="font-size:11px;font-weight:800;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;"><i class="ph ph-clock-counter-clockwise"></i> Últimos pedidos:</div>';
  data.historico.forEach(function(p) {
    var tempo = p.createdAt ? chefFormatDate(p.createdAt) : '';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:12px;">' +
      '<div><span style="font-weight:700;">' + (p.productEmoji || '') + ' ' + p.productName + '</span> <span style="color:#94a3b8;">x' + p.quantity + '</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px;color:#94a3b8;"><span>' + tempo + '</span><span style="color:#16a34a;font-weight:700;">R$ ' + parseFloat(p.total || 0).toFixed(2).replace('.', ',') + '</span></div>' +
    '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
  container.style.display = 'block';
});
window.longPressTimer = null;
window.startLongPress = (e) => {
  window.longPressTimer = setTimeout(() => {
    window.longPressTimer = null;
    window.location.href = '/index.html';
  }, 2000);
};
window.cancelLongPress = (e) => {
  if (window.longPressTimer) {
    clearTimeout(window.longPressTimer);
    window.longPressTimer = null;
  }
};
window.endLongPress = (e) => {
  if (window.longPressTimer) {
    clearTimeout(window.longPressTimer);
    window.longPressTimer = null;
    if (typeof showView === 'function') {
      showView('tables', 'Comanda Mobile');
      if (typeof renderTables === 'function') renderTables();
    }
  }
};
