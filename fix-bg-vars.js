const fs = require('fs');
let css = fs.readFileSync('fila-classica.css', 'utf8');

// Replace var(--bg-panel, #ffffff) with var(--bg-sidebar) globally
css = css.replace(/var\(--bg-panel, #ffffff\)/g, 'var(--bg-sidebar)');

fs.writeFileSync('fila-classica.css', css);
console.log('Fixed background variables');
