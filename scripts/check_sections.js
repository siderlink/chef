const fs = require('fs');

const panel = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const js = fs.readFileSync('super-admin.js', 'utf8');

// Find all elements with id="sec-..."
const secRegex = /id=["'](sec-[^"']+)["']/gi;
let m;
const sections = [];
while ((m = secRegex.exec(panel)) !== null) {
  sections.push(m[1]);
}

console.log(`Found ${sections.length} sec- elements in views/super-admin-panel.html:`);
console.log(sections);

// Also find all menu items data-target="..."
const menuRegex = /data-target=["']([^"']+)["']/gi;
const menuTargets = [];
while ((m = menuRegex.exec(panel)) !== null) {
  menuTargets.push(m[1]);
}
console.log(`\nFound ${menuTargets.length} data-target items:`);
console.log([...new Set(menuTargets)]);
