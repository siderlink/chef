const fs = require('fs');
const path = require('path');

const files = [
  'caixa-ultra.js',
  'caixa-ultra-3d.js',
  'caixa-v11.js',
  'caixa-v2.js',
  'pdv-mobile.js',
  'public/pdv-mobile.js',
  'hub-server/public/pdv-mobile.js',
  'fila.js',
  'fila-classica.js',
  'src/js/pages/main.js',
  'main.js',
  'garcom.js',
  'caixa-ultra-game.js'
];

for (const file of files) {
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) continue;
  
  let content = fs.readFileSync(p, 'utf-8');
  let changed = false;

  const fixReg = /window\.customNfceConfig\.Math\.max\(0, ([a-zA-Z0-9_]+)\)/g;
  if (fixReg.test(content)) {
    content = content.replace(fixReg, 'Math.max(0, window.customNfceConfig.$1)');
    changed = true;
  }
  
  const fixReg2 = /this\.Math\.max\(0, ([a-zA-Z0-9_]+)\)/g;
  if (fixReg2.test(content)) {
    content = content.replace(fixReg2, 'Math.max(0, this.$1)');
    changed = true;
  }
  
  const fixReg3 = /([a-zA-Z0-9_]+\.[a-zA-Z0-9_]+)\.Math\.max\(0, ([a-zA-Z0-9_]+)\)/g;
  if (fixReg3.test(content)) {
    content = content.replace(fixReg3, 'Math.max(0, $1.$2)');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(p, content, 'utf-8');
    console.log('Fixed syntax error in', file);
  }
}
