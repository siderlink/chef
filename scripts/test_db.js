const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('database.db', (err) => {
  if (err) { console.error('DB OPEN ERROR:', err); return; }
  console.log('DB OPEN OK');
  db.get("SELECT value FROM super_config WHERE key = 'super_admin_senha'", [], (err, row) => {
    if (err) console.error('DB QUERY ERROR:', err);
    else console.log('DB QUERY OK:', row);
    db.close();
  });
});
