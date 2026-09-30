const fs = require('fs');

const html = fs.readFileSync('views/super-admin-panel.html', 'utf8');
const loginHtml = fs.existsSync('super-admin.html') ? fs.readFileSync('super-admin.html', 'utf8') : '';
const js = fs.readFileSync('super-admin.js', 'utf8');

// Extract all getElementById calls in super-admin.js
const idMatches = Array.from(js.matchAll(/document\.getElementById\(['"]([^'"]+)['"]\)/g)).map(m => m[1]);
const uniqueIds = [...new Set(idMatches)];

console.log(`Total getElementById queries in super-admin.js: ${idMatches.length} (${uniqueIds.length} unique)`);

// Check which IDs are NOT in views/super-admin-panel.html and not in super-admin.html
const missingIds = [];
for (const id of uniqueIds) {
  const inPanel = html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
  const inLogin = loginHtml.includes(`id="${id}"`) || loginHtml.includes(`id='${id}'`);
  const isCreatedInJs = js.includes(`.id = '${id}'`) || js.includes(`.id = "${id}"`);
  if (!inPanel && !inLogin && !isCreatedInJs) {
    missingIds.push(id);
  }
}

console.log(`\nFound ${missingIds.length} IDs queried in JS but NOT present in views/super-admin-panel.html:`);

// Group by section or context
for (const id of missingIds) {
  // Find where it's used in JS
  const regex = new RegExp(`document\\.getElementById\\(['"]${id}['"]\\)`, 'g');
  const matches = [...js.matchAll(regex)];
  const contexts = matches.map(m => {
    const start = Math.max(0, m.index - 80);
    const end = Math.min(js.length, m.index + 120);
    return js.substring(start, end).replace(/\s+/g, ' ');
  });
  console.log(`\n• ID: "${id}" (${matches.length} occurrences)`);
  console.log(`  Context: ${contexts[0]}`);
}
