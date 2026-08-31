const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('master.sqlite');
db.all("SELECT chave, valor FROM configuracoes_global WHERE chave LIKE '%admin%' OR chave LIKE '%senha%' OR chave LIKE '%super%'", [], (e, r) => {
  console.log('CONFIG:', JSON.stringify(r, null, 2));
  db.all("SELECT id, username, role, ativo, substring(password_hash,1,30) as hash_start FROM usuarios WHERE role='admin'", [], (e2, r2) => {
    console.log('ADMINS:', JSON.stringify(r2, null, 2));
    db.close();
  });
});