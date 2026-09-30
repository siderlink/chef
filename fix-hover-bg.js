const fs = require('fs');
let css = fs.readFileSync('fila-classica.css', 'utf8');

// The hardcoded #ffffff backgrounds for hover sidebars prevent dark mode
css = css.replace(/background:\s*#ffffff\s*!important;/gi, 'background: var(--bg-panel, #ffffff) !important;');
// Just in case they wrote #fff
css = css.replace(/background:\s*#fff\s*!important;/gi, 'background: var(--bg-panel, #ffffff) !important;');

fs.writeFileSync('fila-classica.css', css);
console.log('Fixed hover sidebar backgrounds in fila-classica.css');
