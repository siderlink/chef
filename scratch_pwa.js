const fs = require('fs');

const apps = ['garcom', 'cozinha', 'motoboy', 'pdv', 'gerente'];
let baseHtml = fs.readFileSync('pwa-loader.html', 'utf8');

for (const id of apps) {
  let newHtml = baseHtml.replace('<link rel="manifest" href="/manifest-central.json">', `<link rel="manifest" href="/manifest-${id}.json">`);
  
  // Also we can inject the specific app in JS, so we don't even need the ?app parameter (but keep it compatible just in case)
  newHtml = newHtml.replace("const appId = params.get('app') || 'garcom';", `const appId = params.get('app') || '${id}';`);
  
  fs.writeFileSync(`pwa-${id}.html`, newHtml);
}

// Update central-pwa.html
let central = fs.readFileSync('central-pwa.html', 'utf8');
central = central.replace(/\/pwa-loader\.html\?app=garcom/g, '/pwa-garcom.html');
central = central.replace(/\/pwa-loader\.html\?app=cozinha/g, '/pwa-cozinha.html');
central = central.replace(/\/pwa-loader\.html\?app=motoboy/g, '/pwa-motoboy.html');
central = central.replace(/\/pwa-loader\.html\?app=pdv/g, '/pwa-pdv.html');
central = central.replace(/\/pwa-loader\.html\?app=gerente/g, '/pwa-gerente.html');
fs.writeFileSync('central-pwa.html', central);

console.log('PWA pages created and linked!');
