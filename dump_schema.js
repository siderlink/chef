const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'database_1.sqlite');
const db = new Database(dbPath);

const tables = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all();

let output = '';
tables.forEach(t => {
  output += `--- Table: ${t.name} ---\n`;
  output += t.sql + ';\n\n';
});

require('fs').writeFileSync('C:\\Users\\computer\\.gemini\\antigravity-ide\\brain\\684241a4-138b-4880-bd71-d71e02f50aad\\schema_dump.md', output);
console.log('Schema dumped successfully.');
