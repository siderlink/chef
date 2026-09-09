/**
 * controllers/suporte-vendas.js
 * Endpoints e regras de negócio para a Equipe de Suporte e Vendas Afiliadas
 */
'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

module.exports = function(app, masterDb, sqlite3, options) {
  const { superAdminAuth, io } = options || {};
  const suporteJwtSecret = process.env.SUPORTE_JWT_SECRET || (options && options.suporteJwtSecret) || 'chef-suporte-secret-key-2026';

  // Anti-brute-force rate limiter para login de suporte
  const suporteLoginAttempts = new Map();
  function checkSuporteRateLimit(ip) {
    const rec = suporteLoginAttempts.get(ip);
    if (!rec) return true;
    if (Date.now() - rec.inicio > 15 * 60 * 1000) {
      suporteLoginAttempts.delete(ip);
      return true;
    }
    return rec.falhas < 5;
  }
  function registrarFalhaSuporte(ip) {
    const rec = suporteLoginAttempts.get(ip);
    if (!rec || Date.now() - rec.inicio > 15 * 60 * 1000) {
      suporteLoginAttempts.set(ip, { inicio: Date.now(), falhas: 1 });
    } else {
      rec.falhas++;
    }
  }

  // Inicializa tabelas se não existirem
  masterDb.serialize(() => {
    masterDb.run(`CREATE TABLE IF NOT EXISTS equipe_suporte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT, email TEXT UNIQUE, telefone TEXT,
      password_hash TEXT, cargo TEXT, especialidade TEXT,
      status TEXT DEFAULT 'disponivel', xp INTEGER DEFAULT 0, nivel INTEGER DEFAULT 1,
      status_aprovacao TEXT DEFAULT 'pendente',
      cpf_cnpj TEXT, pix_chave TEXT, motivacao TEXT,
      meta_vendas_mes INTEGER DEFAULT 10, comissao_percentual REAL DEFAULT 10,
      data_cadastro DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    masterDb.run(`CREATE TABLE IF NOT EXISTS suporte_restaurantes (
      suporte_id INTEGER, restaurante_id INTEGER, tipo_suporte TEXT DEFAULT 'remoto',
      UNIQUE(suporte_id, restaurante_id)
    )`);

    masterDb.run(`CREATE TABLE IF NOT EXISTS tarefas_suporte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suporte_id INTEGER, tipo TEXT, descricao TEXT, restaurante_id INTEGER,
      pontos INTEGER DEFAULT 0, status TEXT DEFAULT 'concluida',
      criada_em DATETIME DEFAULT (datetime('now','localtime')),
      concluida_em DATETIME
    )`);

    masterDb.run(`CREATE TABLE IF NOT EXISTS conquistas_suporte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suporte_id INTEGER, conquista TEXT, icone TEXT, descricao TEXT,
      data_obtida DATETIME DEFAULT (datetime('now','localtime')),
      UNIQUE(suporte_id, conquista)
    )`);

    masterDb.run(`CREATE TABLE IF NOT EXISTS afiliados_metas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      descricao TEXT,
      meta_qtd INTEGER DEFAULT 5,
      recompensa_valor REAL DEFAULT 500,
      afiliado_id INTEGER,
      data_inicio DATETIME,
      data_fim DATETIME,
      status TEXT DEFAULT 'ativa',
      criada_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    masterDb.run(`CREATE TABLE IF NOT EXISTS afiliados_bonificacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      afiliado_id INTEGER,
      suporte_id INTEGER,
      afiliado_nome TEXT,
      meta_id INTEGER,
      valor REAL NOT NULL,
      tipo TEXT DEFAULT 'meta_atingida',
      descricao TEXT,
      status TEXT DEFAULT 'pendente',
      pago_em DATETIME,
      comprovante_pix TEXT,
      criada_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    masterDb.run(`ALTER TABLE equipe_suporte ADD COLUMN codigo_ref TEXT`, () => {});

    masterDb.run(`CREATE TABLE IF NOT EXISTS suporte_vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suporte_id INTEGER,
      chave_ativacao TEXT,
      restaurante_nome TEXT,
      restaurante_id INTEGER,
      contato_nome TEXT,
      contato_telefone TEXT,
      plano TEXT DEFAULT 'premium',
      valor_venda REAL DEFAULT 0,
      fator_decisao TEXT,
      objeção_nao_fecho TEXT,
      ajudas_usabilidade TEXT,
      status_venda TEXT DEFAULT 'fechado',
      comissao_percentual REAL DEFAULT 10,
      comissao_valor REAL DEFAULT 0,
      data_venda DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    masterDb.run(`CREATE TABLE IF NOT EXISTS suporte_adiantamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suporte_id INTEGER,
      valor REAL DEFAULT 0,
      descricao TEXT,
      status TEXT DEFAULT 'pendente',
      data_solicitacao DATETIME DEFAULT (datetime('now','localtime')),
      data_resposta DATETIME
    )`);

    masterDb.run(`CREATE TABLE IF NOT EXISTS suporte_logs_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suporte_id INTEGER, operador_nome TEXT, acao TEXT, detalhes TEXT, ip TEXT,
      data_acao DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    masterDb.run(`CREATE TABLE IF NOT EXISTS suporte_missoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT, descricao TEXT, xp_recompensa INTEGER DEFAULT 50,
      icone TEXT DEFAULT 'fa-trophy', categoria TEXT DEFAULT 'geral',
      ativa INTEGER DEFAULT 1
    )`);

    masterDb.run(`CREATE TABLE IF NOT EXISTS site_versoes_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      titulo TEXT,
      resumo TEXT,
      snapshot_json TEXT NOT NULL,
      autor_nome TEXT,
      autor_id INTEGER,
      criado_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);
  });

  // Middleware de Autenticação do Suporte
  function suporteAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ ok: false, erro: 'Token de suporte não fornecido.' });
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ ok: false, erro: 'Formato de token inválido.' });

    try {
      const decoded = jwt.verify(parts[1], suporteJwtSecret, { algorithms: ['HS256'] });
      req.suporteId = decoded.id;
      req.suporteData = decoded;
      next();
    } catch (e) {
      return res.status(401).json({ ok: false, erro: 'Sessão expirada ou token inválido. Faça login novamente.' });
    }
  }

  function registrarAuditLog(suporteId, operadorNome, acao, detalhes, req) {
    const rawIp = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1') : '127.0.0.1';
    const ip = String(rawIp).replace('::ffff:', '');
    masterDb.run(
      `INSERT INTO suporte_logs_audit (suporte_id, operador_nome, acao, detalhes, ip) VALUES (?, ?, ?, ?, ?)`,
      [suporteId || null, operadorNome || 'Sistema', acao, detalhes || '', ip]
    );
  }

  function gerarXP(suporteId, pontos, tipo, descricao, restauranteId) {
    masterDb.get(`SELECT xp, nivel FROM equipe_suporte WHERE id = ?`, [suporteId], (err, row) => {
      if (!err && row) {
        const novoXp = (row.xp || 0) + pontos;
        const novoNivel = Math.floor(novoXp / 100) + 1;
        masterDb.run(`UPDATE equipe_suporte SET xp = ?, nivel = ? WHERE id = ?`, [novoXp, novoNivel, suporteId]);
        masterDb.run(
          `INSERT INTO tarefas_suporte (suporte_id, tipo, descricao, restaurante_id, pontos, status, concluida_em)
           VALUES (?, ?, ?, ?, ?, 'concluida', datetime('now','localtime'))`,
          [suporteId, tipo, descricao, restauranteId || null, pontos]
        );

        if (novoNivel > (row.nivel || 1)) {
          masterDb.run(
            `INSERT OR IGNORE INTO conquistas_suporte (suporte_id, conquista, icone, descricao) VALUES (?, ?, ?, ?)`,
            [suporteId, `level_${novoNivel}`, 'fa-star', `Atingiu o nível ${novoNivel}!`]
          );
        }
      }
    });
  }

  // POST /api/suporte/cadastro — Auto-cadastro para ser Suporte / Vendedor Afiliado
  app.post('/api/suporte/cadastro', async (req, res) => {
    const { nome, email, telefone, senha, cargo, especialidade, cpf_cnpj, pix_chave, motivacao } = req.body || {};
    if (!nome || !email || !senha) return res.json({ ok: false, erro: 'Nome, email e senha são obrigatórios.' });

    try {
      const hash = await bcrypt.hash(senha, 10);
      masterDb.run(
        `INSERT INTO equipe_suporte (nome, email, telefone, password_hash, cargo, especialidade, status, status_aprovacao, cpf_cnpj, pix_chave, motivacao) VALUES (?, ?, ?, ?, ?, ?, 'offline', 'pendente', ?, ?, ?)`,
        [nome.trim(), email.trim().toLowerCase(), telefone || '', hash, cargo || 'Vendedor & Suporte', especialidade || 'Vendas e Onboarding', cpf_cnpj || '', pix_chave || '', motivacao || ''],
        function(err) {
          if (err) {
            if (err.message && err.message.includes('UNIQUE')) return res.json({ ok: false, erro: 'Este email já está cadastrado no sistema.' });
            return res.json({ ok: false, erro: err.message });
          }
          registrarAuditLog(this.lastID, nome, 'CADASTRO_SOLICITADO', `Candidatura enviada: ${cargo || 'Vendedor & Suporte'}`, req);
          res.json({ ok: true, mensagem: 'Cadastro realizado com sucesso! Aguarde a aprovação pelo Administrador para começar.' });
        }
      );
    } catch (e) {
      res.json({ ok: false, erro: 'Erro interno ao criar conta de suporte.' });
    }
  });

  // POST /api/suporte/login — Login do painel de suporte (com proteção anti-força bruta)
  app.post('/api/suporte/login', (req, res) => {
    const rawIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1').replace('::ffff:', '');
    if (!checkSuporteRateLimit(rawIp)) {
      return res.status(429).json({ ok: false, erro: 'Muitas tentativas incorretas. Acesso bloqueado por 15 minutos por segurança.' });
    }

    const { email, senha } = req.body || {};
    if (!email || !senha) return res.json({ ok: false, erro: 'Email e senha são obrigatórios.' });

    masterDb.get(`SELECT * FROM equipe_suporte WHERE email = ?`, [email.trim().toLowerCase()], async (err, row) => {
      if (err || !row) {
        registrarFalhaSuporte(rawIp);
        return res.json({ ok: false, erro: 'Email ou senha inválidos.' });
      }

      if (row.status_aprovacao === 'pendente') {
        return res.json({ ok: false, erro: 'Sua conta ainda está em análise pelo Administrador Master. Você será notificado assim que aprovada.' });
      }
      if (row.status_aprovacao === 'recusado') {
        return res.json({ ok: false, erro: 'Seu cadastro de suporte não foi aprovado pelo administrador.' });
      }

      const match = await bcrypt.compare(senha, row.password_hash);
      if (!match) {
        registrarFalhaSuporte(rawIp);
        return res.json({ ok: false, erro: 'Email ou senha inválidos.' });
      }

      suporteLoginAttempts.delete(rawIp);
      masterDb.run(`UPDATE equipe_suporte SET status = 'disponivel' WHERE id = ?`, [row.id]);

      const token = jwt.sign(
        { id: row.id, nome: row.nome, email: row.email, cargo: row.cargo, especialidade: row.especialidade },
        suporteJwtSecret,
        { expiresIn: '7d' }
      );

      registrarAuditLog(row.id, row.nome, 'LOGIN', 'Membro de suporte fez login no painel', req);

      res.json({
        ok: true,
        token,
        usuario: {
          id: row.id,
          nome: row.nome,
          email: row.email,
          cargo: row.cargo,
          especialidade: row.especialidade,
          status: 'disponivel',
          xp: row.xp || 0,
          nivel: row.nivel || 1
        }
      });
    });
  });

  // GET /api/suporte/me — Dados do perfil logado
  app.get('/api/suporte/me', suporteAuth, (req, res) => {
    masterDb.get(`SELECT id, nome, email, telefone, cargo, especialidade, status, xp, nivel, meta_vendas_mes, comissao_percentual, pix_chave, data_cadastro FROM equipe_suporte WHERE id = ?`, [req.suporteId], (err, row) => {
      if (err || !row) return res.json({ ok: false, erro: 'Usuário não encontrado.' });
      res.json({ ok: true, usuario: row });
    });
  });

  // GET /api/suporte/restaurantes — Lista os restaurantes
  app.get('/api/suporte/restaurantes', suporteAuth, (req, res) => {
    masterDb.all(`SELECT id, nome, subdominio, ativo, data_criacao FROM restaurantes ORDER BY nome ASC`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, restaurantes: rows || [] });
    });
  });

  // GET /api/suporte/restaurantes/:id/produtos
  app.get('/api/suporte/restaurantes/:id/produtos', suporteAuth, (req, res) => {
    const tid = parseInt(req.params.id) || 1;
    const pathMod = require('path');
    const tenantDbPath = pathMod.join(__dirname, '..', `database_${tid}.sqlite`);
    const fsMod = require('fs');
    if (!fsMod.existsSync(tenantDbPath)) return res.json({ ok: true, produtos: [] });

    const tenantDb = new sqlite3.Database(tenantDbPath);
    tenantDb.all(`SELECT * FROM cardapio ORDER BY nome ASC`, [], (err, rows) => {
      tenantDb.close();
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, produtos: rows || [] });
    });
  });

  // POST /api/suporte/restaurantes/:id/produtos
  app.post('/api/suporte/restaurantes/:id/produtos', suporteAuth, (req, res) => {
    const tid = parseInt(req.params.id) || 1;
    const { nome, categoria, preco, descricao, ingredientes, disponivel } = req.body || {};
    if (!nome) return res.json({ ok: false, erro: 'Nome do produto é obrigatório.' });

    const pathMod = require('path');
    const tenantDbPath = pathMod.join(__dirname, '..', `database_${tid}.sqlite`);
    const tenantDb = new sqlite3.Database(tenantDbPath);

    tenantDb.run(
      `INSERT INTO cardapio (nome, categoria, preco, descricao, ingredientes, disponivel) VALUES (?, ?, ?, ?, ?, ?)`,
      [nome, categoria || '', preco || 0, descricao || '', ingredientes || '', disponivel !== undefined ? (disponivel ? 1 : 0) : 1],
      function(err) {
        tenantDb.close();
        if (err) return res.json({ ok: false, erro: err.message });
        gerarXP(req.suporteId, 15, 'CARDAPIO_CRIAR', `Criou o produto "${nome}"`, tid);
        registrarAuditLog(req.suporteId, req.suporteData.nome, 'CARDAPIO_CRIAR', `Produto criado: ${nome} (R$ ${preco}) no restaurante ID ${tid}`, req);
        res.json({ ok: true, id: this.lastID, mensagem: 'Produto adicionado com sucesso!' });
      }
    );
  });

  // PUT /api/suporte/restaurantes/:id/produtos/:prodId
  app.put('/api/suporte/restaurantes/:id/produtos/:prodId', suporteAuth, (req, res) => {
    const tid = parseInt(req.params.id) || 1;
    const prodId = parseInt(req.params.prodId);
    const { nome, categoria, preco, descricao, ingredientes, disponivel } = req.body || {};

    const updates = [];
    const params = [];
    if (nome !== undefined) { updates.push('nome = ?'); params.push(nome); }
    if (categoria !== undefined) { updates.push('categoria = ?'); params.push(categoria); }
    if (preco !== undefined) { updates.push('preco = ?'); params.push(preco); }
    if (descricao !== undefined) { updates.push('descricao = ?'); params.push(descricao); }
    if (ingredientes !== undefined) { updates.push('ingredientes = ?'); params.push(ingredientes); }
    if (disponivel !== undefined) { updates.push('disponivel = ?'); params.push(disponivel ? 1 : 0); }

    if (updates.length === 0) return res.json({ ok: false, erro: 'Nenhum campo para atualizar.' });
    params.push(prodId);

    const pathMod = require('path');
    const tenantDbPath = pathMod.join(__dirname, '..', `database_${tid}.sqlite`);
    const tenantDb = new sqlite3.Database(tenantDbPath);

    tenantDb.run(`UPDATE cardapio SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
      tenantDb.close();
      if (err) return res.json({ ok: false, erro: err.message });
      gerarXP(req.suporteId, 10, 'CARDAPIO_EDITAR', `Editou o produto ID ${prodId}`, tid);
      registrarAuditLog(req.suporteId, req.suporteData.nome, 'CARDAPIO_EDITAR', `Produto ID ${prodId} editado no restaurante ${tid}`, req);
      res.json({ ok: true, mensagem: 'Produto atualizado com sucesso!' });
    });
  });

  // DELETE /api/suporte/restaurantes/:id/produtos/:prodId
  app.delete('/api/suporte/restaurantes/:id/produtos/:prodId', suporteAuth, (req, res) => {
    const tid = parseInt(req.params.id) || 1;
    const prodId = parseInt(req.params.prodId);

    const pathMod = require('path');
    const tenantDbPath = pathMod.join(__dirname, '..', `database_${tid}.sqlite`);
    const tenantDb = new sqlite3.Database(tenantDbPath);

    tenantDb.run(`DELETE FROM cardapio WHERE id = ?`, [prodId], function(err) {
      tenantDb.close();
      if (err) return res.json({ ok: false, erro: err.message });
      gerarXP(req.suporteId, 5, 'CARDAPIO_DELETAR', `Removeu o produto ID ${prodId}`, tid);
      registrarAuditLog(req.suporteId, req.suporteData.nome, 'CARDAPIO_DELETAR', `Produto ID ${prodId} removido do restaurante ${tid}`, req);
      res.json({ ok: true, mensagem: 'Produto excluído com sucesso!' });
    });
  });

  // POST /api/suporte/restaurantes/:id/produtos/:prodId/duplicar
  app.post('/api/suporte/restaurantes/:id/produtos/:prodId/duplicar', suporteAuth, (req, res) => {
    const tid = parseInt(req.params.id) || 1;
    const prodId = parseInt(req.params.prodId);

    const pathMod = require('path');
    const tenantDbPath = pathMod.join(__dirname, '..', `database_${tid}.sqlite`);
    const tenantDb = new sqlite3.Database(tenantDbPath);

    tenantDb.get(`SELECT * FROM cardapio WHERE id = ?`, [prodId], (err, prod) => {
      if (err || !prod) {
        tenantDb.close();
        return res.json({ ok: false, erro: 'Produto original não encontrado.' });
      }

      tenantDb.run(
        `INSERT INTO cardapio (nome, categoria, preco, descricao, ingredientes, disponivel) VALUES (?, ?, ?, ?, ?, ?)`,
        [`${prod.nome} (Cópia)`, prod.categoria, prod.preco, prod.descricao, prod.ingredientes, prod.disponivel],
        function(errIns) {
          tenantDb.close();
          if (errIns) return res.json({ ok: false, erro: errIns.message });
          gerarXP(req.suporteId, 10, 'CARDAPIO_DUPLICAR', `Duplicou o produto "${prod.nome}"`, tid);
          res.json({ ok: true, id: this.lastID, mensagem: 'Produto duplicado com sucesso!' });
        }
      );
    });
  });

  // GET /api/suporte/minhas-tarefas — Tarefas concluídas pelo usuário
  app.get('/api/suporte/minhas-tarefas', suporteAuth, (req, res) => {
    masterDb.all(`SELECT * FROM tarefas_suporte WHERE suporte_id = ? ORDER BY id DESC LIMIT 50`, [req.suporteId], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, tarefas: rows || [] });
    });
  });

  // GET /api/suporte/ranking — Placar de líderes
  app.get('/api/suporte/ranking', suporteAuth, (req, res) => {
    masterDb.all(`SELECT id, nome, cargo, especialidade, xp, nivel FROM equipe_suporte WHERE status_aprovacao = 'aprovado' ORDER BY xp DESC LIMIT 20`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      let minhaPos = 1;
      if (rows) {
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].id === req.suporteId) { minhaPos = i + 1; break; }
        }
      }
      res.json({ ok: true, ranking: rows || [], minhaPosicao: minhaPos });
    });
  });

  // GET /api/suporte/minhas-conquistas — Emblemas
  app.get('/api/suporte/minhas-conquistas', suporteAuth, (req, res) => {
    masterDb.all(`SELECT * FROM conquistas_suporte WHERE suporte_id = ? ORDER BY data_obtida DESC`, [req.suporteId], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, conquistas: rows || [] });
    });
  });

  // GET /api/suporte/minhas-vendas — Vendas do vendedor logado
  app.get('/api/suporte/minhas-vendas', suporteAuth, (req, res) => {
    masterDb.all(`SELECT * FROM suporte_vendas WHERE suporte_id = ? ORDER BY data_venda DESC`, [req.suporteId], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, vendas: rows || [] });
    });
  });

  // POST /api/suporte/vendas — Lança nova venda/negociação
  app.post('/api/suporte/vendas', suporteAuth, (req, res) => {
    const { chave_ativacao, restaurante_nome, restaurante_id, contato_nome, contato_telefone, plano, valor_venda, fator_decisao, objecao, ajudas, status_venda, comissao_pct } = req.body || {};
    if (!restaurante_nome && !contato_nome) return res.json({ ok: false, erro: 'Informe pelo menos o nome do restaurante ou do contato.' });

    masterDb.get(`SELECT comissao_percentual FROM equipe_suporte WHERE id = ?`, [req.suporteId], (eUser, uRow) => {
      const comissaoPct = parseFloat(comissao_pct) || (uRow ? uRow.comissao_percentual : 10) || 10;
      const planoVal = plano || 'premium';
      const valorVal = parseFloat(valor_venda) || (planoVal === 'premium' ? 299 : (planoVal === 'pro' ? 199 : 149));
      const stVenda = status_venda || 'fechado';
      const comissaoValor = stVenda === 'fechado' ? (valorVal * comissaoPct / 100) : 0;

      masterDb.run(
        `INSERT INTO suporte_vendas (suporte_id, chave_ativacao, restaurante_nome, restaurante_id, contato_nome, contato_telefone, plano, valor_venda, fator_decisao, objeção_nao_fecho, ajudas_usabilidade, status_venda, comissao_percentual, comissao_valor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.suporteId, chave_ativacao || '', restaurante_nome || '', restaurante_id || null, contato_nome || '', contato_telefone || '', planoVal, valorVal, fator_decisao || '', objecao || '', ajudas || '', stVenda, comissaoPct, comissaoValor],
        function(err) {
          if (err) return res.json({ ok: false, erro: err.message });
          if (stVenda === 'fechado') {
            gerarXP(req.suporteId, 50, 'VENDA_FECHADA', `Fechou venda do plano ${planoVal.toUpperCase()} para ${restaurante_nome || contato_nome}`, restaurante_id);
          }
          registrarAuditLog(req.suporteId, req.suporteData.nome, 'VENDA_REGISTRADA', `Venda (${stVenda}): ${restaurante_nome || contato_nome} - R$ ${valorVal} (Comissão: R$ ${comissaoValor.toFixed(2)})`, req);
          res.json({ ok: true, id: this.lastID, mensagem: 'Venda registrada com sucesso!' });
        }
      );
    });
  });

  // GET /api/super/suporte/metricas-vendas — Painel Master
  app.get('/api/super/suporte/metricas-vendas', superAdminAuth, (req, res) => {
    masterDb.all(
      `SELECT v.*, s.nome as vendedor_nome, s.email as vendedor_email, s.pix_chave 
       FROM suporte_vendas v 
       LEFT JOIN equipe_suporte s ON v.suporte_id = s.id 
       ORDER BY v.data_venda DESC`,
      [],
      (err, rows) => {
        if (err) return res.json({ ok: false, erro: err.message });
        const vendas = rows || [];
        let totalFaturado = 0, totalComissoes = 0, fechadas = 0, emNegociacao = 0;
        vendas.forEach(v => {
          if (v.status_venda === 'fechado') {
            totalFaturado += (parseFloat(v.valor_venda) || 0);
            totalComissoes += (parseFloat(v.comissao_valor) || 0);
            fechadas++;
          } else {
            emNegociacao++;
          }
        });
        res.json({
          ok: true,
          vendas,
          metricas: { totalFaturado, totalComissoes, fechadas, emNegociacao, totalVendas: vendas.length }
        });
      }
    );
  });

  // GET /api/suporte/financeiro — Dados financeiros do vendedor logado
  app.get('/api/suporte/financeiro', suporteAuth, (req, res) => {
    masterDb.all(`SELECT * FROM suporte_vendas WHERE suporte_id = ?`, [req.suporteId], (err, vendas) => {
      if (err) return res.json({ ok: false, erro: err.message });
      let totalGanhos = 0;
      (vendas || []).forEach(v => {
        if (v.status_venda === 'fechado') totalGanhos += (parseFloat(v.comissao_valor) || 0);
      });

      masterDb.all(`SELECT * FROM suporte_adiantamentos WHERE suporte_id = ? ORDER BY data_solicitacao DESC`, [req.suporteId], (eAd, adiantamentos) => {
        let totalAdiantado = 0;
        (adiantamentos || []).forEach(a => {
          if (a.status === 'aprovado' || a.status === 'pago') totalAdiantado += (parseFloat(a.valor) || 0);
        });

        const saldoDisponivel = Math.max(0, totalGanhos - totalAdiantado);
        res.json({
          ok: true,
          totalGanhos,
          totalAdiantado,
          saldoDisponivel,
          adiantamentos: adiantamentos || []
        });
      });
    });
  });

  // POST /api/suporte/adiantamentos — Solicitar saque/adiantamento
  app.post('/api/suporte/adiantamentos', suporteAuth, (req, res) => {
    const { valor, descricao } = req.body || {};
    const val = parseFloat(valor);
    if (!val || val <= 0) return res.json({ ok: false, erro: 'Informe um valor válido.' });

    masterDb.run(
      `INSERT INTO suporte_adiantamentos (suporte_id, valor, descricao, status) VALUES (?, ?, ?, 'aprovado')`,
      [req.suporteId, val, descricao || 'Solicitação de repasse comissões'],
      function(err) {
        if (err) return res.json({ ok: false, erro: err.message });
        registrarAuditLog(req.suporteId, req.suporteData.nome, 'SAQUE_SOLICITADO', `Solicitou repasse de R$ ${val.toFixed(2)}`, req);
        res.json({ ok: true, mensagem: `Repasse de R$ ${val.toFixed(2)} registrado e enviado para o financeiro!` });
      }
    );
  });

  // PUT /api/super/suporte/:id/metas-comissao
  app.put('/api/super/suporte/:id/metas-comissao', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { meta_vendas_mes, comissao_percentual } = req.body || {};
    masterDb.run(
      `UPDATE equipe_suporte SET meta_vendas_mes = ?, comissao_percentual = ? WHERE id = ?`,
      [parseInt(meta_vendas_mes) || 10, parseFloat(comissao_percentual) || 10, id],
      function(err) {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, mensagem: 'Metas e comissões atualizadas!' });
      }
    );
  });

  // PUT /api/super/suporte/:id/status-aprovacao
  app.put('/api/super/suporte/:id/status-aprovacao', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { status_aprovacao } = req.body || {};
    if (!['aprovado', 'recusado', 'pendente'].includes(status_aprovacao)) {
      return res.json({ ok: false, erro: 'Status inválido.' });
    }
    masterDb.run(`UPDATE equipe_suporte SET status_aprovacao = ? WHERE id = ?`, [status_aprovacao, id], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: `Candidato ${status_aprovacao} com sucesso!` });
    });
  });

  // GET /api/super/suporte/audit-logs
  app.get('/api/super/suporte/audit-logs', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT * FROM suporte_logs_audit ORDER BY data_acao DESC LIMIT 100`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, logs: rows || [] });
    });
  });

  // GET /api/suporte/notificacoes
  app.get('/api/suporte/notificacoes', suporteAuth, (req, res) => {
    masterDb.all(`SELECT * FROM tarefas_suporte WHERE suporte_id = ? ORDER BY id DESC LIMIT 15`, [req.suporteId], (err, rows) => {
      res.json({ ok: true, notificacoes: rows || [] });
    });
  });

  // GET /api/suporte/missoes
  app.get('/api/suporte/missoes', suporteAuth, (req, res) => {
    masterDb.all(`SELECT * FROM suporte_missoes WHERE ativa = 1 ORDER BY id ASC`, [], (err, rows) => {
      res.json({ ok: true, missoes: rows || [] });
    });
  });

  // GET /api/super/missoes
  app.get('/api/super/missoes', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT * FROM suporte_missoes ORDER BY id DESC`, [], (err, rows) => {
      res.json({ ok: true, missoes: rows || [] });
    });
  });

  // POST /api/super/missoes
  app.post('/api/super/missoes', superAdminAuth, (req, res) => {
    const { titulo, descricao, xp_recompensa, icone, categoria } = req.body || {};
    masterDb.run(
      `INSERT INTO suporte_missoes (titulo, descricao, xp_recompensa, icone, categoria) VALUES (?, ?, ?, ?, ?)`,
      [titulo, descricao || '', parseInt(xp_recompensa) || 50, icone || 'fa-trophy', categoria || 'geral'],
      function(err) {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID, mensagem: 'Missão criada com sucesso!' });
      }
    );
  });

  // ─── SITE OFICIAL: CMS & CONFIGURAÇÕES PARA EQUIPE DE SUPORTE ───
  // GET /api/suporte/site-config — ler configurações do site para o editor do suporte
  app.get('/api/suporte/site-config', suporteAuth, (req, res) => {
    masterDb.all("SELECT chave, valor FROM configuracoes_global WHERE chave LIKE 'site_%'", [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      const cfgs = {};
      (rows || []).forEach(r => {
        try {
          cfgs[r.chave] = JSON.parse(r.valor);
        } catch (e) {
          cfgs[r.chave] = r.valor;
        }
      });
      res.json({ ok: true, configs: cfgs });
    });
  });

  // POST /api/suporte/site-config — salvar configurações do site oficial
  app.post('/api/suporte/site-config', suporteAuth, (req, res) => {
    const rawConfigs = req.body && req.body.configs ? req.body.configs : req.body;
    if (!rawConfigs || typeof rawConfigs !== 'object' || !Object.keys(rawConfigs).length) {
      return res.json({ ok: false, erro: 'Nenhuma configuração enviada.' });
    }

    const keys = Object.keys(rawConfigs);
    masterDb.serialize(() => {
      const stmt = masterDb.prepare("INSERT INTO configuracoes_global (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor");
      keys.forEach(k => {
        const safeKey = k.startsWith('site_') ? k : 'site_' + k;
        const val = rawConfigs[k];
        const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val === null || val === undefined ? '' : val);
        stmt.run(safeKey, valStr);
      });
      stmt.finalize(err => {
        if (err) return res.json({ ok: false, erro: err.message });
        const supNome = (req.suporteData && req.suporteData.nome) || 'Colaborador';
        registrarAuditLog(req.suporteId, supNome, 'ALTEROU_SITE_OFICIAL', `Alterou ${keys.length} campo(s) do site oficial: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`, req);

        // Snapshot completo de todas as configurações do site para histórico de versões
        masterDb.all("SELECT chave, valor FROM configuracoes_global WHERE chave LIKE 'site_%'", [], (errSnap, rowsSnap) => {
          if (!errSnap && rowsSnap) {
            const snapshot = {};
            rowsSnap.forEach(r => {
              try { snapshot[r.chave] = JSON.parse(r.valor); } catch (e) { snapshot[r.chave] = r.valor; }
            });
            const resumo = (req.body && req.body.resumo_versao) || `Alteração em ${keys.length} campo(s) (${keys.slice(0, 3).map(k => k.replace('site_','')).join(', ')}${keys.length > 3 ? '...' : ''})`;
            const titulo = (req.body && req.body.titulo_versao) || `Publicação ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

            masterDb.run(
              `INSERT INTO site_versoes_historico (tipo, titulo, resumo, snapshot_json, autor_nome, autor_id) VALUES ('site_oficial', ?, ?, ?, ?, ?)`,
              [titulo, resumo, JSON.stringify(snapshot), supNome, req.suporteId || null],
              () => {
                // Manter estritamente as últimas 10 versões salvas
                masterDb.run(`DELETE FROM site_versoes_historico WHERE tipo = 'site_oficial' AND id NOT IN (SELECT id FROM site_versoes_historico WHERE tipo = 'site_oficial' ORDER BY id DESC LIMIT 10)`);
              }
            );
          }
        });

        res.json({ ok: true, mensagem: 'Configurações do site salvas e nova versão registrada!' });
      });
    });
  });

  // GET /api/suporte/site-historico — Listar últimas 10 versões publicadas do site oficial
  app.get('/api/suporte/site-historico', suporteAuth, (req, res) => {
    masterDb.all(
      `SELECT id, tipo, titulo, resumo, autor_nome, autor_id, criado_em, length(snapshot_json) as tamanho_bytes
       FROM site_versoes_historico
       WHERE tipo = 'site_oficial'
       ORDER BY id DESC LIMIT 10`,
      [],
      (err, rows) => {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, versoes: rows || [] });
      }
    );
  });

  // POST /api/suporte/site-historico/restaurar/:id — Restaurar versão publicada em 1 clique
  app.post('/api/suporte/site-historico/restaurar/:id', suporteAuth, (req, res) => {
    const versaoId = parseInt(req.params.id);
    if (!versaoId) return res.json({ ok: false, erro: 'ID de versão inválido.' });

    masterDb.get(`SELECT * FROM site_versoes_historico WHERE id = ? AND tipo = 'site_oficial'`, [versaoId], (err, row) => {
      if (err || !row) return res.json({ ok: false, erro: 'Versão histórica não encontrada.' });

      let snapshot = {};
      try {
        snapshot = JSON.parse(row.snapshot_json || '{}');
      } catch (e) {
        return res.json({ ok: false, erro: 'Snapshot corrompido.' });
      }

      const keys = Object.keys(snapshot);
      if (!keys.length) return res.json({ ok: false, erro: 'Snapshot vazio.' });

      masterDb.serialize(() => {
        const stmt = masterDb.prepare("INSERT INTO configuracoes_global (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor");
        keys.forEach(k => {
          const val = snapshot[k];
          const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val === null || val === undefined ? '' : val);
          stmt.run(k, valStr);
        });
        stmt.finalize(errFinal => {
          if (errFinal) return res.json({ ok: false, erro: errFinal.message });

          const supNome = (req.suporteData && req.suporteData.nome) || 'Colaborador';
          registrarAuditLog(req.suporteId, supNome, 'RESTAUROU_VERSAO_SITE', `Restaurou versão #${row.id} ("${row.titulo || 'Sem título'}") com ${keys.length} configurações.`, req);

          // Registra uma nova versão de "Rollback" no histórico
          masterDb.run(
            `INSERT INTO site_versoes_historico (tipo, titulo, resumo, snapshot_json, autor_nome, autor_id) VALUES ('site_oficial', ?, ?, ?, ?, ?)`,
            [`Restaurado da v#${row.id}`, `Rollback para snapshot de ${row.criado_em}`, row.snapshot_json, supNome, req.suporteId || null],
            () => {
              masterDb.run(`DELETE FROM site_versoes_historico WHERE tipo = 'site_oficial' AND id NOT IN (SELECT id FROM site_versoes_historico WHERE tipo = 'site_oficial' ORDER BY id DESC LIMIT 10)`);
            }
          );

          res.json({ ok: true, mensagem: `Versão #${row.id} restaurada e publicada com sucesso!`, configs: snapshot });
        });
      });
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* ═══ PORTAL DE ACELERAÇÃO DE VENDAS & PLANO DE CARREIRA DO AFILIADO ═══ */
  /* ═══════════════════════════════════════════════════════════════════════ */

  function calcularPlanoCarreira(clientesAtivos, faturamentoTotal) {
    const count = Math.max(0, parseInt(clientesAtivos) || 0);
    const fat = Math.max(0, parseFloat(faturamentoTotal) || 0);

    if (count >= 30 || fat >= 12000) {
      return {
        nivel: 'black',
        titulo: 'Black Embaixador',
        icone: 'fa-crown',
        cor: '#ffd700',
        badgeBg: 'linear-gradient(135deg, #18181b, #09090b)',
        badgeBorder: '#ffd700',
        comissaoPct: 50,
        clientesMin: 30,
        proximoNivel: null,
        faltamClientes: 0,
        progressoPct: 100,
        bonusGraduacao: 3000,
        vivendoDisso: true,
        seloVivendoDisso: '🔥 VIVENDO DE CHEF COZINHA',
        statusTexto: 'Elite Absoluta — Você construiu uma carteira sólida e vive exclusivamente das comissões recorrentes do Chef Cozinha!',
        beneficios: [
          '50% de comissão recorrente mensal vitalícia sobre todos os restaurantes',
          'Acesso prioritário a novos módulos e betas exclusivos',
          'Canal direto com os fundadores e diretoria executiva',
          'Selo Oficial de Embaixador no diretório e materiais de imprensa'
        ]
      };
    } else if (count >= 15 || fat >= 5000) {
      const faltam = Math.max(0, 30 - count);
      return {
        nivel: 'ouro',
        titulo: 'Afiliado Ouro',
        icone: 'fa-trophy',
        cor: '#f59e0b',
        badgeBg: 'linear-gradient(135deg, #451a03, #78350f)',
        badgeBorder: '#f59e0b',
        comissaoPct: 40,
        clientesMin: 15,
        proximoNivel: 'Black Embaixador (30 clientes)',
        faltamClientes: faltam,
        progressoPct: Math.min(99, Math.round(((count - 15) / 15) * 100)),
        bonusGraduacao: 1500,
        vivendoDisso: true,
        seloVivendoDisso: '🔥 RUMO À LIBERDADE FINANCEIRA',
        statusTexto: 'Alta Performance — Mais de 15 restaurantes parceiros. Renda recorrente mensal expressiva.',
        beneficios: [
          '40% de comissão recorrente mensal por restaurante ativo',
          'Bônus de R$ 1.500 liberado ao atingir o nível Ouro',
          'Suporte VIP na negociação de redes e franquias'
        ]
      };
    } else if (count >= 5 || fat >= 1500) {
      const faltam = Math.max(0, 15 - count);
      return {
        nivel: 'prata',
        titulo: 'Afiliado Prata',
        icone: 'fa-medal',
        cor: '#cbd5e1',
        badgeBg: 'linear-gradient(135deg, #1e293b, #334155)',
        badgeBorder: '#94a3b8',
        comissaoPct: 30,
        clientesMin: 5,
        proximoNivel: 'Afiliado Ouro (15 clientes)',
        faltamClientes: faltam,
        progressoPct: Math.min(99, Math.round(((count - 5) / 10) * 100)),
        bonusGraduacao: 500,
        vivendoDisso: false,
        seloVivendoDisso: null,
        statusTexto: 'Consolidação de Carteira — 30% de comissão recorrente mensal garantida todo mês.',
        beneficios: [
          '30% de comissão recorrente mensal',
          'Bônus de R$ 500 liberado ao atingir 5 clientes ativos',
          'Materiais de marketing de alta conversão'
        ]
      };
    } else {
      const faltam = Math.max(0, 5 - count);
      return {
        nivel: 'bronze',
        titulo: 'Afiliado Bronze',
        icone: 'fa-shield-halved',
        cor: '#f97316',
        badgeBg: 'linear-gradient(135deg, #271306, #431407)',
        badgeBorder: '#ea580c',
        comissaoPct: 20,
        clientesMin: 0,
        proximoNivel: 'Afiliado Prata (5 clientes)',
        faltamClientes: faltam,
        progressoPct: Math.min(99, Math.round((count / 5) * 100)),
        bonusGraduacao: 0,
        vivendoDisso: false,
        seloVivendoDisso: null,
        statusTexto: 'Início de Carreira — Comece a prospectar e receba 20% de comissão recorrente já na 1ª venda.',
        beneficios: [
          '20% de comissão recorrente mensal',
          'Links dinâmicos de vendas com rastreamento por nicho',
          'Scripts completos para WhatsApp e abordagem presencial'
        ]
      };
    }
  }

  // GET /api/afiliado/carreira-dashboard — Dashboard completo do afiliado logado
  app.get('/api/afiliado/carreira-dashboard', suporteAuth, (req, res) => {
    const userId = req.suporteId;
    const host = req.headers.host || 'localhost:8080';
    const protocol = req.protocol || 'http';
    const baseUrl = `${protocol}://${host}`;

    // Busca dados do usuário de suporte ou afiliado
    masterDb.get(`SELECT * FROM equipe_suporte WHERE id = ?`, [userId], (errUser, user) => {
      if (errUser || !user) {
        return res.json({ ok: false, erro: 'Cadastro de afiliado/suporte não encontrado.' });
      }

      // Garante que o usuário possua um código ref limpo e único
      let refCode = user.codigo_ref;
      if (!refCode || refCode.trim() === '') {
        const cleanName = (user.nome || 'AF').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4);
        refCode = `CHEF-${cleanName}${user.id}`;
        masterDb.run(`UPDATE equipe_suporte SET codigo_ref = ? WHERE id = ?`, [refCode, userId]);
      }

      // Busca estatísticas de vendas registradas
      masterDb.all(
        `SELECT * FROM suporte_vendas WHERE suporte_id = ? ORDER BY data_venda DESC`,
        [userId],
        (errVendas, vendasRows) => {
          const vendas = vendasRows || [];
          const vendasFechadas = vendas.filter(v => (v.status_venda || 'fechado') === 'fechado');
          const clientesAtivos = vendasFechadas.length;
          
          let totalFaturado = 0;
          let totalComissoes = 0;
          vendasFechadas.forEach(v => {
            totalFaturado += (parseFloat(v.valor_venda) || 0);
            totalComissoes += (parseFloat(v.comissao_valor) || 0);
          });

          // Projeção do Plano de Carreira
          const carreira = calcularPlanoCarreira(clientesAtivos, totalFaturado);
          
          // Ticket médio estimado R$ 199/mês por restaurante ativo
          const mensalidadeMedia = 199;
          const mrrProjetado = (clientesAtivos * mensalidadeMedia) * (carreira.comissaoPct / 100);

          // Busca Metas Ativas da Diretoria
          masterDb.all(
            `SELECT * FROM afiliados_metas 
             WHERE status = 'ativa' AND (afiliado_id IS NULL OR afiliado_id = ?)
             ORDER BY id DESC`,
            [userId],
            (errMetas, metasRows) => {
              const metas = (metasRows || []).map(m => {
                const progresso = Math.min(clientesAtivos, m.meta_qtd);
                const bateu = clientesAtivos >= m.meta_qtd;
                const perc = m.meta_qtd > 0 ? Math.min(100, Math.round((progresso / m.meta_qtd) * 100)) : 0;
                return {
                  ...m,
                  progresso_atual: progresso,
                  concluida: bateu,
                  percentual_progresso: perc
                };
              });

              // Busca Bonificações do Afiliado
              masterDb.all(
                `SELECT * FROM afiliados_bonificacoes 
                 WHERE suporte_id = ? OR afiliado_id = ?
                 ORDER BY id DESC`,
                [userId, userId],
                (errBonus, bonusRows) => {
                  const bonificacoes = bonusRows || [];
                  let bonusTotalPago = 0;
                  let bonusTotalPendente = 0;

                  bonificacoes.forEach(b => {
                    const val = parseFloat(b.valor) || 0;
                    if (b.status === 'pago') bonusTotalPago += val;
                    else if (b.status === 'pendente') bonusTotalPendente += val;
                  });

                  // Links prontos por nicho
                  const paginasVendas = [
                    {
                      nicho: 'geral',
                      titulo: 'Página Geral Oficial',
                      descricao: 'Apresentação completa de todas as funcionalidades para qualquer restaurante.',
                      url: `${baseUrl}/?ref=${refCode}`,
                      whatsappMsg: `Olá! Conheça o Chef Cozinha, o sistema definitivo para gerenciar pedidos, mesas e delivery sem taxas abusivas: ${baseUrl}/?ref=${refCode}`
                    },
                    {
                      nicho: 'pizzaria',
                      titulo: 'Pizzarias & Delivery',
                      descricao: 'Foco em pedidos rápidos de pizza meio a meio, bordas recheadas e delivery integrado.',
                      url: `${baseUrl}/?nicho=pizzaria&ref=${refCode}`,
                      whatsappMsg: `Olá amigo pizzaiolo! Sabia que você pode economizar milhares de reais por mês eliminando as taxas do iFood com nosso cardápio delivery próprio? Veja uma demo aqui: ${baseUrl}/?nicho=pizzaria&ref=${refCode}`
                    },
                    {
                      nicho: 'hamburgueria',
                      titulo: 'Hamburguerias & Fast Food',
                      descricao: 'Customização ágil de lanches (combos, adicionais, pontos da carne) e comanda rápida.',
                      url: `${baseUrl}/?nicho=hamburgueria&ref=${refCode}`,
                      whatsappMsg: `Fala chef! Quer acelerar a saída de pedidos da sua hamburgueria e receber direto no WhatsApp sem pagar comissão por lanche? Confira: ${baseUrl}/?nicho=hamburgueria&ref=${refCode}`
                    },
                    {
                      nicho: 'buffet',
                      titulo: 'Buffets & Restaurante a Quilo / Balança',
                      descricao: 'Integração de balança com checkout de peso em milissegundos e controle de mesas.',
                      url: `${baseUrl}/?nicho=buffet&ref=${refCode}`,
                      whatsappMsg: `Olá! Seu restaurante a quilo ou buffet precisa de agilidade na balança e fechamento de mesas sem fila? Veja como funciona o Chef Cozinha: ${baseUrl}/?nicho=buffet&ref=${refCode}`
                    },
                    {
                      nicho: 'bar',
                      titulo: 'Bares, Pubs & Chopperias',
                      descricao: 'Comandas individuais, controle de garçons, chopps em dobro e fechamento dividido.',
                      url: `${baseUrl}/?nicho=bar&ref=${refCode}`,
                      whatsappMsg: `Olá! Acabe com as confusões de comandas e filas no caixa do seu bar com o nosso sistema de atendimento na mesa: ${baseUrl}/?nicho=bar&ref=${refCode}`
                    },
                    {
                      nicho: 'cadastro',
                      titulo: 'Cadastro Direto de Restaurante',
                      descricao: 'Leva o restaurante diretamente para a tela de cadastro atribuindo seu código de afiliado.',
                      url: `${baseUrl}/cadastro.html?ref=${refCode}`,
                      whatsappMsg: `Crie agora sua conta no Chef Cozinha e comece o teste grátis de 14 dias sem compromisso: ${baseUrl}/cadastro.html?ref=${refCode}`
                    }
                  ];

                  // Pitchs e Scripts Mastigados
                  const pitchsEScripts = [
                    {
                      id: 'script-whatsapp-frio',
                      categoria: 'WhatsApp - Abordagem Inicial',
                      titulo: 'Abertura Direta: O Fim das Taxas Abusivas',
                      icone: 'fa-whatsapp',
                      descricao: 'Ideal para abordar donos de restaurantes que você pegou o contato no Google Maps ou Instagram.',
                      texto: `Olá [Nome do Dono/Restaurante], tudo bem?\n\nEstava olhando o perfil do seu restaurante e achei o cardápio incrível! Parabéns pelo trabalho.\n\nTe mandei essa mensagem rápida porque ajudamos restaurantes da sua região a economizarem entre R$ 1.500 e R$ 8.000 todo mês, reduzindo a dependência das taxas de 27% do iFood através de um sistema próprio de delivery e cardápio digital.\n\nVocê teria 3 minutinhos amanhã para eu te mostrar como funciona na prática sem custo nenhum?`,
                    },
                    {
                      id: 'script-objecao-ja-tenho',
                      categoria: 'Quebra de Objeção',
                      titulo: '"Já tenho outro sistema"',
                      icone: 'fa-shield-halved',
                      descricao: 'Como contornar quando o dono diz que já utiliza outro software.',
                      texto: `Perfeito, [Nome]! A maioria dos nossos clientes de maior sucesso já usava outro sistema antes de nos conhecerem.\n\nA grande diferença é que com o Chef Cozinha você não paga mensalidades abusivas por módulos separados, não cobramos NENHUMA taxa sobre seus pedidos delivery e o suporte responde em minutos por WhatsApp direto com humanos.\n\nQue tal colocarmos o Chef Cozinha para rodar por 14 dias em paralelo para sua equipe testar na prática sem você pagar 1 real?`,
                    },
                    {
                      id: 'script-objecao-sem-tempo',
                      categoria: 'Quebra de Objeção',
                      titulo: '"Não tenho tempo para cadastrar tudo"',
                      icone: 'fa-clock',
                      descricao: 'Elimina o medo da transição e da complicação técnica.',
                      texto: `Eu entendo perfeitamente, a rotina de cozinha é super puxada! Justamente por isso nosso time de onboarding faz praticamente tudo para você: nós mesmos importamos seu cardápio, fotos e configuramos suas impressoras.\n\nVocê só aperta um botão e o sistema já está pronto para receber pedidos no mesmo dia!`,
                    },
                    {
                      id: 'script-pitch-presencial',
                      categoria: 'Visita Presencial / Balcão',
                      titulo: 'Roteiro de 3 Minutos no Olho no Olho',
                      icone: 'fa-person-walking-dashed-line-arrow-right',
                      descricao: 'Perfeito para quando você vai almoçar ou jantar e quer fechar o dono na hora.',
                      texto: `1. Elogie a comida: "Parabéns pelo prato, estava excelente!"\n2. Peça para falar com o responsável: "Você é o proprietário? Trabalho com tecnologia para gastronomia e estava observando o movimento de vocês."\n3. Toque na dor: "Vocês atendem muito por delivery ou mais no salão? Já calcularam quanto deixam de lucro líquido em taxas de marketplace por mês?"\n4. Apresente a solução: "Nós implantamos o Chef Cozinha aqui em poucos minutos, com cardápio QR Code na mesa e delivery próprio sem nenhuma taxa por pedido."\n5. Fechamento: "Deixa eu ativar 14 dias de degustação aqui no seu celular agora mesmo para você ver a mágica acontecer."`,
                    },
                    {
                      id: 'script-fechamento-urgencia',
                      categoria: 'Fechamento com Urgência',
                      titulo: 'Gatilho de Vaga / Condição Especial',
                      icone: 'fa-bolt',
                      descricao: 'Para donos que ficaram de pensar e precisam do empurrão final.',
                      texto: `Oi [Nome]! Conseguimos liberar hoje com a diretoria do Chef Cozinha 3 vagas com suporte de implantação 100% gratuito e 14 dias de acesso completo sem compromisso.\n\nComo conversamos ontem, reservei uma dessas vagas para você. Posso mandar seu link de ativação agora para não perder essa condição?`,
                    }
                  ];

                  res.json({
                    ok: true,
                    afiliado: {
                      id: user.id,
                      nome: user.nome,
                      email: user.email,
                      telefone: user.telefone,
                      pix_chave: user.pix_chave,
                      codigo_ref: refCode
                    },
                    metricas: {
                      clientes_ativos: clientesAtivos,
                      vendas_total: vendas.length,
                      total_faturado: totalFaturado,
                      total_comissoes: totalComissoes,
                      mrr_projetado: mrrProjetado,
                      ticket_medio_estimado: mensalidadeMedia
                    },
                    carreira,
                    metas,
                    bonificacoes: {
                      historico: bonificacoes,
                      total_pago: bonusTotalPago,
                      total_pendente: bonusTotalPendente
                    },
                    paginas_vendas: paginasVendas,
                    pitchs_e_scripts: pitchsEScripts
                  });
                }
              );
            }
          );
        }
      );
    });
  });

  // POST /api/afiliado/resgatar-bonus — Solicitação de saque/PIX de bonificação de meta
  app.post('/api/afiliado/resgatar-bonus', suporteAuth, (req, res) => {
    const userId = req.suporteId;
    const { meta_id, valor, tipo, descricao } = req.body || {};

    const valorFloat = parseFloat(valor);
    if (!valorFloat || valorFloat <= 0) {
      return res.json({ ok: false, erro: 'Informe um valor válido para resgate da bonificação.' });
    }

    masterDb.get(`SELECT id, nome, pix_chave FROM equipe_suporte WHERE id = ?`, [userId], (errUser, user) => {
      if (errUser || !user) return res.json({ ok: false, erro: 'Usuário não encontrado.' });
      if (!user.pix_chave || user.pix_chave.trim() === '') {
        return res.json({ ok: false, erro: 'Cadastre sua chave PIX no seu perfil antes de solicitar o resgate.' });
      }

      masterDb.run(
        `INSERT INTO afiliados_bonificacoes (suporte_id, afiliado_id, afiliado_nome, meta_id, valor, tipo, descricao, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente')`,
        [userId, userId, user.nome, meta_id || null, valorFloat, tipo || 'meta_atingida', descricao || `Solicitação de Bônus de R$ ${valorFloat.toFixed(2)}`],
        function(errIns) {
          if (errIns) return res.json({ ok: false, erro: errIns.message });

          const solicitacaoId = this.lastID;
          registrarAuditLog(userId, user.nome, 'SOLICITACAO_BONIFICACAO', `Solicitou saque de bônus de R$ ${valorFloat.toFixed(2)} via PIX: ${user.pix_chave}`, req);

          if (io) {
            io.emit('nova_solicitacao_bonificacao', {
              id: solicitacaoId,
              afiliado_nome: user.nome,
              valor: valorFloat,
              pix_chave: user.pix_chave,
              descricao: descricao || 'Bônus de Meta de Vendas',
              data: new Date().toISOString()
            });
          }

          res.json({
            ok: true,
            mensagem: 'Solicitação de bonificação enviada com sucesso! A diretoria fará o pagamento via PIX em breve.',
            id: solicitacaoId
          });
        }
      );
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* ═══ SUPER ADMIN: RANKING TOP AFILIADOS ("VIVENDO DISSO") & METAS ═════ */
  /* ═══════════════════════════════════════════════════════════════════════ */

  // GET /api/super/afiliados/ranking-performers — Melhores afiliados e os que estão vivendo disso
  app.get('/api/super/afiliados/ranking-performers', superAdminAuth, (req, res) => {
    masterDb.all(
      `SELECT s.id, s.nome, s.email, s.telefone, s.cargo, s.pix_chave, s.codigo_ref, s.xp, s.nivel,
              COUNT(DISTINCT CASE WHEN v.status_venda = 'fechado' THEN v.id END) as clientes_ativos,
              COUNT(DISTINCT v.id) as total_vendas,
              COALESCE(SUM(CASE WHEN v.status_venda = 'fechado' THEN v.valor_venda ELSE 0 END), 0) as total_faturado,
              COALESCE(SUM(CASE WHEN v.status_venda = 'fechado' THEN v.comissao_valor ELSE 0 END), 0) as total_comissoes
       FROM equipe_suporte s
       LEFT JOIN suporte_vendas v ON s.id = v.suporte_id
       WHERE s.status_aprovacao = 'aprovado'
       GROUP BY s.id
       ORDER BY clientes_ativos DESC, total_comissoes DESC, total_faturado DESC`,
      [],
      (err, rows) => {
        if (err) return res.json({ ok: false, erro: err.message });

        const performers = (rows || []).map((p, idx) => {
          const clientes = parseInt(p.clientes_ativos) || 0;
          const faturado = parseFloat(p.total_faturado) || 0;
          const comissoes = parseFloat(p.total_comissoes) || 0;
          const carreira = calcularPlanoCarreira(clientes, faturado);
          
          // MRR estimado recorrente
          const mrrEstimado = (clientes * 199) * (carreira.comissaoPct / 100);

          return {
            posicao: idx + 1,
            id: p.id,
            nome: p.nome,
            email: p.email,
            telefone: p.telefone,
            codigo_ref: p.codigo_ref || `CHEF-${p.id}`,
            pix_chave: p.pix_chave,
            clientes_ativos: clientes,
            total_vendas: p.total_vendas,
            total_faturado: faturado,
            total_comissoes: comissoes,
            mrr_estimado: mrrEstimado,
            carreira_nivel: carreira.nivel,
            carreira_titulo: carreira.titulo,
            comissao_pct: carreira.comissaoPct,
            vivendo_disso: carreira.vivendoDisso,
            selo_destaque: carreira.seloVivendoDisso
          };
        });

        // Contadores gerais
        const vivendoDissoCount = performers.filter(p => p.vivendo_disso).length;
        const totalMrrGerado = performers.reduce((acc, p) => acc + p.mrr_estimado, 0);

        res.json({
          ok: true,
          ranking: performers,
          resumo: {
            total_afiliados: performers.length,
            afiliados_vivendo_disso: vivendoDissoCount,
            mrr_recorrente_total: totalMrrGerado
          }
        });
      }
    );
  });

  // GET /api/super/afiliados/metas — Listar campanhas de metas criadas
  app.get('/api/super/afiliados/metas', superAdminAuth, (req, res) => {
    masterDb.all(
      `SELECT m.*, s.nome as afiliado_especifico_nome 
       FROM afiliados_metas m
       LEFT JOIN equipe_suporte s ON m.afiliado_id = s.id
       ORDER BY m.id DESC`,
      [],
      (err, rows) => {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, metas: rows || [] });
      }
    );
  });

  // POST /api/super/afiliados/metas — Criar nova meta e bonificação para a rede de afiliados
  app.post('/api/super/afiliados/metas', superAdminAuth, (req, res) => {
    const { titulo, descricao, meta_qtd, recompensa_valor, afiliado_id, data_inicio, data_fim } = req.body || {};

    if (!titulo) return res.json({ ok: false, erro: 'Título da meta é obrigatório.' });
    const qtd = parseInt(meta_qtd) || 5;
    const recompensa = parseFloat(recompensa_valor) || 500;

    masterDb.run(
      `INSERT INTO afiliados_metas (titulo, descricao, meta_qtd, recompensa_valor, afiliado_id, data_inicio, data_fim, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ativa')`,
      [
        titulo.trim(),
        descricao || '',
        qtd,
        recompensa,
        afiliado_id ? parseInt(afiliado_id) : null,
        data_inicio || new Date().toISOString().slice(0, 10),
        data_fim || null
      ],
      function(err) {
        if (err) return res.json({ ok: false, erro: err.message });

        const metaCriadaId = this.lastID;
        if (io) {
          io.emit('nova_meta_afiliados', {
            id: metaCriadaId,
            titulo: titulo.trim(),
            meta_qtd: qtd,
            recompensa_valor: recompensa,
            afiliado_id: afiliado_id || null
          });
        }

        res.json({
          ok: true,
          id: metaCriadaId,
          mensagem: 'Campanha de meta e bonificação lançada com sucesso para os afiliados!'
        });
      }
    );
  });

  // DELETE /api/super/afiliados/metas/:id — Encerrar ou excluir meta
  app.delete('/api/super/afiliados/metas/:id', superAdminAuth, (req, res) => {
    const metaId = parseInt(req.params.id);
    masterDb.run(`UPDATE afiliados_metas SET status = 'encerrada' WHERE id = ?`, [metaId], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Meta encerrada com sucesso.' });
    });
  });

  // GET /api/super/afiliados/bonificacoes — Listar histórico de bonificações e pendências
  app.get('/api/super/afiliados/bonificacoes', superAdminAuth, (req, res) => {
    masterDb.all(
      `SELECT b.*, s.nome as afiliado_nome, s.email, s.pix_chave, s.telefone
       FROM afiliados_bonificacoes b
       LEFT JOIN equipe_suporte s ON b.suporte_id = s.id
       ORDER BY b.status ASC, b.id DESC`,
      [],
      (err, rows) => {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, bonificacoes: rows || [] });
      }
    );
  });

  // POST /api/super/afiliados/bonificacoes/pagar — Confirmar pagamento via PIX de bonificação
  app.post('/api/super/afiliados/bonificacoes/pagar', superAdminAuth, (req, res) => {
    const { id, comprovante_pix } = req.body || {};
    const bonusId = parseInt(id);

    if (!bonusId) return res.json({ ok: false, erro: 'ID da bonificação inválido.' });

    masterDb.get(`SELECT * FROM afiliados_bonificacoes WHERE id = ?`, [bonusId], (errGet, bonus) => {
      if (errGet || !bonus) return res.json({ ok: false, erro: 'Bonificação não encontrada.' });

      masterDb.run(
        `UPDATE afiliados_bonificacoes 
         SET status = 'pago', pago_em = datetime('now','localtime'), comprovante_pix = ?
         WHERE id = ?`,
        [comprovante_pix || 'Transferência PIX Realizada com Sucesso', bonusId],
        function(errUpd) {
          if (errUpd) return res.json({ ok: false, erro: errUpd.message });

          if (io) {
            io.emit('bonificacao_paga_pix', {
              suporte_id: bonus.suporte_id,
              valor: bonus.valor,
              descricao: bonus.descricao,
              comprovante: comprovante_pix || 'PIX Confirmado'
            });
          }

          res.json({
            ok: true,
            mensagem: `Pagamento de R$ ${bonus.valor.toFixed(2)} registrado e confirmado!`
          });
        }
      );
    });
  });

};

