const sqlite3 = require('./sqlite3-wrapper').verbose();
const db = new sqlite3.Database('./database.sqlite');

const timeNow = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const pedidos = [
  {
    productName: "Pizza Margherita",
    productEmoji: "🍕",
    quantity: 1,
    time: timeNow,
    localName: "Mesa 01",
    userName: "Garçom Teste",
    total: "45.00",
    status: "Em espera",
    sector: "Cozinha 1"
  },
  {
    productName: "Coca-Cola 2L",
    productEmoji: "🥤",
    quantity: 2,
    time: timeNow,
    localName: "Mesa 01",
    userName: "Garçom Teste",
    total: "24.00",
    status: "Pronto",
    sector: "Bar"
  },
  {
    productName: "Hambúrguer Artesanal",
    productEmoji: "🍔",
    quantity: 3,
    time: timeNow,
    localName: "Mesa 05",
    userName: "Garçom Teste",
    total: "87.00",
    status: "Em preparo",
    sector: "Cozinha 2"
  },
  {
    productName: "Porção de Fritas",
    productEmoji: "🍟",
    quantity: 1,
    time: timeNow,
    localName: "Mesa 05",
    userName: "Garçom Teste",
    total: "22.00",
    status: "Em espera",
    sector: "Cozinha 1"
  },
  {
    productName: "Salmão à Moda",
    productEmoji: "🐟",
    quantity: 1,
    time: timeNow,
    localName: "Mesa 12",
    userName: "Garçom Teste",
    total: "120.00",
    status: "Em espera",
    sector: "Cozinha 1"
  }
];

// Ensure tables exist
db.serialize(() => {
  db.run(`INSERT OR IGNORE INTO mesas (nome, status) VALUES ('Mesa 01', 'Ocupada')`);
  db.run(`INSERT OR IGNORE INTO mesas (nome, status) VALUES ('Mesa 05', 'Ocupada')`);
  db.run(`INSERT OR IGNORE INTO mesas (nome, status) VALUES ('Mesa 12', 'Ocupada')`);
  
  db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome IN ('Mesa 01', 'Mesa 05', 'Mesa 12')`);

  const stmt = db.prepare(`INSERT INTO pedidos (productName, productEmoji, quantity, time, localName, userName, total, status, sector) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  
  pedidos.forEach(p => {
    stmt.run([p.productName, p.productEmoji, p.quantity, p.time, p.localName, p.userName, p.total, p.status, p.sector]);
  });
  
  stmt.finalize(() => {
    console.log('Comandas criadas com sucesso!');
    // Trigger socket event from outside? We can't emit from this standalone script easily.
    // The user will just need to reload or the server will serve it on reload.
  });
});
