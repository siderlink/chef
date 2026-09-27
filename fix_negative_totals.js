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

let filesModified = 0;

for (const file of files) {
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) continue;
  
  let content = fs.readFileSync(p, 'utf-8');
  let changed = false;

  // Pattern 1: Object.keys(grouped).forEach(...) -> Math.max(0, ...)
  // Let's just find where `total: ` is assigned from `grouped`
  // Actually, an easier way is to find where .total is calculated and add Math.max(0, ...) right before we render or use it.
  
  // Or simpler: replace all instances of:
  // `total += val;` or `total += parseFloat`
  // Actually, floating point is best fixed by clamping it when we are about to push to results.

  // Let's replace `m.total.toFixed(2)` with `Math.max(0, m.total).toFixed(2)`
  const regex1 = /m\.total\.toFixed\((2|1|0)\)/g;
  if (regex1.test(content)) {
    content = content.replace(regex1, 'Math.max(0, m.total).toFixed($1)');
    changed = true;
  }
  
  const regex2 = /mesa\.total\.toFixed\((2|1|0)\)/g;
  if (regex2.test(content)) {
    content = content.replace(regex2, 'Math.max(0, mesa.total).toFixed($1)');
    changed = true;
  }

  // Handle where `m.total` or `mesa.total` might be used as `val`
  // like: `R$ ${m.total.toFixed(2)}` is already covered above.
  
  // Handle `grouped[key].total = Math.max(0, grouped[key].total)` inside Object.keys(...)
  // We can look for `mesasVistas.add(k.toLowerCase());` or similar to inject.
  
  // Let's do a more generic pass: find anywhere that `.toFixed(2)` is used on a total and clamp it.
  const regex3 = /([a-zA-Z0-9_]+)\.total\.toFixed\((2|1|0)\)/g;
  content = content.replace(regex3, (match, p1, p2) => {
    changed = true;
    return `Math.max(0, ${p1}.total).toFixed(${p2})`;
  });

  // What about `totalComTaxa.toFixed(2)`?
  const regex4 = /([a-zA-Z0-9_]*total[a-zA-Z0-9_]*)\.toFixed\((2|1|0)\)/ig;
  content = content.replace(regex4, (match, p1, p2) => {
    // Avoid double applying Math.max(0, Math.max(0, total))
    if (content.indexOf(`Math.max(0, ${p1})`) !== -1) return match; 
    changed = true;
    return `Math.max(0, ${p1}).toFixed(${p2})`;
  });

  if (changed) {
    fs.writeFileSync(p, content, 'utf-8');
    filesModified++;
    console.log('Fixed', file);
  }
}

console.log(`Modified ${filesModified} files.`);
