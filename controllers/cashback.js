/**
 * controllers/cashback.js
 * Módulo Pilar 4: Motor de Cashback VIP & Fidelidade Gastronômica Cheff.pro
 * - Crédito automático de % de cashback no fechamento de conta
 * - Consulta de saldo instantânea via WhatsApp/Telefone
 * - Resgate de créditos como desconto na comanda/cardápio digital
 * - Relatórios de retenção de clientes e LTV
 */
'use strict';

module.exports = function(app, options) {
  const { db: defaultDb, io, verificarToken, getTenantDb } = options || {};

  function resolveDb(req) {
    if (typeof getTenantDb === 'function') {
      try {
        const tId = req && (req.tenantId || (req.headers && req.headers['x-tenant-id']));
        const tDb = getTenantDb(tId);
        if (tDb) return tDb;
      } catch (e) {}
    }
    return defaultDb;
  }

  function migrarSchema(db) {
    if (!db || !db.run) return;
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS cashback_extrato (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          telefone TEXT NOT NULL,
          nome TEXT,
          mesa_comanda TEXT,
          pedido_id INTEGER,
          tipo TEXT NOT NULL, -- 'credito' ou 'debito'
          valor REAL NOT NULL,
          saldo_resultante REAL NOT NULL,
          descricao TEXT,
          data_criacao DATETIME DEFAULT (datetime('now', 'localtime')),
          data_expiracao DATETIME
        )
      `, () => {});

      db.run(`CREATE INDEX IF NOT EXISTS idx_cashback_telefone ON cashback_extrato(telefone)`, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS cashback_config (
          id INTEGER PRIMARY KEY DEFAULT 1,
          ativo INTEGER DEFAULT 1,
          percentual REAL DEFAULT 5.0,
          validade_dias INTEGER DEFAULT 30,
          resgate_minimo REAL DEFAULT 5.0,
          percentual_max_conta REAL DEFAULT 50.0
        )
      `, () => {
        db.get(`SELECT COUNT(*) as total FROM cashback_config`, (err, row) => {
          if (!err && (!row || row.total === 0)) {
            db.run(`INSERT INTO cashback_config (id, ativo, percentual, validade_dias, resgate_minimo, percentual_max_conta) VALUES (1, 1, 5.0, 30, 5.0, 50.0)`, () => {});
          }
        });
      });
    });
  }

  // Inicializa schema no banco padrão
  migrarSchema(defaultDb);

  function limparTelefone(tel) {
    if (!tel) return '';
    return String(tel).replace(/\D/g, '');
  }

  function obterSaldoAtual(db, telefone, callback) {
    const limpo = limparTelefone(telefone);
    if (!limpo) return callback(null, 0);

    const sql = `
      SELECT 
        COALESCE(SUM(CASE WHEN tipo = 'credito' AND (data_expiracao IS NULL OR data_expiracao >= datetime('now', 'localtime')) THEN valor ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN tipo = 'debito' THEN valor ELSE 0 END), 0) AS saldo
      FROM cashback_extrato
      WHERE telefone = ?
    `;
    db.get(sql, [limpo], (err, row) => {
      if (err) return callback(err, 0);
      const saldo = row && row.saldo ? Math.max(0, parseFloat(Number(row.saldo).toFixed(2))) : 0;
      callback(null, saldo);
    });
  }

  // 1. Obter Configurações de Cashback
  app.get('/api/cashback/config', (req, res) => {
    const db = resolveDb(req);
    migrarSchema(db);
    db.get(`SELECT * FROM cashback_config WHERE id = 1`, (err, cfg) => {
      if (err || !cfg) {
        return res.json({
          ativo: 1,
          percentual: 5.0,
          validade_dias: 30,
          resgate_minimo: 5.0,
          percentual_max_conta: 50.0
        });
      }
      res.json(cfg);
    });
  });

  // 2. Salvar Configurações de Cashback (Admin)
  app.post('/api/cashback/config', (req, res) => {
    const db = resolveDb(req);
    migrarSchema(db);
    const { ativo, percentual, validade_dias, resgate_minimo, percentual_max_conta } = req.body || {};

    const sql = `
      INSERT INTO cashback_config (id, ativo, percentual, validade_dias, resgate_minimo, percentual_max_conta)
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        ativo = excluded.ativo,
        percentual = excluded.percentual,
        validade_dias = excluded.validade_dias,
        resgate_minimo = excluded.resgate_minimo,
        percentual_max_conta = excluded.percentual_max_conta
    `;
    db.run(sql, [
      ativo ? 1 : 0,
      parseFloat(percentual) || 5.0,
      parseInt(validade_dias) || 30,
      parseFloat(resgate_minimo) || 5.0,
      parseFloat(percentual_max_conta) || 50.0
    ], function(err) {
      if (err) {
        console.error('[Cashback] Erro ao salvar config:', err);
        return res.status(500).json({ error: 'Erro ao salvar configurações de cashback' });
      }
      res.json({ sucesso: true, mensagem: 'Configurações de Cashback atualizadas com sucesso.' });
    });
  });

  // 3. Consultar Saldo e Extrato do Cliente por Telefone
  app.post('/api/cashback/consultar', (req, res) => {
    const db = resolveDb(req);
    migrarSchema(db);
    const telefone = limparTelefone(req.body && req.body.telefone);
    if (!telefone || telefone.length < 8) {
      return res.status(400).json({ error: 'Informe um número de telefone/WhatsApp válido.' });
    }

    obterSaldoAtual(db, telefone, (err, saldo) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao consultar saldo de cashback' });
      }

      // Busca extrato recente (últimos 15 lançamentos)
      db.all(
        `SELECT id, tipo, valor, saldo_resultante, descricao, data_criacao, data_expiracao 
         FROM cashback_extrato 
         WHERE telefone = ? 
         ORDER BY id DESC LIMIT 15`,
        [telefone],
        (errExt, extrato) => {
          // Busca última comanda ou nome conhecido
          db.get(`SELECT nome FROM clientes WHERE telefone = ? OR telefone LIKE ? LIMIT 1`, [telefone, `%${telefone.slice(-8)}`], (errCli, cli) => {
            res.json({
              sucesso: true,
              telefone,
              nome: (cli && cli.nome) || null,
              saldo_disponivel: saldo,
              extrato: extrato || []
            });
          });
        }
      );
    });
  });

  // 4. Creditar Cashback após Venda / Fechamento de Comanda
  app.post('/api/cashback/creditar', (req, res) => {
    const db = resolveDb(req);
    migrarSchema(db);
    const { telefone: rawTel, nome, valor_total, mesa_comanda, pedido_id, descricao } = req.body || {};
    const telefone = limparTelefone(rawTel);
    const totalVenda = parseFloat(valor_total) || 0;

    if (!telefone || telefone.length < 8) {
      return res.status(400).json({ error: 'Telefone inválido para creditar cashback' });
    }
    if (totalVenda <= 0) {
      return res.status(400).json({ error: 'Valor da venda deve ser maior que zero' });
    }

    // Consulta configuração do cashback
    db.get(`SELECT * FROM cashback_config WHERE id = 1`, (errCfg, cfg) => {
      const config = cfg || { ativo: 1, percentual: 5.0, validade_dias: 30 };
      if (!config.ativo) {
        return res.json({ creditado: false, motivo: 'Cashback desativado pelo restaurante' });
      }

      const percentual = parseFloat(config.percentual) || 5.0;
      const validadeDias = parseInt(config.validade_dias) || 30;
      const valorCredito = parseFloat((totalVenda * (percentual / 100)).toFixed(2));

      if (valorCredito <= 0) {
        return res.json({ creditado: false, motivo: 'Valor de cashback nulo' });
      }

      obterSaldoAtual(db, telefone, (errSaldo, saldoAtual) => {
        const novoSaldo = parseFloat((saldoAtual + valorCredito).toFixed(2));
        const descFinal = descricao || `Cashback ${percentual}% da mesa/comanda ${mesa_comanda || 'Balcão'} (Venda R$ ${totalVenda.toFixed(2)})`;

        const sql = `
          INSERT INTO cashback_extrato (
            telefone, nome, mesa_comanda, pedido_id, tipo, valor, saldo_resultante, descricao, data_criacao, data_expiracao
          ) VALUES (?, ?, ?, ?, 'credito', ?, ?, ?, datetime('now', 'localtime'), datetime('now', '+${validadeDias} days'))
        `;

        db.run(sql, [telefone, nome || null, mesa_comanda || null, pedido_id || null, valorCredito, novoSaldo, descFinal], function(errIns) {
          if (errIns) {
            console.error('[Cashback] Erro ao creditar:', errIns);
            return res.status(500).json({ error: 'Erro ao registrar crédito de cashback' });
          }

          if (io) {
            io.emit('cashback_atualizado', {
              telefone,
              nome,
              tipo: 'credito',
              valor: valorCredito,
              novo_saldo: novoSaldo,
              mesa_comanda
            });
          }

          res.json({
            sucesso: true,
            creditado: true,
            valor_credito: valorCredito,
            novo_saldo: novoSaldo,
            validade_dias: validadeDias,
            mensagem: `Parabéns! R$ ${valorCredito.toFixed(2)} de cashback creditado com sucesso.`
          });
        });
      });
    });
  });

  // 5. Resgatar Cashback (Abater na Conta / Comanda)
  app.post('/api/cashback/resgatar', (req, res) => {
    const db = resolveDb(req);
    migrarSchema(db);
    const { telefone: rawTel, valor_resgate, mesa_comanda, total_conta } = req.body || {};
    const telefone = limparTelefone(rawTel);
    const valorResgate = parseFloat(valor_resgate) || 0;

    if (!telefone || telefone.length < 8) {
      return res.status(400).json({ error: 'Telefone inválido para resgate' });
    }
    if (valorResgate <= 0) {
      return res.status(400).json({ error: 'Valor de resgate deve ser maior que zero' });
    }

    db.get(`SELECT * FROM cashback_config WHERE id = 1`, (errCfg, cfg) => {
      const config = cfg || { ativo: 1, resgate_minimo: 5.0, percentual_max_conta: 50.0 };
      if (!config.ativo) {
        return res.status(400).json({ error: 'Módulo de cashback temporariamente desativado' });
      }

      if (valorResgate < (config.resgate_minimo || 0)) {
        return res.status(400).json({ error: `Resgate mínimo permitido é de R$ ${(config.resgate_minimo || 0).toFixed(2)}` });
      }

      if (total_conta && config.percentual_max_conta) {
        const limiteMaximo = (parseFloat(total_conta) * (config.percentual_max_conta / 100));
        if (valorResgate > limiteMaximo) {
          return res.status(400).json({ error: `O resgate máximo para esta conta de R$ ${parseFloat(total_conta).toFixed(2)} é de R$ ${limiteMaximo.toFixed(2)} (${config.percentual_max_conta}%)` });
        }
      }

      obterSaldoAtual(db, telefone, (errSaldo, saldoAtual) => {
        if (saldoAtual < valorResgate) {
          return res.status(400).json({ error: `Saldo insuficiente. Saldo disponível: R$ ${saldoAtual.toFixed(2)}` });
        }

        const novoSaldo = parseFloat((saldoAtual - valorResgate).toFixed(2));
        const descFinal = `Resgate de desconto na mesa/comanda ${mesa_comanda || 'Salão'}`;

        const sql = `
          INSERT INTO cashback_extrato (
            telefone, mesa_comanda, tipo, valor, saldo_resultante, descricao, data_criacao
          ) VALUES (?, ?, 'debito', ?, ?, ?, datetime('now', 'localtime'))
        `;

        db.run(sql, [telefone, mesa_comanda || null, valorResgate, novoSaldo, descFinal], function(errIns) {
          if (errIns) {
            console.error('[Cashback] Erro ao resgatar:', errIns);
            return res.status(500).json({ error: 'Erro ao registrar resgate de cashback' });
          }

          if (io) {
            io.emit('cashback_atualizado', {
              telefone,
              tipo: 'debito',
              valor: valorResgate,
              novo_saldo: novoSaldo,
              mesa_comanda
            });
          }

          res.json({
            sucesso: true,
            resgatado: true,
            valor_resgatado: valorResgate,
            novo_saldo: novoSaldo,
            desconto_aplicado: valorResgate,
            mensagem: `Desconto de R$ ${valorResgate.toFixed(2)} aplicado com sucesso!`
          });
        });
      });
    });
  });

  // 6. Resumo Executivo para o Painel do Dono
  app.get('/api/cashback/resumo', (req, res) => {
    const db = resolveDb(req);
    migrarSchema(db);

    const sqlGeral = `
      SELECT 
        COUNT(DISTINCT telefone) as total_clientes_vip,
        COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor ELSE 0 END), 0) as total_gerado,
        COALESCE(SUM(CASE WHEN tipo = 'debito' THEN valor ELSE 0 END), 0) as total_resgatado
      FROM cashback_extrato
    `;

    db.get(sqlGeral, (err, row) => {
      if (err) return res.status(500).json({ error: 'Erro ao calcular métricas de cashback' });

      const totalGerado = row ? parseFloat(row.total_gerado || 0) : 0;
      const totalResgatado = row ? parseFloat(row.total_resgatado || 0) : 0;
      const saldoCirculante = Math.max(0, totalGerado - totalResgatado);
      const taxaRetorno = totalGerado > 0 ? ((totalResgatado / totalGerado) * 100) : 0;

      // Top 5 Clientes VIP com mais cashback
      db.all(`
        SELECT 
          telefone, 
          COALESCE(nome, 'Cliente VIP') as nome,
          SUM(CASE WHEN tipo = 'credito' THEN valor ELSE 0 END) as acumulado,
          SUM(CASE WHEN tipo = 'credito' THEN valor ELSE -valor END) as saldo_atual,
          MAX(data_criacao) as ultima_visita
        FROM cashback_extrato
        GROUP BY telefone
        ORDER BY acumulado DESC
        LIMIT 5
      `, (errTop, topClientes) => {
        res.json({
          total_clientes_vip: (row && row.total_clientes_vip) || 0,
          total_gerado: totalGerado,
          total_resgatado: totalResgatado,
          saldo_circulante: saldoCirculante,
          taxa_retorno_pct: parseFloat(taxaRetorno.toFixed(1)),
          top_clientes: topClientes || []
        });
      });
    });
  });
};
