/**
 * controllers/super-admin-financeiro.js
 * Módulo Financeiro Master do Super-Admin
 * 
 * Funcionalidades:
 * 1. Motor de Custódia & Escrow (15 Dias):
 *    - Pagamentos de tarefas/diárias aprovados imediatamente na origem.
 *    - Retenção em custódia por 15 dias (configurável) para garantia contra erros operacionais.
 *    - Liberação automática após o período condicionado à AUSÊNCIA de contestações ou erros ativos.
 *    - Congelamento imediato se houver contestação aberta por erro operacional.
 *    - Resolução de disputa (liberar, estornar ao restaurante ou cancelar).
 * 2. Controle de Assinaturas de Tenants:
 *    - Gestão central de planos (Starter, Profissional, Enterprise, Franquia).
 *    - Status de pagamento (Em dia, Pendente, Vencida, Trial, Cancelada).
 *    - Alerta de inadimplência e bloqueio programado.
 * 3. Central de Contratações & Repasses de Verba:
 *    - Visão consolidada de todas as escalas de freelancers e contratações de vagas.
 *    - Retenção da taxa da plataforma (take-rate) e valor líquido do talento.
 * 4. Configuração de Gateways de Pagamento:
 *    - Suporte nativo a Asaas e Mercado Pago (Produção & Sandbox).
 *    - Teste de conexão em tempo real.
 *    - Configuração de dias de custódia padrão (15 dias), taxas e chaves de API.
 */
'use strict';

const https = require('https');
const http = require('http');

module.exports = function(app, masterDb, sqlite3, options) {
  const superAdminAuth = (options && options.superAdminAuth) || ((_req, res, next) => {
    if (typeof next === 'function') return next();
    res.status(401).json({ ok: false, erro: 'Acesso não autorizado ao Super Admin.' });
  });

  const { io } = options || {};

  // ═════════════════════════════════════════════════════════════════════════
  // 1. INICIALIZAÇÃO DE TABELAS NO MASTER.SQLITE
  // ═════════════════════════════════════════════════════════════════════════
  masterDb.serialize(() => {
    // Tabela de Custódia e Repasses de Verba
    masterDb.run(`CREATE TABLE IF NOT EXISTS super_admin_custodia_repasses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurante_id INTEGER NOT NULL,
      restaurante_nome TEXT,
      origem_tipo TEXT NOT NULL DEFAULT 'escala_freelancer',
      origem_id INTEGER,
      descricao TEXT NOT NULL,
      beneficiario_tipo TEXT NOT NULL DEFAULT 'freelancer',
      beneficiario_id INTEGER,
      beneficiario_nome TEXT NOT NULL,
      beneficiario_chave_pix TEXT,
      beneficiario_tipo_chave TEXT DEFAULT 'aleatoria',
      valor_bruto REAL NOT NULL,
      taxa_plataforma REAL NOT NULL DEFAULT 0.0,
      valor_liquido REAL NOT NULL,
      gateway TEXT DEFAULT 'asaas',
      gateway_transacao_id TEXT,
      status_aprovacao TEXT DEFAULT 'aprovado_imediato',
      status TEXT DEFAULT 'em_custodia',
      dias_custodia INTEGER DEFAULT 15,
      data_aprovacao DATETIME DEFAULT (datetime('now', 'localtime')),
      data_liberacao_prevista DATETIME,
      data_liberado DATETIME,
      data_contestacao DATETIME,
      motivo_contestacao TEXT,
      contestacao_resolvida_em DATETIME,
      resolucao_contestacao TEXT,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
    )`);

    // Tabela de Controle de Assinaturas de Restaurantes (Tenants)
    masterDb.run(`CREATE TABLE IF NOT EXISTS super_admin_assinaturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurante_id INTEGER NOT NULL UNIQUE,
      restaurante_nome TEXT,
      plano TEXT DEFAULT 'Profissional',
      valor_mensal REAL DEFAULT 149.0,
      status TEXT DEFAULT 'em_dia',
      forma_pagamento TEXT DEFAULT 'PIX',
      gateway TEXT DEFAULT 'asaas',
      gateway_customer_id TEXT,
      gateway_subscription_id TEXT,
      data_inicio DATETIME DEFAULT (datetime('now', 'localtime')),
      proximo_vencimento DATE,
      ultimo_pagamento DATE,
      dias_trial_restantes INTEGER DEFAULT 14,
      bloquear_inadimplente INTEGER DEFAULT 0,
      observacoes TEXT,
      atualizado_em DATETIME DEFAULT (datetime('now', 'localtime'))
    )`);

    // Tabela de Logs de Repasse e Auditoria Financeira
    masterDb.run(`CREATE TABLE IF NOT EXISTS super_admin_financeiro_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      custodia_id INTEGER,
      restaurante_id INTEGER,
      acao TEXT NOT NULL,
      detalhes TEXT,
      executado_por TEXT DEFAULT 'sistema',
      criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
    )`);

    // Sincronizar restaurantes existentes na tabela de assinaturas se ainda não estiverem
    masterDb.all(`SELECT id, nome, validade_licenca FROM restaurantes`, [], (err, rests) => {
      if (!err && Array.isArray(rests)) {
        rests.forEach(r => {
          masterDb.run(
            `INSERT OR IGNORE INTO super_admin_assinaturas (
              restaurante_id, restaurante_nome, plano, valor_mensal, status, proximo_vencimento
            ) VALUES (?, ?, 'Profissional', 149.00, 'em_dia', date('now', '+30 days'))`,
            [r.id, r.nome || `Restaurante #${r.id}`]
          );
        });
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. CONFIGURAÇÕES GLOBAIS DE GATEWAYS & CUSTÓDIA
  // ═════════════════════════════════════════════════════════════════════════
  const CONFIG_KEY = 'financeiro_master_config';

  const DEFAULTS_CONFIG = {
    dias_custodia_padrao: 15,
    auto_liberar_maduros: true,
    taxa_plataforma_percentual: 10.0,
    taxa_plataforma_fixa: 0.0,
    gateway_padrao: 'asaas',
    asaas_ativo: true,
    asaas_sandbox: true,
    asaas_api_key: process.env.ASAAS_API_KEY || '',
    asaas_webhook_token: '',
    mp_ativo: false,
    mp_sandbox: true,
    mp_access_token: '',
    mp_public_key: '',
    mp_webhook_secret: '',
    bloqueio_automatico_contestacao: true
  };

  function obterConfigFinanceira(cb) {
    masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = ?`, [CONFIG_KEY], (err, row) => {
      if (err || !row || !row.valor) {
        // Tenta herdar de site_gateways caso exista
        masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = 'site_gateways'`, [], (errGw, rowGw) => {
          let merged = Object.assign({}, DEFAULTS_CONFIG);
          if (!errGw && rowGw && rowGw.valor) {
            try {
              const gw = JSON.parse(rowGw.valor);
              if (gw.asaas_api_key) merged.asaas_api_key = gw.asaas_api_key;
              if (gw.asaas_sandbox !== undefined) merged.asaas_sandbox = !!gw.asaas_sandbox;
              if (gw.asaas_ativo !== undefined) merged.asaas_ativo = !!gw.asaas_ativo;
              if (gw.mp_access_token) merged.mp_access_token = gw.mp_access_token;
              if (gw.mp_public_key) merged.mp_public_key = gw.mp_public_key;
              if (gw.mp_ativo !== undefined) merged.mp_ativo = !!gw.mp_ativo;
              if (gw.gateway_padrao) merged.gateway_padrao = gw.gateway_padrao;
            } catch (e) {}
          }
          return cb(merged);
        });
        return;
      }

      try {
        const parsed = JSON.parse(row.valor);
        return cb(Object.assign({}, DEFAULTS_CONFIG, parsed));
      } catch (e) {
        return cb(Object.assign({}, DEFAULTS_CONFIG));
      }
    });
  }

  function salvarConfigFinanceira(novaConfig, cb) {
    const jsonStr = JSON.stringify(novaConfig);
    masterDb.run(
      `INSERT INTO configuracoes_global (chave, valor) VALUES (?, ?)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
      [CONFIG_KEY, jsonStr],
      (err) => {
        // Também reflete em site_gateways para retrocompatibilidade
        const siteGw = {
          asaas_api_key: novaConfig.asaas_api_key || '',
          asaas_tipo_cobranca: 'PIX',
          asaas_sandbox: !!novaConfig.asaas_sandbox,
          asaas_ativo: !!novaConfig.asaas_ativo,
          mp_access_token: novaConfig.mp_access_token || '',
          mp_public_key: novaConfig.mp_public_key || '',
          mp_ativo: !!novaConfig.mp_ativo,
          gateway_padrao: novaConfig.gateway_padrao || 'asaas'
        };
        masterDb.run(
          `INSERT INTO configuracoes_global (chave, valor) VALUES ('site_gateways', ?)
           ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
          [JSON.stringify(siteGw)],
          () => {}
        );
        cb(err);
      }
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // 3. MOTOR DE LIBERAÇÃO DE CUSTÓDIA
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Processa itens maduros cuja custódia já expirou (data_liberacao_prevista <= NOW)
   * e que NÃO possuem contestação ativa.
   */
  function processarLiberacoesMadurasEngine(executadoPor = 'motor_automatico', callback) {
    obterConfigFinanceira((cfg) => {
      const sqlBusca = `
        SELECT * FROM super_admin_custodia_repasses
        WHERE status = 'em_custodia'
          AND (data_liberacao_prevista IS NOT NULL AND data_liberacao_prevista <= datetime('now', 'localtime'))
          AND (motivo_contestacao IS NULL OR motivo_contestacao = '' OR status != 'contestado')
        ORDER BY id ASC
      `;

      masterDb.all(sqlBusca, [], (err, itensMaduros) => {
        if (err) {
          if (callback) callback(err, { liberados: 0, erros: [err.message] });
          return;
        }

        if (!itensMaduros || itensMaduros.length === 0) {
          if (callback) callback(null, { liberados: 0, itens: [] });
          return;
        }

        let liberadosCount = 0;
        const liberadosIds = [];

        itensMaduros.forEach((item) => {
          // Atualiza para liberado
          masterDb.run(
            `UPDATE super_admin_custodia_repasses
             SET status = 'liberado',
                 data_liberado = datetime('now', 'localtime')
             WHERE id = ? AND status = 'em_custodia'`,
            [item.id],
            function(errUp) {
              if (!errUp && this.changes > 0) {
                liberadosCount++;
                liberadosIds.push(item.id);

                // Registra log de auditoria
                masterDb.run(
                  `INSERT INTO super_admin_financeiro_logs (
                    custodia_id, restaurante_id, acao, detalhes, executado_por
                  ) VALUES (?, ?, 'liberacao_custodia', ?, ?)`,
                  [
                    item.id,
                    item.restaurante_id,
                    `Repasse de R$ ${item.valor_liquido.toFixed(2)} liberado para ${item.beneficiario_nome} (${item.beneficiario_chave_pix || 'PIX'}). Período de 15 dias concluído sem contestações.`,
                    executadoPor
                  ]
                );
              }
            }
          );
        });

        setTimeout(() => {
          if (callback) {
            callback(null, {
              liberados: liberadosCount,
              itensIds: liberadosIds,
              totalProcessado: itensMaduros.length
            });
          }
        }, 150);
      });
    });
  }

  // Timer automático para checar e processar liberações a cada 30 minutos
  setInterval(() => {
    obterConfigFinanceira((cfg) => {
      if (cfg && cfg.auto_liberar_maduros) {
        processarLiberacoesMadurasEngine('cron_agendado_30min', (err, res) => {
          if (!err && res && res.liberados > 0) {
            console.log(`[Financeiro Super-Admin] Auto-liberação de custódia executada: ${res.liberados} repasse(s) liberado(s).`);
          }
        });
      }
    });
  }, 30 * 60 * 1000);

  // ═════════════════════════════════════════════════════════════════════════
  // 4. ROTAS DA API SUPER-ADMIN
  // ═════════════════════════════════════════════════════════════════════════

  // ─── GET /api/super/financeiro/metricas ───
  app.get('/api/super/financeiro/metricas', superAdminAuth, (req, res) => {
    obterConfigFinanceira((cfg) => {
      masterDb.get(
        `SELECT 
          COALESCE(SUM(CASE WHEN status = 'em_custodia' THEN valor_liquido ELSE 0 END), 0) AS total_em_custodia,
          COUNT(CASE WHEN status = 'em_custodia' THEN 1 END) AS qtd_em_custodia,
          COALESCE(SUM(CASE WHEN status = 'liberado' AND strftime('%Y-%m', data_liberado) = strftime('%Y-%m', 'now', 'localtime') THEN valor_liquido ELSE 0 END), 0) AS total_liberado_mes,
          COUNT(CASE WHEN status = 'liberado' AND strftime('%Y-%m', data_liberado) = strftime('%Y-%m', 'now', 'localtime') THEN 1 END) AS qtd_liberado_mes,
          COALESCE(SUM(CASE WHEN status = 'contestado' THEN valor_liquido ELSE 0 END), 0) AS total_contestado,
          COUNT(CASE WHEN status = 'contestado' THEN 1 END) AS qtd_contestado,
          COALESCE(SUM(CASE WHEN status = 'em_custodia' AND data_liberacao_prevista <= datetime('now', 'localtime') AND (motivo_contestacao IS NULL OR motivo_contestacao = '') THEN valor_liquido ELSE 0 END), 0) AS total_pronto_liberar,
          COUNT(CASE WHEN status = 'em_custodia' AND data_liberacao_prevista <= datetime('now', 'localtime') AND (motivo_contestacao IS NULL OR motivo_contestacao = '') THEN 1 END) AS qtd_pronto_liberar,
          COALESCE(SUM(taxa_plataforma), 0) AS total_taxas_arrecadadas
         FROM super_admin_custodia_repasses`,
        [],
        (errCust, kpisCustodia) => {
          if (errCust) return res.status(500).json({ ok: false, erro: errCust.message });

          // Métricas de Assinaturas
          masterDb.get(
            `SELECT
              COALESCE(SUM(CASE WHEN status = 'em_dia' THEN valor_mensal ELSE 0 END), 0) AS mrr_total,
              COUNT(CASE WHEN status = 'em_dia' THEN 1 END) AS tenants_em_dia,
              COUNT(CASE WHEN status = 'vencida' THEN 1 END) AS tenants_vencidos,
              COUNT(CASE WHEN status = 'trial' THEN 1 END) AS tenants_trial,
              COUNT(*) AS total_tenants_assinantes
             FROM super_admin_assinaturas`,
            [],
            (errAssin, kpisAssin) => {
              // Contratações do mês
              masterDb.get(
                `SELECT 
                  COUNT(*) AS total_escalas_mes,
                  COALESCE(SUM(valor_diaria), 0) AS volume_escalas_mes
                 FROM escala_freelancers
                 WHERE strftime('%Y-%m', data_turno) = strftime('%Y-%m', 'now', 'localtime')`,
                [],
                (errEsc, kpisEscalas) => {
                  res.json({
                    ok: true,
                    metricas: {
                      custodia: kpisCustodia || {},
                      assinaturas: kpisAssin || {},
                      escalas_rh: kpisEscalas || {},
                      config: {
                        dias_custodia_padrao: cfg.dias_custodia_padrao,
                        gateway_padrao: cfg.gateway_padrao,
                        auto_liberar_maduros: cfg.auto_liberar_maduros,
                        taxa_plataforma_percentual: cfg.taxa_plataforma_percentual
                      }
                    }
                  });
                }
              );
            }
          );
        }
      );
    });
  });

  // ─── GET /api/super/financeiro/custodia ───
  app.get('/api/super/financeiro/custodia', superAdminAuth, (req, res) => {
    const { status, restaurante_id, busca, apenas_maduros, limit = 100 } = req.query;

    let conditions = [];
    let params = [];

    if (status && status !== 'todos') {
      conditions.push('c.status = ?');
      params.push(status);
    }

    if (restaurante_id) {
      conditions.push('c.restaurante_id = ?');
      params.push(parseInt(restaurante_id));
    }

    if (apenas_maduros === '1' || apenas_maduros === 'true') {
      conditions.push("c.status = 'em_custodia'");
      conditions.push("c.data_liberacao_prevista <= datetime('now', 'localtime')");
      conditions.push("(c.motivo_contestacao IS NULL OR c.motivo_contestacao = '')");
    }

    if (busca) {
      conditions.push('(c.beneficiario_nome LIKE ? OR c.descricao LIKE ? OR c.beneficiario_chave_pix LIKE ? OR r.nome LIKE ?)');
      const term = `%${busca}%`;
      params.push(term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        c.*,
        r.nome AS restaurante_nome_real,
        CAST((julianday(c.data_liberacao_prevista) - julianday('now', 'localtime')) AS INTEGER) AS dias_restantes_calc,
        CASE 
          WHEN c.status = 'em_custodia' AND datetime('now', 'localtime') >= c.data_liberacao_prevista AND (c.motivo_contestacao IS NULL OR c.motivo_contestacao = '') THEN 1
          ELSE 0
        END AS pronto_para_liberar
      FROM super_admin_custodia_repasses c
      LEFT JOIN restaurantes r ON r.id = c.restaurante_id
      ${whereClause}
      ORDER BY 
        CASE WHEN c.status = 'contestado' THEN 1 WHEN c.status = 'em_custodia' THEN 2 ELSE 3 END ASC,
        c.data_liberacao_prevista ASC,
        c.id DESC
      LIMIT ?
    `;

    params.push(parseInt(limit) || 100);

    masterDb.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, itens: rows || [] });
    });
  });

  // ─── POST /api/super/financeiro/custodia (Criar Registro em Custódia) ───
  app.post('/api/super/financeiro/custodia', superAdminAuth, (req, res) => {
    obterConfigFinanceira((cfg) => {
      const {
        restaurante_id,
        origem_tipo = 'escala_freelancer',
        origem_id,
        descricao,
        beneficiario_tipo = 'freelancer',
        beneficiario_id,
        beneficiario_nome,
        beneficiario_chave_pix,
        beneficiario_tipo_chave = 'aleatoria',
        valor_bruto,
        dias_custodia = cfg.dias_custodia_padrao || 15,
        taxa_plataforma_percentual = cfg.taxa_plataforma_percentual || 0,
        gateway = cfg.gateway_padrao || 'asaas'
      } = req.body || {};

      if (!restaurante_id || !beneficiario_nome || !valor_bruto) {
        return res.status(400).json({ ok: false, erro: 'Campos obrigatórios: restaurante_id, beneficiario_nome, valor_bruto.' });
      }

      const vBruto = parseFloat(valor_bruto) || 0;
      const pctTaxa = parseFloat(taxa_plataforma_percentual) || 0;
      const vTaxa = parseFloat(((vBruto * pctTaxa) / 100).toFixed(2));
      const vLiquido = parseFloat((vBruto - vTaxa).toFixed(2));
      const diasRetencao = parseInt(dias_custodia) >= 0 ? parseInt(dias_custodia) : 15;

      masterDb.get(`SELECT nome FROM restaurantes WHERE id = ?`, [restaurante_id], (errRest, rest) => {
        const restNome = (rest && rest.nome) || `Restaurante #${restaurante_id}`;

        masterDb.run(
          `INSERT INTO super_admin_custodia_repasses (
            restaurante_id, restaurante_nome, origem_tipo, origem_id, descricao,
            beneficiario_tipo, beneficiario_id, beneficiario_nome, beneficiario_chave_pix,
            beneficiario_tipo_chave, valor_bruto, taxa_plataforma, valor_liquido,
            gateway, status_aprovacao, status, dias_custodia,
            data_aprovacao, data_liberacao_prevista
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, 'aprovado_imediato', 'em_custodia', ?,
            datetime('now', 'localtime'),
            datetime('now', 'localtime', '+' || ? || ' days')
          )`,
          [
            restaurante_id, restNome, origem_tipo, origem_id || null,
            descricao || `Repasse Tarefa / Diária - ${beneficiario_nome}`,
            beneficiario_tipo, beneficiario_id || null, beneficiario_nome,
            beneficiario_chave_pix || null, beneficiario_tipo_chave,
            vBruto, vTaxa, vLiquido, gateway, diasRetencao, diasRetencao
          ],
          function(errIns) {
            if (errIns) return res.status(500).json({ ok: false, erro: errIns.message });

            const novoId = this.lastID;

            masterDb.run(
              `INSERT INTO super_admin_financeiro_logs (custodia_id, restaurante_id, acao, detalhes, executado_por)
               VALUES (?, ?, 'criacao_custodia', ?, 'super_admin')`,
              [
                novoId,
                restaurante_id,
                `Pagamento de R$ ${vBruto.toFixed(2)} aprovado imediatamente. R$ ${vLiquido.toFixed(2)} em custódia por ${diasRetencao} dias.`
              ]
            );

            res.json({
              ok: true,
              mensagem: `Pagamento aprovado imediatamente e alocado em custódia por ${diasRetencao} dias.`,
              id: novoId,
              valor_liquido: vLiquido,
              data_liberacao_prevista: `+${diasRetencao} dias`
            });
          }
        );
      });
    });
  });

  // ─── POST /api/super/financeiro/custodia/processar-liberacoes ───
  // Dispara o motor de liberação de todas as custódias maduras
  app.post('/api/super/financeiro/custodia/processar-liberacoes', superAdminAuth, (req, res) => {
    processarLiberacoesMadurasEngine('acao_manual_super_admin', (err, resultado) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({
        ok: true,
        mensagem: resultado.liberados > 0 
          ? `Sucesso: ${resultado.liberados} repasse(s) maduro(s) liberado(s) com sucesso!` 
          : 'Nenhum repasse elegível para liberação no momento (itens em custódia ativa ou contestados).',
        resultado
      });
    });
  });

  // ─── PUT /api/super/financeiro/custodia/:id/liberar (Liberação Forçada ou Imediata) ───
  app.put('/api/super/financeiro/custodia/:id/liberar', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);

    masterDb.get(`SELECT * FROM super_admin_custodia_repasses WHERE id = ?`, [id], (err, item) => {
      if (err || !item) return res.status(404).json({ ok: false, erro: 'Registro de custódia não encontrado.' });

      if (item.status === 'contestado') {
        return res.status(400).json({
          ok: false,
          erro: 'Este repasse possui uma contestação/disputa ativa. Resolva a contestação antes de liberá-lo.'
        });
      }

      if (item.status === 'liberado') {
        return res.json({ ok: true, mensagem: 'Este repasse já se encontra liberado.', item });
      }

      masterDb.run(
        `UPDATE super_admin_custodia_repasses
         SET status = 'liberado',
             data_liberado = datetime('now', 'localtime')
         WHERE id = ?`,
        [id],
        function(errUp) {
          if (errUp) return res.status(500).json({ ok: false, erro: errUp.message });

          masterDb.run(
            `INSERT INTO super_admin_financeiro_logs (custodia_id, restaurante_id, acao, detalhes, executado_por)
             VALUES (?, ?, 'liberacao_manual_super_admin', ?, 'super_admin')`,
            [
              id,
              item.restaurante_id,
              `Liberação manual autorizada pelo Super Admin: R$ ${item.valor_liquido.toFixed(2)} transferido para ${item.beneficiario_nome}.`
            ]
          );

          res.json({
            ok: true,
            mensagem: `Repasse #${id} liberado com sucesso para ${item.beneficiario_nome}!`,
            item_id: id,
            status: 'liberado'
          });
        }
      );
    });
  });

  // ─── PUT /api/super/financeiro/custodia/:id/contestar (Abrir Contestação / Erro Operacional) ───
  app.put('/api/super/financeiro/custodia/:id/contestar', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { motivo } = req.body || {};

    if (!motivo || !motivo.trim()) {
      return res.status(400).json({ ok: false, erro: 'Informe o motivo da contestação ou erro operacional.' });
    }

    masterDb.get(`SELECT * FROM super_admin_custodia_repasses WHERE id = ?`, [id], (err, item) => {
      if (err || !item) return res.status(404).json({ ok: false, erro: 'Registro de custódia não encontrado.' });

      if (item.status === 'liberado') {
        return res.status(400).json({ ok: false, erro: 'Não é possível contestar um valor que já foi liberado e transferido.' });
      }

      masterDb.run(
        `UPDATE super_admin_custodia_repasses
         SET status = 'contestado',
             motivo_contestacao = ?,
             data_contestacao = datetime('now', 'localtime')
         WHERE id = ?`,
        [motivo.trim(), id],
        function(errUp) {
          if (errUp) return res.status(500).json({ ok: false, erro: errUp.message });

          masterDb.run(
            `INSERT INTO super_admin_financeiro_logs (custodia_id, restaurante_id, acao, detalhes, executado_por)
             VALUES (?, ?, 'abertura_contestacao', ?, 'super_admin')`,
            [
              id,
              item.restaurante_id,
              `Contestação aberta: "${motivo.trim()}". O repasse de R$ ${item.valor_liquido.toFixed(2)} foi congelado.`
            ]
          );

          res.json({
            ok: true,
            mensagem: `Contestação registrada com sucesso. O repasse #${id} foi CONGELADO e não será liberado automaticamente.`,
            status: 'contestado',
            motivo: motivo.trim()
          });
        }
      );
    });
  });

  // ─── PUT /api/super/financeiro/custodia/:id/resolver-contestacao ───
  app.put('/api/super/financeiro/custodia/:id/resolver-contestacao', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { decisao, resolucao } = req.body || {}; // decisao: 'liberar' | 'estornar' | 'cancelar'

    if (!['liberar', 'estornar', 'cancelar'].includes(decisao)) {
      return res.status(400).json({ ok: false, erro: "Decisão inválida. Escolha entre 'liberar', 'estornar' ou 'cancelar'." });
    }

    masterDb.get(`SELECT * FROM super_admin_custodia_repasses WHERE id = ?`, [id], (err, item) => {
      if (err || !item) return res.status(404).json({ ok: false, erro: 'Registro não encontrado.' });

      let novoStatus = 'liberado';
      if (decisao === 'estornar') novoStatus = 'estornado';
      if (decisao === 'cancelar') novoStatus = 'cancelado';

      masterDb.run(
        `UPDATE super_admin_custodia_repasses
         SET status = ?,
             contestacao_resolvida_em = datetime('now', 'localtime'),
             resolucao_contestacao = ?,
             data_liberado = CASE WHEN ? = 'liberado' THEN datetime('now', 'localtime') ELSE data_liberado END
         WHERE id = ?`,
        [novoStatus, resolucao || `Resolvido como ${novoStatus}`, novoStatus, id],
        function(errUp) {
          if (errUp) return res.status(500).json({ ok: false, erro: errUp.message });

          masterDb.run(
            `INSERT INTO super_admin_financeiro_logs (custodia_id, restaurante_id, acao, detalhes, executado_por)
             VALUES (?, ?, 'resolucao_contestacao', ?, 'super_admin')`,
            [
              id,
              item.restaurante_id,
              `Disputa resolvida: Decisão '${novoStatus}'. Resolução: ${resolucao || 'N/A'}`
            ]
          );

          res.json({
            ok: true,
            mensagem: `Contestação resolvida com sucesso! Status final: ${novoStatus.toUpperCase()}.`,
            novoStatus
          });
        }
      );
    });
  });

  // ─── PUT /api/super/financeiro/custodia/:id/estornar ───
  app.put('/api/super/financeiro/custodia/:id/estornar', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { motivo = 'Estorno solicitado pelo Super Admin / Restaurante' } = req.body || {};

    masterDb.get(`SELECT * FROM super_admin_custodia_repasses WHERE id = ?`, [id], (err, item) => {
      if (err || !item) return res.status(404).json({ ok: false, erro: 'Registro não encontrado.' });

      if (item.status === 'estornado') {
        return res.json({ ok: true, mensagem: 'Este registro já está estornado.' });
      }

      masterDb.run(
        `UPDATE super_admin_custodia_repasses
         SET status = 'estornado',
             resolucao_contestacao = ?
         WHERE id = ?`,
        [`Estornado: ${motivo}`, id],
        function(errUp) {
          if (errUp) return res.status(500).json({ ok: false, erro: errUp.message });

          masterDb.run(
            `INSERT INTO super_admin_financeiro_logs (custodia_id, restaurante_id, acao, detalhes, executado_por)
             VALUES (?, ?, 'estorno_recorrente', ?, 'super_admin')`,
            [id, item.restaurante_id, `Estorno de R$ ${item.valor_bruto.toFixed(2)} para o restaurante: ${motivo}`]
          );

          res.json({
            ok: true,
            mensagem: `Valor de R$ ${item.valor_bruto.toFixed(2)} estornado com sucesso ao restaurante!`,
            status: 'estornado'
          });
        }
      );
    });
  });

  // ─── GET /api/super/financeiro/assinaturas ───
  app.get('/api/super/financeiro/assinaturas', superAdminAuth, (req, res) => {
    const { status, busca } = req.query;

    let conditions = [];
    let params = [];

    if (status && status !== 'todos') {
      conditions.push('a.status = ?');
      params.push(status);
    }

    if (busca) {
      conditions.push('(a.restaurante_nome LIKE ? OR r.nome LIKE ? OR r.dono_nome LIKE ? OR r.dono_email LIKE ?)');
      const term = `%${busca}%`;
      params.push(term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        a.*,
        r.nome AS restaurante_nome_real,
        r.dono_nome,
        r.dono_email,
        r.dono_telefone,
        r.validade_licenca,
        r.ativo AS restaurante_ativo
      FROM super_admin_assinaturas a
      LEFT JOIN restaurantes r ON r.id = a.restaurante_id
      ${whereClause}
      ORDER BY 
        CASE WHEN a.status = 'vencida' THEN 1 WHEN a.status = 'pendente' THEN 2 WHEN a.status = 'em_dia' THEN 3 ELSE 4 END ASC,
        a.proximo_vencimento ASC
    `;

    masterDb.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, assinaturas: rows || [] });
    });
  });

  // ─── PUT /api/super/financeiro/assinaturas/:restauranteId ───
  app.put('/api/super/financeiro/assinaturas/:restauranteId', superAdminAuth, (req, res) => {
    const restId = parseInt(req.params.restauranteId);
    const {
      plano,
      valor_mensal,
      status,
      proximo_vencimento,
      dias_trial_restantes,
      bloquear_inadimplente,
      observacoes,
      forma_pagamento,
      gateway
    } = req.body || {};

    masterDb.get(`SELECT id, nome FROM restaurantes WHERE id = ?`, [restId], (errR, rest) => {
      if (errR || !rest) return res.status(404).json({ ok: false, erro: 'Restaurante não encontrado.' });

      const updates = [];
      const params = [];

      if (plano !== undefined) { updates.push('plano = ?'); params.push(plano); }
      if (valor_mensal !== undefined) { updates.push('valor_mensal = ?'); params.push(parseFloat(valor_mensal) || 0); }
      if (status !== undefined) { updates.push('status = ?'); params.push(status); }
      if (proximo_vencimento !== undefined) { updates.push('proximo_vencimento = ?'); params.push(proximo_vencimento); }
      if (dias_trial_restantes !== undefined) { updates.push('dias_trial_restantes = ?'); params.push(parseInt(dias_trial_restantes) || 0); }
      if (bloquear_inadimplente !== undefined) { updates.push('bloquear_inadimplente = ?'); params.push(bloquear_inadimplente ? 1 : 0); }
      if (observacoes !== undefined) { updates.push('observacoes = ?'); params.push(observacoes); }
      if (forma_pagamento !== undefined) { updates.push('forma_pagamento = ?'); params.push(forma_pagamento); }
      if (gateway !== undefined) { updates.push('gateway = ?'); params.push(gateway); }

      updates.push("atualizado_em = datetime('now', 'localtime')");

      params.push(restId);

      const sql = `
        INSERT INTO super_admin_assinaturas (
          restaurante_id, restaurante_nome, plano, valor_mensal, status, proximo_vencimento
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(restaurante_id) DO UPDATE SET ${updates.join(', ')}
      `;

      masterDb.run(
        `UPDATE super_admin_assinaturas SET ${updates.join(', ')} WHERE restaurante_id = ?`,
        params,
        function(errUp) {
          if (errUp) return res.status(500).json({ ok: false, erro: errUp.message });

          if (this.changes === 0) {
            // Insere se não existia
            masterDb.run(
              `INSERT INTO super_admin_assinaturas (
                restaurante_id, restaurante_nome, plano, valor_mensal, status, proximo_vencimento, observacoes
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                restId, rest.nome, plano || 'Profissional', parseFloat(valor_mensal) || 149.0,
                status || 'em_dia', proximo_vencimento || '2026-10-26', observacoes || ''
              ],
              () => {
                res.json({ ok: true, mensagem: 'Assinatura criada e atualizada com sucesso!' });
              }
            );
            return;
          }

          res.json({ ok: true, mensagem: 'Assinatura do tenant atualizada com sucesso!' });
        }
      );
    });
  });

  // ─── GET /api/super/financeiro/contratacoes ───
  app.get('/api/super/financeiro/contratacoes', superAdminAuth, (req, res) => {
    const sql = `
      SELECT 
        e.id AS escala_id,
        e.restaurante_id,
        r.nome AS restaurante_nome,
        e.nome AS talento_nome,
        e.cargo,
        e.data_turno,
        e.periodo,
        e.valor_diaria,
        e.status AS status_escala,
        e.forma_pagamento,
        e.chave_pix,
        e.pago_em,
        c.id AS custodia_id,
        c.status AS custodia_status,
        c.dias_custodia,
        c.data_liberacao_prevista,
        c.data_liberado,
        c.motivo_contestacao
      FROM escala_freelancers e
      LEFT JOIN restaurantes r ON r.id = e.restaurante_id
      LEFT JOIN super_admin_custodia_repasses c ON c.origem_tipo = 'escala_freelancer' AND c.origem_id = e.id
      ORDER BY e.data_turno DESC, e.id DESC
      LIMIT 150
    `;

    masterDb.all(sql, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, contratacoes: rows || [] });
    });
  });

  // ─── GET /api/super/financeiro/gateways ───
  app.get('/api/super/financeiro/gateways', superAdminAuth, (req, res) => {
    obterConfigFinanceira((cfg) => {
      // Mascara parte das chaves para segurança na visualização
      const masked = Object.assign({}, cfg);
      if (masked.asaas_api_key && masked.asaas_api_key.length > 12) {
        masked.asaas_api_key_preview = masked.asaas_api_key.slice(0, 8) + '...' + masked.asaas_api_key.slice(-4);
      }
      if (masked.mp_access_token && masked.mp_access_token.length > 12) {
        masked.mp_access_token_preview = masked.mp_access_token.slice(0, 8) + '...' + masked.mp_access_token.slice(-4);
      }
      res.json({ ok: true, config: masked });
    });
  });

  // ─── POST /api/super/financeiro/gateways ───
  app.post('/api/super/financeiro/gateways', superAdminAuth, (req, res) => {
    obterConfigFinanceira((atual) => {
      const b = req.body || {};
      const merged = {
        dias_custodia_padrao: b.dias_custodia_padrao !== undefined ? Math.max(0, parseInt(b.dias_custodia_padrao) || 15) : atual.dias_custodia_padrao,
        auto_liberar_maduros: b.auto_liberar_maduros !== undefined ? !!b.auto_liberar_maduros : atual.auto_liberar_maduros,
        taxa_plataforma_percentual: b.taxa_plataforma_percentual !== undefined ? Math.max(0, parseFloat(b.taxa_plataforma_percentual) || 0) : atual.taxa_plataforma_percentual,
        taxa_plataforma_fixa: b.taxa_plataforma_fixa !== undefined ? Math.max(0, parseFloat(b.taxa_plataforma_fixa) || 0) : atual.taxa_plataforma_fixa,
        gateway_padrao: b.gateway_padrao || atual.gateway_padrao || 'asaas',
        asaas_ativo: b.asaas_ativo !== undefined ? !!b.asaas_ativo : atual.asaas_ativo,
        asaas_sandbox: b.asaas_sandbox !== undefined ? !!b.asaas_sandbox : atual.asaas_sandbox,
        asaas_api_key: b.asaas_api_key !== undefined ? b.asaas_api_key.trim() : atual.asaas_api_key,
        asaas_webhook_token: b.asaas_webhook_token !== undefined ? b.asaas_webhook_token.trim() : atual.asaas_webhook_token,
        mp_ativo: b.mp_ativo !== undefined ? !!b.mp_ativo : atual.mp_ativo,
        mp_sandbox: b.mp_sandbox !== undefined ? !!b.mp_sandbox : atual.mp_sandbox,
        mp_access_token: b.mp_access_token !== undefined ? b.mp_access_token.trim() : atual.mp_access_token,
        mp_public_key: b.mp_public_key !== undefined ? b.mp_public_key.trim() : atual.mp_public_key,
        mp_webhook_secret: b.mp_webhook_secret !== undefined ? b.mp_webhook_secret.trim() : atual.mp_webhook_secret,
        bloqueio_automatico_contestacao: b.bloqueio_automatico_contestacao !== undefined ? !!b.bloqueio_automatico_contestacao : atual.bloqueio_automatico_contestacao
      };

      salvarConfigFinanceira(merged, (errSalvar) => {
        if (errSalvar) return res.status(500).json({ ok: false, erro: errSalvar.message });
        res.json({
          ok: true,
          mensagem: 'Configurações financeiras e gateways atualizadas com sucesso!',
          config: merged
        });
      });
    });
  });

  // ─── POST /api/super/financeiro/gateways/testar (Testar Conexão Live com Asaas / Mercado Pago) ───
  app.post('/api/super/financeiro/gateways/testar', superAdminAuth, (req, res) => {
    const { gateway } = req.body || {};

    obterConfigFinanceira((cfg) => {
      if (gateway === 'mercadopago') {
        const token = (req.body.mp_access_token || cfg.mp_access_token || '').trim();
        if (!token) {
          return res.json({ ok: false, erro: 'Access Token do Mercado Pago não informado.' });
        }

        const options = {
          hostname: 'api.mercadopago.com',
          path: '/v1/users/me',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'ChefCozinha-SuperAdmin/1.0'
          },
          timeout: 6000
        };

        const reqHttp = https.request(options, (resp) => {
          let data = '';
          resp.on('data', chunk => { data += chunk; });
          resp.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (resp.statusCode === 200 && parsed.id) {
                return res.json({
                  ok: true,
                  gateway: 'mercadopago',
                  mensagem: `Conexão bem-sucedida! Usuário Mercado Pago: ${parsed.nickname || parsed.email || parsed.id} (${parsed.site_id || 'MLB'})`,
                  detalhes: { id: parsed.id, nickname: parsed.nickname, email: parsed.email }
                });
              }
              return res.json({
                ok: false,
                gateway: 'mercadopago',
                erro: parsed.message || `Erro HTTP ${resp.statusCode}: Token inválido ou não autorizado.`
              });
            } catch (e) {
              return res.json({ ok: false, gateway: 'mercadopago', erro: `Resposta inválida do Mercado Pago: ${data.slice(0, 100)}` });
            }
          });
        });

        reqHttp.on('error', (e) => res.json({ ok: false, gateway: 'mercadopago', erro: `Erro de rede: ${e.message}` }));
        reqHttp.on('timeout', () => { reqHttp.destroy(); res.json({ ok: false, gateway: 'mercadopago', erro: 'Timeout ao conectar na API do Mercado Pago.' }); });
        reqHttp.end();
        return;
      }

      // Default: Asaas
      const apiKey = (req.body.asaas_api_key || cfg.asaas_api_key || '').trim();
      const isSandbox = req.body.asaas_sandbox !== undefined ? !!req.body.asaas_sandbox : !!cfg.asaas_sandbox;

      if (!apiKey) {
        return res.json({ ok: false, erro: 'API Key do Asaas não informada.' });
      }

      const host = isSandbox ? 'sandbox.asaas.com' : 'api.asaas.com';

      const options = {
        hostname: host,
        path: '/api/v3/finance/balance',
        method: 'GET',
        headers: {
          'access_token': apiKey,
          'User-Agent': 'ChefCozinha-SuperAdmin/1.0'
        },
        timeout: 6000
      };

      const reqHttp = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => { data += chunk; });
        resp.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (resp.statusCode === 200) {
              return res.json({
                ok: true,
                gateway: 'asaas',
                ambiente: isSandbox ? 'Sandbox (Testes)' : 'Produção',
                mensagem: `Conexão bem-sucedida com Asaas! Saldo em conta: R$ ${(parsed.balance || 0).toFixed(2)}`,
                detalhes: parsed
              });
            }
            const errMsg = (parsed.errors && parsed.errors[0] && parsed.errors[0].description) || parsed.message || `HTTP ${resp.statusCode}: Chave inválida.`;
            return res.json({ ok: false, gateway: 'asaas', erro: errMsg });
          } catch (e) {
            return res.json({ ok: false, gateway: 'asaas', erro: `Resposta inválida do Asaas (${host}): ${data.slice(0, 100)}` });
          }
        });
      });

      reqHttp.on('error', (e) => res.json({ ok: false, gateway: 'asaas', erro: `Erro de rede ao conectar no Asaas: ${e.message}` }));
      reqHttp.on('timeout', () => { reqHttp.destroy(); res.json({ ok: false, gateway: 'asaas', erro: 'Timeout ao conectar na API do Asaas.' }); });
      reqHttp.end();
    });
  });

  // Retorna métodos utilitários exportados para reuso interno em outros controllers
  return {
    obterConfigFinanceira,
    salvarConfigFinanceira,
    processarLiberacoesMadurasEngine
  };
};
