const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const js = fs.readFileSync('public/super-admin.js', 'utf8');

const menuMatches = [...html.matchAll(/class="[^"]*menu-item[^"]*"[^>]*data-target="([^"]+)"/g)].map(m => m[1]);

const switchTabFull = js.match(/function switchTab\(targetId\)\s*\{([\s\S]*?)function/);
const fullBody = switchTabFull ? switchTabFull[1] : '';
const jsTargetsFull = [...fullBody.matchAll(/targetId === \'([^\']+)\'/g)].map(m => m[1]);

const missingJsHandlers = menuMatches.filter(m => !jsTargetsFull.includes(m) && m !== 'sec-tema-custom');
console.log('Menu items without JS handler in public/super-admin.js:', missingJsHandlers);

const loadersCalled = [...fullBody.matchAll(/typeof (?:window\.)?([a-zA-Z0-9_]+)\s*===/g)].map(m => m[1]);
const missingLoaders = loadersCalled.filter(fn => !js.includes('function ' + fn) && !js.includes('window.' + fn + ' ='));
console.log('Loaders missing definition in public/super-admin.js:', missingLoaders);
