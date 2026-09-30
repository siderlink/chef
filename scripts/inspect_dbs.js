const fs = require('fs');
const path = require('path');
const sqlite3 = require('../sqlite3-wrapper.js');

const files = fs.readdirSync('.').filter(f => f.endsWith('.db'));
console.log('DB files found:', files);

for (const f of files) {
  try {
    const db = new sqlite3.Database(f);
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
      console.log(`\nTables in [${f}]:`, (rows || []).map(r => r.name).join(', '));
    });
  } catch(e) {
    console.error(`Error opening ${f}:`, e.message);
  }
}
