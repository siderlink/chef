const fs = require('fs');
let html = fs.readFileSync('totem-kiosk.html', 'utf8');

// 1. Add cart management modal
const cartModalHtml = `
  <!-- MODAL CARRINHO -->
  <div id="modal-cart" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 100; justify-content: center; align-items: flex-end;">
    <div style="background: var(--card); width: 100%; height: 80%; border-radius: 40px 40px 0 0; padding: 50px; display: flex; flex-direction: column;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px;">
        <h2 style="font-size: 50px; font-weight: 900;">Meu Pedido</h2>
        <button style="background:none; border:none; font-size:60px; color:var(--text); cursor:pointer;" onclick="fecharCarrinho()"><i class="ph-bold ph-x"></i></button>
      </div>
      <div id="lista-carrinho" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 20px;">
        <!-- Itens injetados aqui -->
      </div>
      <div style="margin-top: 40px; display: flex; gap: 20px;">
        <button style="flex: 1; padding: 30px; font-size: 34px; border-radius: 20px; border: 2px solid var(--border); background: #fff; font-weight: 700; cursor:pointer;" onclick="fecharCarrinho()">Continuar Comprando</button>
        <button style="flex: 1; padding: 30px; font-size: 34px; border-radius: 20px; border: none; background: var(--primary); color: #fff; font-weight: 900; cursor:pointer;" onclick="abrirCheckoutDoCarrinho()">Finalizar Pedido <i class="ph-bold ph-arrow-right"></i></button>
      </div>
    </div>
  </div>
`;
html = html.replace('<!-- MODAL CHECKOUT PIX -->', cartModalHtml + '\n  <!-- MODAL CHECKOUT PIX -->');

// 2. Change cart-bar to have a "Ver Carrinho" button
html = html.replace(
  '<div class="cart-total">TOTAL DO PEDIDO (0 itens)<br><span>R$ 0,00</span></div>',
  '<div class="cart-total" onclick="abrirCarrinho()" style="cursor:pointer; display:flex; align-items:center; gap:20px;"><div>TOTAL DO PEDIDO (<span id="cart-count">0</span> itens)<br><span id="cart-sum">R$ 0,00</span></div> <i class="ph-bold ph-caret-up" style="font-size:40px; color:var(--primary);"></i></div>'
);

// 3. Add JS logic for cart modal, warning timeout, and better add-to-cart feedback
const jsRepl = `
    function resetTimer() {
      clearTimeout(timeoutScreensaver);
      clearTimeout(timeoutWarning);
      document.getElementById('modal-warning').style.display = 'none';
      if(cart.length > 0) {
        timeoutWarning = setTimeout(() => {
          document.getElementById('modal-warning').style.display = 'flex';
          let sec = 10;
          document.getElementById('warning-sec').textContent = sec;
          timeoutScreensaver = setInterval(() => {
            sec--;
            document.getElementById('warning-sec').textContent = sec;
            if(sec <= 0) {
              clearInterval(timeoutScreensaver);
              cancelarPedido();
            }
          }, 1000);
        }, 45000); // 45s warning
      } else {
        timeoutScreensaver = setTimeout(() => {
          document.getElementById('screensaver').style.transform = 'translateY(0)';
          cancelarPedido();
        }, 60000);
      }
    }

    function addToCart(id, nome, preco, event) {
      playClick();
      let item = cart.find(c => c.id === id);
      if(item) {
        item.qtd++;
      } else {
        cart.push({ id, nome, preco, qtd: 1 });
      }
      updateCartBar();
      resetTimer();

      // Better Feedback
      const card = event.currentTarget;
      const originalBg = card.style.background;
      card.style.background = 'var(--primary)';
      card.style.color = '#fff';
      card.style.transform = 'scale(0.95)';
      setTimeout(() => {
        card.style.background = originalBg;
        card.style.color = 'var(--text)';
        card.style.transform = 'scale(1)';
      }, 300);
    }

    function updateCartBar() {
      let total = cart.reduce((acc, c) => acc + (c.preco * c.qtd), 0);
      let count = cart.reduce((acc, c) => acc + c.qtd, 0);
      document.getElementById('cart-count').textContent = count;
      document.getElementById('cart-sum').textContent = 'R$ ' + total.toFixed(2).replace('.',',');

      const btn = document.querySelector('.btn-finish');
      if(cart.length === 0) {
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
      } else {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      }
      if(document.getElementById('modal-cart').style.display === 'flex') {
        renderListaCarrinho();
      }
    }

    function abrirCarrinho() {
      if(cart.length === 0) return;
      playClick();
      renderListaCarrinho();
      document.getElementById('modal-cart').style.display = 'flex';
      resetTimer();
    }

    function fecharCarrinho() {
      playClick();
      document.getElementById('modal-cart').style.display = 'none';
      resetTimer();
    }

    function abrirCheckoutDoCarrinho() {
      fecharCarrinho();
      abrirCheckout();
    }

    function alterarQtd(id, delta) {
      playClick();
      let item = cart.find(c => c.id === id);
      if(item) {
        item.qtd += delta;
        if(item.qtd <= 0) {
          cart = cart.filter(c => c.id !== id);
        }
        updateCartBar();
        if(cart.length === 0) fecharCarrinho();
      }
    }

    function renderListaCarrinho() {
      const lista = document.getElementById('lista-carrinho');
      lista.innerHTML = '';
      cart.forEach(c => {
        lista.innerHTML += \`
          <div style="display:flex; justify-content:space-between; align-items:center; padding: 20px; border: 1px solid var(--border); border-radius: 20px;">
            <div style="font-size:30px; font-weight:700;">\${c.nome}<br><span style="color:var(--green); font-size:24px;">R$ \${c.preco.toFixed(2).replace('.',',')}</span></div>
            <div style="display:flex; align-items:center; gap:30px;">
               <button style="width:60px; height:60px; border-radius:50%; border:none; background:#f1f5f9; font-size:30px; font-weight:bold; cursor:pointer;" onclick="alterarQtd('\${c.id}', -1)">-</button>
               <span style="font-size:36px; font-weight:900;">\${c.qtd}</span>
               <button style="width:60px; height:60px; border-radius:50%; border:none; background:#f1f5f9; font-size:30px; font-weight:bold; cursor:pointer;" onclick="alterarQtd('\${c.id}', 1)">+</button>
            </div>
          </div>
        \`;
      });
    }
`;

html = html.replace(/function addToCart\([\s\S]*?updateCartBar\(\) \{[\s\S]*?\}\s*\}/, jsRepl);

// Add modal-warning HTML
const warningHtml = `
  <!-- MODAL INATIVIDADE -->
  <div id="modal-warning" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 200; justify-content: center; align-items: center;">
    <div style="background: var(--card); padding: 60px; border-radius: 40px; text-align: center; max-width: 800px;">
      <i class="ph-bold ph-warning-circle" style="font-size: 100px; color: var(--primary); margin-bottom: 30px;"></i>
      <h2 style="font-size: 60px; font-weight: 900; margin-bottom: 20px;">Ainda está aí?</h2>
      <p style="font-size: 34px; color: var(--muted); margin-bottom: 40px;">Seu pedido será cancelado em <b id="warning-sec" style="color:var(--text);">10</b> segundos.</p>
      <button style="background: var(--primary); color: #fff; border: none; padding: 25px 60px; border-radius: 100px; font-size: 34px; font-weight: 900; width:100%;" onclick="resetTimer()">CONTINUAR COMPRANDO</button>
    </div>
  </div>
`;
html = html.replace('<!-- MODAL CHECKOUT PIX -->', warningHtml + '\n  <!-- MODAL CHECKOUT PIX -->');

// Also need to declare timeoutWarning
html = html.replace('let timeoutScreensaver;', 'let timeoutScreensaver;\n    let timeoutWarning;');

fs.writeFileSync('totem-kiosk.html', html);
console.log('Totem updated successfully');
