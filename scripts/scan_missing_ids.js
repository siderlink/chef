const fs = require('fs');
const js = fs.readFileSync('super-admin.js', 'utf8');
const panel = fs.readFileSync('views/super-admin-panel.html', 'utf8');

const regex = /document\.getElementById\(['"]([^'"]+)['"]\)\.value/g;
let m;
const unguarded = new Set();
while ((m = regex.exec(js)) !== null) {
  unguarded.add(m[1]);
}

const missing = [];
unguarded.forEach(id => {
  if (!panel.includes(`id="${id}"`) && !panel.includes(`id='${id}'`)) {
    missing.push(id);
  }
});

console.log(`Of ${unguarded.size} accessed IDs, ${missing.length} do NOT exist in super-admin-panel.html:`);
console.log(missing);
