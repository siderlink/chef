const fs = require('fs');
const js = fs.readFileSync('super-admin.js', 'utf8');

const switchTabFull = js.match(/function switchTab\(targetId\)\s*\{([\s\S]*?)function/);
const fullBody = switchTabFull ? switchTabFull[1] : '';

// Check loaders called inside switchTab
const loadersCalled = [...fullBody.matchAll(/typeof (?:window\.)?([a-zA-Z0-9_]+)\s*===/g)].map(m => m[1]);

const missingLoaders = loadersCalled.filter(fn => !js.includes('function ' + fn) && !js.includes('window.' + fn + ' ='));

console.log('Loaders called in switchTab:', loadersCalled.length);
console.log('Loaders missing definition in super-admin.js:');
console.log(missingLoaders);
