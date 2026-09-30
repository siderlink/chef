const fs = require('fs');

const html = fs.readFileSync('views/super-admin-panel.html', 'utf8') + '\n' + fs.readFileSync('super-admin.html', 'utf8');
const js = fs.readFileSync('super-admin.js', 'utf8');

// Find all patterns like document.getElementById('foo').property or .method()
// or var x = document.getElementById('foo'); x.property without if (x)
const directAccessRegex = /document\.getElementById\(['"]([^'"]+)['"]\)\.([a-zA-Z0-9_$]+)/g;
let m;
const directNullDangers = [];
while ((m = directAccessRegex.exec(js)) !== null) {
  const id = m[1];
  const prop = m[2];
  const existsInHtml = html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
  if (!existsInHtml) {
    directNullDangers.push({ id, prop, index: m.index });
  }
}

console.log(`Direct property access on MISSING elements (${directNullDangers.length}):`);
for (const item of directNullDangers) {
  const line = js.substring(0, item.index).split('\n').length;
  console.log(`  ❌ Line ${line}: document.getElementById('${item.id}').${item.prop} (element #${item.id} NOT in HTML!)`);
}

// Check querySelector direct property accesses
const qsDirectRegex = /document\.querySelector\(['"]([^'"]+)['"]\)\.([a-zA-Z0-9_$]+)/g;
while ((m = qsDirectRegex.exec(js)) !== null) {
  const sel = m[1];
  const prop = m[2];
  const line = js.substring(0, m.index).split('\n').length;
  console.log(`  ⚠️ Line ${line}: document.querySelector('${sel}').${prop}`);
}
