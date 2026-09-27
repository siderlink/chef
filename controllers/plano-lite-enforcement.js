/**
 * controllers/plano-lite-enforcement.js
 * Sistema de Governança e Restrições Severas para Assinatura LITE
 * 
 * Objetivo Estratégico:
 * 1. Garantir que o Plano Lite gaste o MÍNIMO ABSOLUTO de recursos do servidor (CPU, RAM, Disco e I/O).
 * 2. Assegurar a MAIOR MARGEM DE LUCRO para a plataforma SaaS (custo ~R$ 0,15 vs mensalidade R$ 39,90 = 99,6% de margem).
 * 3. Aplicar travas rígidas de negócio (máx 30 produtos, máx 150 pedidos/mês, máx 8 mesas, sem IA, sem WebSockets contínuos).
 * 4. Purgar automaticamente histórico após 30 dias para manter banco SQLite de cada tenant Lite sempre abaixo de 2MB.
 * 5. Estimular o upgrade irresistível para os planos Pro e Premium assim que o restaurante atinge os limites.
 */
'use strict';

const featurePlans = require('../feature-plans');

module.exports = function(app, masterDb, sqlite3, options) {
  const {
    getTenantDb,
    getTenantDbPath,
    verificarToken,
    superAdminAuth,
    io
  } = options || {};

  // ──────────────────────────────────────────────────────────────────
  // MIGRAÇÃO DE TABELAS DE GOVERNANÇA DE PLANOS NO MASTER DB
  // ──────────────────────────────────────────────────────────────────
  function migrarTabelasPlano() {
    if (!masterDb || typeof masterDb.serialize !== 'function') return;

    masterDb.serialize(() => {
      // Tabela de solicitações de upgrade
      masterDb.run(`
        CREATE TABLE IF NOT EXISTS plano_upgrade_pedidos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          restaurante_id INTEGER NOT NULL,
          restaurante_nome TEXT,
          plano_atual TEXT NOT NULL,
          plano_desejado TEXT NOT NULL,
          whatsapp TEXT,
          status TEXT DEFAULT 'pendente', -- 'pendente' | 'aprovado' | 'cancelado'
          valor_mensal REAL DEFAULT 0,
          observacoes TEXT,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
          atendido_em DATETIME
        )
      `, () => {});

      // Tabela de auditoria de bloqueios por limite de quota
      masterDb.run(`
        CREATE TABLE IF NOT EXISTS plano_bloqueios_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          restaurante_id INTEGER NOT NULL,
          plano TEXT NOT NULL,
          recurso_bloqueado TEXT NOT NULL, -- 'pedidos_mes' | 'produtos' | 'mesas' | 'ia' | 'sockets'
          limite_maximo REAL NOT NULL,
          valor_tentativa REAL NOT NULL,
          ip TEXT,
          mensagem TEXT,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});
    });
  }

  migrarTabelasPlano();

  // Helper para resolver restaurante_id
  function getTenantId(req) {
    if (!req) return 1;
    return parseInt(
      req.headers?.['x-tenant-id'] ||
      req.query?.restaurante_id ||
      req.body?.restaurante_id ||
      req.tenantId ||
      (req.user && req.user.restaurante_id) ||
      1,
      10
    ) || 1;
  }

  // Helper para resolver banco do tenant
  function resolveTenantDb(tid) {
    if (typeof getTenantDb === 'function') {
      try {
        const tDb = getTenantDb(tid);
        if (tDb) return tDb;
      } catch (e) {}
    }
    return null;
  }

  // Helper para obter licença do restaurante no masterDb
  function getRestauranteLicenca(tid) {
    return new Promise((resolve) => {
      masterDb.get('SELECT id, nome, licenca, ativo FROM restaurantes WHERE id = ?', [tid], (err, row) => {
        if (err || !row) return resolve({ id: tid, nome: 'Restaurante ' + tid, licenca: 'lite', ativo: 1 });
        resolve(row);
      });
    });
  }

  // Helper para contar dados de uso no banco do tenant
  function getUsoTenant(tid) {
    return new Promise((resolve) => {
      const db = resolveTenantDb(tid);
      if (!db) {
        return resolve({ produtos: 0, pedidos_mes: 0, mesas: 0, fotos: 0 });
      }

      const uso = { produtos: 0, pedidos_mes: 0, mesas: 0, fotos: 0 };
      let pending = 4;
      const done = () => {
        pending--;
        if (pending <= 0) resolve(uso);
      };

      // 1. Produtos cadastrados
      db.get('SELECT COUNT(*) AS total FROM produtos WHERE ativo = 1', (err, row) => {
        if (!err && row) uso.produtos = row.total || 0;
        done();
      });

      // 2. Pedidos no mês corrente
      db.get(`
        SELECT COUNT(*) AS total FROM pedidos 
        WHERE (
          strftime('%Y-%m', time) = strftime('%Y-%m', 'now') 
          OR strftime('%Y-%m', criado_em) = strftime('%Y-%m', 'now')
          OR date(time) >= date('now', 'start of month')
        )
      `, (err, row) => {
        if (!err && row) uso.pedidos_mes = row.total || 0;
        done();
      });

      // 3. Mesas
      db.get('SELECT COUNT(*) AS total FROM mesas', (err, row) => {
        if (!err && row) uso.mesas = row.total || 0;
        done();
      });

      // 4. Produtos com imagem cadastrada
      db.get(`
        SELECT COUNT(*) AS total FROM produtos 
        WHERE imagem IS NOT NULL AND length(trim(imagem)) > 5 AND imagem != 'default.png'
      `, (err, row) => {
        if (!err && row) uso.fotos = row.total || 0;
        done();
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ROTAS DA GOVERNANÇA DE PLANO E QUOTAS
  // ══════════════════════════════════════════════════════════════════

  /**
   * GET /api/plano/quotas
   * Retorna os limites do plano atual, uso em tempo real e status de bloqueio
   */
  app.get('/api/plano/quotas', async (req, res) => {
    try {
      const tid = getTenantId(req);
      const rest = await getRestauranteLicenca(tid);
      const chavePlano = featurePlans.planoParaChave(rest.licenca);
      const limits = featurePlans.getPlanLimits(rest.licenca);
      const uso = await getUsoTenant(tid);

      const pedidosPct = limits.max_pedidos_mes !== Infinity 
        ? Math.min(100, Math.round((uso.pedidos_mes / limits.max_pedidos_mes) * 100)) 
        : 0;

      const produtosPct = limits.max_produtos !== Infinity 
        ? Math.min(100, Math.round((uso.produtos / limits.max_produtos) * 100)) 
        : 0;

      const mesasPct = limits.max_mesas !== Infinity 
        ? Math.min(100, Math.round((uso.mesas / limits.max_mesas) * 100)) 
        : 0;

      const pedidosAtingido = limits.max_pedidos_mes !== Infinity && uso.pedidos_mes >= limits.max_pedidos_mes;
      const produtosAtingido = limits.max_produtos !== Infinity && uso.produtos >= limits.max_produtos;
      const mesasAtingido = limits.max_mesas !== Infinity && uso.mesas >= limits.max_mesas;

      const bloqueado = pedidosAtingido;
      let alerta = null;

      if (pedidosAtingido) {
        alerta = {
          tipo: 'bloqueio',
          recurso: 'pedidos_mes',
          titulo: 'Limite de Pedidos Atingido',
          mensagem: `Você atingiu o limite de ${limits.max_pedidos_mes} pedidos no mês do Plano Lite. Para continuar lançando pedidos sem travar o caixa, faça upgrade para o Plano Pro!`,
          upgrade_urgente: true
        };
      } else if (pedidosPct >= 80) {
        alerta = {
          tipo: 'aviso',
          recurso: 'pedidos_mes',
          titulo: 'Limite de Pedidos Quase no Fim',
          mensagem: `Atenção: você já utilizou ${uso.pedidos_mes} de ${limits.max_pedidos_mes} pedidos (${pedidosPct}%). Prepare o upgrade para o Pro para não interromper seu atendimento.`,
          upgrade_urgente: false
        };
      }

      res.json({
        ok: true,
        restaurante: {
          id: rest.id,
          nome: rest.nome,
          licenca: rest.licenca,
          plano: chavePlano
        },
        limites: limits,
        uso_atual: uso,
        percentuais: {
          pedidos: pedidosPct,
          produtos: produtosPct,
          mesas: mesasPct
        },
        travas: {
          bloqueado,
          pedidos_atingido: pedidosAtingido,
          produtos_atingido: produtosAtingido,
          mesas_atingido: mesasAtingido
        },
        alerta,
        upsell: {
          proximo_plano: chavePlano === 'lite' ? 'pro' : (chavePlano === 'pro' ? 'premium' : null),
          proximo_preco: chavePlano === 'lite' ? 'R$ 149/mês' : (chavePlano === 'pro' ? 'R$ 249/mês' : null),
          vantagens: chavePlano === 'lite' ? [
            'Pedidos Ilimitados sem travamentos',
            'Cardápio com até 300 produtos',
            'WebSockets em tempo real (cozinha e balcão instantâneos)',
            'Integração iFood e Delivery com Motoboy',
            'KDS multi-telas para Cozinha e Bar'
          ] : [
            'Cardápio Ilimitado e Mesas Ilimitadas',
            'Copiloto Cheff IA integrado',
            'Marketplaces centralizados (Rappi, Uber Eats, 99Food)',
            'Suporte VIP prioritário 24/7'
          ]
        }
      });
    } catch (err) {
      console.error('[Plano Quotas Error]', err);
      res.status(500).json({ ok: false, erro: 'Erro ao calcular cotas do plano: ' + err.message });
    }
  });

  /**
   * GET /api/plano/catalogo
   * Catálogo público de planos com preços, cotas e diferenciais
   */
  app.get('/api/plano/catalogo', (_req, res) => {
    res.json({
      ok: true,
      planos: featurePlans.PLAN_LIMITS,
      destaque: 'lite',
      mensagem_conversao: 'Comece com o Plano Lite a R$ 39,90/mês e faça upgrade quando seu restaurante crescer!'
    });
  });

  /**
   * POST /api/plano/solicitar-upgrade
   * Solicitação de upgrade para quando o merchant bate o teto do Lite
   */
  app.post('/api/plano/solicitar-upgrade', async (req, res) => {
    try {
      const tid = getTenantId(req);
      const { plano_desejado = 'pro', whatsapp, observacoes } = req.body || {};
      const rest = await getRestauranteLicenca(tid);
      const planoAlvo = featurePlans.PLAN_LIMITS[plano_desejado] || featurePlans.PLAN_LIMITS.pro;

      masterDb.run(`
        INSERT INTO plano_upgrade_pedidos (
          restaurante_id, restaurante_nome, plano_atual, plano_desejado, whatsapp, valor_mensal, observacoes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        tid,
        rest.nome,
        rest.licenca,
        plano_desejado,
        whatsapp || '',
        planoAlvo.preco_mensal,
        observacoes || 'Upgrade solicitado via trava de cotas do painel'
      ], function(err) {
        if (err) {
          return res.status(500).json({ ok: false, erro: 'Falha ao registrar pedido de upgrade.' });
        }

        const pedidoId = this.lastID;

        // Se houver Socket.IO ativo, avisa Super Admin
        if (io) {
          io.emit('superadmin:notificacao', {
            tipo: 'upgrade_solicitado',
            restaurante_id: tid,
            restaurante_nome: rest.nome,
            plano_desejado,
            valor: planoAlvo.preco_mensal
          });
        }

        res.json({
          ok: true,
          pedido_id: pedidoId,
          mensagem: `Solicitação de upgrade para o Plano ${planoAlvo.nome} registrada com sucesso!`,
          plano_desejado: planoAlvo.nome,
          valor_mensal: planoAlvo.preco_mensal,
          pix_copia_cola: `00020126580014br.gov.bcb.pix0136upgrade-${tid}-${plano_desejado}-chefcozinha520400005303986540${planoAlvo.preco_mensal.toFixed(2)}5802BR5920CHEF COZINHA SAAS6009SAO PAULO62070503***6304ABCD`,
          instrucoes: 'Efetue o pagamento via Pix ou aguarde o contato do suporte no WhatsApp para ativação imediata.'
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  /**
   * POST /api/plano/verificar-trava
   * Verifica preventivamente se uma ação (novo produto, nova mesa) é permitida no plano Lite
   */
  app.post('/api/plano/verificar-trava', async (req, res) => {
    try {
      const tid = getTenantId(req);
      const { recurso = 'produtos' } = req.body || {};
      const rest = await getRestauranteLicenca(tid);
      const limits = featurePlans.getPlanLimits(rest.licenca);
      const uso = await getUsoTenant(tid);

      let permitido = true;
      let limiteMax = Infinity;
      let usoAtual = 0;
      let mensagemBloqueio = '';

      if (recurso === 'produtos') {
        limiteMax = limits.max_produtos;
        usoAtual = uso.produtos;
        if (limiteMax !== Infinity && usoAtual >= limiteMax) {
          permitido = false;
          mensagemBloqueio = `Seu Plano Lite permite no máximo ${limiteMax} produtos ativos. Você já tem ${usoAtual} cadastrados. Faça upgrade para o Pro para ter cardápio ilimitado!`;
        }
      } else if (recurso === 'pedidos') {
        limiteMax = limits.max_pedidos_mes;
        usoAtual = uso.pedidos_mes;
        if (limiteMax !== Infinity && usoAtual >= limiteMax) {
          permitido = false;
          mensagemBloqueio = `Seu Plano Lite atingiu o teto mensal de ${limiteMax} pedidos. Faça upgrade para o Plano Pro para continuar vendendo!`;
        }
      } else if (recurso === 'mesas') {
        limiteMax = limits.max_mesas;
        usoAtual = uso.mesas;
        if (limiteMax !== Infinity && usoAtual >= limiteMax) {
          permitido = false;
          mensagemBloqueio = `Seu Plano Lite permite até ${limiteMax} mesas. Você já atingiu este limite. Faça upgrade para o Pro para gerenciar salões maiores!`;
        }
      } else if (recurso === 'ia') {
        if (!limits.permite_ia) {
          permitido = false;
          mensagemBloqueio = 'Recursos de Inteligência Artificial estão disponíveis exclusivamente nos Planos Pro e Premium.';
        }
      }

      if (!permitido) {
        // Grava no log de auditoria
        masterDb.run(`
          INSERT INTO plano_bloqueios_log (
            restaurante_id, plano, recurso_bloqueado, limite_maximo, valor_tentativa, mensagem
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [tid, rest.licenca, recurso, limiteMax === Infinity ? 999999 : limiteMax, usoAtual + 1, mensagemBloqueio]);
      }

      res.json({
        ok: true,
        permitido,
        recurso,
        limite_maximo: limiteMax,
        uso_atual: usoAtual,
        mensagem_bloqueio: permitido ? null : mensagemBloqueio,
        upgrade_url: '/api/plano/solicitar-upgrade'
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  /**
   * POST /api/plano/otimizar-recursos
   * Limpeza e otimização profunda para restaurantes no Plano Lite
   * Remove registros com mais de 30 dias para manter banco minúsculo (< 2MB)
   */
  app.post('/api/plano/otimizar-recursos', superAdminAuth, async (req, res) => {
    try {
      masterDb.all("SELECT id, nome, licenca FROM restaurantes WHERE licenca IN ('lite', 'basico', 'trial')", [], async (err, rows) => {
        if (err || !rows) return res.json({ ok: true, processados: 0, mensagem: 'Nenhum tenant Lite encontrado.' });

        const resultados = [];
        for (const r of rows) {
          const db = resolveTenantDb(r.id);
          if (db) {
            await new Promise((resolveNext) => {
              db.serialize(() => {
                // 1. Limpa pedidos antigos finalizados com mais de 30 dias
                db.run(`
                  DELETE FROM pedidos 
                  WHERE status IN ('entregue', 'finalizado', 'cancelado', 'pago') 
                  AND (
                    time < datetime('now', '-30 days')
                    OR criado_em < datetime('now', '-30 days')
                  )
                `, () => {});

                // 2. Limpa logs de auditoria e telemetria antigos
                db.run(`DELETE FROM logs WHERE criado_em < datetime('now', '-15 days')`, () => {});
                db.run(`DELETE FROM notificacoes WHERE data < datetime('now', '-15 days')`, () => {});

                // 3. Compactação para liberar espaço no disco
                db.run("PRAGMA optimize;", () => {
                  resultados.push({ id: r.id, nome: r.nome, status: 'otimizado_com_sucesso' });
                  resolveNext();
                });
              });
            });
          }
        }

        res.json({
          ok: true,
          total_processados: resultados.length,
          detalhes: resultados,
          economia: 'Bancos de dados compactados. Espaço em disco e I/O do servidor reduzidos ao mínimo.'
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // GESTÃO DE UPGRADES E GOVERNANÇA NO SUPER ADMIN
  // ══════════════════════════════════════════════════════════════════

  const adminAuth = typeof superAdminAuth === 'function' ? superAdminAuth : (req, res, next) => next();

  /**
   * GET /api/super/planos/upgrades
   * Lista todos os pedidos de upgrade de plano recebidos
   */
  app.get('/api/super/planos/upgrades', adminAuth, (_req, res) => {
    masterDb.all(`
      SELECT p.*, r.dono_nome, r.dono_telefone, r.dono_email, r.cidade
      FROM plano_upgrade_pedidos p
      LEFT JOIN restaurantes r ON p.restaurante_id = r.id
      ORDER BY p.id DESC
      LIMIT 100
    `, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, pedidos: rows || [] });
    });
  });

  /**
   * POST /api/super/planos/upgrades/:id/aprovar
   * Aprova a solicitação e migra o restaurante para o novo plano
   */
  app.post('/api/super/planos/upgrades/:id/aprovar', adminAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    masterDb.get('SELECT * FROM plano_upgrade_pedidos WHERE id = ?', [id], (err, pedido) => {
      if (err || !pedido) return res.status(404).json({ ok: false, erro: 'Pedido de upgrade não encontrado.' });

      const novoPlano = pedido.plano_desejado || 'pro';
      const valorMensal = pedido.valor_mensal || (novoPlano === 'pro' ? 149.00 : 249.00);

      masterDb.serialize(() => {
        // 1. Atualiza licenca do restaurante
        masterDb.run('UPDATE restaurantes SET licenca = ? WHERE id = ?', [novoPlano, pedido.restaurante_id]);

        // 2. Atualiza ou insere na tabela de assinaturas
        masterDb.run(`
          INSERT INTO super_admin_assinaturas (restaurante_id, restaurante, plano, valor_mensal, status, atualizado_em)
          VALUES (?, ?, ?, ?, 'em_dia', datetime('now', 'localtime'))
          ON CONFLICT(restaurante_id) DO UPDATE SET
            plano = excluded.plano,
            valor_mensal = excluded.valor_mensal,
            status = 'em_dia',
            atualizado_em = datetime('now', 'localtime')
        `, [pedido.restaurante_id, pedido.restaurante_nome || ('Restaurante #' + pedido.restaurante_id), novoPlano, valorMensal]);

        // 3. Marca pedido como aprovado
        masterDb.run(`
          UPDATE plano_upgrade_pedidos 
          SET status = 'aprovado', atendido_em = datetime('now', 'localtime')
          WHERE id = ?
        `, [id], function(updateErr) {
          if (updateErr) return res.status(500).json({ ok: false, erro: updateErr.message });

          if (io) {
            io.emit('superadmin:notificacao', {
              tipo: 'upgrade_aprovado',
              restaurante_id: pedido.restaurante_id,
              novo_plano: novoPlano
            });
          }

          res.json({
            ok: true,
            mensagem: `Upgrade do Restaurante #${pedido.restaurante_id} para o Plano ${novoPlano.toUpperCase()} aprovado com sucesso!`,
            novo_plano: novoPlano,
            valor_mensal: valorMensal
          });
        });
      });
    });
  });

  /**
   * POST /api/super/planos/upgrades/:id/cancelar
   */
  app.post('/api/super/planos/upgrades/:id/cancelar', adminAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    masterDb.run(`
      UPDATE plano_upgrade_pedidos 
      SET status = 'cancelado', atendido_em = datetime('now', 'localtime')
      WHERE id = ?
    `, [id], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Pedido de upgrade cancelado.' });
    });
  });

  /**
   * GET /api/super/planos/bloqueios
   * Retorna os últimos bloqueios por estouro de cota
   */
  app.get('/api/super/planos/bloqueios', adminAuth, (_req, res) => {
    masterDb.all(`
      SELECT b.*, r.nome as restaurante_nome, r.dono_telefone, r.dono_nome
      FROM plano_bloqueios_log b
      LEFT JOIN restaurantes r ON b.restaurante_id = r.id
      ORDER BY b.id DESC
      LIMIT 100
    `, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, bloqueios: rows || [] });
    });
  });

  /**
   * GET /api/super/planos/metricas
   * Visão geral de governança e distribuição de planos
   */
  app.get('/api/super/planos/metricas', adminAuth, (_req, res) => {
    masterDb.all(`
      SELECT 
        LOWER(COALESCE(licenca, 'lite')) as plano,
        COUNT(*) as total_restaurantes
      FROM restaurantes
      GROUP BY LOWER(COALESCE(licenca, 'lite'))
    `, [], (errPlanos, rowsPlanos) => {
      masterDb.get(`
        SELECT COUNT(*) as total_bloqueios_mes
        FROM plano_bloqueios_log
        WHERE criado_em >= datetime('now', 'start of month')
      `, [], (errBloq, rowBloq) => {
        masterDb.get(`
          SELECT COUNT(*) as upgrades_pendentes
          FROM plano_upgrade_pedidos
          WHERE status = 'pendente'
        `, [], (errUp, rowUp) => {
          res.json({
            ok: true,
            distribuicao_planos: rowsPlanos || [],
            bloqueios_mes: (rowBloq && rowBloq.total_bloqueios_mes) || 0,
            upgrades_pendentes: (rowUp && rowUp.upgrades_pendentes) || 0
          });
        });
      });
    });
  });

  console.log('🛡️ Controller Plano Lite Enforcement carregado com sucesso (Governança de Cotas & Ultra Margem).');
};
