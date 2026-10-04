const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /db\.run\(\s*`INSERT INTO pedidos[\s\S]*?function\s*\(\s*err\s*\)\s*{[\s\S]*?\}\s*\);/m;
const replacement = `
          // Função auxiliar para inserir usando a nova estrutura (Comandas)
          function inserirComandaItem(prodName, prodEmoji, qty, timeStr, totalVal, prodStatus, prodSector, bonusCb) {
            const mesaName = pedido.localName || 'Mesa ?';
            const clientId = pedido.cliente_id || null;
            const promId = pedido.promocao_id || null;

            db.get("SELECT id FROM comandas WHERE mesa = ? AND status = 'Aberta'", [mesaName], (errC, rowC) => {
              if (rowC && rowC.id) {
                doInsertItem(rowC.id);
              } else {
                db.run(
                  "INSERT INTO comandas (mesa, cliente_id, promocao_id, status, criado_em) VALUES (?, ?, ?, 'Aberta', datetime('now', 'localtime'))",
                  [mesaName, clientId, promId],
                  function(errI) {
                    if (errI) return console.error('Erro ao criar comanda:', errI);
                    doInsertItem(this.lastID);
                  }
                );
              }
            });

            function doInsertItem(comanda_id) {
               const precoUnitario = parseFloat(totalVal) / (qty || 1);
               db.run(\`
                 INSERT INTO comandas_itens 
                 (comanda_id, nome, emoji, quantidade, preco_unitario, total, status, setor, observacoes, composicoes, opcionais, garcom, criado_em)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
               \`, [
                 comanda_id, prodName, prodEmoji, qty, precoUnitario, parseFloat(totalVal),
                 prodStatus, prodSector, pedido.observations || '', JSON.stringify(pedido.composicoes || []),
                 pedido.options || '', pedido.userName || ''
               ], function(err) {
                 if (err) {
                   if (!bonusCb) {
                     console.error('Erro ao inserir item:', err);
                     socket.emit('erro_servidor', 'Falha ao gravar o pedido. Tente novamente.');
                   }
                   return;
                 }
                 const insertedId = this.lastID;
                 
                 // Atualiza os totais da comanda
                 db.run("UPDATE comandas SET valor_subtotal = (SELECT SUM(total) FROM comandas_itens WHERE comanda_id = ?), valor_total = (SELECT SUM(total) FROM comandas_itens WHERE comanda_id = ?) WHERE id = ?", [comanda_id, comanda_id, comanda_id]);

                 if (bonusCb) {
                   bonusCb(insertedId);
                 } else {
                   const finalSector = prodSector || 'Cozinha 1';
                   const newOrder = { ...pedido, id: insertedId, status: prodStatus, sector: finalSector, etapa: etapa, marcha_status: marchaStatus, tempo_preparo_min: tempoPreparo, createdAt: new Date().toISOString() };
                   io.emit('pedido_adicionado', newOrder);
                   sendPush('cozinha', '🆕 Novo Pedido!', \`\${qty}x \${prodName} — \${mesaName}\`.trim(), 'pedido-' + insertedId, '/fila-pedidos.html');
                   updateMesaStatus();
                   broadcastPedidos();

                   if (comboBonus) {
                     db.get(\`SELECT emoji, categoria FROM produtos WHERE nome = ?\`, [comboBonus], (err, bonusProd) => {
                       const bonusSector = (bonusProd && bonusProd.categoria === 'Bebidas') ? 'Bar' : 'Cozinha 1';
                       const bonusEmoji = bonusProd ? bonusProd.emoji : '🎁 ';
                       inserirComandaItem(
                         comboBonus + ' (Brinde)', bonusEmoji, qty, timeStr, "0.00", prodStatus, bonusSector,
                         function(bonusId) {
                           io.emit('pedido_adicionado', {
                             productName: comboBonus + ' (Brinde)', productEmoji: bonusEmoji, quantity: qty,
                             time: timeStr, localName: mesaName, userName: pedido.userName,
                             total: "0.00", status: prodStatus, sector: bonusSector, id: bonusId, createdAt: new Date().toISOString()
                           });
                           broadcastPedidos();
                         }
                       );
                     });
                   }
                 }
               });
            }
          }

          inserirComandaItem(pedido.productName, pedido.productEmoji, pedido.quantity, pedido.time, pedido.total, status, pedido.sector || 'Cozinha 1', null);
`;

const newContent = content.replace(regex, replacement.trim());
if (newContent === content) {
    console.error("No match found!");
} else {
    fs.writeFileSync(file, newContent);
    console.log("Successfully patched server.js");
}
