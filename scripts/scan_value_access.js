const fs = require('fs');
const js = fs.readFileSync('super-admin.js', 'utf8');

const regex = /document\.getElementById\(['"]([^'"]+)['"]\)\.value/g;
let m;
const unguarded = [];
while ((m = regex.exec(js)) !== null) {
  unguarded.push(m[1]);
}

console.log(`Found ${unguarded.length} direct .value accesses:`);
console.log([...new Set(unguarded)]);
