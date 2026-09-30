const fs = require('fs');
const html = fs.readFileSync('painel-dono.html', 'utf8');
const lines = html.split('\n');
const start = lines.findIndex(l => l.includes('class="dashboard-cards"') || l.includes('class="dashboard-grid"') || l.includes('class="widgets"') || l.includes('main-content'));
if(start !== -1) {
  for(let i=start; i<start+40; i++) console.log(lines[i]);
}
