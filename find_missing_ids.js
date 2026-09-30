const fs = require('fs');
const html = fs.readFileSync('painel-dono.html', 'utf8');
const js = fs.readFileSync('painel-dono.js', 'utf8');

const idRegex = /document\.getElementById\(['"](.*?)['"]\)/g;
let match;
const missingIds = new Set();

while ((match = idRegex.exec(js)) !== null) {
  const id = match[1];
  if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
    missingIds.add(id);
  }
}

console.log('Missing IDs referenced by JS:', Array.from(missingIds));
