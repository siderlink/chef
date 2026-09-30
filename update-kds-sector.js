const fs = require('fs');

function fixHtml(file) {
  let html = fs.readFileSync(file, 'utf8');
  
  // 1. Make the badge clickable
  html = html.replace(
    '<div class="kds-brand-badge">',
    '<div class="kds-brand-badge" style="cursor:pointer;" onclick="window.abrirModalSetor()" title="Mudar Setor">'
  );

  // 2. Make the center navbar chip clickable
  html = html.replace(
    '<button class="kds-chip-item active sector-modal-btn" data-sector="Todos" onclick="filtrarSetor(\'Todos\')">',
    '<button class="kds-chip-item active sector-modal-btn" data-sector="Todos" onclick="window.abrirModalSetor()">\n            <i class="ph-bold ph-storefront"></i> <span>Todos os Setores</span>\n            <i class="ph-bold ph-caret-down" style="margin-left: 5px;"></i>\n          </button>\n          <!-- '
  );
  
  // Clean up the comment from the replace
  html = html.replace('</button>\n          <!-- \n            <i class="ph-bold ph-storefront"></i> <span>Todos os Setores</span>\n          </button>', '</button>');
  
  // Just simple replace for the chip to avoid regex mess
  html = html.replace(
    /onclick="filtrarSetor\('Todos'\)"[^>]*>\s*<i class="ph-bold ph-storefront"><\/i> <span>Todos os Setores<\/span>\s*<\/button>/,
    'onclick="window.abrirModalSetor()"><i class="ph-bold ph-storefront"></i> <span>Todos os Setores</span> <i class="ph-bold ph-caret-down" style="margin-left:5px;"></i></button>'
  );

  fs.writeFileSync(file, html);
}

fixHtml('fila-pedidos.html');
try { fixHtml('src/views/cozinha/fila-pedidos.html'); } catch(e){}
console.log('OK');
