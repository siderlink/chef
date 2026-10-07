const fs = require('fs');
let c = fs.readFileSync('painel-dono.html', 'utf8');

const modalHtml = `
  <!-- MODAL DE AUDITORIA (Cancelamentos, Sangrias, Descontos) -->
  <div id="modal-auditoria" class="modal-overlay" style="display:none; align-items:center; justify-content:center; z-index:999999;">
    <div class="modal-content" style="max-width:600px; width:90%; background:var(--card); border:1px solid var(--border); border-radius:18px; overflow:hidden;">
      <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2);">
        <h3 id="titulo-auditoria" style="margin:0; font-size:18px; display:flex; align-items:center; gap:8px;">
          <i class="ph-bold ph-magnifying-glass"></i> Auditoria
        </h3>
        <button onclick="fecharModalAuditoria()" style="background:none; border:none; color:var(--text-sub); cursor:pointer;"><i class="ph-bold ph-x" style="font-size:20px;"></i></button>
      </div>
      <div style="padding:20px;">
        <div id="lista-auditoria" style="display:flex; flex-direction:column; gap:10px; max-height:400px; overflow-y:auto;">
          <!-- Items injected via JS -->
        </div>
      </div>
      <div style="padding:12px 20px; background:rgba(0,0,0,0.2); border-top:1px solid var(--border); text-align:right;">
        <button class="btn-primary" onclick="fecharModalAuditoria()" style="padding:8px 16px; border-radius:8px; border:none; background:var(--primary); color:#fff; font-weight:bold; cursor:pointer;">Fechar Relatório</button>
      </div>
    </div>
  </div>
</body>`;

c = c.replace('</body>', modalHtml);
fs.writeFileSync('painel-dono.html', c);

let js = fs.readFileSync('painel-dono.js', 'utf8');

const jsModal = `window.abrirModalAuditoria = function(tipo) {
  const titles = {
    'cancelamentos': '<i class="ph-bold ph-x-circle" style="color:#ef4444;"></i> Histórico de Cancelamentos',
    'sangrias': '<i class="ph-bold ph-arrow-circle-up-right" style="color:#f59e0b;"></i> Registro de Sangrias',
    'descontos': '<i class="ph-bold ph-tag" style="color:#8b5cf6;"></i> Auditoria de Descontos'
  };
  document.getElementById('titulo-auditoria').innerHTML = titles[tipo] || 'Auditoria';
  
  const lista = document.getElementById('lista-auditoria');
  lista.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-sub);">Carregando registros...</div>';
  
  document.getElementById('modal-auditoria').style.display = 'flex';
  
  // Simula busca
  setTimeout(() => {
    let mockData = '';
    if(tipo === 'cancelamentos') {
      mockData = \`
        <div style="padding:12px; background:var(--card2); border-radius:8px; border:1px solid rgba(239,68,68,0.2); display:flex; justify-content:space-between;">
          <div><div style="font-weight:bold; color:#ef4444;">Pedido #1042</div><div style="font-size:13px; color:var(--text-sub);">Operador: João (Caixa 1)</div><div style="font-size:13px; color:var(--text-sub); margin-top:4px;">Motivo: Cliente desistiu</div></div>
          <div style="font-weight:bold;">R$ 45,00</div>
        </div>
      \`;
    } else if(tipo === 'sangrias') {
      mockData = \`
        <div style="padding:12px; background:var(--card2); border-radius:8px; border:1px solid rgba(245,158,11,0.2); display:flex; justify-content:space-between;">
          <div><div style="font-weight:bold; color:#f59e0b;">Retirada de Dinheiro</div><div style="font-size:13px; color:var(--text-sub);">Operador: Maria (Caixa 2)</div><div style="font-size:13px; color:var(--text-sub); margin-top:4px;">Motivo: Pagamento fornecedor (Gelo)</div></div>
          <div style="font-weight:bold;">R$ 120,00</div>
        </div>
      \`;
    } else if(tipo === 'descontos') {
      mockData = \`
        <div style="padding:12px; background:var(--card2); border-radius:8px; border:1px solid rgba(139,92,246,0.2); display:flex; justify-content:space-between;">
          <div><div style="font-weight:bold; color:#8b5cf6;">Desconto Manual (10%)</div><div style="font-size:13px; color:var(--text-sub);">Pedido #1088 • Operador: Ana (Gerente)</div><div style="font-size:13px; color:var(--text-sub); margin-top:4px;">Autorizado via senha</div></div>
          <div style="font-weight:bold;">- R$ 15,50</div>
        </div>
      \`;
    }
    
    if(!mockData) mockData = '<div style="text-align:center; padding:20px; color:var(--text-sub);">Nenhum registro encontrado hoje.</div>';
    lista.innerHTML = mockData;
  }, 600);
};

window.fecharModalAuditoria = function() {
  document.getElementById('modal-auditoria').style.display = 'none';
};`;

// Replace the placeholder window.abrirModalAuditoria
const regex = /window\.abrirModalAuditoria = function\(tipo\) \{[\s\S]*?\};/;
js = js.replace(regex, jsModal);
fs.writeFileSync('painel-dono.js', js);

console.log('Auditoria Modal implemented!');
