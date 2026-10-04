const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'database_1.sqlite'));

console.log("=== TESTANDO INSERT VIA VIEW ===");
try {
  // Simular a inserção do backend antigo
  const info1 = db.prepare(`
    INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, userName, time, sector, createdAt)
    VALUES ('Hambúrguer Mágico', '🍔', 2, '45.00', 'Em preparo', 'Mesa 42', 'Garçom Teste', '19:00', 'Cozinha', datetime('now'))
  `).run();
  console.log("Insert item OK");
  
  // Inserir um pagamento negativo
  const info2 = db.prepare(`
    INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, userName, time, sector, createdAt, paymentMethod)
    VALUES ('Pgto Parcial', '💸', 1, '-20.00', 'Entregue', 'Mesa 42', 'Caixa', '19:15', 'Caixa', datetime('now'), 'PIX')
  `).run();
  console.log("Insert pagamento OK");

  const comandas = db.prepare(`SELECT * FROM comandas WHERE mesa = 'Mesa 42'`).all();
  console.log("Comandas criadas:", comandas);
  
  const itens = db.prepare(`SELECT * FROM comandas_itens WHERE comanda_id = ?`).all(comandas[0].id);
  console.log("Itens na comanda:", itens);

  const pgtos = db.prepare(`SELECT * FROM comandas_pagamentos WHERE comanda_id = ?`).all(comandas[0].id);
  console.log("Pagamentos na comanda:", pgtos);

  const viewData = db.prepare(`SELECT * FROM pedidos WHERE localName = 'Mesa 42'`).all();
  console.log("Dados lidos da VIEW:", viewData);

} catch (e) {
  console.error(e);
}
