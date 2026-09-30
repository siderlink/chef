const fs = require('fs');

function extractModals(file) {
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/id=["'](modal-[^"']+)["']/g) || [];
  return matches.map(m => m.replace(/id=["']|["']/g, ''));
}

const htmlModals = extractModals('views/super-admin-panel.html');
console.log('Modals in views/super-admin-panel.html:');
console.log(JSON.stringify([...new Set(htmlModals)].sort(), null, 2));

const jsContent = fs.readFileSync('super-admin.js', 'utf8');
const jsMatches = jsContent.match(/document\.getElementById\(['"](modal-[^'"]+)['"]\)/g) || [];
const jsModals = jsMatches.map(m => m.replace(/document\.getElementById\(['"]|['"]\)/g, ''));
console.log('\nModals referenced in super-admin.js:');
console.log(JSON.stringify([...new Set(jsModals)].sort(), null, 2));

// Compare
const panelModalSet = new Set(htmlModals);
const missingInPanel = [...new Set(jsModals)].filter(m => !panelModalSet.has(m) && !m.includes('-title') && !m.includes('-corpo') && !m.includes('-fields') && !m.includes('-desc') && !m.includes('-save') && !m.includes('-tipo') && !m.includes('-input'));
console.log('\nMissing modals in views/super-admin-panel.html:', missingInPanel);
