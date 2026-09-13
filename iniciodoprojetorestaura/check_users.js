const sqlite3 = require('./sqlite3-wrapper').verbose();
const path = require('path');

const dbFiles = ['database_1.sqlite', 'database.sqlite', 'master.sqlite'];

function queryDb(dbFile) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
      
      db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
        if (err) return reject(err);
        console.log(`\n=== BANCO: ${dbFile} ===`);
        console.log('Tabelas:', tables.map(t => t.name).join(', '));
        
        const userTableNames = ['usuarios', 'users', 'user', 'funcionarios', 'clientes', 'accounts', 'contas', 'admins', 'proprietarios'];
        let pending = 0;
        
        for (const row of tables) {
          if (userTableNames.includes(row.name.toLowerCase())) {
            pending++;
            db.all(`SELECT * FROM ${row.name} LIMIT 20`, [], (err2, rows) => {
              if (err2) {
                console.log(`Erro na tabela ${row.name}:`, err2.message);
              } else {
                console.log(`\n--- Tabela: ${row.name} (${rows.length} registros) ---`);
                console.log(JSON.stringify(rows, null, 2));
              }
              if (--pending === 0) {
                db.close();
                resolve();
              }
            });
          }
        }
        
        if (pending === 0) {
          db.close();
          resolve();
        }
      });
    });
  });
}

(async () => {
  for (const f of dbFiles) {
    try {
      await queryDb(f);
    } catch(e) {
      console.log(`Erro ao abrir ${f}:`, e.message);
    }
  }
})();
