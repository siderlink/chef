const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const descMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'master_product_descriptions.json'), 'utf8'));

// Helper to find all database paths
function findDbs(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'backups') continue;
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (file === 'estabelecimentos') {
        const sub = fs.readdirSync(full);
        for (const s of sub) {
          const dbPath = path.join(full, s, 'database.sqlite');
          if (fs.existsSync(dbPath)) results.push(dbPath);
        }
      } else if (file === 'hub-server' || file === 'pendrive' || file === 'ChefCozinha-Nativo') {
        results = results.concat(findDbs(full));
      }
    } else if (file.endsWith('.sqlite')) {
      results.push(full);
    }
  }
  return results;
}

const allDbs = findDbs('.');
console.log(`Found ${allDbs.length} databases to evaluate.`);

let totalUpdatedAcrossAll = 0;

for (const dbPath of allDbs) {
  try {
    const db = new Database(dbPath);
    
    // Check if table produtos exists
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='produtos'").get();
    if (!hasTable) {
      db.close();
      continue;
    }

    // Check if column descricao exists, add if missing
    const cols = db.prepare("PRAGMA table_info(produtos)").all();
    if (!cols.some(c => c.name === 'descricao')) {
      console.log(`[${dbPath}] Adding missing 'descricao' column...`);
      db.prepare("ALTER TABLE produtos ADD COLUMN descricao TEXT").run();
    }

    const prods = db.prepare("SELECT id, nome, categoria, descricao FROM produtos").all();
    if (prods.length === 0) {
      db.close();
      continue;
    }

    const updateStmt = db.prepare("UPDATE produtos SET descricao = ? WHERE id = ?");

    let updatedCount = 0;

    const updateTx = db.transaction(() => {
      for (const p of prods) {
        const currentDesc = p.descricao ? p.descricao.trim() : '';
        const isGeneric = !currentDesc ||
          currentDesc === 'Valor por pessoa' ||
          currentDesc.includes('excelente qualidade') ||
          currentDesc.includes('preparado com todo cuidado') ||
          currentDesc.includes('Delicioso item da categoria') ||
          currentDesc.includes('Prepare-se para saborear') ||
          currentDesc.includes('Delicioso item do nosso cardápio');

        if (isGeneric) {
          const normName = p.nome ? p.nome.trim() : '';
          const targetDesc = descMap[normName] ||
            descMap[normName.replace(' - ', ' ')] ||
            descMap[normName.replace('Pastéis ', 'Pastéis - ')] ||
            `Prato especial preparado com ingredientes frescos selecionados e o tempero exclusivo da nossa cozinha.`;

          updateStmt.run(targetDesc, p.id);
          updatedCount++;
        }
      }
    });

    updateTx();

    const stats = db.prepare(`
      SELECT 
        COUNT(1) as total,
        SUM(CASE WHEN descricao LIKE '%excelente qualidade%' OR descricao LIKE '%Delicioso item da categoria%' THEN 1 ELSE 0 END) as generic,
        SUM(CASE WHEN descricao IS NULL OR trim(descricao) = '' THEN 1 ELSE 0 END) as empty
      FROM produtos
    `).get();

    console.log(`[${dbPath}] Updated: ${updatedCount} | Remaining Total: ${stats.total}, Generic: ${stats.generic || 0}, Empty: ${stats.empty || 0}`);
    totalUpdatedAcrossAll += updatedCount;
    db.close();
  } catch (err) {
    console.error(`[${dbPath}] Error:`, err.message);
  }
}

console.log(`\n========================================`);
console.log(`MIGRATION COMPLETE: ${totalUpdatedAcrossAll} product descriptions updated across all databases.`);
console.log(`========================================\n`);
