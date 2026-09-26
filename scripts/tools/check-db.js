const sqlite3 = require('./sqlite3-wrapper').verbose();
const db = new sqlite3.Database('database.sqlite');
db.all("SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC", [], (err, rows) => {
    if (err) console.error(err);
    console.log('Turnos Abertos:', rows);
});
