const fs = require('fs');
let code = fs.readFileSync('painel-dono.js', 'utf8');

const editModeFunc = `
window.isModoEdicaoDono = false;
let donoSortableInst = null;

window.toggleModoEdicao = function() {
  window.isModoEdicaoDono = !window.isModoEdicaoDono;
  const btn = document.getElementById('btn-edit-mode');
  const main = document.querySelector('main');
  if (!main) return;
  
  if (window.isModoEdicaoDono) {
    if(btn) btn.innerHTML = '<i class="ph-bold ph-check"></i> Salvar Layout';
    if(btn) btn.style.background = 'var(--green)';
    if(btn) btn.style.borderColor = 'var(--green)';
    
    // Sort DOM physically to match CSS order before initializing Sortable
    const elements = Array.from(main.children);
    elements.sort((a, b) => {
      const orderA = parseInt(a.style.order) || 99;
      const orderB = parseInt(b.style.order) || 99;
      return orderA - orderB;
    });
    elements.forEach(el => main.appendChild(el));
    
    const cfg = window.getDonoModularConfig();
    
    Array.from(main.children).forEach(el => {
      if (!el.id || el.id === 'modal-reordenar-seccoes') return;
      el.style.position = 'relative';
      
      const conf = cfg.secoes.find(s => s.id === el.id) || { largura: 'medium' };
      
      const editBar = document.createElement('div');
      editBar.className = 'dono-edit-bar';
      editBar.innerHTML = \`
        <div class="drag-handle-main" style="cursor:grab; background:var(--card); padding:8px 12px; border-radius:8px; border:1px solid var(--border); margin-right:8px; display:inline-flex; align-items:center; font-weight:800; font-size:12px; color:var(--text);"><i class="ph-bold ph-arrows-out-cardinal" style="margin-right:6px;"></i> Mover</div>
        <select onchange="window.alterarParametroSecao('\${el.id}', 'largura', this.value); window.aplicarDonoModularConfig()" style="padding:8px; border-radius:8px; background:var(--card); border:1px solid var(--border); color:var(--text); font-size:12px; font-weight:700;">
          <option value="small" \${conf.largura === 'small' ? 'selected' : ''}>Pequeno (1 Col)</option>
          <option value="medium" \${conf.largura === 'medium' ? 'selected' : ''}>Médio (2 Col)</option>
          <option value="large" \${conf.largura === 'large' ? 'selected' : ''}>Grande (Linha Toda)</option>
        </select>
        <button onclick="window.alterarParametroSecao('\${el.id}', 'visivel', false); window.aplicarDonoModularConfig()" style="padding:8px 12px; border-radius:8px; background:#ef4444; border:none; color:#fff; font-size:12px; font-weight:800; margin-left:8px; cursor:pointer;"><i class="ph-bold ph-eye-slash"></i> Ocultar</button>
      \`;
      editBar.style.position = 'absolute';
      editBar.style.top = '10px';
      editBar.style.right = '10px';
      editBar.style.zIndex = '99';
      editBar.style.display = 'flex';
      editBar.style.background = 'rgba(0,0,0,0.6)';
      editBar.style.padding = '8px';
      editBar.style.borderRadius = '12px';
      editBar.style.backdropFilter = 'blur(4px)';
      
      el.appendChild(editBar);
    });
    
    if (typeof Sortable !== 'undefined') {
      donoSortableInst = new Sortable(main, {
        handle: '.drag-handle-main',
        animation: 150,
        onEnd: function() {
          const newCfg = window.getDonoModularConfig();
          const items = main.children;
          let orderCounter = 1;
          Array.from(items).forEach(item => {
            if (item.id) {
              const confSec = newCfg.secoes.find(s => s.id === item.id);
              if (confSec) {
                confSec.ordem = orderCounter++;
              }
            }
          });
          window.salvarDonoModularConfig(newCfg);
        }
      });
    }
  } else {
    if(btn) btn.innerHTML = '<i class="ph-bold ph-pencil-simple"></i> Modo Edição';
    if(btn) btn.style.background = 'var(--yellow)';
    if(btn) btn.style.borderColor = 'var(--yellow)';
    
    document.querySelectorAll('.dono-edit-bar').forEach(el => el.remove());
    if (donoSortableInst) {
      donoSortableInst.destroy();
      donoSortableInst = null;
    }
    window.aplicarDonoModularConfig();
  }
};
`;

if (!code.includes('window.toggleModoEdicao = function')) {
  code += '\n' + editModeFunc;
  fs.writeFileSync('painel-dono.js', code);
  console.log('Edit mode function added!');
} else {
  console.log('Edit mode function already exists!');
}
