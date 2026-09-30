const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const lines = html.split('\n');
let open = 0;
for (let i = 0; i < lines.length; i++) {
  open += (lines[i].match(/<div/g) || []).length;
  open -= (lines[i].match(/<\/div/g) || []).length;
  if (lines[i].includes('class="content-section"') || lines[i].includes('class="content-section active"')) {
    console.log('Depth at', lines[i].trim(), 'is', open);
  }
}
