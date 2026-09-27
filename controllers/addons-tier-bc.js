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
        migrarTabelasTierBC(resolveDb(req));
        next();
      });
    }
    migrarTabelasTierBC(resolveDb(req));
    next();
  };

  migrarTabelasTierBC(defaultDb || masterDb);

  function migrarTabelasTierBC(db) {
    if (!db || typeof db.serialize !== 'function') return;
    db.serialize(() => {
      // 13. Gestão Multi-Unidades & Franquias
      db.run(`CREATE TABLE IF NOT EXISTS rede_unidades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        cnpj TEXT,
        endereco TEXT,
        cidade TEXT,
        responsavel TEXT,
        tenant_id INTEGER,
        tipo TEXT,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS rede_transferencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origem_id INTEGER,
        destino_id INTEGER,
        insumos_json TEXT,
        valor_total REAL,
        status TEXT DEFAULT 'pendente',
        aprovado_por TEXT,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
        aprovado_em DATETIME
      )`);

      // 14. Manutenção Preventiva de Equipamentos
      db.run(`CREATE TABLE IF NOT EXISTS equipamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        modelo TEXT,
        numero_serie TEXT,
        localizacao TEXT,
        data_aquisicao DATE,
        valor REAL,
        proxima_manutencao DATE,
        intervalo_manutencao_dias INTEGER DEFAULT 90,
        status TEXT DEFAULT 'ativo',
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS manutencao_os (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipamento_id INTEGER,
        tipo TEXT,
        descricao TEXT,
        tecnico TEXT,
        custo REAL DEFAULT 0,
        data_agendada DATE,
        data_execucao DATE,
        status TEXT DEFAULT 'agendada',
        observacoes TEXT,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);

      // 15. Academia do Restaurante
      db.run(`CREATE TABLE IF NOT EXISTS academia_cursos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT,
        cargo TEXT,
        descricao TEXT,
        thumbnail_url TEXT,
        ordem INTEGER,
        obrigatorio INTEGER DEFAULT 0,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS academia_aulas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        curso_id INTEGER,
        titulo TEXT,
        tipo TEXT,
        conteudo TEXT,
        duracao_min INTEGER,
        ordem INTEGER,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS academia_progresso (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER,
        aula_id INTEGER,
        concluido INTEGER DEFAULT 0,
        nota_quiz REAL,
        concluido_em DATETIME,
        UNIQUE(funcionario_id, aula_id)
      )`);

      // 16. Monitoramento de Temperatura IoT
      db.run(`CREATE TABLE IF NOT EXISTS iot_sensores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        localizacao TEXT,
        temp_min REAL,
        temp_max REAL,
        sensor_id_externo TEXT,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS iot_leituras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sensor_id INTEGER,
        temperatura REAL,
        umidade REAL,
        dentro_faixa INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS iot_alertas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sensor_id INTEGER,
        temperatura REAL,
        faixa_min REAL,
        faixa_max REAL,
        tipo TEXT,
        notificado INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);

      // 17. Atendente Virtual
      db.run(`CREATE TABLE IF NOT EXISTS bot_social_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plataforma TEXT,
        token_api TEXT,
        page_id TEXT,
        respostas_padrao TEXT,
        horario_atendimento TEXT,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS bot_social_conversas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plataforma TEXT,
        usuario_externo TEXT,
        usuario_nome TEXT,
        mensagens_json TEXT,
        status TEXT DEFAULT 'aberta',
        pedido_gerado_id INTEGER,
        escalado_para TEXT,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
        atualizado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);

      // 18. Benchmark Anônimo
      db.run(`CREATE TABLE IF NOT EXISTS benchmark_dados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metrica TEXT,
        valor REAL,
        nicho TEXT,
        cidade TEXT,
        periodo TEXT,
        anonimizado INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS benchmark_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        participar INTEGER DEFAULT 1,
        nicho TEXT,
        cidade TEXT,
        area_m2 REAL,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);

      // 19. App do Funcionário
      db.run(`CREATE TABLE IF NOT EXISTS func_comunicados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT,
        mensagem TEXT,
        urgente INTEGER DEFAULT 0,
        autor TEXT,
        lido_por TEXT DEFAULT '',
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS func_solicitacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcionario_id INTEGER,
        tipo TEXT,
        descricao TEXT,
        data_solicitada DATE,
        status TEXT DEFAULT 'pendente',
        resposta TEXT,
        respondido_por TEXT,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
        respondido_em DATETIME
      )`);

      // 20. Roleta & Promoções Gamificadas
      db.run(`CREATE TABLE IF NOT EXISTS roleta_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        premios_json TEXT,
        probabilidades_json TEXT,
        ativo INTEGER DEFAULT 1,
        gasto_minimo REAL DEFAULT 50,
        max_giros_dia INTEGER DEFAULT 100,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS roleta_giros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_id INTEGER,
        cliente_nome TEXT,
        cliente_telefone TEXT,
        premio_ganho TEXT,
        valor_premio REAL,
        resgatado INTEGER DEFAULT 0,
        pedido_id INTEGER,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
        resgatado_em DATETIME
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS selos_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        total_selos INTEGER DEFAULT 10,
        premio TEXT,
        valor_premio REAL,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS selos_clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_id INTEGER,
        cliente_telefone TEXT,
        selos_acumulados INTEGER DEFAULT 0,
        completos INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
        atualizado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);

      // 21. Pesquisa de Satisfação In-Loco
      db.run(`CREATE TABLE IF NOT EXISTS pesquisa_respostas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mesa TEXT,
        comida_nota INTEGER,
        atendimento_nota INTEGER,
        ambiente_nota INTEGER,
        nps INTEGER,
        comentario TEXT,
        garcom TEXT,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS pesquisa_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        perguntas_extras TEXT,
        mostrar_apos TEXT DEFAULT 'pre_conta',
        ativo INTEGER DEFAULT 1,
        alerta_nota_minima INTEGER DEFAULT 2,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);

      // 22. Valet & Controle de Estacionamento
      db.run(`CREATE TABLE IF NOT EXISTS valet_veiculos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        placa TEXT,
        modelo TEXT,
        cor TEXT,
        cliente_nome TEXT,
        cliente_telefone TEXT,
        vaga TEXT,
        manobrista TEXT,
        foto_url TEXT,
        status TEXT DEFAULT 'estacionado',
        cobrar INTEGER DEFAULT 0,
        valor REAL DEFAULT 0,
        entrada_em DATETIME DEFAULT (datetime('now', 'localtime')),
        saida_em DATETIME
      )`);

      // 23. Gestão de Ambientação Sonora
      db.run(`CREATE TABLE IF NOT EXISTS playlist_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        momento TEXT,
        horario_inicio TEXT,
        horario_fim TEXT,
        dias_semana TEXT,
        volume INTEGER DEFAULT 50,
        spotify_playlist_url TEXT,
        youtube_playlist_url TEXT,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS playlist_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_id INTEGER,
        ativado_em DATETIME,
        desativado_em DATETIME
      )`);

      // 24. Portal do Cliente
      db.run(`CREATE TABLE IF NOT EXISTS portal_clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        telefone TEXT UNIQUE,
        email TEXT,
        senha_hash TEXT,
        ultimo_login DATETIME,
        total_pedidos INTEGER DEFAULT 0,
        total_gasto REAL DEFAULT 0,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS portal_favoritos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER,
        produto_id INTEGER,
        vezes_pedido INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
        UNIQUE(cliente_id, produto_id)
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS portal_sessoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER,
        token TEXT UNIQUE,
        expira_em DATETIME,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
      )`);
    });
  }

  // ==========================================
  // 13. Gestão Multi-Unidades & Franquias
  // ==========================================
  app.get('/api/addons/rede/unidades', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM rede_unidades ORDER BY criado_em DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, unidades: rows });
    });
  });

  app.post('/api/addons/rede/unidades', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome, cnpj, endereco, cidade, responsavel, tenant_id, tipo } = req.body;
    db.run(
      'INSERT INTO rede_unidades (nome, cnpj, endereco, cidade, responsavel, tenant_id, tipo) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nome, cnpj, endereco, cidade, responsavel, tenant_id, tipo],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.get('/api/addons/rede/dashboard-consolidado', authMiddleware, (req, res) => {
    // Mock consolidado
    res.json({
      ok: true,
      faturamento_total: 150000,
      pedidos_total: 3500,
      ticket_medio: 42.85
    });
  });

  app.post('/api/addons/rede/transferir-estoque', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { origem_id, destino_id, insumos_json, valor_total, aprovado_por } = req.body;
    db.run(
      'INSERT INTO rede_transferencias (origem_id, destino_id, insumos_json, valor_total, aprovado_por) VALUES (?, ?, ?, ?, ?)',
      [origem_id, destino_id, JSON.stringify(insumos_json), valor_total, aprovado_por],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.get('/api/addons/rede/transferencias', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM rede_transferencias ORDER BY criado_em DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, transferencias: rows });
    });
  });

  app.get('/api/addons/rede/ranking', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT id, nome, tipo FROM rede_unidades ORDER BY id ASC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      const ranking = rows.map((u, index) => ({ ...u, faturamento: 50000 - (index * 5000) }));
      res.json({ ok: true, ranking });
    });
  });

  // ==========================================
  // 14. Manutenção Preventiva de Equipamentos
  // ==========================================
  app.get('/api/addons/manutencao/equipamentos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM equipamentos ORDER BY criado_em DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, equipamentos: rows });
    });
  });

  app.post('/api/addons/manutencao/equipamentos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome, modelo, numero_serie, localizacao, data_aquisicao, valor, proxima_manutencao, intervalo_manutencao_dias } = req.body;
    db.run(
      'INSERT INTO equipamentos (nome, modelo, numero_serie, localizacao, data_aquisicao, valor, proxima_manutencao, intervalo_manutencao_dias) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [nome, modelo, numero_serie, localizacao, data_aquisicao, valor, proxima_manutencao, intervalo_manutencao_dias],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.get('/api/addons/manutencao/alertas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all("SELECT * FROM equipamentos WHERE proxima_manutencao <= date('now', '+7 days') AND status='ativo'", [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, alertas: rows });
    });
  });

  app.post('/api/addons/manutencao/os', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { equipamento_id, tipo, descricao, tecnico, data_agendada } = req.body;
    db.run(
      'INSERT INTO manutencao_os (equipamento_id, tipo, descricao, tecnico, data_agendada) VALUES (?, ?, ?, ?, ?)',
      [equipamento_id, tipo, descricao, tecnico, data_agendada],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.put('/api/addons/manutencao/os/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { id } = req.params;
    const { status, custo, data_execucao, observacoes } = req.body;
    db.run(
      'UPDATE manutencao_os SET status = ?, custo = ?, data_execucao = ?, observacoes = ? WHERE id = ?',
      [status, custo, data_execucao, observacoes, id],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, changes: this.changes });
      }
    );
  });

  app.get('/api/addons/manutencao/historico', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM manutencao_os ORDER BY criado_em DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, historico: rows });
    });
  });

  app.get('/api/addons/manutencao/custo-total', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT equipamento_id, SUM(custo) as custo_total FROM manutencao_os GROUP BY equipamento_id', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, custos: rows });
    });
  });

  // ==========================================
  // 15. Academia do Restaurante
  // ==========================================
  app.get('/api/addons/academia/cursos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM academia_cursos ORDER BY ordem ASC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, cursos: rows });
    });
  });

  app.post('/api/addons/academia/cursos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { titulo, cargo, descricao, thumbnail_url, ordem, obrigatorio } = req.body;
    db.run(
      'INSERT INTO academia_cursos (titulo, cargo, descricao, thumbnail_url, ordem, obrigatorio) VALUES (?, ?, ?, ?, ?, ?)',
      [titulo, cargo, descricao, thumbnail_url, ordem, obrigatorio],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.post('/api/addons/academia/aulas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { curso_id, titulo, tipo, conteudo, duracao_min, ordem } = req.body;
    db.run(
      'INSERT INTO academia_aulas (curso_id, titulo, tipo, conteudo, duracao_min, ordem) VALUES (?, ?, ?, ?, ?, ?)',
      [curso_id, titulo, tipo, conteudo, duracao_min, ordem],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.get('/api/addons/academia/curso/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { id } = req.params;
    db.get('SELECT * FROM academia_cursos WHERE id = ?', [id], (err, curso) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      if (!curso) return res.status(404).json({ ok: false, erro: 'Curso não encontrado' });
      db.all('SELECT * FROM academia_aulas WHERE curso_id = ? ORDER BY ordem ASC', [id], (err2, aulas) => {
        if (err2) return res.status(500).json({ ok: false, erro: err2.message });
        res.json({ ok: true, curso, aulas });
      });
    });
  });

  app.post('/api/addons/academia/progresso', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { funcionario_id, aula_id, concluido, nota_quiz } = req.body;
    const concluidoEm = concluido ? new Date().toISOString() : null;
    db.run(
      `INSERT INTO academia_progresso (funcionario_id, aula_id, concluido, nota_quiz, concluido_em) 
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(funcionario_id, aula_id) DO UPDATE SET 
       concluido=excluded.concluido, nota_quiz=excluded.nota_quiz, concluido_em=excluded.concluido_em`,
      [funcionario_id, aula_id, concluido, nota_quiz, concluidoEm],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true });
      }
    );
  });

  app.get('/api/addons/academia/progresso/:funcionario_id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { funcionario_id } = req.params;
    db.all('SELECT * FROM academia_progresso WHERE funcionario_id = ?', [funcionario_id], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, progresso: rows });
    });
  });

  app.get('/api/addons/academia/ranking', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT funcionario_id, COUNT(*) as aulas_concluidas FROM academia_progresso WHERE concluido = 1 GROUP BY funcionario_id ORDER BY aulas_concluidas DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, ranking: rows });
    });
  });

  // ==========================================
  // 16. Monitoramento de Temperatura IoT
  // ==========================================
  app.get('/api/addons/iot/sensores', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM iot_sensores ORDER BY id ASC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, sensores: rows });
    });
  });

  app.post('/api/addons/iot/sensores', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome, localizacao, temp_min, temp_max, sensor_id_externo } = req.body;
    db.run(
      'INSERT INTO iot_sensores (nome, localizacao, temp_min, temp_max, sensor_id_externo) VALUES (?, ?, ?, ?, ?)',
      [nome, localizacao, temp_min, temp_max, sensor_id_externo],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.post('/api/addons/iot/leitura', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { sensor_id, temperatura, umidade } = req.body;
    db.get('SELECT temp_min, temp_max FROM iot_sensores WHERE id = ?', [sensor_id], (err, sensor) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      let dentro_faixa = 1;
      if (sensor) {
        if (temperatura < sensor.temp_min || temperatura > sensor.temp_max) {
          dentro_faixa = 0;
          const tipo = temperatura < sensor.temp_min ? 'abaixo' : 'acima';
          db.run(
            'INSERT INTO iot_alertas (sensor_id, temperatura, faixa_min, faixa_max, tipo) VALUES (?, ?, ?, ?, ?)',
            [sensor_id, temperatura, sensor.temp_min, sensor.temp_max, tipo]
          );
        }
      }
      db.run(
        'INSERT INTO iot_leituras (sensor_id, temperatura, umidade, dentro_faixa) VALUES (?, ?, ?, ?)',
        [sensor_id, temperatura, umidade, dentro_faixa],
        function(err2) {
          if (err2) return res.status(500).json({ ok: false, erro: err2.message });
          res.json({ ok: true, id: this.lastID });
        }
      );
    });
  });

  app.get('/api/addons/iot/painel', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`
      SELECT s.id, s.nome, s.localizacao, s.temp_min, s.temp_max,
             l.temperatura as ult_temperatura, l.umidade as ult_umidade, l.criado_em as ult_leitura
      FROM iot_sensores s
      LEFT JOIN iot_leituras l ON l.id = (SELECT id FROM iot_leituras WHERE sensor_id = s.id ORDER BY criado_em DESC LIMIT 1)
    `, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, painel: rows });
    });
  });

  app.get('/api/addons/iot/alertas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM iot_alertas ORDER BY criado_em DESC LIMIT 50', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, alertas: rows });
    });
  });

  app.get('/api/addons/iot/relatorio-haccp', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM iot_leituras ORDER BY criado_em DESC LIMIT 100', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, relatorio: rows });
    });
  });

  // ==========================================
  // 17. Atendente Virtual
  // ==========================================
  app.get('/api/addons/bot-social/config', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM bot_social_config', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, configs: rows });
    });
  });

  app.post('/api/addons/bot-social/config', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { plataforma, token_api, page_id, respostas_padrao, horario_atendimento } = req.body;
    db.run(
      'INSERT INTO bot_social_config (plataforma, token_api, page_id, respostas_padrao, horario_atendimento) VALUES (?, ?, ?, ?, ?)',
      [plataforma, token_api, page_id, respostas_padrao, horario_atendimento],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.get('/api/addons/bot-social/conversas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM bot_social_conversas ORDER BY atualizado_em DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, conversas: rows });
    });
  });

  app.get('/api/addons/bot-social/conversa/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.get('SELECT * FROM bot_social_conversas WHERE id = ?', [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, conversa: row });
    });
  });

  app.post('/api/addons/bot-social/escalar/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { id } = req.params;
    const { escalado_para } = req.body;
    db.run(
      "UPDATE bot_social_conversas SET status = 'escalada', escalado_para = ?, atualizado_em = datetime('now', 'localtime') WHERE id = ?",
      [escalado_para, id],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true });
      }
    );
  });

  app.get('/api/addons/bot-social/metricas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT status, COUNT(*) as qtd FROM bot_social_conversas GROUP BY status', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, metricas: rows });
    });
  });

  // ==========================================
  // 18. Benchmark Anônimo do Setor
  // ==========================================
  app.post('/api/addons/benchmark/config', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { participar, nicho, cidade, area_m2 } = req.body;
    db.run('DELETE FROM benchmark_config');
    db.run(
      'INSERT INTO benchmark_config (participar, nicho, cidade, area_m2) VALUES (?, ?, ?, ?)',
      [participar, nicho, cidade, area_m2],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true });
      }
    );
  });

  app.get('/api/addons/benchmark/comparativo', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT metrica, AVG(valor) as media_mercado FROM benchmark_dados GROUP BY metrica', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, comparativo: rows });
    });
  });

  app.post('/api/addons/benchmark/contribuir', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { metrica, valor, nicho, cidade, periodo } = req.body;
    db.run(
      'INSERT INTO benchmark_dados (metrica, valor, nicho, cidade, periodo) VALUES (?, ?, ?, ?, ?)',
      [metrica, valor, nicho, cidade, periodo],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true });
      }
    );
  });

  app.get('/api/addons/benchmark/ranking', authMiddleware, (req, res) => {
    res.json({ ok: true, ranking: [] }); // mock para ranking percentil
  });

  // ==========================================
  // 19. App do Funcionário
  // ==========================================
  app.get('/api/addons/app-func/comunicados', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM func_comunicados ORDER BY criado_em DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, comunicados: rows });
    });
  });

  app.post('/api/addons/app-func/comunicados', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { titulo, mensagem, urgente, autor } = req.body;
    db.run(
      'INSERT INTO func_comunicados (titulo, mensagem, urgente, autor) VALUES (?, ?, ?, ?)',
      [titulo, mensagem, urgente, autor],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.post('/api/addons/app-func/comunicados/:id/ler', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    // Simples mock appending user ID or name to lido_por
    res.json({ ok: true });
  });

  app.post('/api/addons/app-func/solicitacao', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { funcionario_id, tipo, descricao, data_solicitada } = req.body;
    db.run(
      'INSERT INTO func_solicitacoes (funcionario_id, tipo, descricao, data_solicitada) VALUES (?, ?, ?, ?)',
      [funcionario_id, tipo, descricao, data_solicitada],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.get('/api/addons/app-func/solicitacoes', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM func_solicitacoes ORDER BY criado_em DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, solicitacoes: rows });
    });
  });

  app.put('/api/addons/app-func/solicitacoes/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { id } = req.params;
    const { status, resposta, respondido_por } = req.body;
    db.run(
      "UPDATE func_solicitacoes SET status = ?, resposta = ?, respondido_por = ?, respondido_em = datetime('now', 'localtime') WHERE id = ?",
      [status, resposta, respondido_por, id],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true });
      }
    );
  });

  app.get('/api/addons/app-func/meu-resumo', authMiddleware, (req, res) => {
    res.json({ ok: true, resumo: { saldo_horas: 10, dias_ferias: 15 } });
  });

  // ==========================================
  // 20. Roleta & Promoções Gamificadas
  // ==========================================
  app.post('/api/addons/gamificacao-cliente/roleta/config', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome, premios_json, probabilidades_json, ativo, gasto_minimo, max_giros_dia } = req.body;
    db.run(
      'INSERT INTO roleta_config (nome, premios_json, probabilidades_json, ativo, gasto_minimo, max_giros_dia) VALUES (?, ?, ?, ?, ?, ?)',
      [nome, JSON.stringify(premios_json), JSON.stringify(probabilidades_json), ativo, gasto_minimo, max_giros_dia],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.get('/api/addons/gamificacao-cliente/roleta/config', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.get('SELECT * FROM roleta_config WHERE ativo = 1 ORDER BY criado_em DESC LIMIT 1', [], (err, row) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, config: row });
    });
  });

  app.post('/api/addons/gamificacao-cliente/roleta/girar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { cliente_nome, cliente_telefone, pedido_id, config_id } = req.body;
    // mock sorteio
    const premio_ganho = "Sobremesa Grátis";
    const valor_premio = 15.00;
    db.run(
      'INSERT INTO roleta_giros (config_id, cliente_nome, cliente_telefone, premio_ganho, valor_premio, pedido_id) VALUES (?, ?, ?, ?, ?, ?)',
      [config_id, cliente_nome, cliente_telefone, premio_ganho, valor_premio, pedido_id],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, premio: premio_ganho, id: this.lastID });
      }
    );
  });

  app.get('/api/addons/gamificacao-cliente/roleta/historico', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM roleta_giros ORDER BY criado_em DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, historico: rows });
    });
  });

  app.post('/api/addons/gamificacao-cliente/selos/config', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome, total_selos, premio, valor_premio, ativo } = req.body;
    db.run(
      'INSERT INTO selos_config (nome, total_selos, premio, valor_premio, ativo) VALUES (?, ?, ?, ?, ?)',
      [nome, total_selos, premio, valor_premio, ativo],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.post('/api/addons/gamificacao-cliente/selos/carimbar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { config_id, cliente_telefone } = req.body;
    db.get('SELECT * FROM selos_clientes WHERE config_id = ? AND cliente_telefone = ?', [config_id, cliente_telefone], (err, row) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      if (row) {
        db.run(
          "UPDATE selos_clientes SET selos_acumulados = selos_acumulados + 1, atualizado_em = datetime('now', 'localtime') WHERE id = ?",
          [row.id]
        );
      } else {
        db.run(
          'INSERT INTO selos_clientes (config_id, cliente_telefone, selos_acumulados) VALUES (?, ?, 1)',
          [config_id, cliente_telefone]
        );
      }
      res.json({ ok: true });
    });
  });

  app.get('/api/addons/gamificacao-cliente/selos/cliente/:telefone', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM selos_clientes WHERE cliente_telefone = ?', [req.params.telefone], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, saldo: rows });
    });
  });

  // ==========================================
  // 21. Pesquisa de Satisfação In-Loco
  // ==========================================
  app.post('/api/addons/pesquisa/responder', (req, res) => {
    const db = resolveDb(req);
    const { mesa, comida_nota, atendimento_nota, ambiente_nota, nps, comentario, garcom } = req.body;
    db.run(
      'INSERT INTO pesquisa_respostas (mesa, comida_nota, atendimento_nota, ambiente_nota, nps, comentario, garcom) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [mesa, comida_nota, atendimento_nota, ambiente_nota, nps, comentario, garcom],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.get('/api/addons/pesquisa/resumo', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.get(`
      SELECT AVG(comida_nota) as avg_comida, AVG(atendimento_nota) as avg_atendimento, 
             AVG(ambiente_nota) as avg_ambiente, AVG(nps) as avg_nps, COUNT(*) as total 
      FROM pesquisa_respostas
    `, [], (err, row) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, resumo: row });
    });
  });

  app.get('/api/addons/pesquisa/alertas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM pesquisa_respostas WHERE comida_nota <= 2 OR atendimento_nota <= 2 OR ambiente_nota <= 2', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, alertas: rows });
    });
  });

  app.post('/api/addons/pesquisa/config', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { perguntas_extras, mostrar_apos, ativo, alerta_nota_minima } = req.body;
    db.run('DELETE FROM pesquisa_config');
    db.run(
      'INSERT INTO pesquisa_config (perguntas_extras, mostrar_apos, ativo, alerta_nota_minima) VALUES (?, ?, ?, ?)',
      [JSON.stringify(perguntas_extras), mostrar_apos, ativo, alerta_nota_minima],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true });
      }
    );
  });

  app.get('/api/addons/pesquisa/config', (req, res) => {
    const db = resolveDb(req);
    db.get('SELECT * FROM pesquisa_config LIMIT 1', [], (err, row) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, config: row });
    });
  });

  app.get('/api/addons/pesquisa/por-garcom', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT garcom, AVG(atendimento_nota) as nota_media FROM pesquisa_respostas GROUP BY garcom', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, ranking: rows });
    });
  });

  // ==========================================
  // 22. Valet & Controle de Estacionamento
  // ==========================================
  app.post('/api/addons/valet/entrada', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { placa, modelo, cor, cliente_nome, cliente_telefone, vaga, manobrista, foto_url, cobrar, valor } = req.body;
    db.run(
      'INSERT INTO valet_veiculos (placa, modelo, cor, cliente_nome, cliente_telefone, vaga, manobrista, foto_url, cobrar, valor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [placa, modelo, cor, cliente_nome, cliente_telefone, vaga, manobrista, foto_url, cobrar, valor],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.post('/api/addons/valet/solicitar-saida/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.run("UPDATE valet_veiculos SET status = 'solicitado' WHERE id = ?", [req.params.id], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true });
    });
  });

  app.post('/api/addons/valet/entregar/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.run("UPDATE valet_veiculos SET status = 'entregue', saida_em = datetime('now', 'localtime') WHERE id = ?", [req.params.id], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true });
    });
  });

  app.get('/api/addons/valet/ativos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all("SELECT * FROM valet_veiculos WHERE status IN ('estacionado', 'solicitado')", [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, veiculos: rows });
    });
  });

  app.get('/api/addons/valet/historico', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM valet_veiculos ORDER BY entrada_em DESC LIMIT 100', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, historico: rows });
    });
  });

  app.get('/api/addons/valet/metricas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.get('SELECT COUNT(*) as total, SUM(valor) as faturamento FROM valet_veiculos', [], (err, row) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, metricas: row });
    });
  });

  // ==========================================
  // 23. Gestão de Ambientação Sonora & Playlist
  // ==========================================
  app.get('/api/addons/playlist/configs', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM playlist_config', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, configs: rows });
    });
  });

  app.post('/api/addons/playlist/configs', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome, momento, horario_inicio, horario_fim, dias_semana, volume, spotify_playlist_url, youtube_playlist_url, ativo } = req.body;
    db.run(
      'INSERT INTO playlist_config (nome, momento, horario_inicio, horario_fim, dias_semana, volume, spotify_playlist_url, youtube_playlist_url, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nome, momento, horario_inicio, horario_fim, dias_semana, volume, spotify_playlist_url, youtube_playlist_url, ativo],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.put('/api/addons/playlist/configs/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome, momento, horario_inicio, horario_fim, dias_semana, volume, spotify_playlist_url, youtube_playlist_url, ativo } = req.body;
    db.run(
      'UPDATE playlist_config SET nome=?, momento=?, horario_inicio=?, horario_fim=?, dias_semana=?, volume=?, spotify_playlist_url=?, youtube_playlist_url=?, ativo=? WHERE id=?',
      [nome, momento, horario_inicio, horario_fim, dias_semana, volume, spotify_playlist_url, youtube_playlist_url, ativo, req.params.id],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true });
      }
    );
  });

  app.get('/api/addons/playlist/agora', (req, res) => {
    // mock active playlist
    const db = resolveDb(req);
    db.get('SELECT * FROM playlist_config WHERE ativo = 1 LIMIT 1', [], (err, row) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, playlist: row });
    });
  });

  app.get('/api/addons/playlist/historico', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all('SELECT * FROM playlist_historico ORDER BY ativado_em DESC LIMIT 50', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, historico: rows });
    });
  });

  // ==========================================
  // 24. Portal do Cliente
  // ==========================================
  app.post('/api/addons/portal/registro', (req, res) => {
    const db = resolveDb(req);
    const { nome, telefone, email, senha } = req.body;
    const hash = crypto.createHash('sha256').update(senha || '').digest('hex');
    db.run(
      'INSERT INTO portal_clientes (nome, telefone, email, senha_hash) VALUES (?, ?, ?, ?)',
      [nome, telefone, email, hash],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.post('/api/addons/portal/login', (req, res) => {
    const db = resolveDb(req);
    const { telefone, senha } = req.body;
    const hash = crypto.createHash('sha256').update(senha || '').digest('hex');
    db.get('SELECT * FROM portal_clientes WHERE telefone = ? AND senha_hash = ?', [telefone, hash], (err, row) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      if (!row) return res.status(401).json({ ok: false, erro: 'Credenciais inválidas' });
      
      const token = crypto.randomUUID();
      db.run("INSERT INTO portal_sessoes (cliente_id, token, expira_em) VALUES (?, ?, datetime('now', '+7 days'))", [row.id, token], (err2) => {
        if (err2) return res.status(500).json({ ok: false, erro: err2.message });
        res.json({ ok: true, token, cliente: { id: row.id, nome: row.nome } });
      });
    });
  });

  app.get('/api/addons/portal/perfil', (req, res) => {
    const db = resolveDb(req);
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ ok: false, erro: 'Token não fornecido' });
    db.get('SELECT c.* FROM portal_clientes c JOIN portal_sessoes s ON c.id = s.cliente_id WHERE s.token = ?', [token], (err, row) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      if (!row) return res.status(401).json({ ok: false, erro: 'Sessão inválida' });
      res.json({ ok: true, perfil: row });
    });
  });

  app.get('/api/addons/portal/historico', (req, res) => {
    // mock historico de pedidos
    res.json({ ok: true, historico: [] });
  });

  app.get('/api/addons/portal/favoritos', (req, res) => {
    res.json({ ok: true, favoritos: [] });
  });

  app.post('/api/addons/portal/favoritos', (req, res) => {
    const db = resolveDb(req);
    const { cliente_id, produto_id } = req.body;
    db.run(
      'INSERT INTO portal_favoritos (cliente_id, produto_id) VALUES (?, ?) ON CONFLICT(cliente_id, produto_id) DO UPDATE SET vezes_pedido = vezes_pedido + 1',
      [cliente_id, produto_id],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true });
      }
    );
  });

  app.get('/api/addons/portal/recompensas', (req, res) => {
    res.json({ ok: true, recompensas: { pontos: 150, cashback: 25.50 } });
  });

  app.post('/api/addons/portal/re-pedir/:pedido_id', (req, res) => {
    res.json({ ok: true, mensagem: 'Pedido recriado no carrinho', novo_pedido_id: 999 });
  });

};
