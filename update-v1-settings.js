const fs = require('fs');

function fixV1Html(file) {
  let html = fs.readFileSync(file, 'utf8');
  
  // Insert the gear button before the "Fila V2 Moderna" button
  const searchStr = '<button type="button" onclick="window.trocarVersaoFila(\'nova\')" class="fila-settings-btn"';
  const insertStr = `<button id="btn-fila-settings-top" class="fila-settings-btn" onclick="document.getElementById('modal-fila-settings').style.display='flex'" title="Configurações da Fila" style="min-width: 42px;"><i class="ph-bold ph-gear"></i></button>\n              `;
  
  if (!html.includes('id="btn-fila-settings-top"')) {
    html = html.replace(searchStr, insertStr + searchStr);
    fs.writeFileSync(file, html);
    console.log('Fixed ' + file);
  } else {
    console.log('Already fixed ' + file);
  }
}

fixV1Html('fila-pedidos-classica.html');
try { fixV1Html('src/views/cozinha/fila-pedidos-classica.html'); } catch(e){}
