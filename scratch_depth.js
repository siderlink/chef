const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const lines = html.split('\n');
let open = 0;
for (let i = 0; i < lines.length; i++) {
  open += (lines[i].match(/<div/g) || []).length;
  open -= (lines[i].match(/<\/div/g) || []).length;
  if (lines[i].includes('id="sec-fin-gateways"')) {
    console.log('Depth at sec-fin-gateways:', open);
  }
}
