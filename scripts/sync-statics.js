/**
 * scripts/sync-statics.js
 * Garante que os arquivos entre a raiz, src/ e public/ estejam sempre sincronizados,
 * prevenindo divergências e bugs fantasmas durante o desenvolvimento ou build.
 */
const fs = require('fs');
const path = require('path');

const mappings = [
  ['dark-mode.css', 'src/css/dark-mode.css'],
  ['fila.css', 'src/css/fila.css'],
  ['style.css', 'src/css/style.css'],
  ['device-adapters.css', 'public/device-adapters.css'],
  ['device-adapters.js', 'public/device-adapters.js'],
  ['chef-layout-customizer.js', 'public/chef-layout-customizer.js'],
  ['auth.js', 'src/js/modules/auth.js'],
  ['auth_device.js', 'src/js/modules/auth_device.js'],
  ['broadcast.js', 'src/js/modules/broadcast.js'],
  ['caixa-checkout.js', 'src/js/modules/caixa-checkout.js'],
  ['caixa-impressoes.js', 'src/js/modules/caixa-impressoes.js'],
  ['caixa-mesas.js', 'src/js/modules/caixa-mesas.js'],
  ['fuzzy-search.js', 'src/js/modules/fuzzy-search.js'],
  ['pwa-telemetry.js', 'src/js/modules/pwa-telemetry.js'],
  ['shortcuts.js', 'src/js/modules/shortcuts.js'],
  ['tracking.js', 'src/js/modules/tracking.js'],
  ['wizard.js', 'src/js/modules/wizard.js'],
  ['configuracoes.js', 'src/js/pages/configuracoes.js'],
  ['fila.js', 'src/js/pages/fila.js'],
  ['garcom.js', 'src/js/pages/garcom.js'],
  ['login.js', 'src/js/pages/login.js'],
  ['main.js', 'src/js/pages/main.js'],
  ['configuracoes.html', 'src/views/admin/configuracoes.html'],
  ['painel-dono.html', 'src/views/admin/painel-dono.html'],
  ['super-admin.html', 'src/views/admin/super-admin.html'],
  ['cardapio.html', 'src/views/autoatendimento/cardapio.html'],
  ['pdv-mobile.html', 'src/views/autoatendimento/pdv-mobile.html'],
  ['totem.html', 'src/views/autoatendimento/totem.html'],
  ['caixa-classico.html', 'src/views/caixa/caixa-classico.html'],
  ['caixa-ultra.html', 'src/views/caixa/caixa-ultra.html'],
  ['caixa-v11.html', 'src/views/caixa/caixa-v11.html'],
  ['index.html', 'src/views/caixa/index.html'],
  ['fila-lite.html', 'src/views/cozinha/fila-lite.html'],
  ['fila-pedidos-classica.html', 'src/views/cozinha/fila-pedidos-classica.html'],
  ['fila-pedidos.html', 'src/views/cozinha/fila-pedidos.html'],
  ['garcom-lite.html', 'src/views/garcom/garcom-lite.html'],
  ['garcom.html', 'src/views/garcom/garcom.html']
];

let syncCount = 0;
mappings.forEach(([root, sub]) => {
  const rootPath = path.resolve(__dirname, '..', root);
  const subPath = path.resolve(__dirname, '..', sub);

  if (fs.existsSync(rootPath) && fs.existsSync(subPath)) {
    const rootStat = fs.statSync(rootPath);
    const subStat = fs.statSync(subPath);

    if (rootStat.mtimeMs > subStat.mtimeMs) {
      fs.copyFileSync(rootPath, subPath);
      syncCount++;
    } else if (subStat.mtimeMs > rootStat.mtimeMs) {
      fs.copyFileSync(subPath, rootPath);
      syncCount++;
    }
  } else if (fs.existsSync(rootPath) && !fs.existsSync(subPath)) {
    fs.mkdirSync(path.dirname(subPath), { recursive: true });
    fs.copyFileSync(rootPath, subPath);
    syncCount++;
  } else if (!fs.existsSync(rootPath) && fs.existsSync(subPath)) {
    fs.copyFileSync(subPath, rootPath);
    syncCount++;
  }
});

console.log(`[sync-statics] ${syncCount} arquivo(s) sincronizados com sucesso.`);
