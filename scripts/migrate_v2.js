const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'database_1.sqlite');
const db = new Database(dbPath);

console.log('Iniciando migração de banco de dados (V2)...');

// 1. Criar novas tabelas
db.exec(`
  CREATE TABLE IF NOT EXISTS comandas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mesa TEXT NOT NULL,
    cliente_id INTEGER,
    status TEXT DEFAULT 'Aberta',
    turno_id INTEGER,
    promocao_id INTEGER,
    entregador_id INTEGER,
    valor_subtotal REAL DEFAULT 0,
    valor_desconto REAL DEFAULT 0,
    valor_total REAL DEFAULT 0,
    criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
    fechado_em DATETIME
  );

  CREATE TABLE IF NOT EXISTS comandas_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comanda_id INTEGER NOT NULL,
    produto_id INTEGER,
    nome TEXT,
    emoji TEXT,
    quantidade INTEGER DEFAULT 1,
    preco_unitario REAL DEFAULT 0,
    total REAL DEFAULT 0,
    status TEXT DEFAULT 'Pendente',
    setor TEXT,
    observacoes TEXT,
    composicoes TEXT,
    opcionais TEXT,
    garcom TEXT,
    criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (comanda_id) REFERENCES comandas(id)
  );

  CREATE TABLE IF NOT EXISTS comandas_pagamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comanda_id INTEGER NOT NULL,
    movimentacao_id INTEGER,
    valor REAL NOT NULL,
    forma_pagamento TEXT,
    data_pagamento DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (comanda_id) REFERENCES comandas(id)
  );
`);

console.log('Tabelas V2 criadas com sucesso.');

// 2. Agrupar itens antigos em comandas virtuais
const pedidos_antigos = db.prepare("SELECT * FROM pedidos ORDER BY createdAt ASC").all();

let comandasMap = {}; // key: localName_turno_id_data
let comandasGeradas = 0;
let itensMigrados = 0;
let pagamentosMigrados = 0;

db.transaction(() => {
  for (const p of pedidos_antigos) {
    // Definir a chave de agrupamento: Mesa + Turno + Data(YYYY-MM-DD)
    const dateStr = p.createdAt ? p.createdAt.substring(0, 10) : '1970-01-01';
    const key = `${p.localName}_${p.turno_id}_${dateStr}`;

    if (!comandasMap[key]) {
      // Criar nova comanda virtual
      const info = db.prepare(`
        INSERT INTO comandas (mesa, cliente_id, status, turno_id, promocao_id, entregador_id, criado_em, fechado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        p.localName, p.cliente_id || null, 
        p.status === 'Finalizado' ? 'Fechada' : 'Aberta',
        p.turno_id || null, p.promocao_id || null, p.entregador_id || null,
        p.createdAt,
        p.status === 'Finalizado' ? p.createdAt : null
      );
      comandasMap[key] = info.lastInsertRowid;
      comandasGeradas++;
    }

    const comanda_id = comandasMap[key];

    // Verificar se é pagamento fantasma
    const nome = String(p.productName || '').toLowerCase();
    const isPayment = nome.includes('pgto') || nome.includes('pagamento') || (parseFloat(p.total) < 0);

    if (isPayment) {
      // É um pagamento
      db.prepare(`
        INSERT INTO comandas_pagamentos (comanda_id, valor, forma_pagamento, data_pagamento)
        VALUES (?, ?, ?, ?)
      `).run(comanda_id, Math.abs(parseFloat(p.total) || 0), p.paymentMethod || 'Dinheiro', p.createdAt);
      pagamentosMigrados++;
    } else {
      // É um item consumido
      db.prepare(`
        INSERT INTO comandas_itens (
          comanda_id, produto_id, nome, emoji, quantidade, preco_unitario, total, 
          status, setor, observacoes, composicoes, opcionais, garcom, criado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        comanda_id, null, p.productName, p.productEmoji || '🍽️', p.quantity || 1, 
        parseFloat(p.total) / (p.quantity || 1), parseFloat(p.total), 
        p.status, p.sector, p.observations, p.composicoes, p.options, p.userName, p.createdAt
      );
      itensMigrados++;
    }
  }

  // 3. Atualizar os totais das comandas
  const comandas = db.prepare("SELECT id FROM comandas").all();
  for (const c of comandas) {
    const sumItens = db.prepare("SELECT SUM(total) as t FROM comandas_itens WHERE comanda_id = ?").get(c.id).t || 0;
    db.prepare("UPDATE comandas SET valor_subtotal = ?, valor_total = ? WHERE id = ?").run(sumItens, sumItens, c.id);
  }
})();

console.log('--- RESUMO DA MIGRAÇÃO ---');
console.log(`Comandas (Capas) geradas: ${comandasGeradas}`);
console.log(`Produtos migrados: ${itensMigrados}`);
console.log(`Pagamentos (Fantasmas) convertidos: ${pagamentosMigrados}`);
console.log('Migração concluída com sucesso!');
