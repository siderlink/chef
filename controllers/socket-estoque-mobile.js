module.exports = function(socket, io, db, helpers) {
  const { getLocalDateOnly, getLocalTimestamp, activePaymentLocks, tenantContext } = helpers || {};

  // --- Módulo de Estoque (Mobile) ---
  socket.on('buscar_produto_por_codigo', (codigo) => {
    if (!codigo) return;
    // Tenta buscar por código de barras primeiro, senão por ID
    db.get(`SELECT * FROM produtos WHERE codigo_barras = ? OR id = ? LIMIT 1`, [codigo, codigo], (err, row) => {
      if (err || !row) {
        socket.emit('produto_estoque_resultado', { error: 'Produto não encontrado' });
      } else {
        socket.emit('produto_estoque_resultado', row);
      }
    });
  });

  socket.on('atualizar_estoque', (data) => {
    const { id, quantidade, validade, operador, valor_unitario } = data;
    if (!id || !quantidade) return;

    const qtdAdd = parseFloat(quantidade) || 0;
    const custo = safeFloat(valor_unitario, 0);

    db.get(`SELECT nome, estoque FROM produtos WHERE id = ?`, [id], (err, row) => {
      if (err || !row) return;

      const novoEstoque = (row.estoque || 0) + qtdAdd;
      const campos = custo > 0 ? `estoque = ?, validade = ?, preco_custo = ?` : `estoque = ?, validade = ?`;
      const params = custo > 0 ? [novoEstoque, validade || null, custo, id] : [novoEstoque, validade || null, id];

      db.run(`UPDATE produtos SET ${campos} WHERE id = ?`, params, (updateErr) => {
        if (!updateErr) {
          // Registrar auditoria
          registrarAuditoria('Entrada de Estoque', `Adicionado ${qtdAdd}x de '${row.nome}'. Novo total: ${novoEstoque}. Validade: ${validade || 'N/A'}${custo > 0 ? `. Custo unitário: R$ ${custo.toFixed(2)}` : ''}`, operador || 'App Mobile');
          socket.emit('estoque_atualizado_sucesso', { nome: row.nome, novoEstoque });

          // Broadcast para atualizar listas
          db.all("SELECT * FROM produtos WHERE status = 'ativo'", (err, produtos) => {
            io.emit('produtos_atualizados', produtos || []);
          });
        }
      });
    });
  });

};
