const fs = require('fs');
let html = fs.readFileSync('host-fila-espera.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (m) {
  html = html.replace(m[0], `<script src="/socket.io/socket.io.js"></script>
  <script>
    const token = localStorage.getItem('chef_token') || '';
    const restId = localStorage.getItem('restaurante_id') || '1';
    const socket = io({ query: { token, restaurante_id: restId } });

    let fila = [];
    
    socket.on('connect', () => {
      socket.emit('get_fila');
    });

    socket.on('fila_atualizada_trigger', () => {
      socket.emit('get_fila');
    });

    socket.on('fila_atualizada', (data) => {
      fila = data;
      renderFila();
    });

    function playClick() {
      try {
        if(navigator.vibrate) navigator.vibrate(15);
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
        osc.start(); osc.stop(ctx.currentTime + 0.05);
      } catch(e){}
    }

    function addFila() {
      playClick();
      const nome = document.getElementById('inp-nome').value;
      const pax = document.getElementById('inp-pax').value;
      const tel = document.getElementById('inp-tel').value;

      if(!nome || !pax) return alert('Preencha Nome e Número de Pessoas');

      socket.emit('add_fila', { nome, pax, tel });
      
      document.getElementById('inp-nome').value = '';
      document.getElementById('inp-pax').value = '';
      document.getElementById('inp-tel').value = '';
      
      // Feedback visual
      const btn = document.querySelector('.btn-add');
      const oldHtml = btn.innerHTML;
      btn.innerHTML = '<i class="ph-bold ph-check"></i> Adicionado!';
      btn.style.background = 'var(--c-pronto)';
      setTimeout(() => {
        btn.innerHTML = oldHtml;
        btn.style.background = 'var(--c-novo)';
      }, 1000);
    }

    function removeFila(id) {
      playClick();
      if(confirm('Remover cliente da fila?')) {
        socket.emit('remove_fila', id);
      }
    }

    function assentarCliente(id) {
      playClick();
      socket.emit('assentar_fila', id);
    }

    function chamarWhatsApp(tel, nome) {
      playClick();
      if(!tel) return alert('Cliente não informou WhatsApp.');
      const msg = encodeURIComponent(\`Olá \${nome}! Sua mesa no Chef Cozinha está pronta. Por favor, dirija-se à recepção.\`);
      window.open(\`https://wa.me/55\${tel.replace(/\\D/g, '')}?text=\${msg}\`, '_blank');
    }

    function renderFila() {
      const lista = document.getElementById('lista-fila');
      document.getElementById('contador-fila').textContent = fila.length;
      
      if(fila.length === 0) {
        lista.innerHTML = '<div style="color:var(--muted); text-align:center; padding: 40px 0;">Fila Vazia</div>';
        return;
      }

      lista.innerHTML = '';
      fila.forEach((f, index) => {
        const timeWait = Math.floor((Date.now() - new Date(f.timestamp).getTime()) / 60000);
        let statusClass = timeWait > 20 ? 'status-red' : (timeWait > 10 ? 'status-orange' : 'status-green');
        
        lista.innerHTML += \`
          <div class="card-fila">
            <div class="fila-pos">#\${index + 1}</div>
            <div class="fila-info">
              <div class="fila-nome">\${f.nome} <span class="badge \${statusClass}">\${timeWait} min aguardando</span></div>
              <div class="fila-meta">
                <span><i class="ph-bold ph-users"></i> \${f.pax} pessoas</span>
                \${f.telefone ? \`<span><i class="ph-bold ph-phone"></i> \${f.telefone}</span>\` : ''}
              </div>
            </div>
            <div class="fila-actions">
              <button class="btn-icon btn-call" onclick="chamarWhatsApp('\${f.telefone}', '\${f.nome}')" title="Avisar no WhatsApp"><i class="ph-bold ph-whatsapp-logo"></i></button>
              <button class="btn-icon btn-seat" onclick="assentarCliente(\${f.id})" title="Assentar Cliente"><i class="ph-bold ph-chair"></i></button>
              <button class="btn-icon btn-remove" onclick="removeFila(\${f.id})" title="Desistiu"><i class="ph-bold ph-x"></i></button>
            </div>
          </div>
        \`;
      });
    }
  </script>`);
  fs.writeFileSync('host-fila-espera.html', html);
  console.log('OK');
}
