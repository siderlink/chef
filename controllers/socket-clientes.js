module.exports = function(socket, io, db, helpers) {
  const { getLocalDateOnly, getLocalTimestamp, activePaymentLocks, tenantContext } = helpers || {};

  // --- CLIENTES ---
  socket.on('get_clientes', () => {
    db.all(`SELECT * FROM clientes`, (err, rows) => socket.emit('clientes_atualizados', rows || []));
  });
  socket.on('add_cliente', (c) => {
    if (c.id) {
      // Update
      db.run(`UPDATE clientes SET nome=?, telefone=?, observacao=?, endereco=?, data_nascimento=? WHERE id=?`,
        [c.nome, c.telefone, c.observacao, c.endereco, c.data_nascimento, c.id], () => {
          db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
        });
    } else {
      // Insert
      db.run(`INSERT INTO clientes (nome, telefone, observacao, endereco, data_nascimento, pontos) VALUES (?, ?, ?, ?, ?, 0)`,
        [c.nome, c.telefone, c.observacao, c.endereco, c.data_nascimento], () => {
          db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
        });
    }
  });
  socket.on('delete_cliente', (id) => {
    if (!exigirAdminSocket(socket)) return;
    db.run(`DELETE FROM clientes WHERE id = ?`, [id], () => {
      db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
    });
  });

  socket.on('buscar_historico_cliente', (data) => {
    const nome = data.nome || null;
    const telefone = data.telefone || null;
    if (!nome && !telefone) return socket.emit('historico_cliente', { nome: null, historico: [] });
    let query, params;
    if (telefone) {
      query = `SELECT p.localName, p.productName, p.productEmoji, p.quantity, p.total, p.createdAt 
               FROM pedidos p
               LEFT JOIN clientes c ON p.cliente_id = c.id
               WHERE (c.telefone = ? OR p.mesa_comanda = ?) AND p.status IN ('Finalizado','Pago','Entregue')
               ORDER BY p.createdAt DESC LIMIT 10`;
      params = [telefone, nome];
    } else {
      query = `SELECT p.localName, p.productName, p.productEmoji, p.quantity, p.total, p.createdAt 
               FROM pedidos p
               LEFT JOIN clientes c ON p.cliente_id = c.id
               WHERE (p.mesa_comanda = ? OR c.nome = ?) AND p.status IN ('Finalizado','Pago','Entregue')
               ORDER BY p.createdAt DESC LIMIT 10`;
      params = [nome, nome];
    }
    db.all(query, params, (err, rows) => {
      socket.emit('historico_cliente', { nome, historico: rows || [] });
    });
  });

  socket.on('resgatar_premio_qr', (data) => {
    // Pode receber apenas a string do QR Code ou um objeto { qrCodeStr, mesaName }
    const qrCodeStr = typeof data === 'string' ? data : data.qrCodeStr;
    const mesaName = typeof data === 'object' ? data.mesaName : null;

    if (!qrCodeStr || !qrCodeStr.startsWith('RESGATE:')) {
      return socket.emit('resgate_erro', 'QR Code inválido. Formato esperado: RESGATE:TELEFONE:CUSTO:PRODUTO');
    }

    const parts = qrCodeStr.split(':');
    if (parts.length < 4) return socket.emit('resgate_erro', 'QR Code mal formatado.');

    const telefone = parts[1];
    const custo = parseInt(parts[2], 10);
    const produto = parts.slice(3).join(':'); // Permite que o produto tenha dois pontos no nome

    db.get(`SELECT * FROM clientes WHERE telefone = ?`, [telefone], (err, cliente) => {
      if (!cliente) return socket.emit('resgate_erro', 'Cliente não encontrado com este telefone.');
      if (cliente.pontos < custo) return socket.emit('resgate_erro', `Saldo insuficiente. Cliente tem ${cliente.pontos} pts, e o prêmio custa ${custo} pts.`);

      // Deduzir pontos (atomic check + deduct to prevent race conditions)
      db.run(`UPDATE clientes SET pontos = pontos - ? WHERE id = ? AND pontos >= ?`, [custo, cliente.id, custo], (err2) => {
        if (err2) return socket.emit('resgate_erro', 'Erro ao deduzir pontos.');

        // Check if the update actually affected a row (balance was sufficient)
        db.get(`SELECT changes() as ch`, [], (errCh, rowCh) => {
          if (!errCh && rowCh && rowCh.ch === 0) {
            return socket.emit('resgate_erro', 'Saldo insuficiente (concorrência). Tente novamente.');
          }

          // Atualizar a interface dos clientes globalmente
          db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));

          // Enviar sucesso e dados do produto
          socket.emit('resgate_sucesso', {
            cliente: cliente,
            produto: produto,
            custo: custo
          });

          // Se uma mesa foi fornecida (App do Garçom), lança automaticamente o prêmio na mesa
          if (mesaName) {
            db.get(`SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, (err3, turno) => {
              if (turno) {
                const pedido = {
                  localName: mesaName,
                  userName: 'App Garçom',
                  productName: produto + ' (Prêmio Fidelidade)',
                  productEmoji: '🎁',
                  quantity: 1,
                  total: '0,00',
                  status: 'Recebido',
                  time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                  sector: 'Cozinha 1', // Ou tentar inferir o setor do produto
                  turno_id: turno.id,
                  cliente_id: cliente.id
                };

                db.run(
                  `INSERT INTO pedidos (localName, userName, productName, productEmoji, quantity, total, status, time, sector, turno_id, cliente_id, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
                  [pedido.localName, pedido.userName, pedido.productName, pedido.productEmoji, pedido.quantity, pedido.total, pedido.status, pedido.time, pedido.sector, pedido.turno_id, pedido.cliente_id],
                  function (err4) {
                    if (!err4) {
                      pedido.id = this.lastID;
                      io.emit('novo_pedido', pedido);
                      io.emit('pedido_adicionado', pedido);
                      broadcastPedidos();
                      // Atualiza o status da mesa para ocupada se for nova
                      db.get(`SELECT status FROM mesas WHERE nome = ?`, [mesaName], (err, m) => {
                        if (m && m.status === 'Disponível') {
                          db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ?`, [mesaName], () => {
                            db.all(`SELECT * FROM mesas`, (e, r) => io.emit('mesas_atualizadas', r || []));
                          });
                        }
                      });
                    }
                  }
                );
              }
            });
          }
        });
      });
    });
  });

};
