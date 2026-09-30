const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const lines = html.split('\n');
lines.forEach(l => {
  if (l.includes('onclick="') && (l.toLowerCase().includes('salvar') || l.toLowerCase().includes('processar'))) {
    console.log(l.trim());
  }
});
