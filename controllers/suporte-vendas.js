/**
 * controllers/suporte-vendas.js
 * Endpoints e regras de negócio para a Equipe de Suporte e Vendas Afiliadas
 */
'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

module.exports = function(app, masterDb, sqlite3, options) {
  const { superAdminAuth, io } = options || {};
  const suporteJwtSecret = process.env.SUPORTE_JWT_SECRET || 'chef-suporte-secret-key-2026';

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
      status TEXT DEFAULT 'aprovado',
      data_solicitacao DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    masterDb.run(`CREATE TABLE IF NOT EXISTS suporte_logs_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suporte_id INTEGER,
      suporte_nome TEXT,
      acao TEXT,
      detalhes TEXT,
      ip TEXT,
      data_acao DATETIME DEFAULT (datetime('now','localtime'))
    )`);

    masterDb.run(`CREATE TABLE IF NOT EXISTS suporte_missoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT,
      descricao TEXT,
      xp_recompensa INTEGER DEFAULT 50,
      icone TEXT DEFAULT 'fa-trophy',
      categoria TEXT DEFAULT 'geral',
      ativa INTEGER DEFAULT 1,
      criada_em DATETIME DEFAULT (datetime('now','localtime'))
    )`);
  });

  function suporteAuth(req, res, next) {
    const token = req.headers['x-suporte-token'];
    if (!token) return res.json({ ok: false, erro: 'Token de suporte não fornecido.' });
    try {
      const decoded = jwt.verify(token, suporteJwtSecret);
      req.suporteId = decoded.id;
      req.suporteData = decoded;
      next();
    } catch (e) {
      res.json({ ok: false, erro: 'Sessão de suporte inválida ou expirada.' });
    }
  }

  function registrarAuditLog(suporteId, suporteNome, acao, detalhes, req) {
    const clientIp = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';
    masterDb.run(
      `INSERT INTO suporte_logs_audit (suporte_id, suporte_nome, acao, detalhes, ip) VALUES (?, ?, ?, ?, ?)`,
      [suporteId || null, suporteNome || 'Anônimo', acao, detalhes, String(clientIp)]
    );
  }

  function gerarXP(suporteId, pontos, tipo, descricao, restauranteId) {
    masterDb.run(`UPDATE equipe_suporte SET xp = COALESCE(xp,0) + ? WHERE id = ?`, [pontos, suporteId]);
    masterDb.run(
      `INSERT INTO tarefas_suporte (suporte_id, tipo, descricao, restaurante_id, pontos, status, concluida_em) VALUES (?, ?, ?, ?, ?, 'concluida', datetime('now','localtime'))`,
      [suporteId, tipo, descricao, restauranteId || null, pontos]
    );
    
    masterDb.get(`SELECT xp, nivel FROM equipe_suporte WHERE id = ?`, [suporteId], (err, row) => {
      if (row) {
        const novoNivel = Math.floor((row.xp || 0) / 100) + 1;
        if (novoNivel > (row.nivel || 1)) {
          masterDb.run(`UPDATE equipe_suporte SET nivel = ? WHERE id = ?`, [novoNivel, suporteId]);
          masterDb.run(
            `INSERT OR IGNORE INTO conquistas_suporte (suporte_id, conquista, icone, descricao) VALUES (?, ?, ?, ?)`,
            [suporteId, `level_${novoNivel}`, 'fa-star', `Atingiu o nível ${novoNivel}!`]
          );
        }
        if ((row.xp || 0) + pontos >= 100 && (row.xp || 0) < 100) {
          masterDb.run(
            `INSERT OR IGNORE INTO conquistas_suporte (suporte_id, conquista, icone, descricao) VALUES (?, 'primeiros_100', 'fa-bolt', 'Acumulou 100 XP!')`,
            [suporteId]
          );
        }
        if ((row.xp || 0) + pontos >= 500 && (row.xp || 0) < 500) {
          masterDb.run(
            `INSERT OR IGNORE INTO conquistas_suporte (suporte_id, conquista, icone, descricao) VALUES (?, 'primeiros_500', 'fa-fire', 'Acumulou 500 XP!')`,
            [suporteId]
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

  // POST /api/suporte/login — Login do painel de suporte
  app.post('/api/suporte/login', (req, res) => {
    const { email, senha } = req.body || {};
    if (!email || !senha) return res.json({ ok: false, erro: 'Email e senha são obrigatórios.' });

    masterDb.get(`SELECT * FROM equipe_suporte WHERE email = ?`, [email.trim().toLowerCase()], async (err, row) => {
      if (err || !row) return res.json({ ok: false, erro: 'Email ou senha inválidos.' });

      if (row.status_aprovacao === 'pendente') {
        return res.json({ ok: false, erro: 'Sua conta ainda está em análise pelo Administrador Master. Você será notificado assim que aprovada.' });
      }
      if (row.status_aprovacao === 'recusado') {
        return res.json({ ok: false, erro: 'Seu cadastro de suporte não foi aprovado pelo administrador.' });
      }

      const match = await bcrypt.compare(senha, row.password_hash);
      if (!match) return res.json({ ok: false, erro: 'Email ou senha inválidos.' });

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

  // POST /api/suporte/atualizar-status
  app.post('/api/suporte/atualizar-status', suporteAuth, (req, res) => {
    const { status } = req.body || {};
    if (!['disponivel', 'ocupado', 'offline'].includes(status)) return res.json({ ok: false, erro: 'Status inválido' });
    masterDb.run(`UPDATE equipe_suporte SET status = ? WHERE id = ?`, [status, req.suporteId], (err) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, status });
    });
  });

};
