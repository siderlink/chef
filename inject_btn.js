const fs = require('fs');
let html = fs.readFileSync('painel-dono.html', 'utf8');

if (html.includes('window.abrirModalReordenarSeccoes()')) {
  if (!html.includes('id="btn-edit-mode"')) {
    html = html.replace(/<button[^>]*onclick="window\.abrirModalReordenarSeccoes\(\)"[^>]*>[\s\S]*?<\/button>/, match => {
      return '<button id="btn-edit-mode" class="btn-reportar-problema btn-header-action" onclick="window.toggleModoEdicao()" style="background:var(--yellow); color:#000; border-color:var(--yellow); margin-right:8px; font-weight:800;"><i class="ph-bold ph-pencil-simple"></i> Modo Edição</button>\n      ' + match;
    });
    fs.writeFileSync('painel-dono.html', html);
    console.log('Button injected successfully via regex.');
  } else {
    console.log('Already injected.');
  }
} else {
  console.log('Target string not found.');
}
