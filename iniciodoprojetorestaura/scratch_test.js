const sqlite3 = require('./sqlite3-wrapper').verbose();
const db = new sqlite3.Database('database.sqlite');
db.all("PRAGMA table_info(pontos)", (err, rows) => {
  console.log("pontos schema:");
  console.log(rows);
  db.all("PRAGMA table_info(vales)", (err2, rows2) => {
    console.log("vales schema:");
    console.log(rows2);
    db.close();
  });
});
