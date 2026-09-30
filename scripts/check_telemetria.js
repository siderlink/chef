const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database/master.sqlite');
db.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%click%' OR name LIKE '%telemetria%'", (err, rows) => {
  console.log('Tables found:', rows);
  db.all("PRAGMA table_info(telemetria_clicks)", (err, cols) => {
    console.log('telemetria_clicks columns:', cols);
    db.close();
  });
});
