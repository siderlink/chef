const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'database_1.sqlite'));

db.exec(`
  ALTER TABLE comandas_itens ADD COLUMN prontoEm DATETIME;
`);
console.log("Coluna prontoEm adicionada!");
