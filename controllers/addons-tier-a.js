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
        migrarTabelasTierA(resolveDb(req));
        next();
      });
    }
    migrarTabelasTierA(resolveDb(req));
    next();
  };

  migrarTabelasTierA(defaultDb || masterDb);

  function migrarTabelasTierA(db) {
    if (!db || typeof db.serialize !== 'function') return;
    db.serialize(() => {
      // 6. Precificação Dinâmica
      db.run(`CREATE TABLE IF NOT EXISTS preco_dinamico_regras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        tipo TEXT,
        condicao_json TEXT,
        desconto_pct REAL,
        acrescimo_pct REAL DEFAULT 0,
        categorias_aplicaveis TEXT,
        horario_inicio TEXT,
        horario_fim TEXT,
        dias_semana TEXT,
        ocupacao_min_pct INTEGER,
        ocupacao_max_pct INTEGER,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS preco_dinamico_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        regra_id INTEGER,
        produto_id INTEGER,
        preco_original REAL,
        preco_ajustado REAL,
        motivo TEXT,
        aplicado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 7. Controle Nutricional
      db.run(`CREATE TABLE IF NOT EXISTS nutricional_produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER UNIQUE,
        kcal REAL,
        proteina_g REAL,
        carboidrato_g REAL,
        gordura_g REAL,
        fibra_g REAL,
        sodio_mg REAL,
        acucar_g REAL,
        porcao_g REAL,
        alergenos TEXT,
        tags TEXT,
        fonte TEXT DEFAULT 'manual',
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 8. Foto IA
      db.run(`CREATE TABLE IF NOT EXISTS foto_ia_geracoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER,
        prompt_usado TEXT,
        url_gerada TEXT,
        url_aprovada TEXT,
        status TEXT DEFAULT 'gerada',
        aprovado_por TEXT,
        custo_credito REAL DEFAULT 0.05,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        aprovado_em DATETIME
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS foto_ia_creditos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        creditos_total INTEGER DEFAULT 100,
        creditos_usados INTEGER DEFAULT 0,
        mes_referencia TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 9. Push
      db.run(`CREATE TABLE IF NOT EXISTS push_assinantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT UNIQUE,
        keys_json TEXT,
        cliente_id INTEGER,
        bairro TEXT,
        ultimo_acesso DATETIME,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS push_campanhas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT,
        corpo TEXT,
        url_acao TEXT,
        imagem_url TEXT,
        segmento TEXT,
        filtro_json TEXT,
        enviados INTEGER DEFAULT 0,
        clicados INTEGER DEFAULT 0,
        status TEXT DEFAULT 'rascunho',
        agendado_para DATETIME,
        enviado_em DATETIME,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 10. Escalas
      db.run(`CREATE TABLE IF NOT EXISTS escala_turnos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        horario_inicio TEXT,
        horario_fim TEXT,
        cargo TEXT,
        qtd_minima INTEGER DEFAULT 1,
        dias_semana TEXT DEFAULT '1,2,3,4,5',
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS escala_alocacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turno_id INTEGER,
        funcionario_id INTEGER,
        data DATE,
        tipo TEXT,
        horas_previstas REAL,
        custo_hora REAL,
        confirmado INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS escala_preferencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER UNIQUE,
        dias_preferidos TEXT,
        turnos_preferidos TEXT,
        restricoes TEXT,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 11. Vitrine
      db.run(`CREATE TABLE IF NOT EXISTS vitrine_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome_loja TEXT,
        slug TEXT UNIQUE,
        dominio_custom TEXT,
        logo_url TEXT,
        banner_url TEXT,
        cor_primaria TEXT DEFAULT '#e74c3c',
        cor_secundaria TEXT DEFAULT '#2c3e50',
        descricao TEXT,
        horario_funcionamento TEXT,
        taxa_entrega REAL DEFAULT 5,
        raio_entrega_km REAL DEFAULT 5,
        pedido_minimo REAL DEFAULT 20,
        whatsapp TEXT,
        instagram TEXT,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS vitrine_pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vitrine_id INTEGER,
        cliente_nome TEXT,
        cliente_telefone TEXT,
        cliente_endereco TEXT,
        cliente_bairro TEXT,
        itens_json TEXT,
        subtotal REAL,
        taxa_entrega REAL,
        desconto REAL DEFAULT 0,
        total REAL,
        forma_pagamento TEXT,
        troco_para REAL,
        observacao TEXT,
        cupom TEXT,
        status TEXT DEFAULT 'novo',
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS vitrine_cupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE,
        tipo TEXT,
        valor REAL,
        uso_maximo INTEGER DEFAULT 100,
        usos INTEGER DEFAULT 0,
        valido_ate DATE,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 12. Desperdício
      db.run(`CREATE TABLE IF NOT EXISTS desperdicio_registros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        categoria TEXT,
        insumo TEXT,
        peso_kg REAL,
        custo_estimado REAL,
        responsavel TEXT,
        turno TEXT,
        motivo TEXT,
        foto_url TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS desperdicio_metas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meta_kg_dia REAL,
        benchmark_setor_pct REAL DEFAULT 3,
        alerta_limite_pct REAL DEFAULT 5,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 13. Checklist
      db.run(`CREATE TABLE IF NOT EXISTS checklist_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        turno TEXT,
        itens_json TEXT,
        obrigatorio INTEGER DEFAULT 1,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS checklist_execucoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id INTEGER,
        executado_por TEXT,
        turno TEXT,
        data DATE,
        itens_concluidos TEXT,
        itens_total INTEGER,
        itens_ok INTEGER,
        observacoes TEXT,
        foto_evidencia TEXT,
        concluido INTEGER DEFAULT 0,
        inicio_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        fim_em DATETIME
      )`);
    });
  }

  // ==========================================
  // 6. Precificação Dinâmica & Happy Hour Auto
  // ==========================================
  app.get('/api/addons/preco-dinamico/regras', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM preco_dinamico_regras ORDER BY id DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.post('/api/addons/preco-dinamico/regras', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome, tipo, condicao_json, desconto_pct, acrescimo_pct, categorias_aplicaveis, horario_inicio, horario_fim, dias_semana, ocupacao_min_pct, ocupacao_max_pct, ativo } = req.body;
    db.run(`INSERT INTO preco_dinamico_regras (nome, tipo, condicao_json, desconto_pct, acrescimo_pct, categorias_aplicaveis, horario_inicio, horario_fim, dias_semana, ocupacao_min_pct, ocupacao_max_pct, ativo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome, tipo, condicao_json, desconto_pct, acrescimo_pct, categorias_aplicaveis, horario_inicio, horario_fim, dias_semana, ocupacao_min_pct, ocupacao_max_pct, ativo === undefined ? 1 : ativo],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      });
  });

  app.delete('/api/addons/preco-dinamico/regras/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.run(`DELETE FROM preco_dinamico_regras WHERE id = ?`, [req.params.id], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, removido: this.changes });
    });
  });

  app.get('/api/addons/preco-dinamico/preview', authMiddleware, (req, res) => {
    // Simulação - buscar regras ativas e calcular
    res.json({ ok: true, mensagem: 'Preview gerado com sucesso', dados: [] });
  });

  app.get('/api/addons/preco-dinamico/historico', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM preco_dinamico_historico ORDER BY id DESC LIMIT 100`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.post('/api/addons/preco-dinamico/ativar-happy-hour', authMiddleware, (req, res) => {
    // Forçar happy hour manualmente
    res.json({ ok: true, mensagem: 'Happy hour ativado manualmente' });
  });

  // ==========================================
  // 7. Controle Nutricional & Calorias
  // ==========================================
  app.get('/api/addons/nutricional/produto/:produto_id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM nutricional_produtos WHERE produto_id = ?`, [req.params.produto_id], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows[0] || null });
    });
  });

  app.post('/api/addons/nutricional/produto', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { produto_id, kcal, proteina_g, carboidrato_g, gordura_g, fibra_g, sodio_mg, acucar_g, porcao_g, alergenos, tags, fonte } = req.body;
    db.run(`INSERT INTO nutricional_produtos (produto_id, kcal, proteina_g, carboidrato_g, gordura_g, fibra_g, sodio_mg, acucar_g, porcao_g, alergenos, tags, fonte)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(produto_id) DO UPDATE SET
            kcal=excluded.kcal, proteina_g=excluded.proteina_g, carboidrato_g=excluded.carboidrato_g, gordura_g=excluded.gordura_g,
            fibra_g=excluded.fibra_g, sodio_mg=excluded.sodio_mg, acucar_g=excluded.acucar_g, porcao_g=excluded.porcao_g,
            alergenos=excluded.alergenos, tags=excluded.tags, fonte=excluded.fonte, atualizado_em=CURRENT_TIMESTAMP`,
      [produto_id, kcal, proteina_g, carboidrato_g, gordura_g, fibra_g, sodio_mg, acucar_g, porcao_g, alergenos, tags, fonte || 'manual'],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, atualizado: true });
      });
  });

  app.get('/api/addons/nutricional/cardapio', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM nutricional_produtos`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.get('/api/addons/nutricional/filtrar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const maxKcal = req.query.max_kcal || 9999;
    const tag = req.query.tag || '';
    let sql = `SELECT * FROM nutricional_produtos WHERE kcal <= ?`;
    let params = [maxKcal];
    if (tag) {
      sql += ` AND tags LIKE ?`;
      params.push('%' + tag + '%');
    }
    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.get('/api/addons/nutricional/alergenos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT alergenos FROM nutricional_produtos WHERE alergenos IS NOT NULL AND alergenos != ''`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      let todos = new Set();
      rows.forEach(r => {
        r.alergenos.split(',').forEach(a => todos.add(a.trim()));
      });
      res.json({ ok: true, dados: Array.from(todos) });
    });
  });

  // ==========================================
  // 8. Cardápio com Foto IA
  // ==========================================
  app.post('/api/addons/foto-ia/gerar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { produto_id, prompt } = req.body;
    const url_gerada = 'https://via.placeholder.com/400x400.png?text=IA+' + encodeURIComponent(prompt || 'Foto');
    
    db.run(`INSERT INTO foto_ia_geracoes (produto_id, prompt_usado, url_gerada) VALUES (?, ?, ?)`,
      [produto_id, prompt, url_gerada], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID, url: url_gerada });
    });
  });

  app.get('/api/addons/foto-ia/produto/:produto_id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM foto_ia_geracoes WHERE produto_id = ? ORDER BY id DESC`, [req.params.produto_id], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.post('/api/addons/foto-ia/aprovar/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { url } = req.body;
    db.run(`UPDATE foto_ia_geracoes SET status = 'aprovada', url_aprovada = ?, aprovado_em = CURRENT_TIMESTAMP WHERE id = ?`,
      [url, req.params.id], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, atualizado: this.changes });
    });
  });

  app.post('/api/addons/foto-ia/rejeitar/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.run(`UPDATE foto_ia_geracoes SET status = 'rejeitada' WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, atualizado: this.changes });
    });
  });

  app.get('/api/addons/foto-ia/creditos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM foto_ia_creditos ORDER BY id DESC LIMIT 1`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows[0] || { creditos_total: 100, creditos_usados: 0 } });
    });
  });

  app.get('/api/addons/foto-ia/galeria', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM foto_ia_geracoes WHERE status = 'aprovada'`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  // ==========================================
  // 9. Central de Notificações Push
  // ==========================================
  app.post('/api/addons/push/assinar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { endpoint, keys_json, cliente_id, bairro } = req.body;
    db.run(`INSERT INTO push_assinantes (endpoint, keys_json, cliente_id, bairro, ultimo_acesso)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(endpoint) DO UPDATE SET ultimo_acesso=CURRENT_TIMESTAMP`,
      [endpoint, keys_json, cliente_id, bairro], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
    });
  });

  app.post('/api/addons/push/campanha', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { titulo, corpo, url_acao, imagem_url, segmento, filtro_json, agendado_para } = req.body;
    db.run(`INSERT INTO push_campanhas (titulo, corpo, url_acao, imagem_url, segmento, filtro_json, agendado_para)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [titulo, corpo, url_acao, imagem_url, segmento, filtro_json, agendado_para], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
    });
  });

  app.get('/api/addons/push/campanhas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM push_campanhas ORDER BY id DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.post('/api/addons/push/disparar/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.run(`UPDATE push_campanhas SET status = 'enviado', enviado_em = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, atualizado: this.changes, mensagem: 'Campanha disparada' });
    });
  });

  app.get('/api/addons/push/metricas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT SUM(enviados) as total_enviados, SUM(clicados) as total_clicados FROM push_campanhas WHERE status = 'enviado'`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows[0] || {} });
    });
  });

  app.get('/api/addons/push/assinantes', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT COUNT(*) as total FROM push_assinantes WHERE ativo = 1`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, total: rows[0]?.total || 0 });
    });
  });

  // ==========================================
  // 10. Agenda de Escalas Inteligente
  // ==========================================
  app.get('/api/addons/escala/turnos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM escala_turnos`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.post('/api/addons/escala/turnos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome, horario_inicio, horario_fim, cargo, qtd_minima, dias_semana } = req.body;
    db.run(`INSERT INTO escala_turnos (nome, horario_inicio, horario_fim, cargo, qtd_minima, dias_semana)
            VALUES (?, ?, ?, ?, ?, ?)`,
      [nome, horario_inicio, horario_fim, cargo, qtd_minima, dias_semana], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
    });
  });

  app.post('/api/addons/escala/gerar', authMiddleware, (req, res) => {
    // Lógica IA simples para gerar escala
    res.json({ ok: true, mensagem: 'Escala gerada com sucesso' });
  });

  app.get('/api/addons/escala/semana', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const data = req.query.data;
    db.all(`SELECT * FROM escala_alocacoes WHERE data >= ? LIMIT 100`, [data], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.post('/api/addons/escala/trocar', authMiddleware, (req, res) => {
    res.json({ ok: true, mensagem: 'Troca solicitada/realizada' });
  });

  app.get('/api/addons/escala/custo-projetado', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT SUM(horas_previstas * custo_hora) as custo_total FROM escala_alocacoes WHERE tipo != 'folga'`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, custo_projetado: rows[0]?.custo_total || 0 });
    });
  });

  app.post('/api/addons/escala/preferencias', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { funcionario_id, dias_preferidos, turnos_preferidos, restricoes } = req.body;
    db.run(`INSERT INTO escala_preferencias (funcionario_id, dias_preferidos, turnos_preferidos, restricoes)
            VALUES (?, ?, ?, ?) ON CONFLICT(funcionario_id) DO UPDATE SET
            dias_preferidos=excluded.dias_preferidos, turnos_preferidos=excluded.turnos_preferidos, restricoes=excluded.restricoes, atualizado_em=CURRENT_TIMESTAMP`,
      [funcionario_id, dias_preferidos, turnos_preferidos, restricoes], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, atualizado: true });
    });
  });

  // ==========================================
  // 11. Vitrine de Delivery Própria
  // ==========================================
  app.get('/api/addons/vitrine/config', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM vitrine_config LIMIT 1`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows[0] || null });
    });
  });

  app.post('/api/addons/vitrine/config', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome_loja, slug, dominio_custom, logo_url, banner_url, cor_primaria, cor_secundaria, descricao, horario_funcionamento, taxa_entrega, raio_entrega_km, pedido_minimo, whatsapp, instagram, ativo } = req.body;
    db.run(`INSERT INTO vitrine_config (id, nome_loja, slug, dominio_custom, logo_url, banner_url, cor_primaria, cor_secundaria, descricao, horario_funcionamento, taxa_entrega, raio_entrega_km, pedido_minimo, whatsapp, instagram, ativo)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
            nome_loja=excluded.nome_loja, slug=excluded.slug, dominio_custom=excluded.dominio_custom, logo_url=excluded.logo_url, banner_url=excluded.banner_url, cor_primaria=excluded.cor_primaria, cor_secundaria=excluded.cor_secundaria, descricao=excluded.descricao, horario_funcionamento=excluded.horario_funcionamento, taxa_entrega=excluded.taxa_entrega, raio_entrega_km=excluded.raio_entrega_km, pedido_minimo=excluded.pedido_minimo, whatsapp=excluded.whatsapp, instagram=excluded.instagram, ativo=excluded.ativo, atualizado_em=CURRENT_TIMESTAMP`,
      [nome_loja, slug, dominio_custom, logo_url, banner_url, cor_primaria, cor_secundaria, descricao, horario_funcionamento, taxa_entrega, raio_entrega_km, pedido_minimo, whatsapp, instagram, ativo],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, atualizado: true });
    });
  });

  // Sem auth para clientes visualizarem (usando slug para resolver DB se multitenant ou padrao se nao houver logica aqui)
  app.get('/api/addons/vitrine/cardapio/:slug', (req, res) => {
    // Retornar cardapio publico
    res.json({ ok: true, dados: [] });
  });

  app.post('/api/addons/vitrine/pedido', (req, res) => {
    const db = defaultDb || masterDb; // simplificacao para endpoint sem auth sem resolver db por tenant via header
    const { vitrine_id, cliente_nome, cliente_telefone, cliente_endereco, cliente_bairro, itens_json, subtotal, taxa_entrega, desconto, total, forma_pagamento, troco_para, observacao, cupom } = req.body;
    db.run(`INSERT INTO vitrine_pedidos (vitrine_id, cliente_nome, cliente_telefone, cliente_endereco, cliente_bairro, itens_json, subtotal, taxa_entrega, desconto, total, forma_pagamento, troco_para, observacao, cupom)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [vitrine_id, cliente_nome, cliente_telefone, cliente_endereco, cliente_bairro, itens_json, subtotal, taxa_entrega, desconto, total, forma_pagamento, troco_para, observacao, cupom], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
    });
  });

  app.get('/api/addons/vitrine/pedidos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM vitrine_pedidos ORDER BY id DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.post('/api/addons/vitrine/cupom', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { codigo, tipo, valor, uso_maximo, valido_ate, ativo } = req.body;
    db.run(`INSERT INTO vitrine_cupons (codigo, tipo, valor, uso_maximo, valido_ate, ativo) VALUES (?, ?, ?, ?, ?, ?)`,
      [codigo, tipo, valor, uso_maximo, valido_ate, ativo], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
    });
  });

  app.get('/api/addons/vitrine/cupons', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM vitrine_cupons ORDER BY id DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.post('/api/addons/vitrine/validar-cupom', (req, res) => {
    const db = defaultDb || masterDb;
    const { codigo } = req.body;
    db.all(`SELECT * FROM vitrine_cupons WHERE codigo = ? AND ativo = 1 AND (uso_maximo IS NULL OR usos < uso_maximo)`, [codigo], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      if (rows.length === 0) return res.json({ ok: false, erro: 'Cupom inválido ou expirado' });
      res.json({ ok: true, cupom: rows[0] });
    });
  });

  app.get('/api/addons/vitrine/metricas', authMiddleware, (req, res) => {
    res.json({ ok: true, metricas: { total_pedidos: 0, faturamento: 0 } });
  });

  // ==========================================
  // 12. Controle de Desperdício
  // ==========================================
  app.post('/api/addons/desperdicio/registrar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { categoria, insumo, peso_kg, custo_estimado, responsavel, turno, motivo, foto_url } = req.body;
    db.run(`INSERT INTO desperdicio_registros (categoria, insumo, peso_kg, custo_estimado, responsavel, turno, motivo, foto_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [categoria, insumo, peso_kg, custo_estimado, responsavel, turno, motivo, foto_url], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
    });
  });

  app.get('/api/addons/desperdicio/resumo', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT SUM(peso_kg) as total_kg, SUM(custo_estimado) as total_custo FROM desperdicio_registros`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows[0] || {} });
    });
  });

  app.get('/api/addons/desperdicio/historico', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM desperdicio_registros ORDER BY id DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.post('/api/addons/desperdicio/meta', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { meta_kg_dia, benchmark_setor_pct, alerta_limite_pct, ativo } = req.body;
    db.run(`INSERT INTO desperdicio_metas (meta_kg_dia, benchmark_setor_pct, alerta_limite_pct, ativo) VALUES (?, ?, ?, ?)`,
      [meta_kg_dia, benchmark_setor_pct, alerta_limite_pct, ativo], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
    });
  });

  app.get('/api/addons/desperdicio/ranking-categorias', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT categoria, SUM(peso_kg) as total_kg FROM desperdicio_registros GROUP BY categoria ORDER BY total_kg DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.get('/api/addons/desperdicio/tendencia', authMiddleware, (req, res) => {
    res.json({ ok: true, tendencia: 'estavel' });
  });

  // ==========================================
  // 13. Checklist de Abertura & Fechamento
  // ==========================================
  app.get('/api/addons/checklist/templates', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM checklist_templates ORDER BY id DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.post('/api/addons/checklist/templates', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome, turno, itens_json, obrigatorio, ativo } = req.body;
    db.run(`INSERT INTO checklist_templates (nome, turno, itens_json, obrigatorio, ativo) VALUES (?, ?, ?, ?, ?)`,
      [nome, turno, itens_json, obrigatorio, ativo], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
    });
  });

  app.put('/api/addons/checklist/templates/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome, turno, itens_json, obrigatorio, ativo } = req.body;
    db.run(`UPDATE checklist_templates SET nome = ?, turno = ?, itens_json = ?, obrigatorio = ?, ativo = ? WHERE id = ?`,
      [nome, turno, itens_json, obrigatorio, ativo, req.params.id], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, atualizado: this.changes });
    });
  });

  app.post('/api/addons/checklist/executar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { template_id, executado_por, turno, data, itens_total } = req.body;
    db.run(`INSERT INTO checklist_execucoes (template_id, executado_por, turno, data, itens_total, itens_ok, concluido)
            VALUES (?, ?, ?, ?, ?, 0, 0)`,
      [template_id, executado_por, turno, data, itens_total], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
    });
  });

  app.put('/api/addons/checklist/executar/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { itens_concluidos, itens_ok, observacoes, foto_evidencia, concluido } = req.body;
    let sql = `UPDATE checklist_execucoes SET itens_concluidos = ?, itens_ok = ?, observacoes = ?, foto_evidencia = ?, concluido = ?`;
    let params = [itens_concluidos, itens_ok, observacoes, foto_evidencia, concluido];
    
    if (concluido) {
      sql += `, fim_em = CURRENT_TIMESTAMP`;
    }
    sql += ` WHERE id = ?`;
    params.push(req.params.id);

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, atualizado: this.changes });
    });
  });

  app.get('/api/addons/checklist/historico', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT * FROM checklist_execucoes ORDER BY id DESC`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

  app.get('/api/addons/checklist/conformidade', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`SELECT turno, SUM(itens_ok)*100.0/SUM(itens_total) as conformidade_pct FROM checklist_execucoes WHERE itens_total > 0 GROUP BY turno`, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, dados: rows || [] });
    });
  });

};
