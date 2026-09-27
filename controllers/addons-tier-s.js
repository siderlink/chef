'use strict';
const crypto = require('crypto');

module.exports = function(app, options) {
  const {
    db: defaultDb,
    masterDb,
    io,
    sqlite3,
    verificarToken,
    getTenantDb,
    superAdminAuth
  } = options || {};

  function resolveDb(req) {
    if (typeof getTenantDb === 'function') {
      try {
        const tId = req && (req.query?.restaurante_id || req.body?.restaurante_id || req.tenantId || req.headers?.['x-tenant-id']);
        if (tId) {
          const tDb = getTenantDb(tId);
          if (tDb) return tDb;
        }
      } catch (e) {}
    }
    return defaultDb || masterDb;
  }

  const authMiddleware = (req, res, next) => {
    if (typeof verificarToken === 'function') {
      return verificarToken(req, res, () => {
        migrarTabelasTierS(resolveDb(req));
        next();
      });
    }
    migrarTabelasTierS(resolveDb(req));
    next();
  };

  migrarTabelasTierS(defaultDb || masterDb);

  function migrarTabelasTierS(db) {
    if (!db || typeof db.serialize !== 'function') return;
    db.serialize(() => {
      // 1. Hub Multi-Marketplace
      db.run(`CREATE TABLE IF NOT EXISTS marketplace_integracoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        marketplace TEXT,
        token_api TEXT,
        loja_id_externo TEXT,
        ativo INTEGER DEFAULT 1,
        sync_cardapio INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS marketplace_pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        marketplace TEXT,
        pedido_externo_id TEXT UNIQUE,
        cliente_nome TEXT,
        cliente_telefone TEXT,
        endereco TEXT,
        itens_json TEXT,
        valor_total REAL,
        taxa_marketplace REAL,
        status TEXT DEFAULT 'novo',
        aceito_em DATETIME,
        preparando_em DATETIME,
        pronto_em DATETIME,
        despachado_em DATETIME,
        entregue_em DATETIME,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS marketplace_pausas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        marketplace TEXT,
        motivo TEXT,
        insumo_esgotado TEXT,
        pausado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        retomado_em DATETIME
      )`);

      // 2. Maquininha Virtual & Link de Pagamento Instantâneo
      db.run(`CREATE TABLE IF NOT EXISTS link_pagamento (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER,
        valor REAL,
        parcelas INTEGER DEFAULT 1,
        forma TEXT,
        url_checkout TEXT,
        token_unico TEXT UNIQUE,
        status TEXT DEFAULT 'pendente',
        gateway TEXT,
        gateway_id_externo TEXT,
        taxa_plataforma_pct REAL DEFAULT 0.5,
        valor_taxa REAL DEFAULT 0,
        pago_em DATETIME,
        expirado_em DATETIME,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS link_pagamento_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gateway TEXT,
        chave_api TEXT,
        webhook_secret TEXT,
        taxa_padrao_pct REAL DEFAULT 0.5,
        ativo INTEGER DEFAULT 1
      )`);

      // 3. Ficha Técnica Visual com Foto do Prato Montado
      db.run(`CREATE TABLE IF NOT EXISTS ficha_tecnica_visual (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER,
        foto_prato_url TEXT,
        modo_preparo TEXT,
        tempo_preparo_min INTEGER,
        temperatura TEXT,
        dificuldade TEXT,
        checklist_montagem TEXT,
        dicas_chef TEXT,
        video_url TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS ficha_tecnica_insumos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ficha_id INTEGER,
        insumo_nome TEXT,
        quantidade REAL,
        unidade TEXT,
        ordem INTEGER,
        obrigatorio INTEGER DEFAULT 1,
        FOREIGN KEY (ficha_id) REFERENCES ficha_tecnica_visual(id) ON DELETE CASCADE
      )`);

      // 4. Dashboard do Dono em Tempo Real
      db.run(`CREATE TABLE IF NOT EXISTS dashboard_alertas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT,
        titulo TEXT,
        mensagem TEXT,
        dados_json TEXT,
        lido INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS dashboard_metas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT,
        valor_meta REAL,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 5. SPED Fiscal & Exportação Contábil Automática
      db.run(`CREATE TABLE IF NOT EXISTS sped_exportacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT,
        periodo_inicio DATE,
        periodo_fim DATE,
        arquivo_nome TEXT,
        arquivo_path TEXT,
        registros_count INTEGER,
        status TEXT DEFAULT 'gerado',
        enviado_email TEXT,
        enviado_em DATETIME,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS sped_config_contador (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contador_nome TEXT,
        contador_email TEXT,
        contador_telefone TEXT,
        envio_automatico INTEGER DEFAULT 0,
        dia_envio INTEGER DEFAULT 1,
        regime_tributario TEXT,
        ativo INTEGER DEFAULT 1
      )`);
    });
  }

  // ==========================================
  // 1. Hub Multi-Marketplace
  // ==========================================
  
  app.get('/api/addons/marketplace/integracoes', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM marketplace_integracoes WHERE ativo = 1`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao listar integrações.', detalhes: err.message });
      res.json({ ok: true, integracoes: rows });
    });
  });

  app.post('/api/addons/marketplace/integracoes', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { marketplace, token_api, loja_id_externo, sync_cardapio } = req.body;
    
    if (!marketplace || !token_api) {
      return res.json({ ok: false, erro: 'Marketplace e token_api são obrigatórios.' });
    }

    const sql = `INSERT INTO marketplace_integracoes (marketplace, token_api, loja_id_externo, sync_cardapio) VALUES (?, ?, ?, ?)`;
    db.run(sql, [marketplace, token_api, loja_id_externo, sync_cardapio || 0], function(err) {
      if (err) return res.json({ ok: false, erro: 'Erro ao salvar integração.', detalhes: err.message });
      res.json({ ok: true, mensagem: 'Integração salva com sucesso.', id: this.lastID });
    });
  });

  app.get('/api/addons/marketplace/pedidos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { marketplace, status } = req.query;
    
    let sql = `SELECT * FROM marketplace_pedidos WHERE 1=1`;
    let params = [];
    
    if (marketplace) {
      sql += ` AND marketplace = ?`;
      params.push(marketplace);
    }
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    
    sql += ` ORDER BY criado_em DESC LIMIT 100`;
    
    db.all(sql, params, (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao listar pedidos.', detalhes: err.message });
      res.json({ ok: true, pedidos: rows });
    });
  });

  app.post('/api/addons/marketplace/aceitar/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const id = req.params.id;
    
    db.run(`UPDATE marketplace_pedidos SET status = 'aceito', aceito_em = CURRENT_TIMESTAMP WHERE id = ?`, [id], function(err) {
      if (err) return res.json({ ok: false, erro: 'Erro ao aceitar pedido.', detalhes: err.message });
      if (this.changes === 0) return res.json({ ok: false, erro: 'Pedido não encontrado.' });
      res.json({ ok: true, mensagem: 'Pedido aceito com sucesso.' });
    });
  });

  app.post('/api/addons/marketplace/pausar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { marketplace, motivo, insumo_esgotado } = req.body;
    
    if (!marketplace) return res.json({ ok: false, erro: 'Marketplace é obrigatório.' });
    
    db.run(`INSERT INTO marketplace_pausas (marketplace, motivo, insumo_esgotado) VALUES (?, ?, ?)`, [marketplace, motivo, insumo_esgotado], function(err) {
      if (err) return res.json({ ok: false, erro: 'Erro ao pausar marketplace.', detalhes: err.message });
      res.json({ ok: true, mensagem: 'Marketplace pausado com sucesso.' });
    });
  });

  app.post('/api/addons/marketplace/retomar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { marketplace } = req.body;
    
    if (!marketplace) return res.json({ ok: false, erro: 'Marketplace é obrigatório.' });
    
    db.run(`UPDATE marketplace_pausas SET retomado_em = CURRENT_TIMESTAMP WHERE marketplace = ? AND retomado_em IS NULL`, [marketplace], function(err) {
      if (err) return res.json({ ok: false, erro: 'Erro ao retomar marketplace.', detalhes: err.message });
      res.json({ ok: true, mensagem: 'Marketplace retomado com sucesso.' });
    });
  });

  app.get('/api/addons/marketplace/dashboard', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT marketplace, COUNT(*) as total_pedidos, SUM(valor_total) as faturamento, AVG(taxa_marketplace) as taxa_media FROM marketplace_pedidos GROUP BY marketplace`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao gerar dashboard.', detalhes: err.message });
      res.json({ ok: true, dashboard: rows });
    });
  });

  // ==========================================
  // 2. Maquininha Virtual & Link de Pagamento
  // ==========================================
  
  app.post('/api/addons/link-pagamento/gerar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { pedido_id, valor, parcelas, forma } = req.body;
    
    if (!valor) return res.json({ ok: false, erro: 'Valor é obrigatório.' });
    
    const token = crypto.randomUUID();
    const url_checkout = `https://pagamento.chefcozinha.com/checkout/${token}`;
    
    const sql = `INSERT INTO link_pagamento (pedido_id, valor, parcelas, forma, url_checkout, token_unico, expirado_em) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+1 day'))`;
    db.run(sql, [pedido_id, valor, parcelas || 1, forma || 'pix', url_checkout, token], function(err) {
      if (err) return res.json({ ok: false, erro: 'Erro ao gerar link.', detalhes: err.message });
      res.json({ ok: true, url_checkout, token });
    });
  });

  app.get('/api/addons/link-pagamento/status/:token', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const token = req.params.token;
    
    db.all(`SELECT * FROM link_pagamento WHERE token_unico = ?`, [token], (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao consultar status.', detalhes: err.message });
      if (rows.length === 0) return res.json({ ok: false, erro: 'Link não encontrado.' });
      res.json({ ok: true, pagamento: rows[0] });
    });
  });

  app.post('/api/addons/link-pagamento/webhook', (req, res) => {
    const db = defaultDb || masterDb; 
    const { token, status, gateway_id_externo } = req.body;
    
    if (!token || !status) return res.json({ ok: false, erro: 'Token e status são obrigatórios.' });
    
    let sql = `UPDATE link_pagamento SET status = ?, gateway_id_externo = ?`;
    if (status === 'pago') sql += `, pago_em = CURRENT_TIMESTAMP`;
    sql += ` WHERE token_unico = ?`;
    
    db.run(sql, [status, gateway_id_externo, token], function(err) {
      if (err) return res.json({ ok: false, erro: 'Erro ao processar webhook.', detalhes: err.message });
      res.json({ ok: true, mensagem: 'Webhook processado.' });
    });
  });

  app.get('/api/addons/link-pagamento/relatorio', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`
      SELECT status, COUNT(*) as qtd, SUM(valor) as valor_total, SUM(valor_taxa) as taxas
      FROM link_pagamento 
      GROUP BY status
    `, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao gerar relatório.', detalhes: err.message });
      res.json({ ok: true, relatorio: rows });
    });
  });

  app.post('/api/addons/link-pagamento/config', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { gateway, chave_api, webhook_secret, taxa_padrao_pct } = req.body;
    
    if (!gateway) return res.json({ ok: false, erro: 'Gateway é obrigatório.' });
    
    db.run(`INSERT INTO link_pagamento_config (gateway, chave_api, webhook_secret, taxa_padrao_pct) VALUES (?, ?, ?, ?)`, 
      [gateway, chave_api, webhook_secret, taxa_padrao_pct || 0.5], function(err) {
      if (err) return res.json({ ok: false, erro: 'Erro ao salvar configuração.', detalhes: err.message });
      res.json({ ok: true, mensagem: 'Configuração salva com sucesso.' });
    });
  });

  // ==========================================
  // 3. Ficha Técnica Visual
  // ==========================================

  app.post('/api/addons/ficha-visual/salvar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { produto_id, foto_prato_url, modo_preparo, tempo_preparo_min, temperatura, dificuldade, checklist_montagem, dicas_chef, video_url, insumos } = req.body;
    
    if (!produto_id) return res.json({ ok: false, erro: 'produto_id é obrigatório.' });

    db.run(`DELETE FROM ficha_tecnica_visual WHERE produto_id = ?`, [produto_id], function(err) {
      if (err) return res.json({ ok: false, erro: 'Erro ao limpar ficha anterior.', detalhes: err.message });
      
      const sql = `INSERT INTO ficha_tecnica_visual (produto_id, foto_prato_url, modo_preparo, tempo_preparo_min, temperatura, dificuldade, checklist_montagem, dicas_chef, video_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      
      db.run(sql, [produto_id, foto_prato_url, modo_preparo, tempo_preparo_min, temperatura, dificuldade, checklist_montagem, dicas_chef, video_url], function(err) {
        if (err) return res.json({ ok: false, erro: 'Erro ao salvar ficha.', detalhes: err.message });
        
        const fichaId = this.lastID;
        if (insumos && Array.isArray(insumos) && insumos.length > 0) {
          const stmt = db.prepare(`INSERT INTO ficha_tecnica_insumos (ficha_id, insumo_nome, quantidade, unidade, ordem, obrigatorio) VALUES (?, ?, ?, ?, ?, ?)`);
          insumos.forEach((i, idx) => {
            stmt.run([fichaId, i.insumo_nome, i.quantidade, i.unidade, idx, i.obrigatorio !== false ? 1 : 0]);
          });
          stmt.finalize();
        }
        res.json({ ok: true, mensagem: 'Ficha salva com sucesso.', id: fichaId });
      });
    });
  });

  app.get('/api/addons/ficha-visual/produto/:produto_id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const pid = req.params.produto_id;
    
    db.all(`SELECT * FROM ficha_tecnica_visual WHERE produto_id = ?`, [pid], (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao consultar ficha.', detalhes: err.message });
      if (rows.length === 0) return res.json({ ok: false, erro: 'Ficha não encontrada.' });
      
      const ficha = rows[0];
      db.all(`SELECT * FROM ficha_tecnica_insumos WHERE ficha_id = ? ORDER BY ordem ASC`, [ficha.id], (err, insumos) => {
        if (!err) ficha.insumos = insumos || [];
        res.json({ ok: true, ficha });
      });
    });
  });

  app.get('/api/addons/ficha-visual/lista', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT id, produto_id, foto_prato_url, dificuldade, tempo_preparo_min FROM ficha_tecnica_visual ORDER BY atualizado_em DESC`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao listar fichas.', detalhes: err.message });
      res.json({ ok: true, fichas: rows });
    });
  });

  app.delete('/api/addons/ficha-visual/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const id = req.params.id;
    
    db.run(`DELETE FROM ficha_tecnica_visual WHERE id = ?`, [id], function(err) {
      if (err) return res.json({ ok: false, erro: 'Erro ao excluir ficha.', detalhes: err.message });
      res.json({ ok: true, mensagem: 'Ficha excluída com sucesso.' });
    });
  });

  app.get('/api/addons/ficha-visual/kds/:produto_id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const pid = req.params.produto_id;
    
    db.all(`SELECT foto_prato_url, modo_preparo, checklist_montagem, tempo_preparo_min FROM ficha_tecnica_visual WHERE produto_id = ?`, [pid], (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao consultar ficha pro KDS.', detalhes: err.message });
      if (rows.length === 0) return res.json({ ok: false, erro: 'Ficha não encontrada.' });
      res.json({ ok: true, ficha_kds: rows[0] });
    });
  });

  // ==========================================
  // 4. Dashboard do Dono
  // ==========================================

  app.get('/api/addons/dashboard-dono/resumo', authMiddleware, (req, res) => {
    // In a real scenario, this would query a central `pedidos` table.
    // For demonstration, we'll try to use marketplace_pedidos if the table exists and fallsback if not.
    // Ideally we would SELECT from the main orders table
    const db = resolveDb(req);
    // Simulating queries for faturamento do dia, ticket medio etc
    try {
      db.all(`SELECT COUNT(*) as pedidos_hoje, SUM(valor_total) as faturamento_hoje, AVG(valor_total) as ticket_medio FROM marketplace_pedidos WHERE date(criado_em) = date('now')`, [], (err, rows) => {
        if (err) return res.json({ ok: false, erro: 'Erro ao calcular resumo.', detalhes: err.message });
        const resumo = rows[0] || { pedidos_hoje: 0, faturamento_hoje: 0, ticket_medio: 0 };
        res.json({ ok: true, resumo });
      });
    } catch(e) {
      res.json({ ok: false, erro: 'Falha ao buscar resumo.' });
    }
  });

  app.get('/api/addons/dashboard-dono/por-hora', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT strftime('%H', criado_em) as hora, SUM(valor_total) as total_vendas, COUNT(*) as qtd FROM marketplace_pedidos WHERE date(criado_em) = date('now') GROUP BY hora`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao agrupar vendas por hora.', detalhes: err.message });
      res.json({ ok: true, vendas_por_hora: rows });
    });
  });

  app.get('/api/addons/dashboard-dono/alertas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM dashboard_alertas WHERE lido = 0 ORDER BY criado_em DESC`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao listar alertas.', detalhes: err.message });
      res.json({ ok: true, alertas: rows });
    });
  });

  app.post('/api/addons/dashboard-dono/alertas/ler', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.run(`UPDATE dashboard_alertas SET lido = 1 WHERE lido = 0`, [], function(err) {
      if (err) return res.json({ ok: false, erro: 'Erro ao marcar alertas como lidos.', detalhes: err.message });
      res.json({ ok: true, mensagem: 'Alertas marcados como lidos.' });
    });
  });

  app.post('/api/addons/dashboard-dono/metas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { tipo, valor_meta } = req.body;
    
    if (!tipo || !valor_meta) return res.json({ ok: false, erro: 'Tipo e valor_meta são obrigatórios.' });
    
    db.run(`UPDATE dashboard_metas SET ativo = 0 WHERE tipo = ?`, [tipo], (err) => {
      db.run(`INSERT INTO dashboard_metas (tipo, valor_meta) VALUES (?, ?)`, [tipo, valor_meta], function(err) {
        if (err) return res.json({ ok: false, erro: 'Erro ao definir meta.', detalhes: err.message });
        res.json({ ok: true, mensagem: 'Meta definida com sucesso.' });
      });
    });
  });

  app.get('/api/addons/dashboard-dono/metas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM dashboard_metas WHERE ativo = 1`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao listar metas.', detalhes: err.message });
      res.json({ ok: true, metas: rows });
    });
  });

  app.get('/api/addons/dashboard-dono/top-produtos', authMiddleware, (req, res) => {
    // Simulated as we don't have a specific order items structure mapped here, returning dummy or basic json
    res.json({ ok: true, top_produtos: [] });
  });

  // ==========================================
  // 5. SPED Fiscal & Exportação Contábil
  // ==========================================

  app.post('/api/addons/sped/exportar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { tipo, periodo_inicio, periodo_fim } = req.body;
    
    if (!tipo || !periodo_inicio || !periodo_fim) {
      return res.json({ ok: false, erro: 'Tipo, periodo_inicio e periodo_fim são obrigatórios.' });
    }
    
    const arquivo_nome = `sped_${tipo}_${periodo_inicio}_${periodo_fim}.zip`;
    const arquivo_path = `/exportacoes/${arquivo_nome}`;
    
    db.run(`INSERT INTO sped_exportacoes (tipo, periodo_inicio, periodo_fim, arquivo_nome, arquivo_path, registros_count) VALUES (?, ?, ?, ?, ?, 0)`, 
      [tipo, periodo_inicio, periodo_fim, arquivo_nome, arquivo_path], function(err) {
      if (err) return res.json({ ok: false, erro: 'Erro ao gerar exportação.', detalhes: err.message });
      res.json({ ok: true, mensagem: 'Exportação iniciada em background.', id: this.lastID });
    });
  });

  app.get('/api/addons/sped/exportacoes', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM sped_exportacoes ORDER BY criado_em DESC`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao listar exportações.', detalhes: err.message });
      res.json({ ok: true, exportacoes: rows });
    });
  });

  app.get('/api/addons/sped/download/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const id = req.params.id;
    db.all(`SELECT arquivo_path FROM sped_exportacoes WHERE id = ?`, [id], (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao baixar arquivo.', detalhes: err.message });
      if (rows.length === 0) return res.json({ ok: false, erro: 'Arquivo não encontrado.' });
      res.json({ ok: true, url: rows[0].arquivo_path });
    });
  });

  app.post('/api/addons/sped/config-contador', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { contador_nome, contador_email, contador_telefone, envio_automatico, dia_envio, regime_tributario } = req.body;
    
    db.run(`UPDATE sped_config_contador SET ativo = 0`, [], (err) => {
      db.run(`INSERT INTO sped_config_contador (contador_nome, contador_email, contador_telefone, envio_automatico, dia_envio, regime_tributario) VALUES (?, ?, ?, ?, ?, ?)`,
        [contador_nome, contador_email, contador_telefone, envio_automatico || 0, dia_envio || 1, regime_tributario || 'simples'], function(err) {
        if (err) return res.json({ ok: false, erro: 'Erro ao salvar configuração contábil.', detalhes: err.message });
        res.json({ ok: true, mensagem: 'Configuração contábil salva com sucesso.' });
      });
    });
  });

  app.get('/api/addons/sped/config-contador', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM sped_config_contador WHERE ativo = 1 ORDER BY id DESC LIMIT 1`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: 'Erro ao consultar configuração.', detalhes: err.message });
      res.json({ ok: true, config: rows[0] || null });
    });
  });

  app.get('/api/addons/sped/preview/:tipo', authMiddleware, (req, res) => {
    // Simulating preview 
    res.json({ ok: true, preview: { total_notas: 150, valor_total: 45000.00 } });
  });

};
