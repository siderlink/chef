
    // ===== 1. BLOQUEAR F12 / INSPECT =====
    document.addEventListener('keydown', function(e) {
      if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
        e.preventDefault();
      }
    });

    // ===== 2. CUSTOM CONTEXT MENU =====
    const ctxMenu = document.getElementById('custom-context-menu');
    const ctxHeader = document.getElementById('ctx-header');
    
    document.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      showContextMenu(e.pageX, e.pageY, e.target);
    });

    document.addEventListener('click', function(e) {
      if(ctxMenu) ctxMenu.style.display = 'none';
      
      document.querySelectorAll('.dropdown-menu.show').forEach(m => {
         if (!e.target.closest('.dropdown-wrapper')) m.classList.remove('show');
      });
    });

    function showContextMenu(x, y, target) {
      if(!ctxMenu) return;
      let title = 'Ações Rápidas';
      const card = target.closest('.clean-card');
      const item = target.closest('.clean-cart-item');
      
      if (card) { title = 'Ações: ' + card.getAttribute('data-nome'); } 
      else if (item) { title = 'Editar Item'; }

      ctxHeader.innerText = title;
      ctxMenu.style.display = 'block';
      
      let posX = x;
      let posY = y;
      if (posX + ctxMenu.offsetWidth > window.innerWidth) posX = window.innerWidth - ctxMenu.offsetWidth - 10;
      if (posY + ctxMenu.offsetHeight > window.innerHeight) posY = window.innerHeight - ctxMenu.offsetHeight - 10;
      ctxMenu.style.left = posX + 'px';
      ctxMenu.style.top = posY + 'px';
    }

    // ===== 3. LONG PRESS =====
    let pressTimer;
    function startPress(e) {
      if (e.type === 'click' && e.detail === 0) return;
      const target = e.target;
      const touch = e.touches ? e.touches[0] : e;
      pressTimer = window.setTimeout(function() { showContextMenu(touch.pageX, touch.pageY, target); }, 500);
    }
    function cancelPress() { clearTimeout(pressTimer); }
    
    document.body.addEventListener('touchstart', function(e) {
      if(e.target.closest('.clean-card') || e.target.closest('.clean-cart-item')) { startPress(e); }
    }, {passive: true});
    document.body.addEventListener('touchend', cancelPress);
    document.body.addEventListener('touchmove', cancelPress);
    
    document.querySelectorAll('.clean-card').forEach(card => {
      card.addEventListener('click', function(e) {
        if (ctxMenu.style.display !== 'block') { selectMesa(this.getAttribute('data-nome'), this.getAttribute('data-total')); }
      });
    });

    // ===== 4. ARRASTAR E SOLTAR =====
    let hoverTarget = null;
    let originalNextSibling = null;
    let originalParent = null;

    const sortableOptionsMesas = {
      group: { name: 'mesas', put: ['mesas', 'itens'] },
      animation: 150, delay: 200, delayOnTouchOnly: true, ghostClass: 'sortable-ghost',
      onStart: function(evt) {
        originalNextSibling = evt.item.nextElementSibling;
        originalParent = evt.item.parentNode;
      },
      onMove: function (evt) {
        document.querySelectorAll('.clean-card').forEach(c => c.classList.remove('merge-target'));
        if (evt.related && evt.related.classList.contains('clean-card')) {
          evt.related.classList.add('merge-target');
          hoverTarget = evt.related;
        } else { hoverTarget = null; }
      },
      onEnd: function (evt) {
        document.querySelectorAll('.clean-card').forEach(c => c.classList.remove('merge-target'));
        
        if (evt.item.classList.contains('clean-card') && hoverTarget && hoverTarget !== evt.item) {
          const originItem = evt.item;
          const targetItem = hoverTarget;
          const originName = originItem.getAttribute('data-nome');
          const targetName = targetItem.getAttribute('data-nome');
          
                    showMergeModal(Deseja transferir os itens da \ para a \?, (isSub) => {
            if(isSub) {
                // Nova Comanda
                socket.emit('juntar_mesas', { mesaA: originName, mesaB: targetName, operador: 'Caixa Clean (Comanda)' });
            } else {
                // Juntar Tudo
                socket.emit('juntar_mesas', { mesaA: originName, mesaB: targetName, operador: 'Caixa Clean' });
            }
          }, () => { revertDrag(originItem); }, true, true, originName);
        }
        hoverTarget = null;
      }
    };

    if (typeof Sortable !== 'undefined') {
      const fecharCfg = Object.assign({}, sortableOptionsMesas);
      fecharCfg.onAdd = function(evt) {
        if (evt.item.classList.contains('clean-cart-item')) { handleDropItemOnGrid(evt); }
        else { evt.item.classList.add('fechar'); }
      };
      new Sortable(document.getElementById('grid-fechar'), fecharCfg);

      const ocuCfg = Object.assign({}, sortableOptionsMesas);
      ocuCfg.onAdd = function(evt) {
        if (evt.item.classList.contains('clean-cart-item')) { handleDropItemOnGrid(evt); }
        else { evt.item.classList.remove('fechar'); }
      };
      new Sortable(document.getElementById('grid-ocupadas'), ocuCfg);

      new Sortable(document.getElementById('cart-items'), {
        group: { name: 'itens', put: false }, animation: 150, delay: 200, delayOnTouchOnly: true, ghostClass: 'sortable-ghost',
        onStart: function(evt) { originalNextSibling = evt.item.nextElementSibling; originalParent = evt.item.parentNode; }
      });
    }

    function handleDropItemOnGrid(evt) {
      const originItem = evt.item;
      const originName = originItem.getAttribute('data-name');
      const originPrice = parseFloat(originItem.getAttribute('data-price') || 0);
      const originId = originItem.getAttribute('data-id');
      const targetMesa = hoverTarget || originItem.previousElementSibling || originItem.nextElementSibling;
      
      if (targetMesa && targetMesa.classList.contains('clean-card')) {
         const targetName = targetMesa.getAttribute('data-nome');
                  showMergeModal(Deseja mover o item "\" para a \?, () => {
            socket.emit('transferir_item', { itemId: originId, novaMesa: targetName, operador: 'Caixa Clean' });
         }, () => { revertDrag(originItem); }, false, false, '');
      } else { revertDrag(originItem); }
    }

    function showMergeModal(text, onConfirm, onCancel, showReorder, showSubAccount, originName) {
      const modal = document.getElementById('modal-merge');
      document.getElementById('merge-text').innerText = text;
      document.getElementById('btn-merge-reorder').style.display = showReorder ? 'block' : 'none';
      
      const btnSub = document.getElementById('btn-merge-subaccount');
      if (showSubAccount) { btnSub.style.display = 'block'; btnSub.innerText = "Agrupar como Comanda: " + originName; } 
      else { btnSub.style.display = 'none'; }
      
      modal.style.display = 'flex';
      document.getElementById('btn-merge-confirm').onclick = () => { modal.style.display = 'none'; onConfirm(false); };
      document.getElementById('btn-merge-subaccount').onclick = () => { modal.style.display = 'none'; onConfirm(true); };
      document.getElementById('btn-merge-reorder').onclick = () => { modal.style.display = 'none'; };
      document.getElementById('btn-merge-cancel').onclick = () => { modal.style.display = 'none'; onCancel(); };
    }

    function revertDrag(item) {
      if (originalNextSibling) { originalParent.insertBefore(item, originalNextSibling); } 
      else { originalParent.appendChild(item); }
    }

    // ===== FUNCOES AUXILIARES =====
    function toggleCleanDropdown(event) {
      const m = document.getElementById('drop-caixa-version');
      if(m) { m.classList.toggle('show'); if(m.classList.contains('show') && typeof CaixaVersionManager !== 'undefined') { CaixaVersionManager.renderDropdown('drop-caixa-version', 'clean'); } } 
      event.stopPropagation();
    }

    function selectMesa(nome, totalStr) {
      document.getElementById('cart-title').innerText = nome;
      document.getElementById('cart-total').innerText = 'R$ ' + totalStr.replace('.', ',');
      document.getElementById('cart-items').innerHTML = `
        <div class="clean-cart-item" data-name="1x Item Genérico" data-price="${totalStr}">
          <span class="clean-cart-item-name">1x Item Genérico</span>
          <span class="clean-cart-item-price">R$ ${totalStr.replace('.', ',')}</span>
        </div>
      `;
      document.getElementById('cart-panel').classList.add('active');
    }

    function closeCart() { document.getElementById('cart-panel').classList.remove('active'); }
  
