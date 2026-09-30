const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const lines = html.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('EQUIPE & PARCEIROS') || lines[i].includes('FINANCEIRO & CUSTÓDIA')) {
    console.log('--- ' + lines[i].trim() + ' ---');
    for (let j = i; j < i + 15; j++) {
      console.log(lines[j].trim());
    }
  }
}
