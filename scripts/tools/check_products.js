const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function findDbs(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (file === 'estabelecimentos') {
        const sub = fs.readdirSync(full);
        for (const s of sub) {
          const dbPath = path.join(full, s, 'database.sqlite');
          if (fs.existsSync(dbPath)) results.push(dbPath);
        }
      }
    } else if (file.endsWith('.sqlite')) {
      results.push(full);
    }
  }
  return results;
}

const dbs = findDbs('.');
console.log('Found databases:', dbs);

for (const dbPath of dbs) {
  try {
    const db = new Database(dbPath, { readonly: true });
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='produtos'").get();
    if (table) {
      const total = db.prepare("SELECT count(1) as cnt FROM produtos").get().cnt;
      const generic = db.prepare("SELECT count(1) as cnt FROM produtos WHERE descricao LIKE '%excelente qualidade%' OR descricao LIKE '%preparado com todo cuidado%' OR descricao LIKE '%Delicioso item da categoria%' OR descricao LIKE '%Prepare-se para saborear%'").get().cnt;
      const emptyDesc = db.prepare("SELECT count(1) as cnt FROM produtos WHERE descricao IS NULL OR trim(descricao) = ''").get().cnt;
      console.log(`${dbPath} => Total: ${total} | Generic: ${generic} | Empty: ${emptyDesc}`);
      const sample = db.prepare("SELECT id, nome, categoria, preco, descricao FROM produtos LIMIT 5").all();
      console.log('  Sample:', sample.map(s => `[${s.id}] ${s.nome} (${s.categoria}): ${s.descricao}`));
    }
    db.close();
  } catch (e) {
    console.log(`${dbPath} => Error: ${e.message}`);
  }
}
