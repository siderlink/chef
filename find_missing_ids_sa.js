const fs = require('fs');
let html = '';
try {
  html = fs.readFileSync('public/super-admin.html', 'utf8');
} catch(e) {
  html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
}
const js = fs.readFileSync('public/super-admin.js', 'utf8');

const idRegex = /document\.getElementById\(['"](.*?)['"]\)/g;
let match;
const missingIds = new Set();

while ((match = idRegex.exec(js)) !== null) {
  const id = match[1];
  if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
    missingIds.add(id);
  }
}

console.log('Missing IDs referenced by JS in super-admin:', Array.from(missingIds));
