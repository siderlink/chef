const sqlite3 = require('./sqlite3-wrapper').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const tables = [
  'pedidos', 'qr_pedidos_pendentes', 'clientes', 'promocoes', 'turnos_caixa',
  'movimentacoes', 'nfce_notas', 'mesas', 'produtos', 'funcionarios', 'pontos',
  'vales', 'funcionarios_pagamentos', 'historico_logins', 'cupons', 'configuracoes',
  'api_logs', 'auditoria', 'beneficios', 'resgates', 'formas_pagamento'
];

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS restaurantes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      licenca TEXT,
      ativo BOOLEAN DEFAULT true,
      data_cadastro DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurante_id INTEGER,
      username TEXT UNIQUE,
      password_hash TEXT,
      role TEXT,
      ativo BOOLEAN DEFAULT true,
      data_cadastro DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    INSERT INTO restaurantes (id, nome, licenca, ativo)
    SELECT 1, 'Restaurante Padrão', 'ativo', 1
    WHERE NOT EXISTS (SELECT 1 FROM restaurantes WHERE id = 1)
  `);

  for (const table of tables) {
    db.run(`ALTER TABLE ${table} ADD COLUMN restaurante_id INTEGER DEFAULT 1`, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
          console.log(`[${table}] restaurante_id already exists.`);
        } else {
          console.error(`[${table}] Error adding column: ${err.message}`);
        }
      } else {
        console.log(`[${table}] Added restaurante_id successfully.`);
      }
    });
  }
});

db.close(() => {
  console.log('Migration completed.');
});
