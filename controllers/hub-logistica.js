const crypto = require('crypto');

module.exports = function(app, options) {
  const { masterDb, io, getTenantDb } = options;

  // 1. Iniciar Tabelas Globais
  masterDb.run(`
    CREATE TABLE IF NOT EXISTS hub_motoboys (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE,
      email TEXT UNIQUE,
      nome TEXT,
      telefone TEXT,
      cpf TEXT,
      veiculo TEXT,
      placa TEXT,
      cnh_url TEXT,
      status_validacao TEXT DEFAULT 'INCOMPLETO',
      status_online INTEGER DEFAULT 0,
      lat REAL,
      lng REAL,
      saldo REAL DEFAULT 0,
      chave_pix TEXT,
      nivel TEXT DEFAULT 'BRONZE', -- BRONZE, PRATA, OURO
      pontos INTEGER DEFAULT 0,
      last_ping DATETIME
    )
  `);

  masterDb.run(`
    CREATE TABLE IF NOT EXISTS hub_corridas (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      pedido_id TEXT,
      restaurante_nome TEXT,
      endereco_coleta TEXT,
      endereco_entrega TEXT,
      valor_loja REAL,
      valor_motoboy REAL,
      taxa_plataforma REAL,
      status TEXT DEFAULT 'PENDENTE', -- PENDENTE, ACEITA, COLETADA, FINALIZADA
      motoboy_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      accepted_at DATETIME,
      finished_at DATETIME
    )
  `);

  masterDb.run(`
    CREATE TABLE IF NOT EXISTS hub_diarias (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      restaurante_nome TEXT,
      valor_fixo REAL,
      valor_por_entrega REAL,
      data_inicio DATETIME,
      data_fim DATETIME,
      status TEXT DEFAULT 'ABERTA', -- ABERTA, PREENCHIDA, FINALIZADA, CANCELADA
      motoboy_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  masterDb.run(`
    CREATE TABLE IF NOT EXISTS hub_extrato_plataforma (
      id TEXT PRIMARY KEY,
      tipo TEXT, -- 'CORRIDA', 'DIARIA', 'TAXA_SAQUE'
      descricao TEXT,
      valor REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // --- APIs PARA OS MOTOBOYS ---

  app.post('/api/hub-logistica/motoboy/auth-google', (req, res) => {
    // Mocking OAuth verification for prototype
    const { google_id, email, nome, picture } = req.body;
    if (!google_id || !email) return res.json({ ok: false, error: 'Dados do Google inválidos' });
    
    masterDb.get('SELECT * FROM hub_motoboys WHERE google_id = ? OR email = ?', [google_id, email], (err, motoboy) => {
      if (!motoboy) {
        const id = crypto.randomUUID();
        masterDb.run(
          'INSERT INTO hub_motoboys (id, google_id, email, nome, status_validacao) VALUES (?, ?, ?, ?, "INCOMPLETO")',
          [id, google_id, email, nome],
          () => res.json({ ok: true, token: id, motoboy: { id, nome, email, status_validacao: 'INCOMPLETO' } })
        );
      } else {
        res.json({ ok: true, token: motoboy.id, motoboy });
      }
    });
  });

  app.post('/api/hub-logistica/motoboy/enviar-documentos', (req, res) => {
    const { token, telefone, cpf, veiculo, placa, cnh_url } = req.body;
    masterDb.run(
      'UPDATE hub_motoboys SET telefone=?, cpf=?, veiculo=?, placa=?, cnh_url=?, status_validacao="PENDENTE_ANALISE" WHERE id=?',
      [telefone, cpf, veiculo, placa, cnh_url || 'upload_pendente', token],
      function(err) {
        if (err) return res.json({ ok: false, error: err.message });
        res.json({ ok: true, status_validacao: 'PENDENTE_ANALISE' });
      }
    );
  });

  app.post('/api/hub-logistica/motoboy/ping', (req, res) => {
    const { token, lat, lng, status_online } = req.body;
    masterDb.get('SELECT status_validacao, nivel, pontos, saldo FROM hub_motoboys WHERE id = ?', [token], (err, row) => {
      if (!row) return res.json({ ok: false });
      const onlineFinal = (row.status_validacao === 'APROVADO' && status_online) ? 1 : 0;
      masterDb.run(
        'UPDATE hub_motoboys SET lat = ?, lng = ?, status_online = ?, last_ping = CURRENT_TIMESTAMP WHERE id = ?',
        [lat, lng, onlineFinal, token]
      );
      res.json({ ok: true, status_validacao: row.status_validacao, nivel: row.nivel, saldo: row.saldo, pontos: row.pontos });
    });
  });

  app.get('/api/hub-logistica/motoboy/corridas', (req, res) => {
    // Gets pending rides
    masterDb.all('SELECT * FROM hub_corridas WHERE status = "PENDENTE" ORDER BY created_at DESC', [], (err, rows) => {
      res.json({ ok: true, corridas: rows || [] });
    });
  });

  app.post('/api/hub-logistica/motoboy/aceitar', (req, res) => {
    const { token, corrida_id } = req.body;
    masterDb.get('SELECT * FROM hub_corridas WHERE id = ? AND status = "PENDENTE"', [corrida_id], (err, corrida) => {
      if (!corrida) return res.json({ ok: false, error: 'Corrida não está mais disponível.' });
      
      masterDb.run('UPDATE hub_corridas SET status = "ACEITA", motoboy_id = ?, accepted_at = CURRENT_TIMESTAMP WHERE id = ?', [token, corrida_id], function(err2) {
        if (io) io.emit('hub_corrida_aceita', { corrida_id, motoboy_id: token, tenant_id: corrida.tenant_id });
        res.json({ ok: true });
      });
    });
  });

  app.post('/api/hub-logistica/motoboy/finalizar', (req, res) => {
    const { token, corrida_id } = req.body;
    
    masterDb.get('SELECT * FROM hub_corridas WHERE id = ? AND motoboy_id = ? AND status = "ACEITA"', [corrida_id, token], (err, corrida) => {
      if (!corrida) return res.json({ ok: false, error: 'Corrida não encontrada ou já finalizada.' });
      
      // Atualiza a corrida
      masterDb.run('UPDATE hub_corridas SET status = "FINALIZADA", finished_at = CURRENT_TIMESTAMP WHERE id = ?', [corrida_id], () => {
        
        // 1. Paga o Motoboy
        masterDb.run('UPDATE hub_motoboys SET saldo = saldo + ? WHERE id = ?', [corrida.valor_motoboy, token]);
        
        // 2. Paga a Plataforma (Banco Chef)
        const extratoId = crypto.randomUUID();
        masterDb.run(
          'INSERT INTO hub_extrato_plataforma (id, tipo, descricao, valor) VALUES (?, ?, ?, ?)',
          [extratoId, 'CORRIDA', `Comissão de Corrida (${corrida.restaurante_nome})`, corrida.taxa_plataforma]
        );

        if (io) io.emit('hub_corrida_finalizada', { corrida_id, tenant_id: corrida.tenant_id });
        res.json({ ok: true });
      });
    });
  });

  app.post('/api/hub-logistica/motoboy/saque', (req, res) => {
    const { token, valor_saque } = req.body;
    
    masterDb.get('SELECT saldo, chave_pix FROM hub_motoboys WHERE id = ?', [token], (err, motoboy) => {
      if (!motoboy) return res.json({ ok: false, error: 'Motoboy não encontrado' });
      if (!motoboy.chave_pix) return res.json({ ok: false, error: 'Chave PIX não cadastrada' });
      
      const taxa_saque = 2.50; // Taxa fixa da plataforma por saque
      const debito_total = valor_saque + taxa_saque;
      
      if (motoboy.saldo < debito_total) {
        return res.json({ ok: false, error: 'Saldo insuficiente para cobrir o saque e a taxa de R$ 2,50' });
      }

      // 1. Debita o Motoboy
      masterDb.run('UPDATE hub_motoboys SET saldo = saldo - ? WHERE id = ?', [debito_total, token], () => {
        // 2. Registra o ganho da plataforma na taxa de saque
        const extratoId = crypto.randomUUID();
        masterDb.run(
          'INSERT INTO hub_extrato_plataforma (id, tipo, descricao, valor) VALUES (?, ?, ?, ?)',
          [extratoId, 'TAXA_SAQUE', `Taxa de Saque PIX`, taxa_saque]
        );
        
        // Em um sistema real, aqui chamaríamos a API do gateway (Ex: Asaas) para realizar o PIX
        res.json({ ok: true, mensagem: 'Saque solicitado com sucesso. Enviando para o PIX.' });
      });
    });
  });

  app.get('/api/hub-logistica/admin/banco', (req, res) => {
    masterDb.get('SELECT SUM(valor) as total_arrecadado FROM hub_extrato_plataforma', [], (err, totalRow) => {
      masterDb.all('SELECT * FROM hub_extrato_plataforma ORDER BY created_at DESC LIMIT 50', [], (err, extratoRows) => {
        res.json({ 
          ok: true, 
          total_arrecadado: totalRow ? (totalRow.total_arrecadado || 0) : 0,
          extrato: extratoRows || [] 
        });
      });
    });
  });

  // --- APIs PARA OS RESTAURANTES ---

  app.post('/api/hub-logistica/restaurante/solicitar', (req, res) => {
    const { tenant_id, pedido_id, restaurante_nome, endereco_coleta, endereco_entrega, valor_loja } = req.body;
    const corrida_id = crypto.randomUUID();
    
    // Matemática do Split (O sistema ganha sempre 20%)
    const taxa_plataforma = valor_loja * 0.20;
    const valor_motoboy = valor_loja - taxa_plataforma;

    masterDb.run(`
      INSERT INTO hub_corridas (id, tenant_id, pedido_id, restaurante_nome, endereco_coleta, endereco_entrega, valor_loja, valor_motoboy, taxa_plataforma)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [corrida_id, tenant_id, pedido_id, restaurante_nome, endereco_coleta, endereco_entrega, valor_loja, valor_motoboy, taxa_plataforma], function(err) {
      if (err) return res.json({ ok: false, error: err.message });
      
      const novaCorrida = { id: corrida_id, tenant_id, pedido_id, restaurante_nome, endereco_coleta, endereco_entrega, valor_loja, valor_motoboy, status: 'PENDENTE' };
      if (io) io.emit('hub_nova_corrida', novaCorrida); 
      
      res.json({ ok: true, corrida_id });
    });
  });

  // --- APIs PARA A EQUIPE DE SUPORTE (ADMIN) ---

  app.get('/api/hub-logistica/admin/motoboys-pendentes', (req, res) => {
    masterDb.all('SELECT * FROM hub_motoboys WHERE status_validacao = "PENDENTE_ANALISE" ORDER BY last_ping DESC', [], (err, rows) => {
      res.json({ ok: true, motoboys: rows || [] });
    });
  });

  app.post('/api/hub-logistica/admin/avaliar-motoboy', (req, res) => {
    const { motoboy_id, novo_status } = req.body;
    if (!['APROVADO', 'BLOQUEADO', 'INCOMPLETO'].includes(novo_status)) return res.json({ ok: false, error: 'Status inválido' });
    
    masterDb.run('UPDATE hub_motoboys SET status_validacao = ? WHERE id = ?', [novo_status, motoboy_id], function(err) {
      if (err) return res.json({ ok: false, error: err.message });
      res.json({ ok: true });
    });
  });

};
