const sqlite3 = require('./sqlite3-wrapper').verbose();
const db = new sqlite3.Database('./database.sqlite');

const products = [
  ['Pastéis', 'Porção 4 Pastéis Camarão', 28.00, '🥟', false],
  ['Pastéis', 'Porção 4 Pastéis Berbigão', 28.00, '🥟', false],
  ['Rodízio', 'Passaporte Rodízio Livre', 39.90, '🎟️', false],
  ['Peixes', 'Porção de Peixe', 25.00, '🐟', false],
  ['Peixes', 'Porção de Pirão', 15.00, '🍲', false],
  ['Entradas', 'Sopa de Siri', 12.00, '🥣', false],
  ['Especiais', 'Combinado Especial', 129.00, '🍤', false]
];

const promos = [
  ['Quarta do Pastel Camarão', 'Preço fixo na quarta', 0, true, JSON.stringify({tipo_promocao: 'preco_fixo', produto_alvo_nome: 'Porção 4 Pastéis Camarão', novo_preco: 24.00, dias_semana: [3]})],
  ['Quarta do Pastel Berbigão', 'Preço fixo na quarta', 0, true, JSON.stringify({tipo_promocao: 'preco_fixo', produto_alvo_nome: 'Porção 4 Pastéis Berbigão', novo_preco: 24.00, dias_semana: [3]})],
  ['Quinta Livre (Peixe/Pirão)', 'Rodízio Livre', 0, true, JSON.stringify({tipo_promocao: 'livre', produto_alvo_nome: 'Passaporte Rodízio Livre', categorias_inclusas: ['Peixes'], dias_semana: [4]})],
  ['Quinta Sopa Grátis', 'Brinde', 0, true, JSON.stringify({tipo_promocao: 'combo', produto_alvo_nome: 'Passaporte Rodízio Livre', produto_brinde_nome: 'Sopa de Siri', dias_semana: [4]})],
  ['Sexta do Combinado', 'Desconto Combinado', 0, true, JSON.stringify({tipo_promocao: 'preco_fixo', produto_alvo_nome: 'Combinado Especial', novo_preco: 119.90, dias_semana: [5]})]
];

db.serialize(() => {
  const insertProd = db.prepare(`INSERT INTO produtos (categoria, nome, preco, emoji, hasAddons) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM produtos WHERE nome = ?)`);
  products.forEach(p => {
    insertProd.run(p[0], p[1], p[2], p[3], p[4], p[1]);
  });
  insertProd.finalize();

  const insertPromo = db.prepare(`INSERT INTO promocoes (nome, regra, desconto, ativo, config) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM promocoes WHERE nome = ?)`);
  promos.forEach(p => {
    insertPromo.run(p[0], p[1], p[2], p[3], p[4], p[0]);
  });
  insertPromo.finalize();
  
  console.log("Seeds inserted.");
});
