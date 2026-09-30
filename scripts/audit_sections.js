const fs = require('fs');

const panel = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const js = fs.readFileSync('super-admin.js', 'utf8');

// Find all sections (<div class="content-section" id="...">)
const secRegex = /<div[^>]*class=["'][^"']*content-section[^"']*["'][^>]*id=["']([^"']+)["']|<div[^>]*id=["']([^"']+)["'][^>]*class=["'][^"']*content-section[^"']*["']/gi;
let m;
const panelSections = [];
while ((m = secRegex.exec(panel)) !== null) {
  panelSections.push(m[1] || m[2]);
}

console.log('Total sections found in views/super-admin-panel.html:', panelSections.length);
console.log(panelSections);

// Find menu-items data-target
const menuItemRegex = /class=["'][^"']*menu-item[^"']*["'][^>]*data-target=["']([^"']+)["']/gi;
const menuTargets = [];
while ((m = menuItemRegex.exec(panel)) !== null) {
  menuTargets.push(m[1]);
}
console.log('\nTotal menu items found:', menuTargets.length);

// Compare
const missingInPanel = menuTargets.filter(t => !panelSections.includes(t));
console.log('\nMenu items with NO matching section:', missingInPanel);

const unlinkedSections = panelSections.filter(s => !menuTargets.includes(s));
console.log('\nSections with NO menu item:', unlinkedSections);
