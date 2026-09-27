const fs = require('fs');
const Database = require('better-sqlite3');

// 1. Base from database_1.sqlite
const d1 = new Database('database_1.sqlite', { readonly: true });
const prods1 = d1.prepare('SELECT nome, categoria, preco, descricao FROM produtos').all();
d1.close();

const masterDescriptions = {};

// Populate from database_1
for (const p of prods1) {
  if (p.descricao && p.descricao.trim()) {
    masterDescriptions[p.nome.trim()] = p.descricao.trim();
  }
}

// 2. Handcrafted high quality culinary descriptions for specific items & variants
const handcrafted = {
  'Porção 4 Pastéis Camarão': 'Quatro pastéis artesanais crocantes recheados com camarões frescos refogados no azeite de oliva, alho e ervas finas. Massa sequinha e dourada.',
  'Porção 4 Pastéis - Camarão': 'Quatro pastéis artesanais crocantes recheados com camarões frescos refogados no azeite de oliva, alho e ervas finas. Massa sequinha e dourada.',
  'Porção 4 Pastéis Berbigão': 'Quatro pastéis crocantes com berbigão fresco selecionado, temperado à moda tradicional do litoral catarinense com cheiro-verde e especiarias.',
  'Porção 4 Pastéis - Berbigão': 'Quatro pastéis crocantes com berbigão fresco selecionado, temperado à moda tradicional do litoral catarinense com cheiro-verde e especiarias.',
  'Porção 4 Pastéis Queijo': 'Quatro pastéis artesanais fritos na hora, com recheio cremoso e generoso de queijo derretido. Massa crocante e dourada.',
  'Porção 4 Pastéis - Queijo': 'Quatro pastéis artesanais fritos na hora, com recheio cremoso e generoso de queijo derretido. Massa crocante e dourada.',
  'Passaporte Rodízio Livre': 'Acesso livre e completo ao tradicional rodízio de frutos do mar da casa: peixes frescos fritos e grelhados, camarões em diversas preparações, mariscos, ostras, pastéis e guarnições à vontade.',
  'Livre': 'Acesso individual completo ao nosso bufê livre e rodízio de frutos do mar, com variedade de peixes frescos, camarões, acompanhamentos e guarnições da casa.',
  'Porção de Peixe': 'Filés de peixe fresco selecionados, empanados e fritos na hora com casquinha crocante e interior macio e suculento. Acompanha fatias de limão e molho tártaro especial.',
  'Porção de Pirão': 'Pirão de peixe tradicional da costa catarinense, cozido lentamente em fogo brando com caldo encorpado de peixes nobres e farinha de mandioca artesanal fina.',
  'Sopa de Siri': 'Sopa aveludada e aromática preparada com pura carne de siri catado na hora, azeite virgem, leite de coco suave, cheiro-verde fresco e tempero secreto da casa.',
  'Combinado Especial': 'O grande prato de celebração da casa: combinação nobre de camarões grelhados no alho e óleo, iscas crocantes de peixe à dorê, anéis de lula empanados e ostras gratinadas ao forno.',
  'Refrigerante': 'Refrigerante estupidamente gelado (350ml lata), servido com copo com pedras de gelo cristalino e fatia de limão taiti.',
  'Refrigerante Lata': 'Refrigerante lata 350ml trincando de gelado, servido com copo com pedras de gelo e rodela de limão.',
  'Porção Extra - Arroz/Pirão/Salada': 'Guarnição extra completa: arroz branco soltinho preparado na hora, pirão de peixe cremoso e aromático, e salada de folhas frescas com tomates selecionados.',
  'Pudim': 'Clássico pudim de leite condensado artesanal da casa, com textura aveludada sem furinhos, coberto com farta calda dourada de caramelo artesanal.',
  'Filé com Fritas': 'Suculento bife de filé grelhado na chapa no ponto desejado, temperado com sal grosso e ervas, acompanhado de batatas fritas crocantes e sequinhas.',
  'Suco Natural': 'Suco 100% natural da fruta preparado no momento do pedido, sem conservantes, servido bem gelado para refrescar seu paladar.',
  'Tônica Lata': 'Água tônica refrescante servida em lata de 350ml, com notas cítricas equilibradas e gaseificação marcante, perfeita pura com limão ou para compor drinks.',
  'TÃ´nica Lata': 'Água tônica refrescante servida em lata de 350ml, com notas cítricas equilibradas e gaseificação marcante, perfeita pura com limão ou para compor drinks.',
  'Coca-Cola': 'Refrigerante Coca-Cola original geladinho em lata 350ml, servido com pedras de gelo e limão.',
  'Chopp': 'Chopp artesanal puro malte estupidamente gelado, servido com colarinho espumoso e cremoso na medida ideal.',
  'Picanha na Chapa': 'Picanha bovina nobre fatiada e grelhada na chapa com alho e sal grosso. Acompanha arroz branco, farofa crocante e vinagrete da casa.',
  'Porção de Batata Frita': 'Batatas selecionadas cortadas em tiras finas e fritas em óleo limpo até dourarem. Crocantes por fora, macias por dentro e salgadas no ponto.',
  'Bife à Milanesa': 'Bife bovino macio empanado com casquinha crocante e dourada de panko e queijo ralado. Acompanha arroz branco e fritas.'
};

Object.assign(masterDescriptions, handcrafted);

console.log(`Total master descriptions compiled: ${Object.keys(masterDescriptions).length}`);

// Write to JSON for inspection and reuse
fs.writeFileSync('scripts/tools/master_product_descriptions.json', JSON.stringify(masterDescriptions, null, 2), 'utf8');
console.log('Saved to scripts/tools/master_product_descriptions.json');
