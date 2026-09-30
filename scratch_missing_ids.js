const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const ids = [
  'cfg-asaas-ativo', 'cfg-asaas-sandbox', 'cfg-asaas-api-key', 'cfg-asaas-webhook-token',
  'cfg-mp-ativo', 'cfg-mp-sandbox', 'cfg-mp-access-token', 'cfg-mp-public-key',
  'cfg-dias-custodia', 'cfg-taxa-plataforma', 'cfg-gateway-padrao', 'cfg-auto-liberar', 'cfg-bloqueio-contestacao'
];
ids.forEach(id => {
  if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
    console.log('MISSING:', id);
  }
});
