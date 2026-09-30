const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const js = fs.readFileSync('super-admin.js', 'utf8');

const htmlMatches = [...html.matchAll(/class="[^"]*content-section[^"]*"[^>]*id="([^"]+)"/g)].map(m => m[1]);
const menuMatches = [...html.matchAll(/class="[^"]*menu-item[^"]*"[^>]*data-target="([^"]+)"/g)].map(m => m[1]);
const jsTargets = [...js.matchAll(/targetId\s*===\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

console.log('Menu targets in HTML:', menuMatches.length);
console.log('Handled in switchTab:', jsTargets.length);

const missingHtml = menuMatches.filter(m => !htmlMatches.includes(m));
console.log('\nMenu items without HTML section:', missingHtml);

const missingJs = menuMatches.filter(m => !jsTargets.includes(m) && m !== 'sec-tema-custom');
console.log('\nMenu items without JS handler:', missingJs);
