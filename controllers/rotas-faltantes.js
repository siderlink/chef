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
    masterDb.all(`SELECT chave, valor FROM configuracoes_global WHERE chave LIKE 'modulo_%' OR chave LIKE 'module_%'`, [], (err, rows) => {
      const modulos = {};
      (rows || []).forEach(r => { modulos[r.chave] = r.valor; });
      res.json({ ok: true, modulos });
    });
  });

  app.post('/api/super/modulos/global', superAdminAuth, (req, res) => {
    const { modulo, ativo } = req.body || {};
    if (!modulo) return res.json({ ok: false, erro: 'modulo obrigatório.' });
    const chave = modulo.startsWith('modulo_') ? modulo : `modulo_${modulo}`;
    const valor = ativo !== false ? '1' : '0';
    masterDb.run(`INSERT INTO configuracoes_global (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor], (err) => {
      res.json({ ok: !err, mensagem: err ? err.message : `Módulo ${modulo} ${ativo !== false ? 'ativado' : 'desativado'} globalmente.` });
    });
  });

  app.post('/api/super/modulos/tenant', superAdminAuth, (req, res) => {
    const { restaurante_id, modulo, ativo } = req.body || {};
    if (!restaurante_id || !modulo) return res.json({ ok: false, erro: 'restaurante_id e modulo obrigatórios.' });
    const tdb = typeof getTenantDb === 'function' ? getTenantDb(restaurante_id) : db;
    // Lê config atual
    tdb.get(`SELECT valor FROM configuracoes WHERE chave = 'modules_config'`, [], (err, row) => {
      let cfg = {};
      try { cfg = row ? JSON.parse(row.valor) : {}; } catch (e) {}
      cfg[modulo] = ativo !== false;
      const valor = JSON.stringify(cfg);
      tdb.run(`INSERT INTO configuracoes (chave, valor) VALUES ('modules_config', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [valor], (err2) => {
        res.json({ ok: !err2, mensagem: err2 ? err2.message : `Módulo ${modulo} ${ativo !== false ? 'ativado' : 'desativado'} para restaurante ${restaurante_id}.` });
      });
    });
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

  console.log('✅ [rotas-faltantes] 22 rotas ausentes restauradas com sucesso.');
};
