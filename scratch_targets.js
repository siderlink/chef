const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');

const targets = [...html.matchAll(/data-target="([^"]+)"/g)].map(m => m[1]);
console.log('All data-targets:');
console.log([...new Set(targets)]);
