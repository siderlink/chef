const fs = require('fs');
let html = fs.readFileSync('radar-antifraude.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (m) {
  html = html.replace(m[0], `<script src="/socket.io/socket.io.js"></script>
  <script>
    const token = localStorage.getItem('chef_token') || '';
    const restId = localStorage.getItem('restaurante_id') || '1';
    
    async function carregarLogs() {
      try {
        const res = await fetch(\`/api/antifraude/logs?restaurante_id=\${restId}\`, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        
        const container = document.getElementById('lista-logs');
        if(container && Array.isArray(data)) {
          container.innerHTML = '';
          data.forEach(l => {
             container.innerHTML += \`
               <div class="log-item" style="border-left: 4px solid \${l.risco === 'CRÍTICO' ? 'var(--red)' : (l.risco === 'ALTO' ? 'var(--orange)' : 'var(--green)')}; padding: 10px; margin-bottom: 10px; background: #1e293b; border-radius: 4px;">
                  <div style="font-weight:bold; color: #f8fafc;">\${l.tipo} <span style="font-size:0.8em; color:var(--muted)">\${new Date(l.data).toLocaleTimeString()}</span></div>
                  <div style="color:var(--muted); font-size:0.9em;">\${l.detalhe}</div>
               </div>
             \`;
          });
        }
      } catch(e) {}
    }

    carregarLogs();
    setInterval(carregarLogs, 15000);
  </script>`);
  fs.writeFileSync('radar-antifraude.html', html);
  console.log('OK ANTIFRAUDE');
}
