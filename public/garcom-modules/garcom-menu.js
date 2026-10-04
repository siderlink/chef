// --- Menu Logic ---
window.scrollToActiveTab = function() {
  const tabsContainer = document.getElementById('menu-tabs');
  if (!tabsContainer) return;
  setTimeout(() => {
    const activeTab = tabsContainer.querySelector('.tab.active');
    if (!activeTab) return;
    const containerWidth = tabsContainer.clientWidth;
    const tabLeft = activeTab.offsetLeft;
    const tabWidth = activeTab.offsetWidth;
    const targetScrollLeft = tabLeft - (containerWidth / 2) + (tabWidth / 2);
    tabsContainer.scrollTo({
      left: Math.max(0, targetScrollLeft),
      behavior: 'smooth'
    });
  }, 30);
};

window.renderMenu = function renderMenu() {
  const tabsContainer = document.getElementById('menu-tabs');
  tabsContainer.innerHTML = TABS.map(tab => `
    <div class="tab ${tab === currentTab ? 'active' : ''}" onclick="selectTab('${tab}')">${tab}</div>
  `).join('');
  window.scrollToActiveTab();

  const listContainer = document.getElementById('menu-list');
  const emptyMenu = document.getElementById('menu-empty');
  const query = window.garcomSearchQuery || '';
  let filtered = [];
  if (query.trim() !== '') {
    filtered = window.FuzzySearch.filter(MENU, query.trim(), (m) => [m.name, m.category || '']);
  } else if (currentTab === '⭐ Mais Pedidos' || currentTab === 'Mais Pedidos') {
    filtered = MENU.filter(m => m.destaque || m.popular || m.favorito || m.mais_vendido);
    if (filtered.length === 0) {
      filtered = MENU.slice(0, 15);
    }
  } else {
    filtered = MENU.filter(m => m.category === currentTab);
  }
  
  if (filtered.length === 0) {
    listContainer.innerHTML = '';
    if (emptyMenu) emptyMenu.style.display = 'block';
    return;
  }
  if (emptyMenu) emptyMenu.style.display = 'none';
  
  listContainer.innerHTML = filtered.map(item => `
    <div class="menu-item" data-menu-id="${item.id}" onclick="if(!garcomWasLongPress()) openDetails(${item.id})" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
      <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
        <div class="img-box">${escHtml(item.emoji)}</div>
        <div class="menu-item-info" style="flex:1; min-width:0;">
          <div class="menu-item-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(item.name)}</div>
          <div class="menu-item-price">R$ ${item.price.toFixed(2).replace('.', ',')}</div>
        </div>
      </div>
      <button type="button" onclick="event.stopPropagation(); window.adicionarDiretoOuDetalhes(${item.id})" 
        style="width:38px; height:38px; border-radius:12px; background:#fff7ed; border:1.5px solid #fdba74; color:#ea580c; font-size:18px; font-weight:800; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; box-shadow:0 1px 4px rgba(234,88,12,0.1);"
        title="Adicionar 1x ao pedido">
        <i class="ph-bold ph-plus"></i>
      </button>
    </div>
  `).join('');
};

window.adicionarDiretoOuDetalhes = function(id) {
  const prod = MENU.find(m => m.id === id);
  if (!prod) return;
  if (prod.tipo === 'montavel' || prod.has_composicoes) {
    window.openDetails(id);
  } else {
    window.addDirectToCart(id);
    try {
      if ('vibrate' in navigator) navigator.vibrate(60);
    } catch(e) {}
  }
};

window.selectTab = (tab) => {
  currentTab = tab;
  const searchInput = document.getElementById('garcom-search-product');
  if (searchInput && searchInput.value) {
    searchInput.value = '';
    window.garcomSearchQuery = '';
    const clearBtn = document.getElementById('garcom-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
  }
  renderMenu();
};

window.openDetails = (id) => {
  selectedProduct = MENU.find(m => m.id === id);
  selectedQty = 1;
  selectedAddons.clear();
  
  document.getElementById('detail-img').innerText = selectedProduct.emoji;
  document.getElementById('detail-name').innerText = selectedProduct.name;
  document.getElementById('detail-qty').innerText = selectedQty;
  document.getElementById('detail-obs').value = '';
  
  const addonsSec = document.getElementById('detail-addons');
  addonsSec.style.display = 'none';
  
  renderSuggestions(selectedProduct);
  updateDetailPrice();
  fetchGarcomMontavel(selectedProduct.id);
  showView('details', 'Detalhes do Item');
};

window.addDirectToCart = (id) => {
  const prod = MENU.find(m => m.id === id);
  if (!prod) return;
  cart.push({
    productName: prod.name,
    productEmoji: prod.emoji,
    sector: prod.sector,
    quantity: 1,
    obs: '',
    addons: [],
    total: prod.price,
    status: 'Recebido',
    localName: currentTable,
    userName: loggedUser.nome,
    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    createdAt: Date.now()
  });
  saveCart(currentTable);
  updateCartBadge();
  showToast(`${prod.name} adicionado ao carrinho!`, '#3ab55b');
};

function obterHarmonizacaoSommelier(product) {
  if (!product || !product.name) return null;
  const nomeLower = (product.name + ' ' + (product.category || '')).toLowerCase();
  
  const bebidas = MENU.filter(m => {
    const cat = (m.category || '').toLowerCase();
    return cat.includes('bebida') || cat.includes('vinho') || cat.includes('cerveja') || cat.includes('drink') || cat.includes('bar');
  });
  if (bebidas.length === 0) return null;

  let termoBusca = [];
  let motivo = '';

  if (nomeLower.includes('carne') || nomeLower.includes('bife') || nomeLower.includes('picanha') || nomeLower.includes('costela') || nomeLower.includes('burguer') || nomeLower.includes('hamburguer') || nomeLower.includes('churrasco')) {
    termoBusca = ['malbec', 'cabernet', 'tinto', 'ipa', 'chopp', 'preta', 'cerveja'];
    motivo = 'Harmonização Encorpada: taninos e lúpulo que quebram a gordura do corte e exaltam o sabor grelhado.';
  } else if (nomeLower.includes('peixe') || nomeLower.includes('salm') || nomeLower.includes('camar') || nomeLower.includes('frutos') || nomeLower.includes('salada') || nomeLower.includes('tilapia')) {
    termoBusca = ['branco', 'sauvignon', 'chardonnay', 'pilsen', 'gin', 'limonada', 'suco'];
    motivo = 'Harmonização Cítrica & Fresca: frescor límpido ideal para realçar notas marinhas e texturas delicadas.';
  } else if (nomeLower.includes('massa') || nomeLower.includes('pizza') || nomeLower.includes('lasanha') || nomeLower.includes('risoto')) {
    termoBusca = ['tinto', 'merlot', 'chianti', 'chopp', 'refrigerante'];
    motivo = 'Harmonização Clássica: acidez equilibrada que casa perfeitamente com molhos de tomate e queijos gratinados.';
  } else if (nomeLower.includes('sobremesa') || nomeLower.includes('torta') || nomeLower.includes('petit') || nomeLower.includes('pudim') || nomeLower.includes('brownie')) {
    termoBusca = ['porto', 'espresso', 'cafe', 'licor', 'doce'];
    motivo = 'Harmonização de Fechamento: notas tostadas aromáticas que complementam o cacau e a calda de açúcar.';
  } else {
    termoBusca = ['chopp', 'cerveja', 'suco', 'refrigerante', 'agua'];
    motivo = 'Sugestão do Chef: acompanhamento refrescante ideal para complementar este prato.';
  }

  let bebidaEncontrada = null;
  for (const t of termoBusca) {
    bebidaEncontrada = bebidas.find(b => b.name.toLowerCase().includes(t));
    if (bebidaEncontrada) break;
  }
  if (!bebidaEncontrada) bebidaEncontrada = bebidas[0];

  return { bebida: bebidaEncontrada, motivo: motivo };
}

function renderSuggestions(product) {
  const sugSection = document.getElementById('detail-suggestions');
  const sugList = document.getElementById('sugestoes-list');
  if (!sugSection || !sugList) return;

  const sommelier = obterHarmonizacaoSommelier(product);
  let pool = MENU.filter(m => m.category !== product.category && (!sommelier || m.id !== sommelier.bebida.id));
  pool = pool.sort(() => 0.5 - Math.random()).slice(0, 3);

  let html = '';
  if (sommelier && sommelier.bebida) {
    const b = sommelier.bebida;
    html += `
      <div class="suggestion-card sommelier-card" style="border: 2px solid #a855f7; background: linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%); min-width: 170px; position: relative;">
        <span style="position: absolute; top: 4px; right: 6px; font-size: 9px; font-weight: 800; background: #9333ea; color: white; padding: 2px 6px; border-radius: 6px;">🍷 Sommelier IA</span>
        <div class="sug-img">${b.emoji}</div>
        <div class="sug-name" style="font-weight: 800; color: #581c87;" title="${b.name}">${b.name}</div>
        <div class="sug-price" style="color: #7e22ce;">R$ ${b.price.toFixed(2).replace('.', ',')}</div>
        <div style="font-size: 9.5px; color: #6b21a8; margin: 4px 0 6px; line-height: 1.25;">${sommelier.motivo}</div>
        <button onclick="addDirectToCart(${b.id})" style="width:100%; padding:6px; background:#9333ea; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">+ Harmonizar</button>
      </div>
    `;
  }

  pool.forEach(item => {
    html += `
      <div class="suggestion-card">
        <div class="sug-img">${item.emoji}</div>
        <div class="sug-name" title="${item.name}">${item.name}</div>
        <div class="sug-price">R$ ${item.price.toFixed(2).replace('.', ',')}</div>
        <button onclick="addDirectToCart(${item.id})" style="margin-top:8px; width:100%; padding:6px; background:#eaf8ef; color:#3ab55b; border:1px solid #3ab55b; border-radius:6px; font-weight:bold; cursor:pointer;">+ Adicionar</button>
      </div>
    `;
  });

  sugSection.style.display = 'block';
  sugList.innerHTML = html;
}

document.getElementById('btn-plus').onclick = () => { selectedQty++; document.getElementById('detail-qty').innerText = selectedQty; updateDetailPrice(); };
document.getElementById('btn-minus').onclick = () => { if(selectedQty > 1) { selectedQty--; document.getElementById('detail-qty').innerText = selectedQty; updateDetailPrice(); } };

function updateDetailPrice() {
  document.getElementById('detail-unit-price').innerText = `R$ ${selectedProduct.price.toFixed(2).replace('.', ',')}`;
  document.getElementById('detail-total-price').innerText = `R$ ${(selectedProduct.price * selectedQty).toFixed(2).replace('.', ',')}`;
}

let _compsAtuais = [];
let _garcomMontavelConfig = null;

function renderGarcomMontavelUI() {
  const section = document.getElementById('detail-comps-section');
  const catsContainer = document.getElementById('detail-montavel-cats');
  const precoEl = document.getElementById('detail-montavel-preco');
  const hiddenInput = document.getElementById('detail-composicoes-json');
  if (!section || !_garcomMontavelConfig) { if (section) section.style.display = 'none'; return; }
  section.style.display = 'block';
  _compsAtuais = _garcomMontavelConfig.categorias.map(() => []);

  catsContainer.innerHTML = _garcomMontavelConfig.categorias.map((cat, ci) => {
    const isSingle = cat.max_escolhas === 1;
    const optsHtml = cat.opcoes.map((opt, oi) => {
      const inputType = isSingle ? 'radio' : 'checkbox';
      const inputName = 'gmontavel-' + ci;
      return '<label style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:white;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer;font-size:12px;">' +
        '<input type="' + inputType + '" name="' + inputName + '" value="' + oi + '" onchange="window.onGarcomMontavelSelect(' + ci + ',' + oi + ',' + isSingle + ')">' +
        '<span style="flex:1;">' + escHtml(opt.nome) + '</span>' +
        (opt.preco > 0 ? '<span style="color:#3b82f6;font-weight:700;font-size:11px;">+R$' + opt.preco.toFixed(2).replace('.', ',') + '</span>' : '') +
        '</label>';
    }).join('');

    return '<div style="margin-bottom:8px;">' +
      '<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:3px;">' + escHtml(cat.nome) +
      (cat.obrigatoria ? ' <span style="color:#dc2626;">*</span>' : '') +
      (cat.max_escolhas > 1 ? ' <span style="color:#94a3b8;font-weight:400;">(até ' + cat.max_escolhas + ')</span>' : '') +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:3px;">' + optsHtml + '</div>' +
      '</div>';
  }).join('');

  updateGarcomMontavelPrice();
  if (hiddenInput) hiddenInput.value = JSON.stringify(_compsAtuais);
}

window.onGarcomMontavelSelect = (catIdx, optIdx, isSingle) => {
  if (isSingle) { _compsAtuais[catIdx] = [optIdx]; }
  else {
    const arr = _compsAtuais[catIdx];
    const pos = arr.indexOf(optIdx);
    if (pos >= 0) arr.splice(pos, 1);
    else { const max = _garcomMontavelConfig.categorias[catIdx].max_escolhas || 1; if (arr.length < max) arr.push(optIdx); }
  }
  updateGarcomMontavelPrice();
  const hiddenInput = document.getElementById('detail-composicoes-json');
  if (hiddenInput) hiddenInput.value = JSON.stringify(_compsAtuais);
};

function updateGarcomMontavelPrice() {
  const precoEl = document.getElementById('detail-montavel-preco');
  if (!precoEl || !_garcomMontavelConfig || !selectedProduct) return;
  let total = _garcomMontavelConfig.pricing_model === 'fixo' ? _garcomMontavelConfig.preco_fixo : selectedProduct.price;
  if (_garcomMontavelConfig.pricing_model === 'soma') {
    _garcomMontavelConfig.categorias.forEach((cat, ci) => {
      (_compsAtuais[ci] || []).forEach(oi => { if (cat.opcoes[oi]) total += cat.opcoes[oi].preco || 0; });
    });
  }
  precoEl.textContent = 'Total: R$ ' + (total * selectedQty).toFixed(2).replace('.', ',');
  precoEl.dataset.unitPrice = total;
}

function fetchGarcomMontavel(productId) {
  _garcomMontavelConfig = null;
  _compsAtuais = [];
  const section = document.getElementById('detail-comps-section');
  if (section) section.style.display = 'none';
  fetch('/api/montaveis/produto/' + productId, { headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('chef_token') || '') } })
    .then(r => r.json())
    .then(cfg => { if (cfg && cfg.id) { _garcomMontavelConfig = cfg; renderGarcomMontavelUI(); } })
    .catch(() => {});
}

document.getElementById('btn-add-to-cart').onclick = () => {
  const rawComps = JSON.parse(document.getElementById('detail-composicoes-json') ? (document.getElementById('detail-composicoes-json').value || '[]') : '[]');
  let composicoes = [];
  let unitPrice = selectedProduct.price;

  if (_garcomMontavelConfig) {
    _garcomMontavelConfig.categorias.forEach((cat, ci) => {
      (rawComps[ci] || []).forEach(oi => {
        const opt = cat.opcoes[oi];
        if (opt) composicoes.push({ categoria: cat.nome, opcao: opt.nome, preco: opt.preco || 0 });
      });
    });
    const precoEl = document.getElementById('detail-montavel-preco');
    unitPrice = precoEl && precoEl.dataset.unitPrice ? parseFloat(precoEl.dataset.unitPrice) : unitPrice;
  } else {
    composicoes = rawComps;
  }

  const btnEtapaAtiva = document.querySelector('#etapas-selector .btn-etapa.active');
  const catLower = (selectedProduct.category || '').toLowerCase();
  const etapa = btnEtapaAtiva ? btnEtapaAtiva.dataset.etapa : (
    catLower.includes('entrada') || catLower.includes('aperitivo') || catLower.includes('porç') || catLower.includes('porc') ? 'Entrada' :
    catLower.includes('sobremesa') || catLower.includes('doce') ? 'Sobremesa' :
    catLower.includes('bebida') || catLower.includes('bar') || catLower.includes('drink') || catLower.includes('suco') ? 'Bebida' : 'Principal'
  );
  const aguardarMarcha = document.getElementById('check-aguardar-marcha') ? document.getElementById('check-aguardar-marcha').checked : false;

  cart.push({
    productName: selectedProduct.name,
    productEmoji: selectedProduct.emoji,
    sector: selectedProduct.sector,
    quantity: selectedQty,
    obs: document.getElementById('detail-obs').value,
    composicoes: composicoes,
    total: unitPrice * selectedQty,
    status: 'Recebido',
    localName: currentTable,
    userName: loggedUser.nome,
    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    addons: [],
    etapa: etapa,
    marcha_status: aguardarMarcha ? 'aguardando_marcha' : 'marchado',
    aguardar_marcha: aguardarMarcha
  });
  _compsAtuais = [];
  _garcomMontavelConfig = null;
  const obsField = document.getElementById('detail-obs');
  if (obsField) obsField.value = '';
  const compsSection = document.getElementById('detail-comps-section');
  if (compsSection) compsSection.style.display = 'none';
  saveCart(currentTable);
  updateCartBadge();
  showView('menu', `Pedido: ${currentTable}`);
};

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (cart.length > 0) {
    badge.style.display = 'flex';
    badge.innerText = cart.length;
  } else {
    badge.style.display = 'none';
  }
}

document.getElementById('fab-cart').onclick = () => {
  if (cart.length === 0) return alert('Carrinho vazio!');
  renderCart();
  showView('cart', 'Revisar Pedido');
};

window.alterarQtdItemCarrinho = function(idx, delta) {
  if (!cart[idx]) return;
  const unitPrice = cart[idx].quantity > 0 ? (cart[idx].total / cart[idx].quantity) : (cart[idx].price || 0);
  const newQty = cart[idx].quantity + delta;
  if (newQty <= 0) {
    window.removeFromCart(idx);
    return;
  }
  cart[idx].quantity = newQty;
  cart[idx].total = unitPrice * newQty;
  saveCart(currentTable);
  updateCartBadge();
  renderCart();
};

window.editarObsItemCarrinho = function(idx) {
  if (!cart[idx]) return;
  const atual = cart[idx].obs || '';
  const nova = prompt('Observação para ' + cart[idx].productName + ':', atual);
  if (nova !== null) {
    cart[idx].obs = nova.trim();
    saveCart(currentTable);
    renderCart();
  }
};

function renderCart() {
  const list = document.getElementById('cart-list');
  let total = 0;
  list.innerHTML = cart.map((item, idx) => {
    total += item.total;
    const allComandas = [...new Set([
      ...(window.activeComandas || []),
      ...(window.newComandasMap ? Array.from(window.newComandasMap.keys()) : [])
    ])];
    
    return `
      <div class="cart-item" style="padding: 14px 16px; background: #fff; border: 1.5px solid #e2e8f0; border-radius: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
        <div style="display:flex; justify-content:space-between; margin-bottom: 8px; align-items: center; gap: 8px;">
          <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">
            <div style="display:inline-flex; align-items:center; background:#f1f5f9; border-radius:10px; padding:2px; gap:2px; flex-shrink:0;">
              <button onclick="window.alterarQtdItemCarrinho(${idx}, -1)" style="width:28px; height:28px; border-radius:8px; border:none; background:#ffffff; font-weight:800; font-size:15px; color:#475569; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(0,0,0,0.08);">-</button>
              <span style="font-size:14px; font-weight:800; color:#0f172a; min-width:22px; text-align:center;">${item.quantity}</span>
              <button onclick="window.alterarQtdItemCarrinho(${idx}, 1)" style="width:28px; height:28px; border-radius:8px; border:none; background:#ffffff; font-weight:800; font-size:15px; color:#475569; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(0,0,0,0.08);">+</button>
            </div>
            <strong style="font-size: 15px; color: #1e293b; line-height: 1.2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.productName}</strong>
          </div>
          <strong style="color: #fc4b15; font-size: 16px; white-space:nowrap;">R$ ${Math.max(0, item.total).toFixed(2).replace('.',',')}</strong>
        </div>
        ${item.obs ? `<div style="font-size: 12.5px; color: #b45309; margin-bottom: 8px; background: #fffbeb; padding: 6px 10px; border-radius: 8px; border-left: 3px solid #f59e0b; display:flex; justify-content:space-between; align-items:center;"><span><strong>Obs:</strong> ${item.obs}</span><button onclick="window.editarObsItemCarrinho(${idx})" style="background:none; border:none; color:#d97706; cursor:pointer; font-size:12px; font-weight:700;"><i class="ph ph-pencil"></i></button></div>` : ''}
        ${item.composicoes && item.composicoes.length > 0 ? `<div style="font-size: 12px; color: #1e40af; margin-bottom: 8px; background: #dbeafe; padding: 6px 10px; border-radius: 6px; border-left: 3px solid #3b82f6; font-weight: 600;">Monte: ${item.composicoes.map(c => typeof c === 'object' ? c.categoria + ': ' + c.opcao : c).join(' | ')}</div>` : ''}
        
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e2e8f0; gap: 8px;">
          <span style="font-size: 12.5px; color: #64748b; font-weight: 600;">Comanda/Pessoa:</span>
          <select onchange="window.changeItemComanda(${idx}, this.value)" style="padding: 7px 10px; border: 1.5px solid #cbd5e1; border-radius: 10px; font-size: 12.5px; outline: none; background: #fff; color: #333; font-weight: 600; max-width: 170px;">
            <option value="">Mesa (Compartilhado)</option>
            ${allComandas.map(c => `<option value="${c}" ${item.mesa_comanda === c ? 'selected' : ''}>${c}</option>`).join('')}
            <option value="__NEW__" style="color: #fc4b15; font-weight: bold;">+ Nova Comanda...</option>
          </select>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 6px;">
          <button onclick="window.editarObsItemCarrinho(${idx})" style="background: none; border: none; color: #64748b; font-size: 12.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-weight: 600;">
            <i class="ph ph-chat-text"></i> ${item.obs ? 'Alterar Obs' : '+ Obs / Ponto'}
          </button>
          <button onclick="removeFromCart(${idx})" style="background: none; border: none; color: #ef4444; font-size: 12.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-weight: 600;">
            <i class="ph ph-trash"></i> Remover
          </button>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('cart-total-value').innerText = `R$ ${Math.max(0, total).toFixed(2).replace('.', ',')}`;
}

window.removeFromCart = (idx) => {
  cart.splice(idx, 1);
  saveCart(currentTable);
  updateCartBadge();
  if (cart.length === 0) showView('menu', `Pedido: ${currentTable}`);
  else renderCart();
};

document.getElementById('btn-send-order').onclick = () => {
  if (cart.length === 0) return alert('Carrinho vazio!');
  
  const orderComandaInput = document.getElementById('order-comanda') ? document.getElementById('order-comanda').value.trim() : '';

  cart.forEach(item => {
    const comandaName = item.mesa_comanda || orderComandaInput;
    const phone = comandaName ? (window.newComandasMap ? window.newComandasMap.get(comandaName) : '') : '';
    const emitItem = {
      ...item,
      observations: item.obs || item.observations || '',
      composicoes: item.composicoes || [],
      total: Math.max(0, item.total).toFixed(2).replace('.', ','),
      mesa_comanda: comandaName,
      cliente_telefone: phone || '',
      etapa: item.etapa || 'Principal',
      marcha_status: item.marcha_status || 'marchado',
      aguardar_marcha: item.aguardar_marcha || false
    };
    /* Offline-first (upsell): sem internet, grava no dispositivo e sincroniza depois */
    if (window.ChefOfflineQueue && window.ChefOfflineQueue.habilitado() && !navigator.onLine) {
      window.ChefOfflineQueue.add(emitItem).then(() => {
        window.ChefOfflineQueue.agendarSyncNativo();
        if (window.showToast) window.showToast('📶 Sem internet — pedido salvo e será enviado sozinho.', 'warning');
      }).catch(() => {});
    } else {
      socket.emit('novo_pedido', emitItem);
    }
  });
  if (typeof trackInsertion === 'function') trackInsertion();
  cart = [];
  window.newComandasMap = new Map();
  if (document.getElementById('order-comanda')) {
    document.getElementById('order-comanda').value = '';
  }
  saveCart(currentTable);
  updateCartBadge();
  showToast('Pedido enviado com sucesso!');
  showView('tables', 'Comanda Mobile');
};

// ── MARCHA DE PRATOS DO SALÃO (DISPARO DE ETAPAS) ──
window.marcharEtapaMesa = function(etapa) {
  const etapaAlvo = etapa || 'Principal';
  if (!currentTable) return alert('Selecione uma mesa ocupada primeiro.');
  if (confirm(`Confirmar marcha dos ${etapaAlvo}s da mesa ${currentTable} para início imediato na cozinha?`)) {
    socket.emit('marchar_etapa_mesa', {
      mesa: currentTable,
      etapa: etapaAlvo,
      userName: loggedUser ? loggedUser.nome : 'Garçom'
    });
    showToast(`🔥 ${etapaAlvo}s da mesa ${currentTable} marchados! Cozinha notificada.`);
  }
};
