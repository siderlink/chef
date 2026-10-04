const fs = require('fs');
['caixa-classico.html', 'src/views/caixa/caixa-classico.html'].forEach(f => {
  if (!fs.existsSync(f)) return;
  let c = fs.readFileSync(f, 'utf8');
  if (!c.includes('chef-layout-customizer.js')) {
    c = c.replace('</head>', '  <script src="/chef-layout-customizer.js" defer></script>\n</head>');
    fs.writeFileSync(f, c, 'utf8');
    console.log('Added customizer to', f);
  }
});
