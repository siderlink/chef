  // --- MERCADO PAGO SOCKET STATUS ---
  socket.on('mp_status_pagamento', (data) => {
    const overlay = document.getElementById('modal-mp-pagamento');
    const statusEl = document.getElementById('mp-payment-status');
    const titleEl = document.getElementById('mp-payment-title');
    const spinner = document.getElementById('mp-payment-spinner');
    const successIcon = document.getElementById('mp-payment-success-icon');

    if (!overlay) return;

    if (data.status === 'processando') {
      if (titleEl) titleEl.innerText = 'Aguardando Cartão';
      if (statusEl) statusEl.innerText = data.msg;
    } else if (data.status === 'aprovado') {
      if (titleEl) titleEl.innerText = 'Pagamento Aprovado';
      if (statusEl) statusEl.innerText = 'Transação autorizada com sucesso!';
      if (spinner) spinner.style.display = 'none';
      if (successIcon) successIcon.style.display = 'flex';

      setTimeout(() => {
        overlay.style.display = 'none';
        if (window.pendingMpPayment) {
          const { valor, metodo } = window.pendingMpPayment;
          const mesaName = window.mesaAtual.nome || window.mesaAtual.mesaName;
          const modalTaxaCheckbox = document.getElementById('checkout-modal-taxa');
          const taxaCheckbox = document.getElementById('taxa-servico');
          const isTaxaChecked = modalTaxaCheckbox ? modalTaxaCheckbox.checked : (taxaCheckbox ? taxaCheckbox.checked : true);

          // Register partial payment - only via pagamento_parcial_valor to avoid duplicate in movimentacoes
          socket.emit('pagamento_parcial_valor', {
            mesaName: mesaName,
            valor: valor,
            metodo: metodo,
            comTaxa: isTaxaChecked,
            desconto: window.descontoAdicional || 0,
            userName: window.loggedInUser || 'Caixa'
          });

          // Reset inputs
          const inputValor = document.getElementById('checkout-modal-valor');
          if (inputValor) inputValor.value = '';
          window.checkoutModalCents = 0;
          if (typeof window.checkoutModalUpdateTouchVisor === 'function') {
            window.checkoutModalUpdateTouchVisor();
          }

          window.pendingMpPayment = null;
        }
      }, 1500);

    } else if (data.status === 'failed' || data.status === 'cancelado') {
      overlay.style.display = 'none';
      alert(`❌ Falha no pagamento: ${data.msg || 'Transação cancelada ou recusada.'}`);
      window.pendingMpPayment = null;
    }
  });

  window.pdvParaViagem = false;

  window.togglePdvParaViagem = function() {
    window.pdvParaViagem = !window.pdvParaViagem;
    const btn = document.getElementById('btn-toggle-pdv-viagem');
    const txt = document.getElementById('btn-toggle-pdv-viagem-text');
    if (window.pdvParaViagem) {
      if (btn) {
        btn.style.background = '#fffbeb';
        btn.style.borderColor = '#f59e0b';
        btn.style.color = '#d97706';
      }
      if (txt) txt.innerText = '🛍️ Para Viagem: SIM';
    } else {
      if (btn) {
        btn.style.background = '#f1f5f9';
        btn.style.borderColor = '#cbd5e1';
        btn.style.color = '#475569';
      }
      if (txt) txt.innerText = 'Para Viagem';
    }
  };

  window.podeEditarPrecoPdv = function() {
    const pdvCfg = window.pdvConfigs || {};
    const alterarValoresPdv = pdvCfg.feature_alterar_valores_pdv === 'true' || pdvCfg.feature_alterar_valores_pdv === true;
    if (alterarValoresPdv) return true;
    const roles = ['admin', 'administrador', 'gerente', 'dono', 'proprietario', 'adm'];
    const check = (creds) => {
      if (!creds) return false;
      const cargo = String(creds.cargo || creds.role || creds.tipo || '').toLowerCase().trim();
      if (roles.includes(cargo)) return true;
      if (creds.isAdmin || creds.isGerente || creds.isDono) return true;
      return false;
    };
    try { if (check(JSON.parse(localStorage.getItem('chef_app_creds') || '{}'))) return true; } catch (e) {}
    try { if (check(JSON.parse((localStorage.getItem('chef_session') || localStorage.getItem('chef_credentials')) || '{}'))) return true; } catch (e) {}
    return false;
  };

  window.pdvEditPriceInline = function(prodId) {
    if (!window.podeEditarPrecoPdv()) {
      alert('Apenas Administrador, Gerente ou Dono podem alterar o valor do produto.');
      return;
    }
    const prod = window.allProducts ? window.allProducts.find(p => p.id === prodId) : null;
    if (!prod) return;
    const inCart = (window.pdvCart || []).find(item => item.id === prodId);
    const currentPrice = inCart ? inCart.preco : (prod.preco || 0);

    const novoValStr = prompt(`Alterar valor de "${prod.nome}" para este pedido (R$):`, Number(currentPrice).toFixed(2));
    if (novoValStr === null) return;
    const novoVal = parseFloat(String(novoValStr).replace(',', '.'));
    if (isNaN(novoVal) || novoVal < 0) return alert('Valor inválido.');

    if (inCart) {
      inCart.preco = novoVal;
    } else {
      window.pdvCart.push({ ...prod, preco: novoVal, quantity: 1 });
    }
    window.renderPdvCart();
  };

  let pdvTouchTimer = null;

  window.pdvTouchStartCtx = function(prodId, event) {
    if (!event.touches || event.touches.length === 0) return;
    const touch = event.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;
    clearTimeout(pdvTouchTimer);
    pdvTouchTimer = setTimeout(() => {
      window.abrirPdvContextMenu(prodId, x, y);
    }, 450);
  };

  window.pdvTouchEndCtx = function() {
    clearTimeout(pdvTouchTimer);
  };

  window.abrirPdvContextMenu = function(prodId, posX, posY) {
    const prod = window.allProducts ? window.allProducts.find(p => p.id === prodId) : null;
    if (!prod) return;

    let menu = document.getElementById('pdv-quick-context-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'pdv-quick-context-menu';
      menu.style.cssText = 'display: none; position: fixed; z-index: 10005; background: var(--bg-card); border-radius: 16px; box-shadow: 0 16px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.08); border: 1px solid rgba(0,0,0,0.08); width: 260px; overflow: hidden; padding: 6px; user-select: none; font-family: inherit; transition: opacity 0.15s ease, transform 0.15s ease; cubic-bezier(0.16, 1, 0.3, 1);';
      document.body.appendChild(menu);
    }

    const isDark = document.body.classList.contains('dark-mode');
    if (isDark) {
      menu.style.background = '#1a1f2e';
      menu.style.borderColor = 'rgba(255,255,255,0.12)';
      menu.style.color = '#f8fafc';
    } else {
      menu.style.background = '#ffffff';
      menu.style.borderColor = '#e2e8f0';
      menu.style.color = '#0f172a';
    }

    const inCart = (window.pdvCart || []).find(i => i.id === prodId);
    const totalQty = inCart ? inCart.quantity : 0;
    const canEditPrice = window.podeEditarPrecoPdv();

    const menuWidth = 260;
    const menuHeight = 360;
    let finalX = Math.min(posX, window.innerWidth - menuWidth - 12);
    let finalY = Math.min(posY, window.innerHeight - menuHeight - 12);
    finalX = Math.max(12, finalX);
    finalY = Math.max(12, finalY);

    menu.style.left = `${finalX}px`;
    menu.style.top = `${finalY}px`;
    menu.style.display = 'block';

    const bgHeader = isDark ? '#252b3b' : '#f8fafc';
    const borderSub = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
    const textColor = isDark ? '#f8fafc' : '#0f172a';
    const textMuted = isDark ? '#94a3b8' : '#64748b';
    const hoverBg = isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9';

    menu.innerHTML = `
      <div style="padding: 10px 12px; background: ${bgHeader}; border-radius: 12px; border: 1px solid ${borderSub}; margin-bottom: 6px;">
        <div style="font-weight: 800; font-size: 14px; color: ${textColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px;">
          <span>${prod.emoji || '🍽️'}</span> <span style="overflow:hidden; text-overflow:ellipsis;">${escHtml(prod.nome)}</span>
        </div>
        <div style="font-size: 11.5px; color: ${textMuted}; margin-top: 3px; display: flex; justify-content: space-between; align-items: center;">
          <span>${totalQty > 0 ? `<strong style="color: #10b981;">${totalQty}x no pedido</strong>` : 'Não adicionado'}</span>
          <strong style="color: #fc4b15; font-size: 12.5px;">R$ ${(inCart ? inCart.preco : (prod.preco || 0)).toFixed(2).replace('.', ',')}</strong>
        </div>
      </div>

      <!-- Atalhos Rápidos de Quantidade -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 2px 0 6px 0; border-bottom: 1px solid ${borderSub}; margin-bottom: 6px;">
        <button onclick="window.pdvQuickAddQty(${prodId}, 1); window.fecharPdvContextMenu();" title="Adicionar +1"
                style="padding: 6px 0; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.25); border-radius: 8px; font-weight: 800; font-size: 12px; color: #10b981; cursor: pointer; transition: 0.15s;"
                onmouseenter="this.style.background='rgba(16,185,129,0.25)'" onmouseleave="this.style.background='rgba(16,185,129,0.12)'">+1</button>
        <button onclick="window.pdvQuickAddQty(${prodId}, 2); window.fecharPdvContextMenu();" title="Adicionar +2"
                style="padding: 6px 0; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.25); border-radius: 8px; font-weight: 800; font-size: 12px; color: #10b981; cursor: pointer; transition: 0.15s;"
                onmouseenter="this.style.background='rgba(16,185,129,0.25)'" onmouseleave="this.style.background='rgba(16,185,129,0.12)'">+2</button>
        <button onclick="window.pdvQuickAddQty(${prodId}, 5); window.fecharPdvContextMenu();" title="Adicionar +5"
                style="padding: 6px 0; background: rgba(59,130,246,0.12); border: 1px solid rgba(59,130,246,0.25); border-radius: 8px; font-weight: 800; font-size: 12px; color: #3b82f6; cursor: pointer; transition: 0.15s;"
                onmouseenter="this.style.background='rgba(59,130,246,0.25)'" onmouseleave="this.style.background='rgba(59,130,246,0.12)'">+5</button>
        <button onclick="window.pdvQuickSubQty(${prodId}); window.fecharPdvContextMenu();" title="Subtrair -1"
                style="padding: 6px 0; background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; font-weight: 800; font-size: 12px; color: #ef4444; cursor: pointer; transition: 0.15s; ${totalQty <= 0 ? 'opacity:0.4; pointer-events:none;' : ''}"
                onmouseenter="this.style.background='rgba(239,68,68,0.25)'" onmouseleave="this.style.background='rgba(239,68,68,0.12)'">-1</button>
      </div>

      <button onclick="window.pdvSetObsPrompt(${prodId}); window.fecharPdvContextMenu();" 
              style="width: 100%; text-align: left; padding: 8px 10px; background: none; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; color: ${textColor}; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.15s; margin-bottom: 2px;"
              onmouseenter="this.style.background='${hoverBg}'" onmouseleave="this.style.background='none'">
        <i class="ph ph-pencil-line" style="color: #3b82f6; font-size: 17px;"></i> Observação / Detalhes
      </button>

      <button onclick="window.pdvSetQtyPrompt(${prodId}); window.fecharPdvContextMenu();" 
              style="width: 100%; text-align: left; padding: 8px 10px; background: none; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; color: ${textColor}; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.15s; margin-bottom: 2px;"
              onmouseenter="this.style.background='${hoverBg}'" onmouseleave="this.style.background='none'">
        <i class="ph ph-hash" style="color: #8b5cf6; font-size: 17px;"></i> Digitar Quantidade Exata
      </button>

      <button onclick="window.pdvSetCortesia(${prodId}); window.fecharPdvContextMenu();" 
              style="width: 100%; text-align: left; padding: 8px 10px; background: none; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; color: ${textColor}; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.15s; margin-bottom: 2px;"
              onmouseenter="this.style.background='${hoverBg}'" onmouseleave="this.style.background='none'">
        <i class="ph ph-gift" style="color: #ec4899; font-size: 17px;"></i> Aplicar Cortesia (R$ 0,00)
      </button>

      ${canEditPrice ? `
        <button onclick="window.pdvEditPriceInline(${prodId}); window.fecharPdvContextMenu();" 
                style="width: 100%; text-align: left; padding: 8px 10px; background: none; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; color: ${textColor}; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.15s; margin-bottom: 2px;"
                onmouseenter="this.style.background='${hoverBg}'" onmouseleave="this.style.background='none'">
          <i class="ph ph-currency-dollar" style="color: #10b981; font-size: 17px;"></i> Preço Personalizado (Admin)
        </button>
      ` : ''}

      ${totalQty > 0 ? `
        <div style="border-top: 1px solid ${borderSub}; margin-top: 4px; padding-top: 4px;">
          <button onclick="window.pdvRemoveAllDirect(${prodId}); window.fecharPdvContextMenu();" 
                  style="width: 100%; text-align: left; padding: 8px 10px; background: rgba(239,68,68,0.08); border: none; border-radius: 8px; font-size: 13px; font-weight: 700; color: #ef4444; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: 0.15s;"
                  onmouseenter="this.style.background='rgba(239,68,68,0.18)'" onmouseleave="this.style.background='rgba(239,68,68,0.08)'">
            <i class="ph ph-trash" style="color: #ef4444; font-size: 17px;"></i> Remover do Pedido
          </button>
        </div>
      ` : ''}
    `;

    setTimeout(() => {
      const closeHandler = (e) => {
        if (!menu.contains(e.target)) {
          window.fecharPdvContextMenu();
          document.removeEventListener('click', closeHandler);
          document.removeEventListener('touchstart', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
      document.addEventListener('touchstart', closeHandler);
    }, 50);
  };

  window.fecharPdvContextMenu = function() {
    const menu = document.getElementById('pdv-quick-context-menu');
    if (menu) menu.style.display = 'none';
  };

  window.pdvSetObsPrompt = function(prodId) {
    const prod = window.allProducts.find(p => p.id === prodId);
    if (!prod) return;
    let item = (window.pdvCart || []).find(i => i.id === prodId);
    if (!item) {
      window.pdvAddToCart(prodId);
      item = (window.pdvCart || []).find(i => i.id === prodId);
    }
    const custom = prompt(`Observação para "${prod.nome}" (ex: Sem cebola, Bem passado, Com gelo):`, item ? (item.observations || '') : '');
    if (custom === null) return;
    if (item) {
      item.observations = custom.trim();
    }
    window.renderPdvCart();
  };

  window.pdvSetQtyPrompt = function(prodId) {
    const prod = window.allProducts.find(p => p.id === prodId);
    if (!prod) return;
    let item = (window.pdvCart || []).find(i => i.id === prodId);
    const currentQty = item ? item.quantity : 1;
    const custom = prompt(`Digite a quantidade para "${prod.nome}":`, currentQty);
    if (custom === null) return;
    const newQty = parseInt(custom);
    if (isNaN(newQty) || newQty <= 0) {
      if (item) {
        const idx = window.pdvCart.findIndex(i => i.id === prodId);
        if (idx >= 0) window.pdvCart.splice(idx, 1);
      }
    } else {
      if (item) {
        item.quantity = newQty;
      } else {
        window.pdvCart.push({ ...prod, quantity: newQty, preco: prod.preco || 0 });
      }
    }
    window.renderPdvCart();
  };

  window.pdvSetCortesia = function(prodId) {
    const prod = window.allProducts.find(p => p.id === prodId);
    if (!prod) return;
    let item = (window.pdvCart || []).find(i => i.id === prodId);
    if (!item) {
      window.pdvCart.push({
        ...prod,
        preco: 0.00,
        quantity: 1,
        observations: '[CORTESIA]'
      });
    } else {
      item.preco = 0.00;
      item.observations = item.observations ? `[CORTESIA] ${item.observations}` : '[CORTESIA]';
    }
    window.renderPdvCart();
  };

  window.pdvRemoveAllDirect = function(prodId) {
    if (!window.pdvCart) return;
    const idx = window.pdvCart.findIndex(i => i.id === prodId);
    if (idx >= 0) {
      window.pdvCart.splice(idx, 1);
      window.renderPdvCart();
    }
  };

  window.pdvDecQtyDirect = function(prodId) {
    if (!window.pdvCart) return;
    const idx = window.pdvCart.findIndex(item => item.id === prodId);
    if (idx >= 0) {
      window.pdvRemoveFromCart(idx);
    }
  };

  window.pdvViewModes = ['cards', 'list', 'icons'];
  window.pdvViewMode = 'cards';

  window.pdvSetViewMode = function(mode) {
    if (!window.pdvViewModes.includes(mode)) return;
    window.pdvViewMode = mode;
    ['cards', 'list', 'icons'].forEach(m => {
      const btn = document.getElementById(`btn-pdv-mode-${m}`);
      if (btn) {
        btn.style.background = m === mode ? '#ffffff' : 'transparent';
        btn.style.color = m === mode ? '#0f172a' : '#64748b';
        btn.style.boxShadow = m === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none';
      }
    });
    window.renderPdvMenu();
  };

  window.initPdvViewModeControls = function() {
    const itemsDiv = document.getElementById('pdv-menu-items');
    if (!itemsDiv || itemsDiv.dataset.viewControlsInited) return;
    itemsDiv.dataset.viewControlsInited = 'true';

    // Desktop: Ctrl + Mouse Scroll
    itemsDiv.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        let curIdx = window.pdvViewModes.indexOf(window.pdvViewMode);
        if (e.deltaY > 0) {
          curIdx = Math.min(window.pdvViewModes.length - 1, curIdx + 1);
        } else if (e.deltaY < 0) {
          curIdx = Math.max(0, curIdx - 1);
        }
        window.pdvSetViewMode(window.pdvViewModes[curIdx]);
      }
    }, { passive: false });

    // Mobile: Pinch Gesture
    let touchDistStart = 0;
    itemsDiv.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        touchDistStart = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
      }
    }, { passive: true });

    itemsDiv.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && touchDistStart > 0) {
        const curDist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
        const delta = curDist - touchDistStart;
        if (Math.abs(delta) > 40) {
          let curIdx = window.pdvViewModes.indexOf(window.pdvViewMode);
          if (delta < -40) {
            curIdx = Math.min(window.pdvViewModes.length - 1, curIdx + 1);
          } else if (delta > 40) {
            curIdx = Math.max(0, curIdx - 1);
          }
          touchDistStart = curDist;
          window.pdvSetViewMode(window.pdvViewModes[curIdx]);
        }
      }
    }, { passive: true });
  };

  window.scrollToActiveCategoryPill = function() {
    const catsDiv = document.getElementById('pdv-categories');
    if (!catsDiv) return;
    setTimeout(() => {
      const activeBtn = catsDiv.querySelector('.pdv-category-btn.active');
      if (!activeBtn) return;
      const containerWidth = catsDiv.clientWidth;
      const btnLeft = activeBtn.offsetLeft;
      const btnWidth = activeBtn.offsetWidth;
      const targetScrollLeft = btnLeft - (containerWidth / 2) + (btnWidth / 2);
      catsDiv.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: 'smooth'
      });
    }, 30);
  };

  window.pdvSelectCategory = function(categoryName) {
    window.pdvCurrentCategory = categoryName;
    window.renderPdvMenu();
    window.scrollToActiveCategoryPill();
  };
  window.renderPdvMenu = () => {
    if (!window.allProducts) return;
    const catsDiv = document.getElementById('pdv-categories');
    const itemsDiv = document.getElementById('pdv-menu-items');
    if (!catsDiv || !itemsDiv) return;

    window.initPdvViewModeControls();

    const produtosVisiveis = window.allProducts.filter(p => p.visibilidade !== 'invisivel');
    let categories = [...new Set(produtosVisiveis.map(p => p.categoria))];

    if (window.pdvConfigs && window.pdvConfigs.ordem_categorias) {
      try {
        const order = JSON.parse(window.pdvConfigs.ordem_categorias);
        categories.sort((a, b) => {
          let idxA = order.indexOf(a);
          let idxB = order.indexOf(b);
          if (idxA === -1) idxA = 999;
          if (idxB === -1) idxB = 999;
          return idxA - idxB;
        });
      } catch (e) { }
    }

    if (categories.includes('Mais Pedidos')) {
      categories = ['Mais Pedidos', ...categories.filter(t => t !== 'Mais Pedidos')];
    }

    categories = ['Todas', ...categories];

    catsDiv.innerHTML = categories.map(c => `
      <button class="pdv-category-btn ${c === window.pdvCurrentCategory ? 'active' : ''}" 
              onclick="window.pdvSelectCategory('${escHtml(c).replace(/'/g, "\\'")}')"
              style="padding: 8px 16px; border-radius: 20px; border: none; background: ${c === window.pdvCurrentCategory ? '#fc4b15' : '#e2e8f0'}; color: ${c === window.pdvCurrentCategory ? 'white' : '#334155'}; font-weight: 700; cursor: pointer; text-align: center; white-space: nowrap; font-size: 13px; transition: all 0.15s ease; flex-shrink: 0;">
        ${escHtml(c)}
      </button>
    `).join('');

    const normCat = (s) => String(s || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const query = (window.pdvSearchQuery || '').trim();
    let filteredProds = [];
    if (query !== '') {
      if (window.FuzzySearch && typeof window.FuzzySearch.filter === 'function') {
        filteredProds = window.FuzzySearch.filter(produtosVisiveis, query, (p) => [p.nome, p.categoria, String(p.codigo || ''), String(p.id || '')]);
      } else {
        const qNorm = normCat(query);
        filteredProds = produtosVisiveis.filter(p => normCat(p.nome).includes(qNorm) || normCat(p.categoria).includes(qNorm) || String(p.codigo || '').includes(qNorm));
      }
    } else {
      filteredProds = window.pdvCurrentCategory === 'Todas' ? produtosVisiveis : produtosVisiveis.filter(p => normCat(p.categoria) === normCat(window.pdvCurrentCategory));
    }

    window.pdvFilteredProducts = filteredProds;
    if (typeof window.pdvSelectedIndex !== 'number' || window.pdvSelectedIndex >= filteredProds.length) {
      window.pdvSelectedIndex = 0;
    }

    const canEditPrice = window.podeEditarPrecoPdv();
    const pdvCfg = window.pdvConfigs || {};
    const vendaSemEstoque = pdvCfg.feature_venda_sem_estoque === 'true' || pdvCfg.feature_venda_sem_estoque === true;

    // Adjust grid template based on view mode
    const isMobile = window.innerWidth <= 768;
    if (window.pdvViewMode === 'list') {
      itemsDiv.style.setProperty('grid-template-columns', '1fr', 'important');
      itemsDiv.style.gap = '6px';
    } else if (window.pdvViewMode === 'icons') {
      itemsDiv.style.setProperty('grid-template-columns', isMobile ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(80px, 1fr))', 'important');
      itemsDiv.style.gap = '6px';
    } else {
      itemsDiv.style.setProperty('grid-template-columns', isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(150px, 1fr))', 'important');
      itemsDiv.style.gap = '8px';
    }

    itemsDiv.innerHTML = filteredProds.map((p, idx) => {
      const isSearchFocus = query !== '' && idx === window.pdvSelectedIndex;
      const inCartItems = (window.pdvCart || []).filter(item => item.id === p.id);
      const totalQty = inCartItems.reduce((acc, item) => acc + (item.quantity || 1), 0);
      const isSelected = totalQty > 0;
      const currentPrice = inCartItems.length > 0 ? inCartItems[0].preco : window.getPrecoAtivo(p.nome, p.preco || 0);
      const hasPromo = currentPrice < (p.preco || 0);
      const promoBadge = hasPromo ? `<span style="background:#fef3c7; color:#92400e; padding:1px 5px; border-radius:4px; font-size:9px; font-weight:700; margin-left:4px;">PROMO</span>` : '';
      const estoqueAtual = parseFloat(p.estoque) || 0;
      const semEstoqueBadge = (!vendaSemEstoque && estoqueAtual <= 0) ? `<span style="background:#fef2f2; color:#dc2626; padding:1px 5px; border-radius:4px; font-size:9px; font-weight:700; margin-left:4px;">SEM ESTOQUE</span>` : '';

      const cardBg = isSelected ? '#f0fdf4' : (isSearchFocus ? '#fff5f2' : '#ffffff');
      const isOutOfStock = !vendaSemEstoque && estoqueAtual <= 0;
      const cardBorder = isSelected ? '2px solid #22c55e' : (isSearchFocus ? '2px solid #fc4b15' : (isOutOfStock ? '1px dashed #fca5a5' : '1px solid #cbd5e1'));
      const cardShadow = isSelected ? 'box-shadow: 0 4px 12px rgba(34, 197, 94, 0.22);' : (isSearchFocus ? 'box-shadow: 0 0 8px rgba(252, 75, 21, 0.25);' : '');
      const cardOpacity = isOutOfStock ? 'opacity:0.6;' : '';
      const badge = isSearchFocus ? `<span style="background: #fc4b15; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-left: 6px;">↵ Enter</span>` : '';
      const priceColor = isSelected ? '#15803d' : '#64748b';

      const ctxAttrs = `
        oncontextmenu="event.preventDefault(); window.abrirPdvContextMenu(${p.id}, event.clientX, event.clientY);"
        ontouchstart="window.pdvTouchStartCtx(${p.id}, event);"
        ontouchend="window.pdvTouchEndCtx();"
        ontouchmove="window.pdvTouchEndCtx();"
      `;

      // MODE 2: LIST MODE (1 item por linha)
      if (window.pdvViewMode === 'list') {
        return `
          <div class="pdv-item-card" onclick="window.pdvAddToCart(${p.id})" ${ctxAttrs}
               style="padding: 10px 14px; border-radius: 10px; cursor: pointer; transition: all 0.15s; background: ${cardBg}; border: ${cardBorder}; ${cardShadow} ${cardOpacity} display: flex; align-items: center; justify-content: space-between; gap: 10px; user-select: none; width: 100%; box-sizing: border-box;">
             
             <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
               <span style="font-size: 20px; flex-shrink: 0;">${p.emoji || '🍽️'}</span>
                 <span style="font-weight: 700; font-size: 14.5px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escHtml(p.nome)} ${badge} ${promoBadge} ${semEstoqueBadge}</span>
               ${isSelected ? `<span style="background: #22c55e; color: white; padding: 2px 8px; border-radius: 12px; font-weight: 800; font-size: 11.5px; flex-shrink: 0;"><i class="ph ph-check"></i> ${totalQty}x</span>` : ''}
             </div>

             <div style="display: flex; align-items: center; gap: 14px; flex-shrink: 0;">
                <div onclick="${canEditPrice ? `event.stopPropagation(); window.pdvEditPriceInline(${p.id});` : ''}" title="${canEditPrice ? 'Clique para alterar o valor' : ''}">
                  ${hasPromo ? `<span style="color:#94a3b8; font-size:11px; text-decoration:line-through; margin-right:4px;">R$ ${Number(p.preco || 0).toFixed(2).replace('.', ',')}</span>` : ''}
                  <span style="color: ${hasPromo ? '#dc2626' : priceColor}; font-size: 14.5px; font-weight: 800;">R$ ${Number(currentPrice).toFixed(2).replace('.', ',')}</span>
                  ${canEditPrice ? `<i class="ph ph-pencil-simple" style="font-size: 11px; color: var(--text-secondary); margin-left: 2px;"></i>` : ''}
                </div>

               ${isSelected ? `
                 <div style="display: flex; align-items: center; gap: 4px;" onclick="event.stopPropagation();">
                   <button onclick="window.pdvDecQtyDirect(${p.id}); event.stopPropagation();" title="Diminuir"
                           style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 6px; width: 30px; height: 30px; font-weight: 900; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;">-</button>
                   <span style="font-weight: 800; color: #15803d; font-size: 14px; min-width: 20px; text-align: center;">${totalQty}</span>
                   <button onclick="window.pdvAddToCart(${p.id}); event.stopPropagation();" title="Adicionar"
                           style="background: #22c55e; color: white; border: none; border-radius: 6px; width: 30px; height: 30px; font-weight: 900; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;">+</button>
                 </div>
               ` : ''}
             </div>
          </div>
        `;
      }

      // MODE 3: ICONS MODE (No mínimo 3 ícones por linha no mobile, ou mais conforme resolução)
      if (window.pdvViewMode === 'icons') {
        return `
          <div class="pdv-item-card" onclick="window.pdvAddToCart(${p.id})" ${ctxAttrs}
               style="padding: 8px 6px; border-radius: 10px; cursor: pointer; text-align: center; transition: all 0.15s; background: ${cardBg}; border: ${cardBorder}; ${cardShadow} ${cardOpacity} display: flex; flex-direction: column; align-items: center; justify-content: space-between; min-height: 86px; user-select: none; position: relative; box-sizing: border-box;">
             
             ${isSelected ? `<span style="position: absolute; top: 3px; right: 3px; background: #22c55e; color: white; padding: 1px 5px; border-radius: 10px; font-weight: 800; font-size: 10px;">${totalQty}x</span>` : ''}

             <div style="font-size: 24px; margin-top: 2px;">${p.emoji || '🍽️'}</div>
             
             <div style="font-weight: 700; font-size: 11.5px; color: #0f172a; line-height: 1.15; margin: 2px 0; max-height: 26px; overflow: hidden; word-break: break-word;">${escHtml(p.nome)}${semEstoqueBadge ? ' ' + semEstoqueBadge : ''}</div>

             <div style="color: ${hasPromo ? '#dc2626' : priceColor}; font-size: 11.5px; font-weight: 800;">${hasPromo ? `<span style="color:#94a3b8;text-decoration:line-through;font-size:9px;font-weight:400;">R$ ${Number(p.preco || 0).toFixed(2).replace('.', ',')} </span>` : ''}R$ ${Number(currentPrice).toFixed(2).replace('.', ',')}${promoBadge}</div>

             ${isSelected ? `
               <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px;" onclick="event.stopPropagation();">
                 <button onclick="window.pdvDecQtyDirect(${p.id}); event.stopPropagation();" title="Diminuir"
                         style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 4px; width: 22px; height: 22px; font-weight: 900; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center;">-</button>
                 <button onclick="window.pdvAddToCart(${p.id}); event.stopPropagation();" title="Adicionar"
                         style="background: #22c55e; color: white; border: none; border-radius: 4px; width: 22px; height: 22px; font-weight: 900; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center;">+</button>
               </div>
             ` : ''}
          </div>
        `;
      }

      // MODE 1: DEFAULT CARDS MODE
      return `
        <div class="pdv-item-card" onclick="window.pdvAddToCart(${p.id})" ${ctxAttrs}
             style="padding: 12px 14px; border-radius: 12px; cursor: pointer; text-align: left; transition: all 0.15s; position: relative; background: ${cardBg}; border: ${cardBorder}; ${cardShadow} ${cardOpacity} display: flex; flex-direction: column; justify-content: space-between; min-height: 100px; user-select: none;">
           
           <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
              <span style="font-weight: 700; font-size: 14px; color: #0f172a; line-height: 1.25;">${p.emoji || ''} ${escHtml(p.nome)} ${badge} ${promoBadge} ${semEstoqueBadge}</span>
             ${isSelected ? `<span style="background: #22c55e; color: white; padding: 2px 8px; border-radius: 12px; font-weight: 800; font-size: 12px; flex-shrink: 0;"><i class="ph ph-check"></i> ${totalQty}x</span>` : ''}
           </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px;">
              <div style="display: flex; align-items: center; gap: 4px;" onclick="${canEditPrice ? `event.stopPropagation(); window.pdvEditPriceInline(${p.id});` : ''}" title="${canEditPrice ? 'Clique para alterar o valor' : ''}">
                ${hasPromo ? `<span style="color:#94a3b8; font-size:11px; text-decoration:line-through;">R$ ${Number(p.preco || 0).toFixed(2).replace('.', ',')}</span>` : ''}
                <span style="color: ${hasPromo ? '#dc2626' : priceColor}; font-size: 14px; font-weight: 800;">R$ ${Number(currentPrice).toFixed(2).replace('.', ',')}</span>
                ${canEditPrice ? `<i class="ph ph-pencil-simple" style="font-size: 11px; color: var(--text-secondary); margin-left: 2px;"></i>` : ''}
              </div>

             ${isSelected ? `
               <div style="display: flex; align-items: center; gap: 6px;" onclick="event.stopPropagation();">
                 <button onclick="window.pdvDecQtyDirect(${p.id}); event.stopPropagation();" title="Diminuir"
                         style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px; width: 32px; height: 32px; font-weight: 900; cursor: pointer; font-size: 17px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(220,38,38,0.12);">
                   -
                 </button>
                 <button onclick="window.pdvAddToCart(${p.id}); event.stopPropagation();" title="Adicionar"
                         style="background: #22c55e; color: white; border: none; border-radius: 8px; width: 32px; height: 32px; font-weight: 900; cursor: pointer; font-size: 17px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.06);">
                   +
                 </button>
               </div>
             ` : ''}
           </div>
        </div>
      `;
    }).join('');
  };

  window.pdvAddToCart = async (id) => {
    const prod = window.allProducts.find(p => p.id === id);
    if (!prod) return;

    const pdvCfg = window.pdvConfigs || {};
    const vendaSemEstoque = pdvCfg.feature_venda_sem_estoque === 'true' || pdvCfg.feature_venda_sem_estoque === true;

    if (!vendaSemEstoque && prod.estoque !== undefined && prod.estoque !== null && prod.estoque !== '') {
      const estoqueAtual = parseFloat(prod.estoque) || 0;
      if (estoqueAtual <= 0) {
        return alert(`Produto "${prod.nome}" sem estoque disponível!`);
      }
    }

