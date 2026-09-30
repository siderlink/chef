const fs = require('fs');
function fixHtml(file) {
  let h = fs.readFileSync(file, 'utf8');
  if (!h.includes('id="btn-toggle-fullscreen"')) {
    h = h.replace('<button id="btn-fila-settings-top"', '<button id="btn-toggle-fullscreen" onclick="if(!document.fullscreenElement){document.documentElement.requestFullscreen().catch(()=>{});}else{document.exitFullscreen().catch(()=>{});}" class="fila-settings-btn" title="Tela Cheia" style="min-width: 42px;"><i class="ph-bold ph-corners-out"></i></button>\n              <button id="btn-fila-settings-top"');
    fs.writeFileSync(file, h);
    console.log('Fixed', file);
  }
}
fixHtml('fila-pedidos-classica.html');
try { fixHtml('src/views/cozinha/fila-pedidos-classica.html'); } catch(e){}
