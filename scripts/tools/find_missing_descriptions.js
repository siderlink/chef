const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const allDbs = [];
for (const f of fs.readdirSync('.')) {
  if (f.endsWith('.sqlite')) allDbs.push(f);
}
if (fs.existsSync('estabelecimentos')) {
  for (const s of fs.readdirSync('estabelecimentos')) {
    const p = path.join('estabelecimentos', s, 'database.sqlite');
    if (fs.existsSync(p)) allDbs.push(p);
  }
}

const allProducts = new Map();
for (const dbPath of allDbs) {
  try {
    const db = new Database(dbPath, { readonly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='produtos'").get();
    if (!tables) { db.close(); continue; }
    const cols = db.prepare("PRAGMA table_info(produtos)").all();
    if (!cols.some(c => c.name === 'descricao')) { db.close(); continue; }
    const prods = db.prepare("SELECT nome, categoria, descricao FROM produtos").all();
    for (const p of prods) {
      const key = p.nome.trim();
      if (!allProducts.has(key)) {
        allProducts.set(key, { nome: p.nome, categoria: p.categoria, descricoes: [] });
      }
      if (p.descricao && p.descricao.trim()) {
        allProducts.get(key).descricoes.push(p.descricao.trim());
      }
    }
    db.close();
  } catch(e) {
    console.log('Error reading', dbPath, e.message);
  }
}

console.log('Total unique product names found across ALL dbs:', allProducts.size);
const needsDesc = [];
const hasGoodDesc = [];

for (const [name, info] of allProducts.entries()) {
  const goodDesc = info.descricoes.find(d => 
    !d.includes('excelente qualidade') && 
    !d.includes('Delicioso item da categoria') &&
    !d.includes('preparado com todo cuidado') &&
    !d.includes('Prepare-se para saborear')
  );
  if (!goodDesc) {
    needsDesc.push({ nome: name, categoria: info.categoria });
  } else {
    hasGoodDesc.push({ nome: name, categoria: info.categoria, desc: goodDesc });
  }
}

console.log(`Has good desc: ${hasGoodDesc.length} | Needs desc: ${needsDesc.length}`);
console.log('Products needing descriptions:', JSON.stringify(needsDesc, null, 2));
