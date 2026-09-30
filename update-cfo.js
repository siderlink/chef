const fs = require('fs');
let html = fs.readFileSync('cfo-virtual.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (m) {
  html = html.replace(m[0], `<script src="/socket.io/socket.io.js"></script>
  <script>
    const token = localStorage.getItem('chef_token') || '';
    const restId = localStorage.getItem('restaurante_id') || '1';
    
    // Conecta via HTTP API criada no servidor
    async function carregarMetricas() {
      try {
        const res = await fetch(\`/api/cfo/metricas?restaurante_id=\${restId}\`, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        
        document.getElementById('receita-bruta').textContent = 'R$ ' + (data.receita_bruta || 0).toFixed(2).replace('.',',');
        document.getElementById('lucro-liquido').textContent = 'R$ ' + (data.lucro_liquido || 0).toFixed(2).replace('.',',');
        document.getElementById('ticket-medio').textContent = 'R$ ' + (data.ticket_medio || 0).toFixed(2).replace('.',',');
        document.getElementById('burn-rate').textContent = 'R$ ' + (data.burn_rate || 0).toFixed(2).replace('.',',');
      } catch(e) {
        console.error('Erro ao carregar metricas CFO', e);
      }
    }

    carregarMetricas();
    setInterval(carregarMetricas, 30000);
  </script>`);
  fs.writeFileSync('cfo-virtual.html', html);
  console.log('OK CFO');
}
