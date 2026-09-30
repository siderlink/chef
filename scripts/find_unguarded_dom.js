const fs = require('fs');
const js = fs.readFileSync('super-admin.js', 'utf8');

const regex = /document\.getElementById\(['"]([^'"]+)['"]\)\.(value|style|innerHTML|textContent|checked)/g;
let m;
const unshielded = [];
while ((m = regex.exec(js)) !== null) {
  // Check if preceded by if (document.getElementById('...')) or var x = document.getElementById
  const before = js.substring(Math.max(0, m.index - 80), m.index);
  const id = m[1];
  const prop = m[2];
  const line = js.substring(0, m.index).split('\n').length;
  // If not guarded by ternary or if condition
  if (!before.includes(`document.getElementById('${id}') ?`) && !before.includes(`document.getElementById("${id}") ?`)) {
    unshielded.push({ line, id, prop });
  }
}

console.log(`Found ${unshielded.length} unguarded direct property accesses on document.getElementById:`);
unshielded.forEach(u => console.log(`  Line ${u.line}: document.getElementById('${u.id}').${u.prop}`));
