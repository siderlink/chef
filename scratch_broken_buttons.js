const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');

const switchTabCalls = [...html.matchAll(/switchTab\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
const uniqueSwitchTabCalls = [...new Set(switchTabCalls)];
const sections = [...html.matchAll(/class="[^"]*content-section[^"]*"[^>]*id="([^"]+)"/g)].map(m => m[1]);

const brokenLinks = uniqueSwitchTabCalls.filter(s => !sections.includes(s));
console.log('Buttons calling switchTab for non-existent sections:');
console.log(brokenLinks);
