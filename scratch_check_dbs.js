const sqlite3 = require('./sqlite3-wrapper');
new sqlite3.Database('master.sqlite').all("SELECT * FROM usuarios", (err, rows) => {
  console.log('master.sqlite usuarios:', err ? err.message : rows);
});
