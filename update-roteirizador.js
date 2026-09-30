const fs = require('fs');
let html = fs.readFileSync('roteirizador-entregas.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (m) {
  html = html.replace(m[0], `<script src="/socket.io/socket.io.js"></script>
  <script>
    const token = localStorage.getItem('chef_token') || '';
    const restId = localStorage.getItem('restaurante_id') || '1';
    const socket = io({ query: { token, restaurante_id: restId } });

    let pedidosProntos = [];
    let rotas = [];

    socket.on('connect', () => {
      socket.emit('get_pedidos');
      socket.emit('get_rotas');
    });

    socket.on('pedidos_atualizados', (pedidos) => {
      // Filtra pedidos Prontos para entrega
      pedidosProntos = pedidos.filter(p => p.status === 'Pronto' && p.localName && p.localName.toLowerCase().includes('entrega'));
      renderPedidos();
    });
    
    socket.on('pedidos_atualizados_trigger', () => socket.emit('get_pedidos'));
    socket.on('rotas_atualizadas_trigger', () => socket.emit('get_rotas'));

    socket.on('rotas_atualizadas', (data) => {
      rotas = data;
      renderRotas();
    });

    function playClick() {
      try {
        if(navigator.vibrate) navigator.vibrate(15);
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
        osc.start(); osc.stop(ctx.currentTime + 0.05);
      } catch(e){}
    }

    function renderPedidos() {
      const container = document.getElementById('lista-pedidos');
      container.innerHTML = '';
      
      document.querySelector('.col-header span').textContent = \`Pedidos Prontos (\${pedidosProntos.length})\`;

      pedidosProntos.forEach(p => {
        container.innerHTML += \`
          <div class="card-pedido" onclick="toggleSelect('\${p.id}')" id="card-\${p.id}">
            <div class="chk-container">
              <input type="checkbox" id="chk-\${p.id}" onclick="event.stopPropagation(); toggleSelect('\${p.id}')">
            </div>
            <div class="bairro-tag"><i class="ph-bold ph-map-pin"></i> \${p.bairro || 'Sem Bairro'}</div>
            <div class="pedido-id">Pedido #\${p.id}</div>
            <div class="pedido-cliente"><i class="ph-bold ph-user"></i> \${p.userName || 'Cliente'} • <b>R$ \${parseFloat(p.total).toFixed(2)}</b></div>
          </div>
        \`;
      });
    }

    function toggleSelect(id) {
      playClick();
      const card = document.getElementById(\`card-\${id}\`);
      const chk = document.getElementById(\`chk-\${id}\`);
      if(card.classList.contains('selected')) {
        card.classList.remove('selected');
        chk.checked = false;
      } else {
        card.classList.add('selected');
        chk.checked = true;
      }
    }

    let rotasDraft = [];
    function agruparSelecionados() {
      playClick();
      const selecionados = Array.from(document.querySelectorAll('.card-pedido.selected'));
      if(selecionados.length === 0) return alert('Selecione pelo menos 1 pedido para criar uma rota.');

      const rotaPedidos = selecionados.map(card => {
        const id = card.id.replace('card-', '');
        return pedidosProntos.find(x => String(x.id) === id);
      });

      rotasDraft.push({ id: 'draft_' + Date.now(), pedidos: rotaPedidos });
      
      // Remover visualmente
      selecionados.forEach(c => {
        const id = c.id.replace('card-', '');
        const idx = pedidosProntos.findIndex(x => String(x.id) === id);
        if(idx > -1) pedidosProntos.splice(idx, 1);
      });

      renderPedidos();
      renderRotasDraft();
    }

    function renderRotasDraft() {
      const container = document.getElementById('lista-rotas');
      container.innerHTML = '';
      
      rotasDraft.forEach((r, i) => {
        let itensHtml = r.pedidos.map(p => \`
          <div class="rota-item">
            <span><b>#\${p.id}</b> - \${p.bairro || 'Sem Bairro'}</span>
            <span style="color:var(--muted)">\${p.userName || 'Cliente'}</span>
          </div>
        \`).join('');

        container.innerHTML += \`
          <div class="card-rota">
            <div class="rota-header">
              <span class="rota-title">Nova Rota (\${r.pedidos.length} entregas)</span>
              <button class="btn-agrupar" style="background:#ef4444" onclick="desfazerRotaDraft('\${r.id}')"><i class="ph-bold ph-trash"></i></button>
            </div>
            <div class="rota-motoboy">
              <i class="ph-bold ph-motorcycle"></i>
              <select id="entregador-\${r.id}">
                <option value="">Atribuir Entregador...</option>
                <option value="1">Carlos (Moto)</option>
                <option value="2">Roberto (Bike)</option>
                <option value="3">Marcos (Moto)</option>
              </select>
            </div>
            <div class="rota-itens">
              \${itensHtml}
            </div>
            <button class="btn-despachar" onclick="despacharRota('\${r.id}', this)">
              <i class="ph-bold ph-paper-plane-right"></i> DESPACHAR ROTA
            </button>
          </div>
        \`;
      });
      
      // Renderizar rotas já despachadas abaixo (apenas read-only)
      rotas.forEach(r => {
        let pids = JSON.parse(r.pedidos_ids || '[]');
        container.innerHTML += \`
          <div class="card-rota" style="opacity: 0.6; pointer-events: none; border-color: var(--success);">
            <div class="rota-header">
              <span class="rota-title" style="color: var(--success)"><i class="ph-bold ph-check-circle"></i> Rota Despachada</span>
            </div>
            <div class="rota-motoboy">Entregador ID: \${r.entregador_id}</div>
            <div class="rota-itens"><div class="rota-item">Pedidos: \${pids.join(', ')}</div></div>
          </div>
        \`;
      });
    }

    function desfazerRotaDraft(id) {
      playClick();
      const idx = rotasDraft.findIndex(r => r.id === id);
      if(idx > -1) {
        pedidosProntos.push(...rotasDraft[idx].pedidos);
        rotasDraft.splice(idx, 1);
        renderPedidos();
        renderRotasDraft();
      }
    }

    function despacharRota(id, btn) {
      playClick();
      const select = document.getElementById('entregador-' + id);
      if(!select.value) return alert('Selecione um entregador para esta rota!');

      const idx = rotasDraft.findIndex(r => r.id === id);
      if(idx === -1) return;
      
      const payload = {
         entregador_id: parseInt(select.value),
         pedidos: rotasDraft[idx].pedidos
      };

      btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i> Despachando...';
      btn.style.opacity = '0.7';
      
      socket.emit('despachar_rota', payload);
      rotasDraft.splice(idx, 1);
    }
  </script>`);
  fs.writeFileSync('roteirizador-entregas.html', html);
  console.log('OK');
}
