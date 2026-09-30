const fs = require('fs');

function hideDockAndAddSettings(file) {
  let h = fs.readFileSync(file, 'utf8');
  
  // Hide dock
  if (!h.includes('window.HIDE_COLAB_DOCK_BTN = true;')) {
    h = h.replace(/window\.PUSH_ROLE\s*=\s*'cozinha';/g, "window.PUSH_ROLE = 'cozinha'; window.HIDE_COLAB_DOCK_BTN = true;");
  }

  // Add "Perfil do Operador" to the Fila Settings modal, right at the top of the body
  const searchStr = '<div class="fila-settings-body">';
  const insertStr = `<div class="fila-settings-group">
          <span class="fila-settings-label">Usuário Ativo</span>
          <button type="button" class="fila-settings-btn" onclick="window.abrirAreaColaboradorModal && window.abrirAreaColaboradorModal()" style="display:flex; justify-content:flex-start; gap:10px; border-color:var(--border-color); color:var(--text); background:transparent;">
            <i class="ph-bold ph-user" style="color:var(--primary);"></i>
            <span style="font-weight:700;">Trocar Usuário (Área do Colaborador)</span>
          </button>
        </div>\n        `;
        
  if (!h.includes('Trocar Usuário (Área do Colaborador)')) {
    h = h.replace(searchStr, searchStr + '\n        ' + insertStr);
  }

  fs.writeFileSync(file, h);
  console.log('Fixed ' + file);
}

hideDockAndAddSettings('fila-pedidos-classica.html');
try { hideDockAndAddSettings('src/views/cozinha/fila-pedidos-classica.html'); } catch(e){}
hideDockAndAddSettings('fila-pedidos.html');
try { hideDockAndAddSettings('src/views/cozinha/fila-pedidos.html'); } catch(e){}
