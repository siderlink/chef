const sqlite3 = require('./sqlite3-wrapper').verbose();
const db = new sqlite3.Database('database_1.sqlite');
db.all("PRAGMA table_info(clientes)", (e, r) => {
  console.log('All columns:', r.map(c => c.name).join(', '));
  db.close();
});