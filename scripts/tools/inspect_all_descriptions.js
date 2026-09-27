const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function checkDb(p) {
  if (!fs.existsSync(p)) return;
  try {
    const db = new Database(p, { readonly: true });
    const cols = db.prepare("PRAGMA table_info(produtos)").all();
    if (!cols.some(c => c.name === 'descricao')) {
      console.log(`[${p}] Missing column 'descricao'`);
      db.close();
      return;
    }
    const allRows = db.prepare("SELECT id, nome, categoria, descricao FROM produtos").all();
    let genericCnt = 0;
    let emptyCnt = 0;
    let goodCnt = 0;
    const genericExamples = [];
    for (const r of allRows) {
      const d = r.descricao ? r.descricao.trim() : '';
      if (!d) {
        emptyCnt++;
      } else if (
        d.includes('excelente qualidade') ||
        d.includes('preparado com todo cuidado') ||
        d.includes('Delicioso item da categoria') ||
        d.includes('Prepare-se para saborear')
      ) {
        genericCnt++;
        if (genericExamples.length < 3) genericExamples.push({ nome: r.nome, desc: d });
      } else {
        goodCnt++;
      }
    }
    console.log(`[${p}] Total: ${allRows.length} | Good: ${goodCnt} | Generic: ${genericCnt} | Empty: ${emptyCnt}`);
    if (genericExamples.length > 0) {
      console.log('   Generic samples:', genericExamples);
    }
    db.close();
  } catch (err) {
    console.log(`[${p}] Error:`, err.message);
  }
}

console.log('--- ROOT DATABASES ---');
for (const f of fs.readdirSync('.')) {
  if (f.endsWith('.sqlite')) {
    checkDb(f);
  }
}

console.log('--- ESTABELECIMENTOS DATABASES ---');
if (fs.existsSync('estabelecimentos')) {
  for (const s of fs.readdirSync('estabelecimentos')) {
    const p = path.join('estabelecimentos', s, 'database.sqlite');
    if (fs.existsSync(p)) {
      checkDb(p);
    }
  }
}
