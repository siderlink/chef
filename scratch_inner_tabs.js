const fs = require('fs');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');

console.log('Nav-tabs:', (html.match(/nav-tabs/g) || []).length);
console.log('Sub-tabs:', (html.match(/class="[^"]*sub-tab[^"]*"/g) || []).length);
console.log('Tab-panes:', (html.match(/tab-pane/g) || []).length);
console.log('Tabs:', (html.match(/class="[^"]*tab[^"]*"/g) || []).length);
