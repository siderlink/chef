const fs = require('fs');
let css = fs.readFileSync('fila-classica.css', 'utf8');

// Replace width: <any>px !important; ONLY if it's for sidebar-sectors or right-panel-status
// Actually, let's just strip "width: \d+px !important;" from the .app-container.sidebar-mode-fixa blocks.
// Wait, we can just replace "width: 110px !important;" with "min-width: 60px;" etc.
css = css.replace(/width:\s*\d+px\s*!important;/g, (match) => {
  // We'll just remove !important so inline styles can win!
  return match.replace('!important', '');
});

// We should also check for any min-width or max-width that has !important preventing dragging
css = css.replace(/min-width:\s*\d+px\s*!important;/g, (match) => match.replace('!important', ''));
css = css.replace(/max-width:\s*\d+px\s*!important;/g, (match) => match.replace('!important', ''));

fs.writeFileSync('fila-classica.css', css);
console.log('Fixed CSS !important widths');
