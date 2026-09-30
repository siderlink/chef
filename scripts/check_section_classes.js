const fs = require('fs');
const panel = fs.readFileSync('views/super-admin-panel.html', 'utf8');

const matches = panel.match(/<[^>]+id=["']sec-[^"']+["'][^>]*>/g) || [];
console.log(`Found ${matches.length} matching tags:`);
matches.forEach(tag => {
  const idM = tag.match(/id=["']([^"']+)["']/);
  const classM = tag.match(/class=["']([^"']+)["']/);
  const styleM = tag.match(/style=["']([^"']+)["']/);
  console.log(`${idM ? idM[1] : 'unknown'} -> class: "${classM ? classM[1] : ''}", style: "${styleM ? styleM[1] : ''}"`);
});
