const fs = require('fs');
let html = fs.readFileSync('compras-b2b.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (m) {
  html = html.replace(m[0], `<script>
    const token = localStorage.getItem('chef_token') || '';
    const restId = localStorage.getItem('restaurante_id') || '1';
    
    async function carregarFornecedores() {
      try {
        const res = await fetch(\`/api/b2b/fornecedores?restaurante_id=\${restId}\`, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        
        const container = document.getElementById('lista-fornecedores');
        if(container && Array.isArray(data)) {
          container.innerHTML = '';
          data.forEach(f => {
             container.innerHTML += \`
               <div class="card-fornecedor">
                  <div class="nome">\${f.nome}</div>
                  <div class="categoria">\${f.categoria}</div>
                  <div class="status">\${f.status}</div>
               </div>
             \`;
          });
        }
      } catch(e) {}
    }

    // Initialize UI
    function playClick() {
      try {
        if(navigator.vibrate) navigator.vibrate(15);
      } catch(e){}
    }
    carregarFornecedores();
  </script>`);
  fs.writeFileSync('compras-b2b.html', html);
  console.log('OK B2B');
}
