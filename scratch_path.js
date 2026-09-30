const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const lines = html.split('\n');
let path = [];
for (let i = 0; i < lines.length; i++) {
  const opens = [...lines[i].matchAll(/<div[^>]*>/g)].map(m => m[0]);
  const closes = [...lines[i].matchAll(/<\/div>/g)].map(m => m[0]);
  
  for(let tag of opens) {
    const idMatch = tag.match(/id="([^"]+)"/);
    const clsMatch = tag.match(/class="([^"]+)"/);
    path.push((idMatch ? '#' + idMatch[1] : '') + (clsMatch ? '.' + clsMatch[1].replace(/\s+/g, '.') : ''));
  }
  for(let tag of closes) {
    path.pop();
  }
  
  if (lines[i].includes('id="sec-fin-gateways"')) {
    console.log('DOM Path to sec-fin-gateways:');
    console.log(path.join(' > '));
    break;
  }
}
