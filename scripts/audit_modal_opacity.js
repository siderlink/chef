const fs = require('fs');

const js = fs.readFileSync('super-admin.js', 'utf8');
const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');

// Find all elements in views/super-admin-panel.html that have modal or modal-overlay or modal-content
const modalRegex = /<div[^>]*class="([^"]*modal[^"]*)"[^>]*id="([^"]+)"/g;
let m;
const modalsInHtml = {};
while ((m = modalRegex.exec(html)) !== null) {
  modalsInHtml[m[2]] = m[1];
}

console.log('=== CHECKING ALL MODAL OPEN FUNCTIONS IN super-admin.js ===');

for (const [modalId, cls] of Object.entries(modalsInHtml)) {
  // Find occurrences of modalId in JS
  const regex = new RegExp(`['"]${modalId}['"]`, 'g');
  let match;
  const occurrences = [];
  while ((match = regex.exec(js)) !== null) {
    // get surrounding lines
    const start = Math.max(0, match.index - 50);
    const end = Math.min(js.length, match.index + 200);
    occurrences.push(js.substring(start, end).replace(/\s+/g, ' '));
  }
  
  // Check if it sets style.display = 'flex' without classList.add('active') or vice-versa
  const setsDisplayOnly = occurrences.some(o => o.includes('.style.display') && !o.includes(".classList.add('active')") && !o.includes('.classList.add("active")'));
  const setsActiveOnly = occurrences.some(o => o.includes(".classList.add('active')") && !o.includes('.style.display'));
  
  console.log(`\nModal #${modalId} (${cls}):`);
  occurrences.forEach(o => console.log('  ' + o.slice(0, 100)));
  if (cls.includes('modal-overlay') && setsDisplayOnly) {
    console.log(`  🚨 DANGER: Sets display without .active, but .modal-overlay has opacity: 0 by default!`);
  }
}
