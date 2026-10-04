/**
 * scripts/optimize-db.js
 * Utilitário de Otimização e Indexação de Banco de Dados SQLite.
 * Varre todos os bancos dos estabelecimentos e o masterDb, aplicando:
 * - Índices de alta performance em chaves de busca frequente
 * - PRAGMA optimize (analisador de estatísticas do query planner)
 * - PRAGMA wal_checkpoint(TRUNCATE) para liberar arquivos .wal
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const indexesToCreate = [
  { table: 'pedidos', name: 'idx_pedidos_status', cols: 'status' },
  { table: 'pedidos', name: 'idx_pedidos_localName', cols: 'localName' },
  { table: 'pedidos', name: 'idx_pedidos_created', cols: 'createdAt' },
  { table: 'pedidos', name: 'idx_pedidos_turno_id', cols: 'turno_id' },
  { table: 'pedidos', name: 'idx_pedidos_mesa_grupo', cols: 'mesa_grupo' },
  { table: 'pedidos', name: 'idx_pedidos_funcionario', cols: 'funcionario_id' },
  { table: 'pedidos', name: 'idx_pedidos_cliente', cols: 'cliente_id' },
  { table: 'pedidos', name: 'idx_pedidos_status_sector_created', cols: 'status, sector, createdAt' },
  { table: 'pedidos', name: 'idx_pedidos_local_status', cols: 'localName, status' },
  { table: 'produtos', name: 'idx_produtos_categoria', cols: 'categoria' },
  { table: 'produtos', name: 'idx_produtos_ativo', cols: 'ativo' },
  { table: 'produtos', name: 'idx_produtos_codigo', cols: 'codigo_barras' },
  { table: 'mesas', name: 'idx_mesas_status', cols: 'status' },
  { table: 'mesas', name: 'idx_mesas_nome', cols: 'nome' },
  { table: 'movimentacoes', name: 'idx_movimentacoes_turno_id', cols: 'turno_id' },
  { table: 'movimentacoes', name: 'idx_movimentacoes_data', cols: 'data_hora' },
  { table: 'turnos_caixa', name: 'idx_turnos_caixa_status', cols: 'status' },
  { table: 'turnos_caixa', name: 'idx_turnos_caixa_data', cols: 'data_abertura' },
  { table: 'clientes', name: 'idx_clientes_telefone', cols: 'telefone' },
  { table: 'clientes', name: 'idx_clientes_cpf', cols: 'cpf' },
  { table: 'clientes', name: 'idx_clientes_nome', cols: 'nome' },
  { table: 'formas_pagamento', name: 'idx_formas_pagamento_ativo', cols: 'ativo, ordem' },
  { table: 'funcionarios', name: 'idx_funcionarios_pin', cols: 'pin' },
  { table: 'funcionarios', name: 'idx_funcionarios_ativo', cols: 'ativo' },
  { table: 'cupons', name: 'idx_cupons_codigo', cols: 'codigo' },
  { table: 'auditoria', name: 'idx_auditoria_data', cols: 'data_hora' },
  { table: 'configuracoes', name: 'idx_configuracoes_chave', cols: 'chave' }
];

function findDatabases(dir) {
  const list = [];
  if (!fs.existsSync(dir)) return list;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (item !== 'node_modules' && item !== '.git') {
        list.push(...findDatabases(full));
      }
    } else if (item.endsWith('.sqlite') || (item.endsWith('.db') && !item.includes('-shm') && !item.includes('-wal'))) {
      list.push(full);
    }
  }
  return list;
}

const dbs = [
  ...findDatabases(path.resolve(__dirname, '../estabelecimentos')),
  path.resolve(__dirname, '../master.sqlite'),
  path.resolve(__dirname, '../database.sqlite')
].filter(p => fs.existsSync(p));

console.log(`[DB Optimizer] Encontrados ${dbs.length} arquivos de banco de dados para otimização.`);

let totalIndexesCreated = 0;

dbs.forEach(dbPath => {
  try {
    const db = new Database(dbPath, { timeout: 10000 });
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 10000');

    const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);

    indexesToCreate.forEach(idx => {
      if (tableNames.includes(idx.table)) {
        try {
          db.exec(`CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}(${idx.cols});`);
          totalIndexesCreated++;
        } catch (e) {
          // coluna pode não existir em esquemas customizados
        }
      }
    });

    db.pragma('optimize');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    console.log(`  ✅ Otimizado: ${path.relative(path.resolve(__dirname, '..'), dbPath)}`);
  } catch (err) {
    console.warn(`  ⚠️ Erro ao otimizar ${dbPath}:`, err.message);
  }
});

console.log(`[DB Optimizer] Sucesso! ${totalIndexesCreated} verificações/criações de índices concluídas.`);
