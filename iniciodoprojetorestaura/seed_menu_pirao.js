const sqlite3 = require('./sqlite3-wrapper').verbose();
const path = require('path');
const fs = require('fs');

const products = [
  // Category: Cervejas
  ['Cervejas', 'Heineken 600ml', 21.00, '🍺', false, 'Bar', 'Em espera'],
  ['Cervejas', 'Stella 600ml', 21.00, '🍺', false, 'Bar', 'Em espera'],
  ['Cervejas', 'Spaten 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
  ['Cervejas', 'Budweiser 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
  ['Cervejas', 'Amstel 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
  ['Cervejas', 'Eisenbahn 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
  ['Cervejas', 'Original 600ml', 18.00, '🍺', false, 'Bar', 'Em espera'],
  ['Cervejas', 'Brahma 600ml', 15.00, '🍺', false, 'Bar', 'Em espera'],
  ['Cervejas', 'Cerveja Lata', 10.00, '🍺', false, 'Bar', 'Em espera'],
  ['Cervejas', 'Cerveja Artesanal', 25.00, '🍺', false, 'Bar', 'Em espera'],

  // Category: Bebidas
  ['Bebidas', 'Refrigerante Lata', 8.00, '🥤', false, 'Bar', 'Em espera'],
  ['Bebidas', 'Água sem gás', 4.00, '💧', false, 'Bar', 'Em espera'],
  ['Bebidas', 'Água com gás', 5.00, '💧', false, 'Bar', 'Em espera'],
  ['Bebidas', 'Tônica Lata', 8.80, '🥤', false, 'Bar', 'Em espera'],
  ['Bebidas', 'H2O Garrafa', 8.80, '💧', false, 'Bar', 'Em espera'],
  ['Bebidas', 'Citrus Lata', 8.80, '🥤', false, 'Bar', 'Em espera'],
  ['Bebidas', 'Suco copo/lata', 8.80, '🧃', false, 'Bar', 'Em espera'],
  ['Bebidas', 'Suco Jarra Laranja', 18.00, '🍊', false, 'Bar', 'Em espera'],
  ['Bebidas', 'Suco Jarra Limão', 23.00, '🍋', false, 'Bar', 'Em espera'],
  ['Bebidas', 'Energético Baly', 18.00, '⚡', false, 'Bar', 'Em espera'],
  ['Bebidas', 'Energético Redbull', 18.00, '⚡', false, 'Bar', 'Em espera'],
  ['Bebidas', 'Energético Monster', 18.00, '⚡', false, 'Bar', 'Em espera'],
  ['Bebidas', 'Heineken 0%', 15.00, '🍺', false, 'Bar', 'Em espera'],
  ['Bebidas', 'Brahma 0%', 10.00, '🍺', false, 'Bar', 'Em espera'],

  // Category: Caipirinhas
  ['Caipirinhas', 'Caipirinha Smirnoff', 20.00, '🍹', false, 'Bar', 'Em espera'],
  ['Caipirinhas', 'Caipirinha Bacardi', 20.00, '🍹', false, 'Bar', 'Em espera'],
  ['Caipirinhas', 'Caipirinha Cachaça Branca', 20.00, '🍹', false, 'Bar', 'Em espera'],
  ['Caipirinhas', 'Caipirinha Cachaça Amarela', 20.00, '🍹', false, 'Bar', 'Em espera'],
  ['Caipirinhas', 'Caipirinha Vinho', 20.00, '🍷', false, 'Bar', 'Em espera'],
  ['Caipirinhas', 'Caipirinha Skyy', 20.00, '🍹', false, 'Bar', 'Em espera'],
  ['Caipirinhas', 'Caipirinha Absolut', 26.00, '🍹', false, 'Bar', 'Em espera'],
  ['Caipirinhas', 'Caipirinha Havana', 28.00, '🍹', false, 'Bar', 'Em espera'],

  // Category: Doses
  ['Doses', 'Smirnoff', 12.00, '🥃', false, 'Bar', 'Em espera'],
  ['Doses', 'Bacardi', 12.00, '🥃', false, 'Bar', 'Em espera'],
  ['Doses', 'Steinhager', 11.00, '🥃', false, 'Bar', 'Em espera'],
  ['Doses', 'Red Label', 20.00, '🥃', false, 'Bar', 'Em espera'],
  ['Doses', 'White Horse', 20.00, '🥃', false, 'Bar', 'Em espera'],
  ['Doses', 'Passport', 13.00, '🥃', false, 'Bar', 'Em espera'],
  ['Doses', 'Licor 43', 28.00, '🥃', false, 'Bar', 'Em espera'],
  ['Doses', 'Conhaque', 28.00, '🥃', false, 'Bar', 'Em espera'],
  ['Doses', 'Gin', 13.00, '🍸', false, 'Bar', 'Em espera'],
  ['Doses', 'Campari', 15.00, '🥃', false, 'Bar', 'Em espera'],

  // Category: Porções (800g)
  ['Porções (800g)', 'Combinado São José (800g)', 134.00, '🍤', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Anchova Frita (6 postas) (800g)', 69.00, '🐟', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Peixe Frito Misturinha (800g)', 59.00, '🐟', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Isca de Peixe à dorê (800g)', 74.00, '🐟', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Camarão ao Bafo (800g)', 99.00, '🍤', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Camarão à milanesa (800g)', 169.00, '🍤', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Camarão alho e óleo (800g)', 119.90, '🍤', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Ostra ao Bafo (dúzia) (800g)', 34.00, '🦪', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Ostra Gratinada (dúzia) (800g)', 69.00, '🦪', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Bolinho de Siri (4 unidades) (800g)', 44.90, '🦀', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Marisco ao Bafo (1 kg) (800g)', 45.00, '🦪', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Lula em anéis a dorê (800g)', 89.90, '🦑', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Frango à Passarinho (1 kg) (800g)', 59.00, '🍗', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Fritas (800g)', 49.00, '🍟', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Porção 4 Pastéis - Camarão', 28.00, '🥟', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Porção 4 Pastéis - Berbigão', 28.00, '🥟', false, 'Cozinha 1', 'Em espera'],
  ['Porções (800g)', 'Porção 4 Pastéis - Queijo', 28.00, '🥟', false, 'Cozinha 1', 'Em espera'],

  // Category: Porções (500g)
  ['Porções (500g)', '1/2 Peixe Frito Misturinha (500g)', 48.00, '🐟', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', '1/2 Isca de Peixe à dorê (500g)', 64.00, '🐟', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', '1/2 Camarão Maluquinho (500g)', 84.90, '🍤', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', '1/2 Camarão ao Bafo (500g)', 99.00, '🍤', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', '1/2 Camarão à milanesa (500g)', 135.00, '🍤', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', '1/2 Camarão alho e óleo (500g)', 99.90, '🍤', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', '1/2 Ostra ao Bafo (6 unidades)', 16.90, '🦪', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', '1/2 Ostra Gratinada (6 unidades)', 54.00, '🦪', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', 'Bolinho de Siri (1 unidade)', 12.00, '🦀', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', '1/2 Lula a dorê (500g)', 79.90, '🦑', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', 'Filé de Frango Individual', 19.90, '🍗', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', 'Filé de Peixe Individual', 19.90, '🐟', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', '1/2 Fritas (500g)', 39.00, '🍟', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', 'Pastel 1 unidade - Camarão', 8.00, '🥟', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', 'Pastel 1 unidade - Berbigão', 8.00, '🥟', false, 'Cozinha 1', 'Em espera'],
  ['Porções (500g)', 'Pastel 1 unidade - Queijo', 8.00, '🥟', false, 'Cozinha 1', 'Em espera'],

  // Category: A La Carte
  ['A La Carte', 'Pirão São José (700g) (2 pessoas)', 164.90, '🍲', false, 'Cozinha 1', 'Em espera'],
  ['A La Carte', 'Salmão à Moda da Casa (500g)', 209.00, '🐟', false, 'Cozinha 1', 'Em espera'],
  ['A La Carte', 'Filé de Pescada à Milanesa (800g)', 154.00, '🐟', false, 'Cozinha 1', 'Em espera'],
  ['A La Carte', '1/2 Filé Pescada à Milanesa (500g)', 134.00, '🐟', false, 'Cozinha 1', 'Em espera'],
  ['A La Carte', 'Filé de Pescada à Milanesa ao Molho de Camarão (800g)', 209.00, '🐟', false, 'Cozinha 1', 'Em espera'],
  ['A La Carte', '1/2 Filé de Pescada ao Molho de Camarão (500g)', 178.00, '🐟', false, 'Cozinha 1', 'Em espera'],
  ['A La Carte', 'Peixe Grelhado Anchova (Chapa)', 118.00, '🐟', false, 'Cozinha 1', 'Em espera'],
  ['A La Carte', 'Peixe Frito em Postas (6 postas)', 115.00, '🐟', false, 'Cozinha 1', 'Em espera'],
  ['A La Carte', 'Camarão à Milanesa (800g)', 209.00, '🍤', false, 'Cozinha 1', 'Em espera'],
  ['A La Carte', '1/2 Camarão à Milanesa (500g)', 181.00, '🍤', false, 'Cozinha 1', 'Em espera'],
  ['A La Carte', 'Filé de Frango à Milanesa (800g)', 119.00, '🍗', false, 'Cozinha 1', 'Em espera'],
  ['A La Carte', '1/2 Filé de Frango à Milanesa (500g)', 99.00, '🍗', false, 'Cozinha 1', 'Em espera'],
  ['A La Carte', 'Porção Extra - Arroz/Pirão/Salada', 20.00, '🍚', false, 'Cozinha 1', 'Em espera']
];

const dbPaths = [
  path.join(__dirname, 'database.sqlite'),
  path.join(process.env.APPDATA, 'ChefCozinha', 'database.sqlite')
];

dbPaths.forEach(dbPath => {
  if (!fs.existsSync(dbPath)) {
    console.log(`Database not found at: ${dbPath}`);
    return;
  }

  console.log(`Seeding database: ${dbPath}`);
  const db = new sqlite3.Database(dbPath);

  db.serialize(() => {
    // Clean old products
    db.run("DELETE FROM produtos", (err) => {
      if (err) console.error("Error clearing table:", err);
    });

    const stmt = db.prepare(`INSERT INTO produtos (categoria, nome, preco, emoji, hasAddons, setor, status_inicial) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    products.forEach(p => {
      stmt.run(p[0], p[1], p[2], p[3], p[4] ? 1 : 0, p[5], p[6], (err) => {
        if (err) console.error(`Error inserting ${p[1]}:`, err);
      });
    });
    stmt.finalize(() => {
      console.log(`Seeding finished for: ${dbPath}`);
      db.close();
    });
  });
});
