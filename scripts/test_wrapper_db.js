const path = require('path');
const sqlite3 = require(path.join(__dirname, '../sqlite3-wrapper.js'));

const db = new sqlite3.Database('database.db', (err) => {
  if (err) {
    console.error('Failed to open database.db:', err);
    process.exit(1);
  }
  console.log('Successfully opened database.db with sqlite3-wrapper');
  db.get("SELECT value FROM super_config WHERE key = 'super_admin_senha'", [], (err, row) => {
    if (err) {
      console.error('Query error:', err);
      process.exit(1);
    }
    console.log('Query result:', row);
    db.close();
    process.exit(0);
  });
});
