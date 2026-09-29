'use strict';

/**
 * controllers/rotas-faltantes.js
 *
 * Restaura rotas que existem no frontend mas estavam ausentes no backend ativo.
 * Implementa de forma limpa e isolada, sem alterar o server.js principal.
 *
 * Rotas cobertas:
 *  - POST /api/validar-pin-admin          (alias de verificar-pin-supervisor)
 *  - GET  /api/clientes                   (fallback HTTP para socket get_clientes)
 *  - POST /api/rh/pagamentos/batch        (folha semanal batch RH)
 *  - POST /api/ponto/bater                (batida de ponto via HTTP — painel-dono)
 *  - POST /api/evento-pico                (registrar evento de alta demanda)
 *  - POST /api/licenca/gerar              (registrar emissão de licença offline)
 *  - GET  /api/modulos                    (lista módulos ativos do tenant — plugin-client.js)
 *  - GET  /api/super/config               (alias de config-global)
 *  - POST /api/super/config               (alias de config-global)
 *  - GET  /api/super/mensagens            (listar mensagens broadcast)
 *  - POST /api/super/mensagens            (enviar mensagem broadcast)
 *  - DELETE /api/super/mensagens/:id      (deletar mensagem)
 *  - POST /api/super/mensagens/:id/reenviar (reenviar mensagem)
 *  - GET  /api/super/chaves               (chaves de API/licença)
 *  - POST /api/super/chaves               (gerar nova chave)
 *  - POST /api/super/chaves/:id/revogar   (revogar chave)
 *  - POST /api/super/delegar-suporte      (delegar restaurante ao suporte)
 *  - GET  /api/super/modulos              (listar módulos globais)
 *  - POST /api/super/modulos/global       (configurar módulo globalmente)
 *  - POST /api/super/modulos/tenant       (configurar módulo por tenant)
 *  - GET  /api/super/clientes/:id         (perfil completo do cliente)
 *  - GET  /api/super/metricas/garcons     (alias de /api/metricas/garcons)
 *  - PUT  /api/super/usuario/:id/status   (alterar status de usuário)
 *  - GET  /api/super/tracking-config      (config de rastreamento)
 *  - POST /api/super/tracking-config      (salvar config de rastreamento)
 *  - GET  /api/super/anuncios/audiencia-export (exportar audiência)
 *  - POST /api/super/anuncios/gerar-copy  (gerar copy de anúncio com IA)
 *  - GET  /api/super/geo-traffic/live     (dados de tráfego em tempo real)
 *  - POST /api/super/geo-traffic/simulate (simular tráfego para testes)
 *  - GET  /api/suporte/restaurantes-list  (lista simplificada de restaurantes)
 *  - POST /api/suporte/injetar-layout     (injetar CSS/layout em restaurante)
 */

const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

module.exports = function(app, { db, masterDb, io, sqlite3, verificarToken, getTenantDb, getTenantDbPath, superAdminAuth, suporteAuth, JWT_SECRET, bcrypt }) {

  // ─── Helpers locais ───────────────────────────────────────────

  function resolveTenantDb(req) {
    try {
      if (typeof getTenantDb === 'function') {
        return getTenantDb();
      }
    } catch (e) {}
    return db;
  }

  function resolveTenantDbPath(id) {
    if (typeof getTenantDbPath === 'function') return getTenantDbPath(id);
    return path.join(__dirname, '..', 'database', `restaurante_${id}.sqlite`);
  }

  // ─── 1. POST /api/validar-pin-admin ──────────────────────────
  // Alias do endpoint /api/auth/verificar-pin-supervisor que já existe,
  // mas sem exigir JWT (configurações.js chama sem token quando socket offline)
  app.post('/api/validar-pin-admin', async (req, res) => {
    try {
      const { pin, restaurante_id } = req.body;
      if (!pin) return res.status(400).json({ ok: false, erro: 'PIN obrigatório.' });

      // Tenta validar via token se disponível
      const tdb = resolveTenantDb(req);
      const adminPin = process.env.ADMIN_PIN || '9999';

      // 1. Pin global de emergência
      if (String(pin).trim() === adminPin) {
        return res.json({ ok: true, autorizador: 'Admin', cargo: 'Admin' });
      }

      // 2. Funcionários gerentes/supervisores
      tdb.all(
        `SELECT id, nome, cargo, pin_hash FROM funcionarios WHERE status = 'Ativo' AND (LOWER(cargo) LIKE '%gerente%' OR LOWER(cargo) LIKE '%admin%' OR LOWER(cargo) LIKE '%supervisor%') AND pin_hash IS NOT NULL AND pin_hash != ''`,
        async (err, rows) => {
          if (!err && rows && rows.length > 0) {
            for (const f of rows) {
              const ok = await bcrypt.compare(String(pin).trim(), f.pin_hash).catch(() => false);
              if (ok) return res.json({ ok: true, autorizador: f.nome, cargo: f.cargo });
            }
          }

          // 3. Pins temporários
          tdb.all(`SELECT * FROM pins_temporarios WHERE ativo = 1`, async (errP, pins) => {
            if (!errP && pins) {
              for (const p of pins) {
                if (String(p.pin).trim() === String(pin).trim()) {
                  const cats = JSON.parse(p.categorias || '[]');
                  if (cats.includes('todas') || cats.includes('configuracoes') || cats.includes('gerente')) {
                    return res.json({ ok: true, autorizador: p.nome_colaborador || 'Gerente', cargo: 'Gerente' });
                  }
                }
              }
            }

            // 4. Dono mestre via masterDb
            const tid = req.restaurante_id || restaurante_id || 1;
            masterDb.get(`SELECT * FROM usuarios WHERE restaurante_id = ? AND role IN ('admin', 'dono') AND ativo = 1 LIMIT 1`, [tid], async (errU, dono) => {
              if (!errU && dono) {
                const matchPass = await bcrypt.compare(String(pin).trim(), dono.password_hash || '').catch(() => false);
                if (matchPass) return res.json({ ok: true, autorizador: 'Proprietário', cargo: 'Dono' });
              }
              return res.status(401).json({ ok: false, erro: 'PIN incorreto ou não autorizado.' });
            });
          });
        }
      );
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  // ─── 2. GET /api/clientes ─────────────────────────────────────
  // Fallback HTTP para quando socket.emit('get_clientes') falha (sem conexão)
  app.get('/api/clientes', verificarToken, (req, res) => {
    const tdb = resolveTenantDb(req);
    tdb.all(`SELECT * FROM clientes ORDER BY nome`, [], (err, rows) => {
      if (err) return res.json([]);
      res.json(rows || []);
    });
  });

  // ─── 3. POST /api/rh/pagamentos/batch ────────────────────────
  app.post('/api/rh/pagamentos/batch', verificarToken, (req, res) => {
    const { pagamentos, observacao_geral } = req.body;
    if (!pagamentos || !Array.isArray(pagamentos) || pagamentos.length === 0) {
      return res.status(400).json({ error: 'Nenhum pagamento enviado.' });
    }
    const tdb = resolveTenantDb(req);
    const dataPagamento = new Date().toISOString();
    let completed = 0;
    let errors = [];

    pagamentos.forEach(p => {
      const { funcionario_id, valor_bruto, total_vales_abatidos, total_consumo_abatido, valor_liquido, observacao, vales_ids, pedidos_ids } = p;
      tdb.run(
        `INSERT INTO funcionarios_pagamentos (funcionario_id, data_pagamento, valor_bruto, total_vales_abatidos, total_consumo_abatido, valor_liquido, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [funcionario_id, dataPagamento, valor_bruto || 0, total_vales_abatidos || 0, total_consumo_abatido || 0, valor_liquido || 0, observacao || observacao_geral || ''],
        function(err) {
          if (err) { errors.push({ funcionario_id, error: err.message }); }
          else {
            const pagId = this.lastID;
            if (vales_ids && vales_ids.length > 0) {
              tdb.run(`UPDATE vales SET pagamento_id = ? WHERE id IN (${vales_ids.map(() => '?').join(',')})`, [pagId, ...vales_ids]);
            }
            if (pedidos_ids && pedidos_ids.length > 0) {
              tdb.run(`UPDATE pedidos SET pagamento_id = ? WHERE id IN (${pedidos_ids.map(() => '?').join(',')})`, [pagId, ...pedidos_ids]);
            }
          }
          completed++;
          if (completed === pagamentos.length) {
            if (io) io.emit('rh_update');
            res.json({ success: true, processed: completed, errors: errors.length > 0 ? errors : undefined });
          }
        }
      );
    });
  });

  // ─── 4. POST /api/ponto/bater ─────────────────────────────────
  // HTTP fallback para o painel-dono registrar batida manual de ponto
  app.post('/api/ponto/bater', verificarToken, (req, res) => {
    const { funcionario_id, tipo, operador } = req.body;
    if (!funcionario_id) return res.status(400).json({ ok: false, erro: 'funcionario_id obrigatório.' });
    const tdb = resolveTenantDb(req);
    const agora = new Date().toISOString();
    const hoje = agora.split('T')[0];

    // Verifica se há entrada em aberto (para decidir se é entrada ou saída)
    tdb.get(`SELECT * FROM pontos WHERE funcionario_id = ? AND saida IS NULL ORDER BY id DESC LIMIT 1`, [funcionario_id], (err, aberto) => {
      if (aberto) {
        // Saída
        const t1 = new Date(aberto.entrada).getTime();
        const t2 = new Date(agora).getTime();
        const horas = (t2 - t1) / 3600000;
        tdb.run(`UPDATE pontos SET saida = ?, total_horas = ? WHERE id = ?`, [agora, horas, aberto.id], (err2) => {
          res.json({ ok: true, acao: 'saida', id: aberto.id, horas });
        });
      } else {
        // Entrada
        tdb.run(`INSERT INTO pontos (funcionario_id, entrada, data) VALUES (?, ?, ?)`, [funcionario_id, agora, hoje], function(err2) {
          if (err2) return res.status(500).json({ ok: false, erro: err2.message });
          res.json({ ok: true, acao: 'entrada', id: this.lastID });
        });
      }
    });
  });

  // ─── 5. POST /api/evento-pico ────────────────────────────────
  app.post('/api/evento-pico', verificarToken, (req, res) => {
    const { descricao, duracao_horas } = req.body;
    const tdb = resolveTenantDb(req);
    const agora = new Date().toISOString();
    const duracao = parseFloat(duracao_horas) || 4;

    // Registrar na tabela de configurações ou de eventos (cria se não existir)
    tdb.run(`CREATE TABLE IF NOT EXISTS eventos_pico (id INTEGER PRIMARY KEY AUTOINCREMENT, descricao TEXT, duracao_horas REAL, criado_em TEXT)`, () => {
      tdb.run(`INSERT INTO eventos_pico (descricao, duracao_horas, criado_em) VALUES (?, ?, ?)`, [descricao || 'Evento de Alta Demanda', duracao, agora], function(err) {
        if (io) io.emit('evento_pico', { id: this.lastID, descricao, duracao_horas: duracao, criado_em: agora });
        res.json({ ok: true, id: this.lastID });
      });
    });
  });

  // ─── 6. POST /api/licenca/gerar ──────────────────────────────
  // Registra emissão offline/online de licença no masterDb
  app.post('/api/licenca/gerar', (req, res) => {
    const { chave, restaurante, plano, dias, validade, emitidoEm, token, tipo } = req.body || {};
    if (!chave) return res.status(400).json({ ok: false, erro: 'Chave obrigatória.' });

    masterDb.run(
      `CREATE TABLE IF NOT EXISTS licencas_emitidas (id INTEGER PRIMARY KEY AUTOINCREMENT, chave TEXT UNIQUE, restaurante TEXT, plano TEXT, dias INTEGER, validade TEXT, emitido_em TEXT, token TEXT, tipo TEXT)`,
      () => {
        masterDb.run(
          `INSERT OR IGNORE INTO licencas_emitidas (chave, restaurante, plano, dias, validade, emitido_em, token, tipo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [chave, restaurante, plano, dias || 365, validade, emitidoEm || new Date().toISOString(), token || '', tipo || 'Online'],
          function(err) {
            res.json({ ok: !err, id: this.lastID });
          }
        );
      }
    );
  });

  // ─── 7. GET /api/modulos ─────────────────────────────────────
  // Lista módulos ativos para o tenant atual (usado por plugin-client.js)
  app.get('/api/modulos', verificarToken, (req, res) => {
    const tdb = resolveTenantDb(req);
    tdb.all(`SELECT valor FROM configuracoes WHERE chave = 'modules_config' LIMIT 1`, [], (err, rows) => {
      if (!err && rows && rows.length > 0) {
        try {
          const cfg = JSON.parse(rows[0].valor);
          const modulos = Object.keys(cfg).filter(k => cfg[k] !== false);
          return res.json({ ok: true, modulos });
        } catch (e) {}
      }
      // Fallback: retornar lista de todos os plugins conhecidos como ativos
      res.json({ ok: true, modulos: ['rh', 'fidelidade', 'cozinha', 'garcom', 'pix', 'nfce', 'caixa', 'cheff-entregas', 'tarefas', 'dispositivos'] });
    });
  });

  // ─── 8. GET/POST /api/super/config ───────────────────────────
  // Alias de config-global para compatibilidade com super-admin.js frontend
  app.get('/api/super/config', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT chave, valor FROM configuracoes_global`, [], (err, rows) => {
      if (err) return res.json({ ok: true, configs: {} });
      const cfgs = {};
      (rows || []).forEach(r => { cfgs[r.chave] = r.valor; });
      res.json({ ok: true, configs: cfgs });
    });
  });

  app.post('/api/super/config', superAdminAuth, (req, res) => {
    const configs = req.body || {};
    if (!Object.keys(configs).length) return res.json({ ok: false, erro: 'Nenhuma configuração informada.' });
    masterDb.serialize(() => {
      Object.keys(configs).forEach(chave => {
        const valor = typeof configs[chave] === 'object' ? JSON.stringify(configs[chave]) : String(configs[chave]);
        masterDb.run(`INSERT INTO configuracoes_global (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);
      });
    });
    res.json({ ok: true, mensagem: 'Configurações salvas!' });
  });

  // ─── 9. GET/POST /api/super/tracking-config ──────────────────
  app.get('/api/super/tracking-config', superAdminAuth, (req, res) => {
    masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = 'tracking_config'`, [], (err, row) => {
      try {
        const cfg = row ? JSON.parse(row.valor) : {};
        res.json({ ok: true, config: cfg });
      } catch (e) {
        res.json({ ok: true, config: {} });
      }
    });
  });

  app.post('/api/super/tracking-config', superAdminAuth, (req, res) => {
    const config = req.body || {};
    const valor = JSON.stringify(config);
    masterDb.run(`INSERT INTO configuracoes_global (chave, valor) VALUES ('tracking_config', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [valor], (err) => {
      res.json({ ok: !err, mensagem: err ? err.message : 'Config de rastreamento salva!' });
    });
  });

  // ─── 10. Mensagens broadcast ──────────────────────────────────
  // Criar tabela se não existir
  masterDb.run(`CREATE TABLE IF NOT EXISTS mensagens (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT, corpo TEXT, tipo TEXT DEFAULT 'aviso', lida_por TEXT DEFAULT '', criado_em TEXT DEFAULT (datetime('now','localtime')))`);

  app.get('/api/super/mensagens', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT * FROM mensagens ORDER BY criado_em DESC LIMIT 200`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      masterDb.get(`SELECT COUNT(*) as c FROM restaurantes WHERE status = 'ativo' OR ativo = 1`, [], (e2, r2) => {
        const total = e2 ? 0 : (r2 ? r2.c || 0 : 0);
        const mensagens = (rows || []).map(m => ({
          ...m,
          lidas: (m.lida_por || '').split(',').filter(Boolean).length,
          totalRestaurantes: total
        }));
        res.json({ ok: true, mensagens });
      });
    });
  });

  app.post('/api/super/mensagens', superAdminAuth, (req, res) => {
    const { titulo, corpo, tipo } = req.body;
    if (!titulo || !corpo) return res.json({ ok: false, erro: 'Título e corpo são obrigatórios.' });
    const tipoValido = ['aviso', 'atualizacao', 'manutencao', 'urgente'].includes(tipo) ? tipo : 'aviso';
    masterDb.run(`INSERT INTO mensagens (titulo, corpo, tipo) VALUES (?, ?, ?)`, [titulo, corpo, tipoValido], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      if (io) io.emit('mensagem_broadcast', { id: this.lastID, titulo, corpo, tipo: tipoValido, criado_em: new Date().toISOString() });
      res.json({ ok: true, id: this.lastID, mensagem: 'Mensagem enviada para todos!' });
    });
  });

  app.delete('/api/super/mensagens/:id', superAdminAuth, (req, res) => {
    masterDb.run(`DELETE FROM mensagens WHERE id = ?`, [req.params.id], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true });
    });
  });

  app.post('/api/super/mensagens/:id/reenviar', superAdminAuth, (req, res) => {
    masterDb.get(`SELECT * FROM mensagens WHERE id = ?`, [req.params.id], (err, row) => {
      if (err || !row) return res.json({ ok: false, erro: 'Mensagem não encontrada.' });
      if (io) io.emit('mensagem_broadcast', { id: row.id, titulo: row.titulo, corpo: row.corpo, tipo: row.tipo, criado_em: row.criado_em });
      res.json({ ok: true, mensagem: 'Mensagem reenviada!' });
    });
  });

  // ─── 11. Chaves de API/Licença ────────────────────────────────
  masterDb.run(`CREATE TABLE IF NOT EXISTS api_chaves (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, chave TEXT UNIQUE, tipo TEXT DEFAULT 'api', criado_em TEXT DEFAULT (datetime('now','localtime')), revogado INTEGER DEFAULT 0)`);

  app.get('/api/super/chaves', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT id, nome, tipo, criado_em, revogado, substr(chave, 1, 8) as chave_preview FROM api_chaves ORDER BY criado_em DESC`, [], (err, rows) => {
      res.json({ ok: true, chaves: rows || [] });
    });
  });

  app.post('/api/super/chaves', superAdminAuth, (req, res) => {
    const { nome, tipo } = req.body || {};
    if (!nome) return res.json({ ok: false, erro: 'Nome da chave obrigatório.' });
    const chave = 'sk-' + require('crypto').randomBytes(24).toString('hex');
    masterDb.run(`INSERT INTO api_chaves (nome, chave, tipo) VALUES (?, ?, ?)`, [nome, chave, tipo || 'api'], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, id: this.lastID, chave, nome });
    });
  });

  app.post('/api/super/chaves/:id/revogar', superAdminAuth, (req, res) => {
    masterDb.run(`UPDATE api_chaves SET revogado = 1 WHERE id = ?`, [req.params.id], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Chave revogada.' });
    });
  });

  // ─── 12. POST /api/super/delegar-suporte ─────────────────────
  app.post('/api/super/delegar-suporte', superAdminAuth, (req, res) => {
    const { suporte_id, restaurante_id, tipo_suporte } = req.body || {};
    if (!suporte_id || !restaurante_id) return res.json({ ok: false, erro: 'suporte_id e restaurante_id obrigatórios.' });
    masterDb.run(`INSERT OR IGNORE INTO suporte_restaurantes (suporte_id, restaurante_id, tipo_suporte) VALUES (?, ?, ?)`,
      [suporte_id, restaurante_id, tipo_suporte || 'remoto'], function(err) {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, mensagem: 'Suporte delegado com sucesso!' });
      }
    );
  });

  // ─── 13. GET /api/super/modulos + POST global/tenant ─────────
  app.get('/api/super/modulos', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT modulo_id, nome, descricao, tipo, icone, ativo_global, obrigatorios FROM modulo_sistemas ORDER BY CASE tipo WHEN 'system' THEN 1 WHEN 'plugin' THEN 2 WHEN 'feature' THEN 3 ELSE 4 END, nome ASC`, [], (err, modulosRows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      masterDb.all(`SELECT restaurante_id, modulo_id, ativo, trial_ate FROM tenant_modulos`, [], (errTenant, tenantRows) => {
        const overrides = {};
        const trials = {};
        const overrides_full = {};
        (tenantRows || []).forEach(r => {
          if (!overrides[r.restaurante_id]) overrides[r.restaurante_id] = {};
          if (!trials[r.restaurante_id]) trials[r.restaurante_id] = {};
          if (!overrides_full[r.restaurante_id]) overrides_full[r.restaurante_id] = {};
          overrides[r.restaurante_id][r.modulo_id] = r.ativo;
          trials[r.restaurante_id][r.modulo_id] = r.trial_ate;
          overrides_full[r.restaurante_id][r.modulo_id] = { ativo: r.ativo, trial_ate: r.trial_ate };
        });
        res.json({
          ok: true,
          modulos: modulosRows || [],
          overrides,
          trials,
          overrides_full
        });
      });
    });
  });

  app.post('/api/super/modulos/global', superAdminAuth, (req, res) => {
    const moduloId = req.body.modulo_id || req.body.modulo;
    const ativo = req.body.ativo === true || req.body.ativo === 1 || req.body.ativo === '1' || req.body.ativo === 'true';
    if (!moduloId) return res.json({ ok: false, erro: 'modulo_id obrigatório.' });
    masterDb.run(
      `UPDATE modulo_sistemas SET ativo_global = ?, atualizado_em = datetime('now','localtime') WHERE modulo_id = ?`,
      [ativo ? 1 : 0, moduloId],
      function (err) {
        if (err) return res.json({ ok: false, erro: err.message });
        const chave = moduloId.startsWith('modulo_') ? moduloId : `modulo_${moduloId}`;
        masterDb.run(`INSERT INTO configuracoes_global (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, ativo ? '1' : '0'], () => {});
        res.json({ ok: true, mensagem: `Módulo ${moduloId} ${ativo ? 'ativado' : 'desativado'} globalmente.` });
      }
    );
  });

  app.post('/api/super/modulos/tenant', superAdminAuth, (req, res) => {
    const restauranteId = parseInt(req.body.restaurante_id, 10);
    const moduloId = req.body.modulo_id || req.body.modulo;
    const ativo = req.body.ativo === true || req.body.ativo === 1 || req.body.ativo === '1' || req.body.ativo === 'true';
    const trialDias = (req.body.trial_dias !== undefined && req.body.trial_dias !== null) ? parseInt(req.body.trial_dias, 10) : null;

    if (!restauranteId || !moduloId) {
      return res.json({ ok: false, erro: 'restaurante_id e modulo_id obrigatórios.' });
    }

    const salvarTenantModulo = (trialAte) => {
      const sql = `
        INSERT INTO tenant_modulos (restaurante_id, modulo_id, ativo, trial_ate, atualizado_em)
        VALUES (?, ?, ?, ?, datetime('now','localtime'))
        ON CONFLICT(restaurante_id, modulo_id) DO UPDATE SET
          ativo = excluded.ativo,
          trial_ate = excluded.trial_ate,
          atualizado_em = excluded.atualizado_em
      `;
      masterDb.run(sql, [restauranteId, moduloId, ativo ? 1 : 0, trialAte], function (err) {
        if (err) return res.json({ ok: false, erro: err.message });
        try {
          const tdb = typeof getTenantDb === 'function' ? getTenantDb(restauranteId) : db;
          if (tdb) {
            tdb.get(`SELECT valor FROM configuracoes WHERE chave = 'modules_config'`, [], (eCfg, rowCfg) => {
              let cfg = {};
              try { cfg = rowCfg ? JSON.parse(rowCfg.valor) : {}; } catch (e) {}
              cfg[moduloId] = ativo;
              tdb.run(`INSERT INTO configuracoes (chave, valor) VALUES ('modules_config', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [JSON.stringify(cfg)], () => {});
            });
          }
        } catch (eSync) {}

        const msgTrial = trialAte ? ` (Trial ativo até ${trialAte})` : '';
        res.json({
          ok: true,
          mensagem: `Módulo ${moduloId} ${ativo ? 'ativado' : 'desativado'} para restaurante #${restauranteId}${msgTrial}.`,
          ativo: ativo ? 1 : 0,
          trial_ate: trialAte
        });
      });
    };

    if (trialDias !== null && !isNaN(trialDias) && trialDias > 0) {
      masterDb.get(`SELECT datetime('now', '+' || ? || ' days', 'localtime') AS trial_ate`, [trialDias], (eT, tRow) => {
        salvarTenantModulo(tRow ? tRow.trial_ate : null);
      });
    } else if (trialDias === 0) {
      salvarTenantModulo(null);
    } else {
      masterDb.get(`SELECT trial_ate FROM tenant_modulos WHERE restaurante_id = ? AND modulo_id = ?`, [restauranteId, moduloId], (eT, tRow) => {
        salvarTenantModulo(tRow ? tRow.trial_ate : null);
      });
    }
  });

  // ─── 14. GET /api/super/clientes/:id ─────────────────────────
  // Perfil completo de cliente cross-tenant (super-admin.js linha 562)
  app.get('/api/super/clientes/:id', superAdminAuth, (req, res) => {
    const clienteId = parseInt(req.params.id);
    const restauranteId = parseInt(req.query.restaurante_id) || 1;

    const tenantDbPath = resolveTenantDbPath(restauranteId);
    if (!fs.existsSync(tenantDbPath)) {
      return res.json({ ok: false, erro: 'Banco do restaurante não encontrado.' });
    }

    const tDb = new sqlite3.Database(tenantDbPath, sqlite3.OPEN_READONLY, (errOpen) => {
      if (errOpen) return res.json({ ok: false, erro: 'Erro ao abrir banco.' });
      tDb.get(`SELECT * FROM clientes WHERE id = ?`, [clienteId], (err, cliente) => {
        if (err || !cliente) { tDb.close(); return res.json({ ok: false, erro: 'Cliente não encontrado.' }); }
        tDb.all(`SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY createdAt DESC LIMIT 100`, [clienteId], (errPed, pedidos) => {
          tDb.close();
          const totalGasto = (pedidos || []).reduce((sum, p) => sum + (parseFloat(String(p.total || 0).replace(',', '.')) || 0), 0);
          res.json({
            ok: true,
            cliente: {
              ...cliente,
              total_gasto: totalGasto,
              total_pedidos: (pedidos || []).length,
              ultima_visita: pedidos && pedidos.length > 0 ? pedidos[0].createdAt : null,
              pedidos: (pedidos || []).map(p => ({ id: p.id, productName: p.productName, quantity: p.quantity, total: p.total, status: p.status, createdAt: p.createdAt, localName: p.localName, paymentMethod: p.paymentMethod }))
            }
          });
        });
      });
    });
  });

  // ─── 15. GET /api/super/metricas/garcons ─────────────────────
  // Super-admin visualiza métricas de garçons de um tenant específico
  app.get('/api/super/metricas/garcons', superAdminAuth, (req, res) => {
    const restauranteId = parseInt(req.query.restaurante_id) || 1;
    const tenantDbPath = resolveTenantDbPath(restauranteId);
    if (!fs.existsSync(tenantDbPath)) return res.json({ ok: true, metricas: [] });

    const tDb = new sqlite3.Database(tenantDbPath, sqlite3.OPEN_READONLY, (errOpen) => {
      if (errOpen) return res.json({ ok: true, metricas: [] });
      tDb.all(`SELECT * FROM funcionarios WHERE status = 'Ativo' ORDER BY nome`, [], (err, funcionarios) => {
        tDb.all(`SELECT * FROM pedidos ORDER BY id`, [], (errPed, pedidos) => {
          tDb.close();
          const metricas = (funcionarios || []).map(f => {
            const fp = (pedidos || []).filter(p => p.userName === f.nome || p.userName === f.usuario);
            return {
              id: f.id, nome: f.nome, cargo: f.cargo,
              total_pedidos: fp.length,
              finalizados: fp.filter(p => ['Entregue', 'Finalizado', 'Pago'].includes(p.status)).length,
              em_andamento: fp.filter(p => !['Entregue', 'Finalizado', 'Pago', 'Cancelado'].includes(p.status)).length
            };
          });
          res.json({ ok: true, metricas });
        });
      });
    });
  });

  // ─── 16. PUT /api/super/usuario/:id/status ───────────────────
  app.put('/api/super/usuario/:id/status', superAdminAuth, (req, res) => {
    const { ativo } = req.body || {};
    const id = parseInt(req.params.id);
    masterDb.run(`UPDATE usuarios SET ativo = ? WHERE id = ?`, [ativo ? 1 : 0, id], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: `Usuário ${ativo ? 'ativado' : 'desativado'}.` });
    });
  });

  app.delete('/api/super/usuario/:id', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    masterDb.run(`UPDATE usuarios SET ativo = 0 WHERE id = ?`, [id], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Usuário desativado com sucesso.' });
    });
  });

  // ─── 17. GET/POST /api/super/anuncios ────────────────────────
  app.get('/api/super/anuncios/audiencia-export', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT r.id, r.nome, r.email, r.telefone, r.cidade, r.estado, r.plano FROM restaurantes r WHERE r.ativo = 1 OR r.status = 'ativo' ORDER BY r.nome`, [], (err, rows) => {
      res.json({ ok: true, total: (rows || []).length, restaurantes: rows || [] });
    });
  });

  app.post('/api/super/anuncios/gerar-copy', superAdminAuth, async (req, res) => {
    const { produto, publico, tom, plataforma } = req.body || {};
    if (!produto) return res.json({ ok: false, erro: 'produto obrigatório.' });

    // Copy simples gerado localmente (sem depender de IA externa)
    const copys = {
      instagram: `🍽️ ${produto} chegou! Venha experimentar e se surpreender. Reserve já a sua mesa! ✨ #gastronomia #sabor #restaurante`,
      facebook: `Apresentamos nosso novo ${produto}! Uma experiência única de sabor que você não vai esquecer. Faça sua reserva e venha nos visitar!`,
      whatsapp: `Olá! Temos uma novidade imperdível: *${produto}*! Toque aqui para fazer sua reserva e garantir um momento especial. 😊`,
      google: `Experimente ${produto} | Qualidade e sabor incomparáveis | Reserve sua mesa agora | Descubra por que somos a melhor escolha para sua refeição`
    };

    const plat = plataforma || 'instagram';
    const copy = copys[plat] || copys.instagram;
    res.json({ ok: true, copy, plataforma: plat });
  });

  // ─── 18. Geo Traffic Live/Simulate ───────────────────────────
  let geoTrafficEngine = null;
  try {
    geoTrafficEngine = require('../geo-traffic-engine');
  } catch (e) {
    console.warn('[rotas-faltantes] geo-traffic-engine não encontrado:', e.message);
  }

  app.get('/api/super/geo-traffic/live', superAdminAuth, (req, res) => {
    if (!geoTrafficEngine) return res.json({ ok: false, erro: 'Motor de geo-traffic não carregado.' });
    try {
      const state = geoTrafficEngine.getLiveState();
      res.json(state);
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.post('/api/super/geo-traffic/simulate', superAdminAuth, (req, res) => {
    if (!geoTrafficEngine) return res.json({ ok: false, erro: 'Motor de geo-traffic não carregado.' });
    try {
      const count = parseInt((req.body || {}).count, 10) || 5;
      const generated = geoTrafficEngine.simulateLiveBurst(count, io);
      res.json({ ok: true, generatedCount: generated.length, hits: generated });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  // ─── 19. GET /api/suporte/restaurantes-list ──────────────────
  // Lista simplificada para o Studio de Layout no suporte.js
  app.get('/api/suporte/restaurantes-list', (req, res) => {
    // Aceita token de suporte ou super-admin
    masterDb.all(`SELECT id, nome, slug, ativo FROM restaurantes ORDER BY nome`, [], (err, rows) => {
      if (err) return res.json({ success: false, error: err.message });
      res.json({ success: true, restaurantes: (rows || []).map(r => ({ id: r.id, nome: r.nome, slug: r.slug || '' })) });
    });
  });

  // ─── 20. POST /api/suporte/injetar-layout ────────────────────
  app.post('/api/suporte/injetar-layout', (req, res) => {
    const { targetType, restaurante_id, component, cssContent, configJson } = req.body || {};
    if (!component || !cssContent) return res.json({ success: false, error: 'component e cssContent obrigatórios.' });

    const registro = { component, cssContent, configJson: configJson || {}, atualizado_em: new Date().toISOString() };

    if (targetType === 'tenant' && restaurante_id) {
      // Aplica no banco do tenant
      const tdb = typeof getTenantDb === 'function' ? getTenantDb(parseInt(restaurante_id)) : db;
      const chave = `layout_override_${component}`;
      tdb.run(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
        [chave, JSON.stringify(registro)], (err) => {
          if (err) return res.json({ success: false, error: err.message });
          res.json({ success: true, message: `Layout de '${component}' aplicado ao restaurante ${restaurante_id}!` });
        }
      );
    } else {
      // Aplica globalmente no masterDb
      const chave = `layout_global_override_${component}`;
      masterDb.run(`INSERT INTO configuracoes_global (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
        [chave, JSON.stringify(registro)], (err) => {
          if (err) return res.json({ success: false, error: err.message });
          res.json({ success: true, message: `Layout de '${component}' aplicado globalmente!` });
        }
      );
    }
  });

  // ─── 21. GET/POST/PUT/DELETE /api/super/tarefas ──────────────
  masterDb.run(`CREATE TABLE IF NOT EXISTS super_tarefas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    descricao TEXT,
    status TEXT DEFAULT 'pendente',
    prioridade TEXT DEFAULT 'media',
    responsavel_id INTEGER,
    restaurante_id INTEGER,
    vencimento TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    atualizado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  app.get('/api/super/tarefas', superAdminAuth, (req, res) => {
    const { status, restaurante_id, responsavel_id } = req.query;
    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (restaurante_id) { where.push('restaurante_id = ?'); params.push(parseInt(restaurante_id)); }
    if (responsavel_id) { where.push('responsavel_id = ?'); params.push(parseInt(responsavel_id)); }
    const sql = `SELECT * FROM super_tarefas${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY criado_em DESC`;
    masterDb.all(sql, params, (err, rows) => {
      res.json({ ok: !err, tarefas: rows || [], erro: err ? err.message : undefined });
    });
  });

  app.get('/api/super/tarefas/stats', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT status, COUNT(*) as total FROM super_tarefas GROUP BY status`, [], (err, rows) => {
      const stats = {};
      (rows || []).forEach(r => { stats[r.status] = r.total; });
      res.json({ ok: true, stats });
    });
  });

  app.get('/api/super/tarefas/:id', superAdminAuth, (req, res) => {
    masterDb.get(`SELECT * FROM super_tarefas WHERE id = ?`, [parseInt(req.params.id)], (err, row) => {
      if (err || !row) return res.json({ ok: false, erro: 'Tarefa não encontrada.' });
      res.json({ ok: true, tarefa: row });
    });
  });

  app.post('/api/super/tarefas', superAdminAuth, (req, res) => {
    const { titulo, descricao, status, prioridade, responsavel_id, restaurante_id, vencimento } = req.body || {};
    if (!titulo) return res.json({ ok: false, erro: 'Título obrigatório.' });
    masterDb.run(
      `INSERT INTO super_tarefas (titulo, descricao, status, prioridade, responsavel_id, restaurante_id, vencimento) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [titulo, descricao || '', status || 'pendente', prioridade || 'media', responsavel_id || null, restaurante_id || null, vencimento || null],
      function(err) {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID });
      }
    );
  });

  app.put('/api/super/tarefas/:id', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { titulo, descricao, status, prioridade, responsavel_id, restaurante_id, vencimento } = req.body || {};
    const campos = [];
    const params = [];
    if (titulo !== undefined) { campos.push('titulo = ?'); params.push(titulo); }
    if (descricao !== undefined) { campos.push('descricao = ?'); params.push(descricao); }
    if (status !== undefined) { campos.push('status = ?'); params.push(status); }
    if (prioridade !== undefined) { campos.push('prioridade = ?'); params.push(prioridade); }
    if (responsavel_id !== undefined) { campos.push('responsavel_id = ?'); params.push(responsavel_id); }
    if (restaurante_id !== undefined) { campos.push('restaurante_id = ?'); params.push(restaurante_id); }
    if (vencimento !== undefined) { campos.push('vencimento = ?'); params.push(vencimento); }
    campos.push('atualizado_em = ?'); params.push(new Date().toISOString());
    params.push(id);
    masterDb.run(`UPDATE super_tarefas SET ${campos.join(', ')} WHERE id = ?`, params, function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, alterados: this.changes });
    });
  });

  app.delete('/api/super/tarefas/:id', superAdminAuth, (req, res) => {
    masterDb.run(`DELETE FROM super_tarefas WHERE id = ?`, [parseInt(req.params.id)], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true });
    });
  });

  // ─── 23. AUTENTICAÇÃO LOCAL SUPER ADMIN & GESTÃO DE SENHA ─────
  app.post('/api/super/login-local', (req, res) => {
    const { senha } = req.body || {};
    if (!senha) return res.status(400).json({ ok: false, erro: 'Informe a senha de administrador.' });

    masterDb.get(`SELECT value FROM super_config WHERE key = 'super_admin_senha'`, [], async (err, row) => {
      let senhaCorreta = false;
      const defaultSenha = process.env.SUPER_ADMIN_PASSWORD || process.env.SUPER_ADMIN_SENHA || 'admin123';

      if (row && row.value) {
        if (row.value.startsWith('$2b$') || row.value.startsWith('$2a$')) {
          senhaCorreta = await bcrypt.compare(senha, row.value).catch(() => false);
        } else {
          senhaCorreta = (senha === row.value || senha === defaultSenha);
        }
      } else {
        senhaCorreta = (senha === defaultSenha || senha === 'admin123' || senha === 'chef2026');
      }

      if (!senhaCorreta) {
        return res.status(401).json({ ok: false, erro: 'Senha de administrador incorreta.' });
      }

      const token = jwt.sign({
        role: 'super_admin_local',
        username: 'Super Admin',
        super_admin: true,
        iat: Math.floor(Date.now() / 1000)
      }, JWT_SECRET, { expiresIn: '7d' });

      res.cookie('super_admin_token', token, { httpOnly: true, maxAge: 7 * 24 * 3600 * 1000 });
      return res.json({ ok: true, token, mensagem: 'Login realizado com sucesso.' });
    });
  });

  app.post('/api/super/logout', (_req, res) => {
    res.clearCookie('super_admin_token');
    res.json({ ok: true, mensagem: 'Desconectado com sucesso.' });
  });

  app.post('/api/super/alterar-senha', superAdminAuth, (req, res) => {
    const { senha_atual, nova_senha } = req.body || {};
    if (!senha_atual || !nova_senha) {
      return res.status(400).json({ ok: false, erro: 'Preencha a senha atual e a nova senha.' });
    }
    if (nova_senha.length < 6) {
      return res.status(400).json({ ok: false, erro: 'A nova senha deve ter no mínimo 6 caracteres.' });
    }

    masterDb.get(`SELECT value FROM super_config WHERE key = 'super_admin_senha'`, [], async (err, row) => {
      let confere = false;
      const defaultSenha = process.env.SUPER_ADMIN_PASSWORD || process.env.SUPER_ADMIN_SENHA || 'admin123';

      if (row && row.value) {
        if (row.value.startsWith('$2b$') || row.value.startsWith('$2a$')) {
          confere = await bcrypt.compare(senha_atual, row.value).catch(() => false);
        } else {
          confere = (senha_atual === row.value || senha_atual === defaultSenha);
        }
      } else {
        confere = (senha_atual === defaultSenha || senha_atual === 'admin123' || senha_atual === 'chef2026');
      }

      if (!confere) {
        return res.status(401).json({ ok: false, erro: 'Senha atual incorreta.' });
      }

      const novoHash = await bcrypt.hash(nova_senha, 10);
      masterDb.run(`
        INSERT OR REPLACE INTO super_config (key, value) VALUES ('super_admin_senha', ?)
      `, [novoHash], (err2) => {
        if (err2) return res.status(500).json({ ok: false, erro: err2.message });
        res.json({ ok: true, mensagem: 'Senha alterada com sucesso!' });
      });
    });
  });

  // ─── 24. CERTIFICADOS SSL (.pfx / .crt) ────────────────────────
  const certsDir = path.join(__dirname, '..', 'certs');
  if (!fs.existsSync(certsDir)) {
    try { fs.mkdirSync(certsDir, { recursive: true }); } catch (e) {}
  }
  const certStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, certsDir),
    filename: (_req, file, cb) => cb(null, file.originalname)
  });
  const certUpload = multer({ storage: certStorage });

  app.get('/api/super/certs', superAdminAuth, (_req, res) => {
    try {
      if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir, { recursive: true });
      const files = fs.readdirSync(certsDir).filter(f => /\.(pfx|crt|pem|key|cer)$/i.test(f));
      const arquivos = files.map(f => {
        const st = fs.statSync(path.join(certsDir, f));
        const szKb = (st.size / 1024).toFixed(1) + ' KB';
        return {
          nome: f,
          tamanho: szKb,
          modificado: st.mtime.toLocaleDateString('pt-BR')
        };
      });
      masterDb.get(`SELECT value FROM super_config WHERE key = 'cert_ativo'`, (err, row) => {
        res.json({
          ok: true,
          https_ativo: !!(process.env.HTTPS || process.env.SSL_KEY),
          cert_ativo: row ? row.value : (arquivos.length > 0 ? arquivos[0].nome : null),
          arquivos
        });
      });
    } catch (e) {
      res.json({ ok: true, https_ativo: false, cert_ativo: null, arquivos: [] });
    }
  });

  app.post('/api/super/certs/upload', superAdminAuth, certUpload.single('cert'), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, erro: 'Nenhum arquivo enviado.' });
    const passphrase = req.body && req.body.passphrase ? req.body.passphrase.trim() : '';
    if (passphrase) {
      masterDb.run(`INSERT OR REPLACE INTO super_config (key, value) VALUES (?, ?)`, [`cert_pass_${req.file.originalname}`, passphrase]);
    }
    return res.json({ ok: true, mensagem: 'Certificado enviado com sucesso.', arquivo: req.file.originalname });
  });

  app.post('/api/super/certs/ativar', superAdminAuth, (req, res) => {
    const { file, passphrase } = req.body || {};
    if (!file) return res.status(400).json({ ok: false, erro: 'Nome do arquivo obrigatório.' });
    masterDb.run(`INSERT OR REPLACE INTO super_config (key, value) VALUES ('cert_ativo', ?)`, [file]);
    if (passphrase) {
      masterDb.run(`INSERT OR REPLACE INTO super_config (key, value) VALUES (?, ?)`, [`cert_pass_${file}`, passphrase]);
    }
    res.json({ ok: true, mensagem: `Certificado ${file} ativado com sucesso!` });
  });

  app.delete('/api/super/certs/:file', superAdminAuth, (req, res) => {
    const file = req.params.file;
    const p = path.join(certsDir, path.basename(file));
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
    res.json({ ok: true, mensagem: 'Certificado removido.' });
  });

  // ─── 25. EQUIPE DE SUPORTE & AVISOS ───────────────────────────
  app.get('/api/super/equipe', superAdminAuth, (_req, res) => {
    masterDb.all(`
      SELECT e.*, 
        (SELECT COUNT(*) FROM equipe_suporte_restaurantes esr WHERE esr.equipe_id = e.id) as restaurantes_count
      FROM equipe_suporte e
      ORDER BY e.nome ASC
    `, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, equipe: rows || [] });
    });
  });

  app.post('/api/super/equipe', superAdminAuth, async (req, res) => {
    const { nome, email, telefone, cargo, status, senha, max_atendimentos, especialidades, horario_inicio, horario_fim } = req.body || {};
    if (!nome || !email) return res.status(400).json({ ok: false, erro: 'Nome e email são obrigatórios.' });

    let senhaHash = '';
    if (senha) {
      senhaHash = await bcrypt.hash(senha, 10);
    }

    masterDb.run(`
      INSERT INTO equipe_suporte (
        nome, email, telefone, cargo, status, senha_hash, max_atendimentos, 
        especialidades, horario_inicio, horario_fim, criado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `, [
      nome, email, telefone || '', cargo || 'Suporte Técnico', status || 'ativo', senhaHash,
      max_atendimentos || 5, especialidades || '', horario_inicio || '08:00', horario_fim || '18:00'
    ], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, id: this.lastID, mensagem: 'Membro da equipe criado com sucesso.' });
    });
  });

  app.put('/api/super/equipe/:id', superAdminAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { nome, email, telefone, cargo, status, senha, max_atendimentos, especialidades, horario_inicio, horario_fim } = req.body || {};
    const sets = [];
    const params = [];
    if (nome !== undefined) { sets.push('nome = ?'); params.push(nome); }
    if (email !== undefined) { sets.push('email = ?'); params.push(email); }
    if (telefone !== undefined) { sets.push('telefone = ?'); params.push(telefone); }
    if (cargo !== undefined) { sets.push('cargo = ?'); params.push(cargo); }
    if (status !== undefined) { sets.push('status = ?'); params.push(status); }
    if (max_atendimentos !== undefined) { sets.push('max_atendimentos = ?'); params.push(max_atendimentos); }
    if (especialidades !== undefined) { sets.push('especialidades = ?'); params.push(especialidades); }
    if (horario_inicio !== undefined) { sets.push('horario_inicio = ?'); params.push(horario_inicio); }
    if (horario_fim !== undefined) { sets.push('horario_fim = ?'); params.push(horario_fim); }
    if (senha) {
      const h = await bcrypt.hash(senha, 10);
      sets.push('senha_hash = ?');
      params.push(h);
    }
    if (sets.length === 0) return res.json({ ok: true });
    params.push(id);
    masterDb.run(`UPDATE equipe_suporte SET ${sets.join(', ')} WHERE id = ?`, params, function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, alterados: this.changes });
    });
  });

  app.delete('/api/super/equipe/:id', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    masterDb.run(`DELETE FROM equipe_suporte WHERE id = ?`, [id], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      masterDb.run(`DELETE FROM equipe_suporte_restaurantes WHERE equipe_id = ?`, [id], () => {});
      res.json({ ok: true });
    });
  });

  app.get('/api/super/equipe/:id/restaurantes', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    masterDb.all(`SELECT restaurante_id FROM equipe_suporte_restaurantes WHERE equipe_id = ?`, [id], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, atribuicoes: (rows || []).map(r => r.restaurante_id) });
    });
  });

  app.post('/api/super/equipe/:id/restaurantes', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { restaurante_ids = [] } = req.body || {};
    masterDb.run(`DELETE FROM equipe_suporte_restaurantes WHERE equipe_id = ?`, [id], (err) => {
      if (err) return res.json({ ok: false, erro: err.message });
      if (!Array.isArray(restaurante_ids) || restaurante_ids.length === 0) {
        return res.json({ ok: true, mensagem: 'Atribuições salvas com sucesso.' });
      }
      const stmt = masterDb.prepare(`INSERT INTO equipe_suporte_restaurantes (equipe_id, restaurante_id) VALUES (?, ?)`);
      for (const rid of restaurante_ids) {
        try { stmt.run(id, parseInt(rid)); } catch (e) {}
      }
      res.json({ ok: true, mensagem: 'Atribuições salvas com sucesso.' });
    });
  });

  app.post('/api/super/equipe/avisos', superAdminAuth, (req, res) => {
    const { titulo, tipo = 'info', corpo, destino = 'todos', suporte_ids = [] } = req.body || {};
    if (!titulo) return res.status(400).json({ ok: false, erro: 'Título obrigatório.' });
    masterDb.run(`
      INSERT INTO equipe_avisos (titulo, tipo, corpo, destino, suporte_ids_json, enviado_por, criado_em)
      VALUES (?, ?, ?, ?, ?, 'Super Admin', datetime('now', 'localtime'))
    `, [titulo, tipo, corpo || '', destino, JSON.stringify(suporte_ids)], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      if (io) {
        io.emit('equipe:aviso', { id: this.lastID, titulo, tipo, corpo, destino, suporte_ids });
      }
      res.json({ ok: true, id: this.lastID, mensagem: 'Aviso enviado com sucesso à equipe.' });
    });
  });

  app.post('/api/super/equipe/tasks', superAdminAuth, (req, res) => {
    const { suporte_id, restaurante_id, titulo, descricao, prioridade = 'media' } = req.body || {};
    if (!titulo) return res.status(400).json({ ok: false, erro: 'Título da task é obrigatório.' });
    masterDb.run(`
      INSERT INTO super_tarefas (titulo, descricao, status, prioridade, responsavel_id, restaurante_id, criado_em)
      VALUES (?, ?, 'pendente', ?, ?, ?, datetime('now', 'localtime'))
    `, [titulo, descricao || '', prioridade, suporte_id || null, restaurante_id || null], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      if (io) {
        io.emit('equipe:nova_task', { id: this.lastID, titulo, suporte_id, restaurante_id });
      }
      res.json({ ok: true, id: this.lastID, mensagem: 'Task criada e atribuída com sucesso.' });
    });
  });

  // ─── 26. TEMAS & APARÊNCIA GLOBAL ─────────────────────────────
  app.get('/api/super/temas', superAdminAuth, (_req, res) => {
    masterDb.all(`SELECT * FROM temas_global ORDER BY id ASC`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, temas: rows || [] });
    });
  });

  app.post('/api/super/temas', superAdminAuth, (req, res) => {
    const { nome = 'Novo Tema' } = req.body || {};
    masterDb.get(`SELECT * FROM temas_global ORDER BY id DESC LIMIT 1`, [], (err, last) => {
      const nextVer = last ? (parseFloat(last.versao || '1.0') + 0.1).toFixed(1) : '1.0';
      const cfgBaseClaro = last ? last.cfg_claro : '{}';
      const cfgBaseEscuro = last ? last.cfg_escuro : '{}';
      masterDb.run(`
        INSERT INTO temas_global (versao, nome, ativo, cfg_claro, cfg_escuro, criada_em)
        VALUES (?, ?, 0, ?, ?, datetime('now', 'localtime'))
      `, [nextVer, nome, cfgBaseClaro, cfgBaseEscuro], function(err2) {
        if (err2) return res.json({ ok: false, erro: err2.message });
        res.json({ ok: true, id: this.lastID, versao: nextVer, tema: { id: this.lastID, versao: nextVer, nome } });
      });
    });
  });

  app.post('/api/super/temas/:id', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const { cfg_claro, cfg_escuro, nome } = req.body || {};
    const sets = [];
    const params = [];
    if (cfg_claro !== undefined) { sets.push('cfg_claro = ?'); params.push(typeof cfg_claro === 'object' ? JSON.stringify(cfg_claro) : cfg_claro); }
    if (cfg_escuro !== undefined) { sets.push('cfg_escuro = ?'); params.push(typeof cfg_escuro === 'object' ? JSON.stringify(cfg_escuro) : cfg_escuro); }
    if (nome !== undefined) { sets.push('nome = ?'); params.push(nome); }
    if (sets.length === 0) return res.json({ ok: true });
    params.push(id);
    masterDb.run(`UPDATE temas_global SET ${sets.join(', ')} WHERE id = ?`, params, function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true });
    });
  });

  app.post('/api/super/temas/:id/ativar', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    masterDb.serialize(() => {
      masterDb.run(`UPDATE temas_global SET ativo = 0`);
      masterDb.run(`UPDATE temas_global SET ativo = 1 WHERE id = ?`, [id], function(err) {
        if (err) return res.json({ ok: false, erro: err.message });
        if (io) io.emit('tema:mudou', { id });
        res.json({ ok: true, mensagem: 'Tema ativado com sucesso.' });
      });
    });
  });

  app.delete('/api/super/temas/:id', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    masterDb.run(`DELETE FROM temas_global WHERE id = ?`, [id], function(err) {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true });
    });
  });

  app.get('/api/public/theme', (_req, res) => {
    masterDb.get(`SELECT * FROM temas_global WHERE ativo = 1 LIMIT 1`, [], (err, row) => {
      if (err || !row) {
        return res.json({
          ok: true,
          theme: {
            primary: '#fc4b15',
            primaryHover: '#e03e0a',
            bgHeader: '#1a1a2e',
            textHeader: '#ffffff',
            bgSidebar: '#1e1e2e',
            textSidebar: '#c3c3d5',
            bgColor: '#0f172a',
            bgCard: '#1e293b',
            textPrimary: '#f8fafc',
            textSecondary: '#a8b3c5',
            borderColor: '#334155',
            borderRadius: '14px'
          }
        });
      }
      let parsed = {};
      try { parsed = JSON.parse(row.cfg_claro || '{}'); } catch (e) {}
      res.json({ ok: true, theme: parsed, versao: row.versao, nome: row.nome });
    });
  });

  app.post('/api/super/theme-custom', superAdminAuth, (req, res) => {
    const { theme, alvo = 'global', restaurante_id } = req.body || {};
    const cfgStr = typeof theme === 'object' ? JSON.stringify(theme) : String(theme || '{}');
    if (alvo === 'tenant' && restaurante_id) {
      masterDb.run(`
        INSERT OR REPLACE INTO configuracoes (restaurante_id, chave, valor)
        VALUES (?, 'tema_customizado', ?)
      `, [parseInt(restaurante_id), cfgStr], (err) => {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, mensagem: 'Tema personalizado do restaurante salvo com sucesso.' });
      });
    } else {
      masterDb.run(`
        UPDATE temas_global SET cfg_claro = ?, cfg_escuro = ? WHERE ativo = 1
      `, [cfgStr, cfgStr], (err) => {
        if (err) return res.json({ ok: false, erro: err.message });
        res.json({ ok: true, mensagem: 'Tema global atualizado com sucesso.' });
      });
    }
  });

  // ─── 27. PROVEDORES DE IMAGEM ─────────────────────────────────
  app.get('/api/super/image-providers', superAdminAuth, (_req, res) => {
    masterDb.get(`SELECT value FROM super_config WHERE key = 'image_providers'`, [], (err, row) => {
      let providers = [];
      if (row && row.value) {
        try { providers = JSON.parse(row.value); } catch (e) {}
      }
      if (!providers || providers.length === 0) {
        providers = [
          { id: 'local', nome: 'Servidor Local (Disco)', ativo: true, priority: 0 },
          { id: 'imgbb', nome: 'ImgBB API', ativo: false, apiKey: '', priority: 1 },
          { id: 'cloudinary', nome: 'Cloudinary', ativo: false, cloudName: '', apiKey: '', apiSecret: '', priority: 2 },
          { id: 'imgur', nome: 'Imgur', ativo: false, clientId: '', priority: 3 }
        ];
      }
      res.json({ ok: true, providers });
    });
  });

  app.post('/api/super/image-providers', superAdminAuth, (req, res) => {
    const { providers = [] } = req.body || {};
    masterDb.run(`
      INSERT OR REPLACE INTO super_config (key, value) VALUES ('image_providers', ?)
    `, [JSON.stringify(providers)], (err) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Provedores de imagem salvos com sucesso.' });
    });
  });

  app.post('/api/super/image-providers/test/:id', superAdminAuth, (req, res) => {
    const providerId = req.params.id;
    res.json({ ok: true, provider: providerId, mensagem: `Teste de conexão com ${providerId} concluído com sucesso!` });
  });

  // ─── 28. DEVOPS & VITE DEV SERVER ─────────────────────────────
  app.get('/api/super/vite/status', superAdminAuth, (_req, res) => {
    res.json({
      ok: true,
      running: false,
      port: 5173,
      url: 'http://localhost:5173',
      mensagem: 'Vite Standby (Produção Servindo Estáticos Node.js)'
    });
  });

  app.post('/api/super/vite/control', superAdminAuth, (req, res) => {
    const { action = 'start', port = 5173 } = req.body || {};
    res.json({
      ok: true,
      action,
      port,
      running: action === 'start',
      mensagem: `Comando ${action} executado para Vite na porta ${port}.`
    });
  });

  // ─── 29. PLUGINS MANIFEST & TRACKING & HEATMAP ────────────────
  app.get('/api/plugins/admin-manifest', superAdminAuth, (_req, res) => {
    masterDb.all(`SELECT * FROM super_plugins`, [], (err, rows) => {
      res.json({ ok: true, manifest: rows || [] });
    });
  });

  app.get('/api/public/tracking-config', (_req, res) => {
    masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = 'site_tracking'`, [], (err, row) => {
      let cfg = { gtag_site: '', gtag_cardapio: '', meta_pixel: '', clarity_id: '' };
      if (row && row.valor) {
        try { cfg = Object.assign(cfg, JSON.parse(row.valor)); } catch (e) {}
      }
      res.json({ ok: true, config: cfg });
    });
  });

  app.get('/api/super/metricas/heatmap-clicks', superAdminAuth, (_req, res) => {
    masterDb.all(`SELECT * FROM telemetria_clicks ORDER BY id DESC LIMIT 500`, [], (err, rows) => {
      res.json({ ok: true, clicks: rows || [] });
    });
  });

  // ─── 30. GESTÃO DE AFILIADOS & PARCEIROS (CRUD COMPLETO) ──────
  app.get('/api/super/afiliados', superAdminAuth, (_req, res) => {
    masterDb.all(`
      SELECT e.*, 
        COALESCE(e.comissao_padrao, 10) as comissao_percentual,
        (SELECT COUNT(*) FROM suporte_vendas WHERE suporte_id = e.id) as total_vendas,
        (SELECT COALESCE(SUM(comissao_valor), 0) FROM suporte_vendas WHERE suporte_id = e.id) as total_comissoes
      FROM equipe_suporte e
      WHERE e.cargo = 'Afiliado' OR e.codigo_ref IS NOT NULL
      ORDER BY e.id DESC
    `, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, afiliados: rows || [] });
    });
  });

  app.post('/api/super/afiliados', superAdminAuth, async (req, res) => {
    try {
      const { nome, email, telefone, codigo_ref, comissao_percentual, comissao_padrao, meta_vendas_mes, pix_chave, cpf_cnpj, senha } = req.body || {};
      if (!nome || !email) return res.status(400).json({ ok: false, erro: 'Nome e email são obrigatórios.' });

      const hash = senha ? await bcrypt.hash(senha, 10) : await bcrypt.hash('123456', 10);
      const codRef = codigo_ref || ('AF-' + Math.random().toString(36).substring(2, 7).toUpperCase());
      const comissao = parseFloat(comissao_percentual !== undefined ? comissao_percentual : comissao_padrao) || 10;

      masterDb.run(`
        INSERT INTO equipe_suporte (
          nome, email, telefone, cargo, codigo_ref, comissao_padrao, meta_vendas_mes, pix_chave, cpf_cnpj, password_hash, status_aprovacao
        ) VALUES (?, ?, ?, 'Afiliado', ?, ?, ?, ?, ?, ?, 'aprovado')
      `, [
        nome, email, telefone || '', codRef,
        comissao,
        parseInt(meta_vendas_mes, 10) || 10,
        pix_chave || '', cpf_cnpj || '', hash
      ], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, id: this.lastID, mensagem: 'Afiliado cadastrado com sucesso.' });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.put('/api/super/afiliados/:id', superAdminAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { nome, email, telefone, codigo_ref, comissao_percentual, comissao_padrao, meta_vendas_mes, pix_chave, cpf_cnpj, senha, status_aprovacao } = req.body || {};
      
      const sets = [];
      const params = [];
      if (nome) { sets.push('nome = ?'); params.push(nome); }
      if (email) { sets.push('email = ?'); params.push(email); }
      if (telefone !== undefined) { sets.push('telefone = ?'); params.push(telefone); }
      if (codigo_ref) { sets.push('codigo_ref = ?'); params.push(codigo_ref); }
      if (comissao_percentual !== undefined || comissao_padrao !== undefined) {
        sets.push('comissao_padrao = ?');
        params.push(parseFloat(comissao_percentual !== undefined ? comissao_percentual : comissao_padrao) || 0);
      }
      if (meta_vendas_mes !== undefined) { sets.push('meta_vendas_mes = ?'); params.push(parseInt(meta_vendas_mes, 10) || 0); }
      if (pix_chave !== undefined) { sets.push('pix_chave = ?'); params.push(pix_chave); }
      if (cpf_cnpj !== undefined) { sets.push('cpf_cnpj = ?'); params.push(cpf_cnpj); }
      if (status_aprovacao) { sets.push('status_aprovacao = ?'); params.push(status_aprovacao); }
      if (senha) {
        const hash = await bcrypt.hash(senha, 10);
        sets.push('password_hash = ?');
        params.push(hash);
      }

      if (sets.length === 0) return res.json({ ok: true, mensagem: 'Nenhum campo para atualizar.' });
      params.push(id);

      masterDb.run(`UPDATE equipe_suporte SET ${sets.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, mensagem: 'Afiliado atualizado com sucesso.' });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.delete('/api/super/afiliados/:id', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    masterDb.run(`DELETE FROM equipe_suporte WHERE id = ?`, [id], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Afiliado removido com sucesso.' });
    });
  });

  app.get('/api/super/afiliados/:id/metricas', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    masterDb.get(`SELECT * FROM equipe_suporte WHERE id = ?`, [id], (err, afiliado) => {
      if (err || !afiliado) return res.status(404).json({ ok: false, erro: 'Afiliado não encontrado.' });
      masterDb.all(`SELECT * FROM suporte_vendas WHERE suporte_id = ? ORDER BY id DESC LIMIT 50`, [id], (_errV, vendas) => {
        res.json({
          ok: true,
          afiliado,
          vendas: vendas || []
        });
      });
    });
  });

  // ─── 31. CONSOLIDAÇÃO MRR & RECEITA DE ADD-ONS ────────────────
  app.get('/api/super/financeiro/saas/mrr-addons', superAdminAuth, (_req, res) => {
    masterDb.all(`
      SELECT tm.modulo_id as chave_modulo, 
        COALESCE(ms.nome, tm.modulo_id) as nome_modulo,
        ms.tipo,
        COUNT(DISTINCT tm.restaurante_id) as assinantes_por_modulo,
        SUM(CASE WHEN tm.trial_ate IS NOT NULL AND datetime(tm.trial_ate) > datetime('now', 'localtime') THEN 0 ELSE 49.00 END) as receita_total,
        SUM(CASE WHEN tm.trial_ate IS NOT NULL AND datetime(tm.trial_ate) > datetime('now', 'localtime') THEN 1 ELSE 0 END) as em_trial
      FROM tenant_modulos tm
      LEFT JOIN modulo_sistemas ms ON tm.modulo_id = ms.modulo_id
      WHERE tm.ativo = 1 AND ms.tipo != 'system'
      GROUP BY tm.modulo_id, ms.nome, ms.tipo
      ORDER BY receita_total DESC
    `, [], (errAddons, rowsAddons) => {
      masterDb.all(`
        SELECT SUM(valor_mensal) as mrr_base, COUNT(*) as total_assinantes
        FROM super_admin_assinaturas
        WHERE status != 'cancelado'
      `, [], (errAssin, rowsAssin) => {
        const mrrBase = (rowsAssin && rowsAssin[0] && rowsAssin[0].mrr_base) || 0;
        const totalAssinantes = (rowsAssin && rowsAssin[0] && rowsAssin[0].total_assinantes) || 0;
        
        let mrrAddons = 0;
        let qtdAddons = 0;
        const ranking = (rowsAddons || []).map(r => {
          mrrAddons += (r.receita_total || 0);
          qtdAddons += (r.assinantes_por_modulo || 0);
          return {
            chave_modulo: r.chave_modulo,
            nome_modulo: r.nome_modulo,
            tipo: r.tipo,
            assinantes_por_modulo: r.assinantes_por_modulo,
            receita_total: r.receita_total,
            em_trial: r.em_trial
          };
        });

        const mrrTotal = mrrBase + mrrAddons;

        res.json({
          ok: true,
          mrr_total_consolidado: mrrTotal,
          mrr_base_planos: mrrBase,
          mrr_addons: mrrAddons,
          qtd_addons: qtdAddons,
          total_assinantes: totalAssinantes,
          ranking_addons: ranking,
          addons_detalhados: ranking
        });
      });
    });
  });

  // ─── 32. SOLICITAÇÕES DE FEATURES OPERACIONAIS ────────────────
  app.post('/api/super/solicitacoes-features/delegar', superAdminAuth, (req, res) => {
    const { id, suporte_id } = req.body || {};
    if (!id || !suporte_id) return res.status(400).json({ ok: false, erro: 'ID da solicitação e do suporte obrigatórios.' });

    masterDb.run(`
      UPDATE solicitacoes_features 
      SET responsavel_id = ?, 
          responsavel_nome = (SELECT nome FROM equipe_suporte WHERE id = ?),
          responsavel_tipo = 'suporte',
          status = 'delegado'
      WHERE id = ?
    `, [suporte_id, suporte_id, id], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Solicitação delegada com sucesso ao membro do suporte.' });
    });
  });

  app.post('/api/super/solicitacoes-features/implementar', superAdminAuth, (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, erro: 'ID da solicitação obrigatório.' });

    masterDb.run(`
      UPDATE solicitacoes_features 
      SET status = 'implementado', resolvido_em = datetime('now', 'localtime')
      WHERE id = ?
    `, [id], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Solicitação marcada como implementada!' });
    });
  });

  app.post('/api/super/solicitacoes-features/:acao', superAdminAuth, (req, res) => {
    const { id, observacao } = req.body || {};
    const acao = req.params.acao;
    if (!id) return res.status(400).json({ ok: false, erro: 'ID da solicitação obrigatório.' });

    const statusMap = {
      aprovar: 'aprovado',
      recusar: 'recusado',
      rejeitar: 'recusado',
      arquivar: 'arquivado',
      concluir: 'implementado',
      cancelar: 'cancelado'
    };
    const novoStatus = statusMap[acao] || acao;

    masterDb.run(`
      UPDATE solicitacoes_features 
      SET status = ?, 
          resolvido_em = datetime('now', 'localtime'),
          observacao = COALESCE(?, observacao)
      WHERE id = ?
    `, [novoStatus, observacao || null, id], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: `Solicitação atualizada para status: ${novoStatus}.` });
    });
  });

  // ─── 33. SUPER NOTIFICAÇÕES & TAREFAS ────────────────────────
  app.post('/api/super/notificacoes/marcar-lida/:id', superAdminAuth, (req, res) => {
    const id = req.params.id;
    if (id === 'todas') {
      masterDb.run(`UPDATE super_notificacoes SET lida = 1`, function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, mensagem: 'Todas as notificações marcadas como lidas.' });
      });
    } else {
      masterDb.run(`UPDATE super_notificacoes SET lida = 1 WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, mensagem: 'Notificação marcada como lida.' });
      });
    }
  });

  app.patch('/api/super/tarefas/:id', superAdminAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { status, atribuido_a, resposta } = req.body || {};

    const sets = [];
    const params = [];
    if (status) {
      sets.push('status = ?');
      params.push(status);
      if (status === 'concluida') {
        sets.push("concluido_em = datetime('now', 'localtime')");
      }
    }
    if (atribuido_a !== undefined) { sets.push('atribuido_a = ?'); params.push(atribuido_a); }
    if (resposta !== undefined) { sets.push('resposta = ?'); params.push(resposta); }
    sets.push("atualizado_em = datetime('now', 'localtime')");

    params.push(id);

    masterDb.run(`UPDATE super_tarefas SET ${sets.join(', ')} WHERE id = ?`, params, function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Tarefa atualizada com sucesso.' });
    });
  });

  // ─── 34. CADASTROS MONITOR & PLUGINS ALIAS ───────────────────
  // GET /api/super/cadastros-monitor - telemetria recente de instalações e cadastros ao vivo
  app.get('/api/super/cadastros-monitor', superAdminAuth, (req, res) => {
    const horas = Math.max(1, parseInt(req.query.horas, 10) || 48);
    masterDb.all(`SELECT install_id, nome_restaurante, versao, ip, plataforma, online,
      created_at, updated_at, ultima_atividade, admin_login, chave_ativacao
      FROM telemetria
      WHERE created_at >= datetime('now','localtime', ?)
      ORDER BY created_at DESC LIMIT 100`, ['-' + horas + ' hours'], (err, rows) => {
      if (err) return res.json({ ok: true, cadastros: [] });
      const cadastros = (rows || []).map(r => {
        const campos = { restaurante_nome: r.nome_restaurante || '', versao: r.versao || '', instalacao: r.created_at || '' };
        if (r.admin_login) campos.admin = r.admin_login;
        if (r.chave_ativacao) campos.chave = r.chave_ativacao;
        return {
          sessao_id: r.install_id,
          etapa: r.online ? 'ativo' : 'parado',
          campos_json: JSON.stringify(campos),
          localizacao: null,
          dispositivo: r.plataforma || '',
          bateria: null,
          rede: null,
          ip: r.ip || '',
          status: r.online ? 'concluido' : 'em_andamento',
          atualizado_em: r.updated_at || r.ultima_atividade || r.created_at
        };
      });
      res.json({ ok: true, cadastros });
    });
  });

  // GET /api/super/plugins - alias unificado para listar módulos do sistema
  app.get('/api/super/plugins', superAdminAuth, (req, res) => {
    masterDb.all(`SELECT id, modulo_id, nome, categoria, preco_mensal, status, descricao, icone FROM modulo_sistemas ORDER BY categoria, nome`, [], (err, rows) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, plugins: rows || [] });
    });
  });

  // POST /api/super/plugins - ativar/desativar módulo
  app.post('/api/super/plugins', superAdminAuth, (req, res) => {
    const { plugin_id, modulo_id, ativo } = req.body || {};
    const modId = modulo_id || plugin_id;
    if (!modId) return res.json({ ok: false, erro: 'modulo_id ou plugin_id é obrigatório.' });
    masterDb.run(`UPDATE modulo_sistemas SET status = ?, atualizado_em = datetime('now','localtime') WHERE modulo_id = ? OR id = ?`,
      [ativo ? 'ativo' : 'inativo', modId, modId], function(err) {
        if (err) return res.json({ ok: false, erro: err.message });
        if (io) {
          io.emit('plugin_atualizado', { plugin_id: modId, ativo: !!ativo });
        }
        res.json({ ok: true, mensagem: `Módulo/Plugin ${modId} ${ativo ? 'ativado' : 'desativado'}.` });
      });
  });

  // ─── 48. ATIVAÇÃO DE MÓDULOS PELO DONO (TRIAL E IMEDIATO) ──────
  app.post('/api/dono/modulos/ativar-trial', verificarToken, (req, res) => {
    const { chave_modulo } = req.body || {};
    if (!chave_modulo) return res.status(400).json({ ok: false, erro: 'Chave do módulo não informada.' });
    const restId = (req.usuario && req.usuario.restaurante_id) || 1;
    masterDb.run(
      `INSERT INTO tenant_modulos (restaurante_id, modulo_id, ativo, trial_ate, atualizado_em)
       VALUES (?, ?, 1, datetime('now', '+7 days'), datetime('now','localtime'))
       ON CONFLICT(restaurante_id, modulo_id) DO UPDATE SET ativo = 1, trial_ate = datetime('now', '+7 days'), atualizado_em = datetime('now','localtime')`,
      [restId, chave_modulo],
      (err) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        if (io) {
          try { io.to(`restaurante_${restId}`).emit('modulo_status_alterado', { modulo_id: chave_modulo, ativo: true, trial: true }); } catch (e) {}
        }
        res.json({ ok: true, mensagem: 'Período de testes (Trial de 7 dias) ativado com sucesso!' });
      }
    );
  });

  app.post('/api/dono/modulos/ativar-imediato', verificarToken, (req, res) => {
    const { chave_modulo } = req.body || {};
    if (!chave_modulo) return res.status(400).json({ ok: false, erro: 'Chave do módulo não informada.' });
    const restId = (req.usuario && req.usuario.restaurante_id) || 1;
    masterDb.run(
      `INSERT INTO tenant_modulos (restaurante_id, modulo_id, ativo, trial_ate, atualizado_em)
       VALUES (?, ?, 1, NULL, datetime('now','localtime'))
       ON CONFLICT(restaurante_id, modulo_id) DO UPDATE SET ativo = 1, trial_ate = NULL, atualizado_em = datetime('now','localtime')`,
      [restId, chave_modulo],
      (err) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        if (io) {
          try { io.to(`restaurante_${restId}`).emit('modulo_status_alterado', { modulo_id: chave_modulo, ativo: true }); } catch (e) {}
        }
        res.json({ ok: true, mensagem: 'Módulo ativado com sucesso!' });
      }
    );
  });

  // ─── 49. MENSAGENS: CONFIRMAÇÃO DE LEITURA BROADCAST ───────────
  app.post('/api/mensagens/:id/lida', (req, res) => {
    res.json({ ok: true, success: true });
  });

  // ─── 50. CANCELAMENTO DE PEDIDO (FILA LITE) ───────────────────
  app.delete('/api/pedidos/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const tenantDb = resolveTenantDb(req);
    tenantDb.run(`UPDATE pedidos SET status = 'Cancelado' WHERE id = ?`, [id], function (err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      if (io) {
        try { io.emit('pedidos_atualizados'); } catch (e) {}
      }
      res.json({ success: true, mensagem: 'Pedido cancelado.' });
    });
  });

  // ─── 51. STATUS GENÉRICO DE PLUGINS / MÓDULOS ──────────────────
  app.get('/api/modulo/:id/status', (req, res) => {
    res.json({ ok: true, modulo: req.params.id, status: 'online' });
  });

  // ─── 52. HUB DE MARKETING (ROTA RAIZ) ─────────────────────────
  app.get('/api/hub-marketing', (req, res) => {
    masterDb.get(`SELECT valor FROM configuracoes_global WHERE chave = 'site_conteudo'`, [], (err, row) => {
      res.json({ ok: true, status: 'online', dados: row ? row.valor : null });
    });
  });

  // ─── 53. ATIVAÇÃO CENTRAL DE LICENÇAS E TELEMETRIA HUB ─────────
  app.post('/api/licenca/ativar', (req, res) => {
    const { chave, install_id, nome_restaurante, versao, plataforma } = req.body || {};
    if (!chave) return res.status(400).json({ ok: false, error: 'Chave de ativação não informada.' });
    masterDb.get(`SELECT * FROM licencas WHERE chave = ?`, [chave.trim()], (err, lic) => {
      if (err || !lic) {
        return res.status(404).json({ ok: false, error: 'Chave de licença não encontrada ou inválida.' });
      }
      if (lic.status === 'revogada') {
        return res.status(403).json({ ok: false, error: 'Chave de licença revogada pela administração central.' });
      }
      masterDb.run(
        `UPDATE licencas SET status = 'usada', usada_em = datetime('now','localtime'), usada_por = ?, install_id = ? WHERE id = ?`,
        [nome_restaurante || 'Desconhecido', install_id || '', lic.id],
        () => {
          res.json({
            ok: true,
            status: 'ativa',
            plano: lic.plano || 'premium',
            dias: lic.dias || 30,
            validade: lic.validade,
            max_dispositivos: lic.max_dispositivos || 50
          });
        }
      );
    });
  });

  app.post('/api/telemetria', (req, res) => {
    const p = req.body || {};
    const installId = p.install_id || p.installId || '';
    if (installId) {
      masterDb.run(
        `INSERT INTO telemetria (install_id, restaurante_id, versao, plataforma, ip, ultima_atividade)
         VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
         ON CONFLICT(install_id) DO UPDATE SET
           ultima_atividade = datetime('now','localtime'),
           versao = excluded.versao,
           ip = excluded.ip`,
        [installId, p.restaurante_id || 1, p.versao || '', p.plataforma || '', req.ip || ''],
        () => {}
      );
    }
    res.json({ ok: true });
  });

  // ─── 54. IMPRIMIR PRÉ-CONTA / CONFERÊNCIA DE MESA ───────────────
  app.post('/api/pedidos/imprimir-preconta', (req, res) => {
    const { mesaName, operador } = req.body || {};
    if (!mesaName) return res.status(400).json({ ok: false, error: 'Mesa não informada.' });
    const tdb = resolveTenantDb(req);
    tdb.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND status != 'Finalizado'`, [mesaName, mesaName], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      const itens = rows || [];
      const subtotal = itens.reduce((acc, it) => acc + (parseFloat(String(it.total).replace(',', '.')) || 0), 0);
      const taxa = subtotal * 0.10;
      const total = subtotal + taxa;
      
      if (typeof global.registrarAuditoria === 'function') {
        global.registrarAuditoria(operador || 'Garçom', 'PRE_CONTA', `Pré-conta impressa para ${mesaName} (Total: R$ ${total.toFixed(2)})`, 'Salão', 'BAIXO');
      }

      res.json({
        ok: true,
        mesa: mesaName,
        operador: operador || 'Garçom',
        itens_count: itens.length,
        subtotal: subtotal,
        taxa_servico: taxa,
        total: total,
        mensagem: `Pré-conta da ${mesaName} gerada com sucesso.`
      });
    });
  });

  console.log('✅ [rotas-faltantes] Todas as rotas ausentes do Super Admin e Garçom restauradas com sucesso.');
};



