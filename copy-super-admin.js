const fs = require('fs');

const filesToSync = [
  'super-admin.html',
  'super-admin.js',
  'super-admin-script.js',
  'guia-sync.html',
  'hub-marketing.html',
  'kds.html',
  'importar-xml.html',
  'rastreio.html',
  'painel-tv.html',
  'configuracoes.html',
  'configuracoes.js',
  'garcom.html',
  'garcom.js'
];

['dist', 'public'].forEach(targetDir => {
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  filesToSync.forEach(f => {
    if (fs.existsSync(f)) {
      fs.copyFileSync(f, `${targetDir}/${f}`);
    }
  });
});

if (fs.existsSync('views/super-admin-panel.html')) {
  if (!fs.existsSync('dist/views')) fs.mkdirSync('dist/views', { recursive: true });
  fs.copyFileSync('views/super-admin-panel.html', 'dist/views/super-admin-panel.html');
}
console.log('✅ Arquivos sincronizados com dist/ e public/ com sucesso!');
