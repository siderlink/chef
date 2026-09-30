const fs = require('fs');
let html = fs.readFileSync('painel-dono.html', 'utf8');
if (!html.includes('Sortable.min.js')) {
  html = html.replace('<script src="/device-adapters.js"></script>', '<script src="/vendor/sortablejs/Sortable.min.js"></script>\n  <script src="/device-adapters.js"></script>');
  fs.writeFileSync('painel-dono.html', html);
  console.log('Sortable added to HTML.');
} else {
  console.log('Sortable already in HTML.');
}
