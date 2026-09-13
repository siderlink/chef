const sqlite3 = require('./sqlite3-wrapper').verbose();
const db = new sqlite3.Database('master.sqlite');

db.serialize(() => {
  db.all('PRAGMA table_info(tarefas_suporte)', [], (err, cols) => {
    if (err) {
      console.error('Pragma error:', err);
      process.exit(1);
    }
    const existing = new Set(cols.map(c => c.name));
    console.log('Existing cols:', Array.from(existing));

    const toAdd = [
      ['titulo', 'TEXT'],
      ['prioridade', 'TEXT'],
      ['criado_por', 'TEXT'],
      ['atribuido_a', 'TEXT'],
      ['categoria', 'TEXT'],
      ['resposta', 'TEXT'],
      ['criado_em', 'DATETIME'],
      ['atribuido_em', 'DATETIME'],
      ['atualizado_em', 'DATETIME'],
      ['concluido_em', 'DATETIME'],
      ['pontos', 'INTEGER'],
      ['tipo', 'TEXT']
    ];

    toAdd.forEach(([name, type]) => {
      if (!existing.has(name)) {
        db.run(`ALTER TABLE tarefas_suporte ADD COLUMN ${name} ${type}`, (e) => {
          if (e) console.log(`Err adding ${name}:`, e.message);
          else console.log(`Added column ${name}`);
        });
      }
    });

    db.run("UPDATE tarefas_suporte SET titulo = COALESCE(NULLIF(titulo, ''), tipo, 'Demanda #' || id)", (e) => {
      if (e) console.error('Error update titulo:', e);
    });
    db.run("UPDATE tarefas_suporte SET criado_em = COALESCE(criado_em, criada_em, datetime('now','localtime'))", (e) => {
      if (e) console.error('Error update criado_em:', e);
    });
    db.run("UPDATE tarefas_suporte SET prioridade = 'normal' WHERE prioridade IS NULL OR prioridade = ''", (e) => {
      if (e) console.error('Error update prioridade:', e);
    });
    db.run("UPDATE tarefas_suporte SET status = 'pendente' WHERE status IS NULL OR status = '' OR status = 'aviso'", (e) => {
      if (e) console.error('Error update status:', e);
    });

    db.all("SELECT id, titulo, prioridade, status, categoria, criado_em FROM tarefas_suporte ORDER BY id ASC", [], (e, rows) => {
      if (e) console.error('Select error:', e);
      else {
        console.log('\n--- SUCCESS! ALL ROWS IN TAREFAS_SUPORTE ---');
        console.table(rows);
      }
      db.close();
    });
  });
});
