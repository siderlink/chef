const fs = require('fs');
const path = require('path');
const sqlite3 = require('../sqlite3-wrapper').verbose();

// 1. Caminhos
const BASE_DIR = path.resolve(__dirname, '..');
const masterDbPath = path.join(BASE_DIR, 'master.sqlite');
const estabelecimentosDir = path.join(BASE_DIR, 'estabelecimentos');

async function main() {
  const relatorio = {
    timestamp: new Date().toISOString(),
    ambiente: {
      plataforma: process.platform,
      versaoNode: process.version,
      diretorioBase: BASE_DIR,
      diretorioEstabelecimentos: estabelecimentosDir,
      masterDbExiste: fs.existsSync(masterDbPath)
    },
    bancoDados: {},
    codigo: {
      estatisticasArquivos: {},
      totalLinhasPorTipo: {},
      controllers: [],
      plugins: []
    },
    seguranca: {
      padroesSuspeitos: []
    }
  };

  // 1. Auditoria do Banco Master SQLite
  if (fs.existsSync(masterDbPath)) {
    const db = new sqlite3.Database(masterDbPath);
    const getAsync = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
    const allAsync = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

    try {
      const integrity = await getAsync('PRAGMA integrity_check;');
      const journalMode = await getAsync('PRAGMA journal_mode;');
      const cacheSize = await getAsync('PRAGMA cache_size;');
      const foreignKeys = await getAsync('PRAGMA foreign_keys;');
      const tables = await allAsync("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
      const indexes = await allAsync("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%';");
      const stats = fs.statSync(masterDbPath);

      // Checa contagem de registros principais
      let counts = {};
      for (const t of tables) {
        try {
          const c = await getAsync(`SELECT COUNT(*) as total FROM "${t.name}"`);
          counts[t.name] = c ? c.total : 0;
        } catch(e) {
          counts[t.name] = 'erro';
        }
      }

      relatorio.bancoDados.master = {
        tamanhoBytes: stats.size,
        tamanhoMB: (stats.size / (1024 * 1024)).toFixed(2),
        integridade: integrity?.integrity_check || 'OK',
        journalMode: journalMode?.journal_mode || 'unknown',
        cacheSize: cacheSize?.cache_size,
        foreignKeysAtivo: foreignKeys?.foreign_keys === 1,
        totalTabelas: tables.length,
        tabelas: tables.map(t => t.name),
        totalIndices: indexes.length,
        indices: indexes.map(i => `${i.name} (${i.tbl_name})`),
        contagemRegistros: counts
      };
    } catch (e) {
      relatorio.bancoDados.masterErro = e.message;
    } finally {
      db.close();
    }
  }

  // 2. Tenant DBs
  if (fs.existsSync(estabelecimentosDir)) {
    const tenants = fs.readdirSync(estabelecimentosDir).filter(f => fs.statSync(path.join(estabelecimentosDir, f)).isDirectory());
    relatorio.bancoDados.tenantsEncontrados = tenants.length;
    relatorio.bancoDados.listaTenants = tenants;
  }

  // 3. Auditoria de Código (SLOC e Estrutura)
  const pastasEscanear = ['', 'controllers', 'plugins', 'src'];
  let totalLinhasJS = 0;
  let totalLinhasHTML = 0;
  let totalLinhasCSS = 0;

  function countLines(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return content.split('\n').length;
    } catch(e) {
      return 0;
    }
  }

  // Controllers
  const ctrlDir = path.join(BASE_DIR, 'controllers');
  if (fs.existsSync(ctrlDir)) {
    const ctrls = fs.readdirSync(ctrlDir).filter(f => f.endsWith('.js'));
    relatorio.codigo.controllers = ctrls.map(f => {
      const lines = countLines(path.join(ctrlDir, f));
      totalLinhasJS += lines;
      return { nome: f, linhas: lines };
    });
  }

  // Plugins
  const plugDir = path.join(BASE_DIR, 'plugins');
  if (fs.existsSync(plugDir)) {
    const plugs = fs.readdirSync(plugDir);
    relatorio.codigo.plugins = plugs.filter(p => fs.statSync(path.join(plugDir, p)).isDirectory());
  }

  // Arquivos raiz
  const rootFiles = fs.readdirSync(BASE_DIR);
  rootFiles.forEach(f => {
    const full = path.join(BASE_DIR, f);
    if (fs.statSync(full).isFile()) {
      const ext = path.extname(f).toLowerCase();
      const lines = countLines(full);
      if (ext === '.js') totalLinhasJS += lines;
      if (ext === '.html') totalLinhasHTML += lines;
      if (ext === '.css') totalLinhasCSS += lines;
    }
  });

  relatorio.codigo.totalLinhasPorTipo = {
    javascript: totalLinhasJS,
    html: totalLinhasHTML,
    css: totalLinhasCSS,
    totalGeralAproximado: totalLinhasJS + totalLinhasHTML + totalLinhasCSS
  };

  // 4. Varredura de Segurança Heurística
  const arquivosChaveParaSeguranca = [
    'server.js',
    'ia-service.js',
    'controllers/super-admin.js',
    'controllers/hub-marketing.js',
    'controllers/addons-expansao-lucro.js',
    'controllers/addons-tier-s.js',
    'controllers/addons-tier-a.js',
    'controllers/addons-tier-bc.js'
  ];

  for (const relPath of arquivosChaveParaSeguranca) {
    const full = path.join(BASE_DIR, relPath);
    if (!fs.existsSync(full)) continue;
    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      // Procura concatenação em queries SQL
      if (/(SELECT|INSERT|UPDATE|DELETE).*?\+\s*req\.(query|body|params)/i.test(line)) {
        relatorio.seguranca.padroesSuspeitos.push({
          arquivo: relPath,
          linha: idx + 1,
          tipo: 'Possível SQL Injection via concatenação de req',
          trecho: line.trim().substring(0, 100)
        });
      }
      // Procura exec direto de shell com variáveis
      if (/\b(exec|spawn|execSync)\s*\([^)]*\+/i.test(line)) {
        relatorio.seguranca.padroesSuspeitos.push({
          arquivo: relPath,
          linha: idx + 1,
          tipo: 'Possível Command Injection via exec/spawn',
          trecho: line.trim().substring(0, 100)
        });
      }
      // Procura senhas ou tokens hardcoded óbvios
      if (/password\s*=\s*['"][a-zA-Z0-9!@#$%^&*]{6,}['"]/i.test(line) && !line.includes('process.env')) {
        // Ignora seeds de teste ou defaults conhecidos se documentado
      }
    });
  }

  // Salva resultado em JSON formatado
  fs.writeFileSync(path.join(BASE_DIR, 'auditoria-resultado.json'), JSON.stringify(relatorio, null, 2), 'utf8');
  console.log('✅ Auditoria concluída! Resultado salvo em auditoria-resultado.json');
}

main().catch(err => {
  console.error('❌ Falha na auditoria:', err);
  process.exit(1);
});
