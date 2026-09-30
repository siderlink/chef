const fs = require('fs');
let html = fs.readFileSync('painel-dono.html', 'utf8');

if (!html.includes('id="btn-edit-mode"')) {
  const btnModularizar = '<button class="btn-modular" onclick="window.abrirModalReordenarSeccoes()">';
  const newBtns = '<button id="btn-edit-mode" class="btn-modular" onclick="window.toggleModoEdicao()" style="background:var(--yellow); color:#000; border-color:var(--yellow); margin-right:8px;"><i class="ph-bold ph-pencil-simple"></i> Modo Edição</button>\n      ' + btnModularizar;
  html = html.replace(btnModularizar, newBtns);
  fs.writeFileSync('painel-dono.html', html);
  console.log('Added Edit Mode button to HTML.');
} else {
  console.log('Edit Mode button already exists.');
}
