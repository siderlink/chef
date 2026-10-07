module.exports = function(app, { io, getTenantDb }) {
  console.log('📦 Controller Operacional Custom (Fila, B2B, Logística, CFO, Antifraude) carregado.');

  // ==========================================
  // HTTP APIs (B2B, CFO, Antifraude)
  // ==========================================

  app.get('/api/cfo/metricas', (req, res) => {
    const restId = req.query.restaurante_id || 1;
    const db = getTenantDb(restId);
    
    // Create table if not exists (for mocking)
    db.run(`CREATE TABLE IF NOT EXISTS despesas (id INTEGER PRIMARY KEY, descricao TEXT, valor REAL, data TEXT)`);
    
    db.all(`SELECT SUM(total) as receita_total, COUNT(*) as qtd_pedidos FROM pedidos WHERE status = 'Finalizado'`, [], (err, rows) => {
      if (err) return res.json({ error: err.message });
      const receita = rows[0]?.receita_total || 0;
      const qtd = rows[0]?.qtd_pedidos || 0;
      
      res.json({
        receita_bruta: receita,
        lucro_liquido: receita * 0.35, // 35% margin mock
        ticket_medio: qtd > 0 ? (receita / qtd) : 0,
        pedidos_mes: qtd,
        burn_rate: 4500.00,
        runway: '8 meses'
      });
    });
  });

  app.get('/api/antifraude/logs', (req, res) => {
    // Mock data for antifraud
    res.json([
      { id: 1, tipo: 'Cancelamento Suspeito', detalhe: 'Pedido #1042 cancelado após 45 min', risco: 'ALTO', data: new Date().toISOString() },
      { id: 2, tipo: 'Múltiplos Estornos', detalhe: 'Cartão final 4021 com 3 estornos hoje', risco: 'CRÍTICO', data: new Date().toISOString() },
      { id: 3, tipo: 'Gorjeta Anômala', detalhe: 'Gorjeta de R$ 150 em pedido de R$ 30', risco: 'MÉDIO', data: new Date().toISOString() }
    ]);
  });

  app.get('/api/b2b/fornecedores', (req, res) => {
    res.json([
      { id: 1, nome: 'Atacadão das Carnes', categoria: 'Proteínas', status: 'Ativo' },
      { id: 2, nome: 'Hortifruti Central', categoria: 'Vegetais', status: 'Ativo' },
      { id: 3, nome: 'Distribuidora Bebidas', categoria: 'Bebidas', status: 'Atrasado' }
    ]);
  });


  // ==========================================
  // SOCKET.IO (Fila de Espera, Rotas, Tablet)
  // ==========================================
  io.on('connection', (socket) => {
    const restId = socket.handshake.query.restaurante_id || 1;
    const db = getTenantDb(restId);

    // Garante tabela de fila
    db.run(`CREATE TABLE IF NOT EXISTS fila_espera (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, pax INTEGER, telefone TEXT, status TEXT DEFAULT 'Aguardando', timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    // Garante tabela de rotas
    db.run(`CREATE TABLE IF NOT EXISTS rotas_entrega (id INTEGER PRIMARY KEY AUTOINCREMENT, entregador_id INTEGER, pedidos_ids TEXT, status TEXT DEFAULT 'Despachada', timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // --- Fila de Espera ---
    socket.on('get_fila', () => {
      db.all(`SELECT * FROM fila_espera WHERE status = 'Aguardando' ORDER BY id ASC`, [], (err, rows) => {
        if (!err) socket.emit('fila_atualizada', rows);
      });
    });

    socket.on('add_fila', (data) => {
      db.run(`INSERT INTO fila_espera (nome, pax, telefone) VALUES (?, ?, ?)`, [data.nome, data.pax, data.tel], function(err) {
        if (!err) io.emit('fila_atualizada_trigger'); // trigger re-fetch for all clients
      });
    });

    socket.on('remove_fila', (id) => {
      db.run(`UPDATE fila_espera SET status = 'Cancelado' WHERE id = ?`, [id], function(err) {
        if (!err) io.emit('fila_atualizada_trigger');
      });
    });

    socket.on('assentar_fila', (id) => {
      db.run(`UPDATE fila_espera SET status = 'Assentado' WHERE id = ?`, [id], function(err) {
        if (!err) io.emit('fila_atualizada_trigger');
      });
    });

    // --- Tablet Mesa ---
    socket.on('chamar_garcom', (data) => {
      console.log(`Mesa ${data.mesa} chamando garçom!`);
      // Broadcast to all staff interfaces
      io.emit('alerta_chamar_garcom', data.mesa);
    });

    socket.on('fechar_conta', (data) => {
      console.log(`Mesa ${data.mesa} pedindo a conta!`);
      // Broadcast to cashier
      io.emit('alerta_pedir_conta', data.mesa);
    });

    socket.on('alerta_pdv_cozinha', (msg) => {
      console.log(`PDV/Garçom notificando cozinha: ${msg}`);
      io.emit('ia_manobra_executada', { mensagem: msg });
    });

    // --- Roteirizador Lógico ---
    socket.on('get_rotas', () => {
      db.all(`SELECT * FROM rotas_entrega WHERE status = 'Despachada'`, [], (err, rows) => {
        if (!err) socket.emit('rotas_atualizadas', rows);
      });
    });

    socket.on('despachar_rota', (data) => {
      // data = { entregador_id, pedidos: [{id, ...}] }
      const pedidosIds = JSON.stringify(data.pedidos.map(p => p.id));
      db.run(`INSERT INTO rotas_entrega (entregador_id, pedidos_ids) VALUES (?, ?)`, [data.entregador_id, pedidosIds], function(err) {
        if (!err) {
          io.emit('rotas_atualizadas_trigger');
          
          // Atualiza o status dos pedidos para "Em Rota"
          data.pedidos.forEach(p => {
             db.run(`UPDATE pedidos SET status = 'Em Rota' WHERE id = ?`, [p.id]);
             io.emit('pedido_status_alterado', { id: p.id, status: 'Em Rota' });
          });
          io.emit('pedidos_atualizados_trigger'); // atualiza KDS
        }
      });
    });

  });
};
