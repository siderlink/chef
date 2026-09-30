const fs = require('fs');

const js = fs.readFileSync('super-admin.js', 'utf8');
const panel = fs.readFileSync('views/super-admin-panel.html', 'utf8');

// Find all functions that open modals
const openFuncs = js.match(/function\s+(abrir[A-Za-z0-9_]+|editar[A-Za-z0-9_]+|ver[A-Za-z0-9_]+)\s*\([^)]*\)\s*\{[^}]+modal[^}]+\}/g) || [];

console.log('Sample functions dealing with modals:');
const modalOps = [];
const lines = js.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('modal-') && (line.includes('active') || line.includes('display'))) {
    console.log(`L${i+1}: ${line.trim()}`);
  }
}
