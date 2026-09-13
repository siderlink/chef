const sqlite3 = require('./sqlite3-wrapper').verbose();
const db = new sqlite3.Database('./database.sqlite');

const timeNow = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const pedidos = [
  {
    productName: "Cerveja Heineken",
    productEmoji: "🍺",
    quantity: 2,
    time: timeNow,
    localName: "Comanda 01",
    userName: "Garçom Teste",
    total: "28.00",
    status: "Pronto",
    sector: "Bar"
  },
  {
    productName: "Batata Frita Especial",
    productEmoji: "🍟",
    quantity: 1,
    time: timeNow,
    localName: "Comanda 01",
    userName: "Garçom Teste",
    total: "45.00",
    status: "Em espera",
    sector: "Cozinha 1"
  },
  {
    productName: "Caipirinha de Limão",
    productEmoji: "🍹",
    quantity: 1,
    time: timeNow,
    localName: "Comanda 02",
    userName: "Garçom Teste",
    total: "18.00",
    status: "Em preparo",
    sector: "Bar"
  }
];

// Ensure tables exist
db.serialize(() => {
  db.run(`INSERT OR IGNORE INTO mesas (nome, status) VALUES ('Comanda 01', 'Ocupada')`);
  db.run(`INSERT OR IGNORE INTO mesas (nome, status) VALUES ('Comanda 02', 'Ocupada')`);
  db.run(`INSERT OR IGNORE INTO mesas (nome, status) VALUES ('Comanda 03', 'Disponível')`);
  
  db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome IN ('Comanda 01', 'Comanda 02')`);

  const stmt = db.prepare(`INSERT INTO pedidos (productName, productEmoji, quantity, time, localName, userName, total, status, sector) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  
  pedidos.forEach(p => {
    stmt.run([p.productName, p.productEmoji, p.quantity, p.time, p.localName, p.userName, p.total, p.status, p.sector]);
  });
  
  stmt.finalize(() => {
    console.log('Comandas (fichas) criadas com sucesso!');
  });
});
