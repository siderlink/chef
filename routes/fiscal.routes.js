/**
 * routes/fiscal.routes.js
 * Módulo Fiscal extraído do server.js (linhas 9127–9310, 9396–9467)
 *
 * Agrupa NF-e (Modelo 65 - NFC-e), SAT (CF-e Modelo 59) e Formas de Pagamento.
 *
 * Depende de:
 *   - nfceService  (./nfce-service)   — injetado via context.nfceService
 *   - satService   (./sat-service)    — injetado via context.satService
 *
 * Rotas NFC-e:
 *   GET  /api/nfce/notas
 *   GET  /api/nfce/danfe/:id      (HTML)
 *   GET  /api/nfce/xml/:id        (download)
 *   POST /api/nfce/emitir
 *
 * Rotas SAT:
 *   POST /api/fiscal/sat/emitir
 *   GET  /api/fiscal/sat/extrato/:chave
 *   GET  /api/fiscal/sat/cupons
 *   POST /api/fiscal/sat/cancelar
 *
 * Rotas Formas de Pagamento:
 *   GET    /api/formas-pagamento
 *   POST   /api/formas-pagamento        (criar ou editar se body.id)
 *   POST   /api/formas-pagamento/:id/toggle
 *   DELETE /api/formas-pagamento/:id
 */
'use strict';

const { Router } = require('express');
const { getContext } = require('./shared/context');

// ── NFC-e Router ────────────────────────────────────────────────────────────

function createNfceRouter() {
  const router = Router();
  const { withTenant } = getContext();
  const getDb = () => getContext().getTenantDb();

  // GET /api/nfce/notas
  router.get('/notas', (req, res) => {
    withTenant(req, () => {
      getDb().all(
        'SELECT id, pedido_id, localName, cliente_nome, cpf_cnpj, valor_total, chave_acesso, numero_nota, serie, ambiente, status, protocolo, created_at FROM nfce_notas ORDER BY id DESC',
        (err, rows) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json(rows || []);
        }
      );
    });
  });

  // GET /api/nfce/danfe/:id — retorna HTML do DANFE
  router.get('/danfe/:id', (req, res) => {
    const { nfceService } = getContext();
    withTenant(req, () => {
      const db = getDb();
      db.get('SELECT * FROM nfce_notas WHERE id = ?', [req.params.id], (err, nota) => {
        if (err || !nota) return res.status(404).send('Nota Fiscal não encontrada');
        db.all('SELECT * FROM configuracoes', (errCfg, rows) => {
          const config = {};
          if (rows) rows.forEach(r => { config[r.chave] = r.valor; });
          const danfeHtml = nota.danfe_html || (nfceService && nfceService.gerarDANFEHTML(nota, config)) || '<p>DANFE não disponível</p>';
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.send(danfeHtml);
        });
      });
    });
  });

  // GET /api/nfce/xml/:id — download do XML
  router.get('/xml/:id', (req, res) => {
    const { nfceService } = getContext();
    withTenant(req, () => {
      const db = getDb();
      db.get('SELECT * FROM nfce_notas WHERE id = ?', [req.params.id], (err, nota) => {
        if (err || !nota) return res.status(404).send('Nota Fiscal não encontrada');
        db.all('SELECT * FROM configuracoes', (errCfg, rows) => {
          const config = {};
          if (rows) rows.forEach(r => { config[r.chave] = r.valor; });
          const xml = nota.xml_content || (nfceService && nfceService.gerarXMLNFCe(nota, config)) || '';
          res.setHeader('Content-Type', 'application/xml');
          res.setHeader('Content-Disposition', `attachment; filename=NFCe_${nota.chave_acesso || nota.id}.xml`);
          res.send(xml);
        });
      });
    });
  });

  // POST /api/nfce/emitir
  router.post('/emitir', async (req, res) => {
    const { nfceService, withTenant } = getContext();
    withTenant(req, () => {
      const db = getDb();
      db.all('SELECT * FROM configuracoes', async (errConfig, configRows) => {
        const config = {};
        if (configRows) configRows.forEach(r => { config[r.chave] = r.valor; });
        try {
          const result = await nfceService.emitirNFCe({ db, ...req.body, config });
          res.json(result);
        } catch (e) {
          res.status(500).json({ success: false, error: e.message });
        }
      });
    });
  });

  return router;
}

// ── SAT Router ───────────────────────────────────────────────────────────────

function createSatRouter() {
  const router = Router();
  const { withTenant } = getContext();
  const getDb = () => getContext().getTenantDb();

  // POST /api/fiscal/sat/emitir
  router.post('/emitir', async (req, res) => {
    const { satService } = getContext();
    try {
      withTenant(req, () => {
        const db = getDb();
        db.all('SELECT * FROM configuracoes', async (errConfig, configRows) => {
          const config = {};
          if (configRows) configRows.forEach(r => { config[r.chave] = r.valor; });
          if (req.body.sat_serie)             config.numero_serie_sat     = req.body.sat_serie;
          if (req.body.sat_codigo_ativacao)   config.codigo_ativacao      = req.body.sat_codigo_ativacao;
          if (req.body.sat_cnpj_sh)           config.cnpj_software_house  = req.body.sat_cnpj_sh;
          if (req.body.sat_signac)            config.sign_ac              = req.body.sat_signac;

          try {
            const result = await satService.emitirSAT({
              db,
              orderId:       req.body.pedido_id || req.body.orderId,
              items:         req.body.itens || req.body.items || [],
              paymentMethod: req.body.forma_pagamento || req.body.paymentMethod || 'Dinheiro',
              changeFor:     req.body.troco_para || req.body.changeFor || 0,
              cpf_cnpj:      req.body.cpf_destinatario || req.body.cpf_cnpj || null,
              config
            });
            const xmlResult = satService.gerarXMLCFe({ items: req.body.itens || [], numero_cupom: result.numero_cupom }, config);
            res.json({
              success:      result.ok,
              ok:           result.ok,
              chave:        result.chave_acesso,
              chave_acesso: result.chave_acesso,
              xml:          xmlResult.xml,
              extrato_url:  result.extrato_url,
              extrato_html: result.extrato_html,
              numero_cupom: result.numero_cupom,
              status:       result.status,
              mensagem:     result.mensagem,
              error:        result.erro
            });
          } catch (e) {
            res.status(500).json({ success: false, ok: false, error: e.message });
          }
        });
      });
    } catch (err) {
      res.status(500).json({ success: false, ok: false, error: err.message });
    }
  });

  // GET /api/fiscal/sat/extrato/:chave
  router.get('/extrato/:chave', (req, res) => {
    const { satService, withTenant } = getContext();
    withTenant(req, () => {
      const db = getDb();
      db.get('SELECT * FROM sat_cupons WHERE chave_acesso = ?', [req.params.chave], (err, cupom) => {
        if (err || !cupom) return res.status(404).send('Extrato SAT não encontrado para a chave informada.');
        db.all('SELECT * FROM configuracoes', (errConfig, configRows) => {
          const config = {};
          if (configRows) configRows.forEach(r => { config[r.chave] = r.valor; });
          const html = satService.gerarExtratoSATHTML({
            id:            cupom.id,
            numero_cupom:  cupom.numero_cupom,
            chave_acesso:  cupom.chave_acesso,
            items:         [],
            paymentMethod: cupom.forma_pagamento,
            cpf_cnpj:      cupom.cpf_cnpj,
            created_at:    cupom.created_at
          }, config);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.send(html);
        });
      });
    });
  });

  // GET /api/fiscal/sat/cupons
  router.get('/cupons', (req, res) => {
    withTenant(req, () => {
      const db = getDb();
      db.run(`
        CREATE TABLE IF NOT EXISTS sat_cupons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pedido_id INTEGER, numero_cupom INTEGER,
          numero_serie_sat TEXT, chave_acesso TEXT UNIQUE,
          xml_envio TEXT, xml_retorno TEXT,
          valor_total REAL, forma_pagamento TEXT,
          cpf_cnpj TEXT, status TEXT DEFAULT 'Autorizado',
          sessao_sat INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `, () => {
        db.all('SELECT * FROM sat_cupons ORDER BY id DESC LIMIT 100', [], (err, rows) => {
          if (err) return res.status(500).json({ success: false, error: err.message });
          res.json({ success: true, cupons: (rows || []).map(r => ({ ...r, chave: r.chave_acesso })) });
        });
      });
    });
  });

  // POST /api/fiscal/sat/cancelar
  router.post('/cancelar', async (req, res) => {
    const { satService } = getContext();
    try {
      const { chave, motivo } = req.body;
      if (!chave) return res.status(400).json({ success: false, error: 'Chave do cupom SAT é obrigatória.' });
      getContext().withTenant(req, async () => {
        const result = await satService.cancelarSAT(getDb(), chave, motivo);
        res.json({
          success:  result.ok,
          ok:       result.ok,
          status:   result.ok ? 'CANCELADO' : 'ERRO',
          mensagem: result.mensagem,
          error:    result.erro
        });
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

// ── Formas de Pagamento Router ────────────────────────────────────────────────

function createFormasPagamentoRouter() {
  const router = Router();
  const getDb      = () => getContext().getTenantDb();
  const broadcast  = () => {
    const ctx = getContext();
    if (typeof ctx.broadcastFormasPagamento === 'function') ctx.broadcastFormasPagamento();
    else ctx.io && ctx.io.emit('formas_pagamento_atualizadas');
  };
  const resolveTid = (req) => {
    const ctx = getContext();
    if (typeof ctx.resolveTenantId === 'function') return ctx.resolveTenantId(req);
    return parseInt(req.headers['x-tenant-id'] || req.query.restaurante_id || '1', 10) || 1;
  };

  // GET /api/formas-pagamento
  router.get('/', (req, res) => {
    getContext().withTenant(req, () => {
      getDb().all('SELECT * FROM formas_pagamento ORDER BY ordem ASC, id ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      });
    });
  });

  // POST /api/formas-pagamento — criar (sem id) ou editar (com id no body)
  router.post('/', (req, res) => {
    const { id, nome, tipo, taxa, prazo_dias, ativo, icone } = req.body || {};
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const tid = resolveTid(req);
    getContext().withTenant(req, () => {
      const db = getDb();
      if (id) {
        db.run(
          'UPDATE formas_pagamento SET nome = ?, tipo = ?, taxa = ?, prazo_dias = ?, ativo = ?, icone = ? WHERE id = ?',
          [nome, tipo || 'credito', parseFloat(taxa) || 0, parseInt(prazo_dias) || 0, ativo ? 1 : 0, icone || 'ph-credit-card', id],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });
            broadcast();
            res.json({ success: true, id });
          }
        );
      } else {
        db.run(
          'INSERT INTO formas_pagamento (nome, tipo, taxa, prazo_dias, ativo, icone) VALUES (?, ?, ?, ?, ?, ?)',
          [nome, tipo || 'credito', parseFloat(taxa) || 0, parseInt(prazo_dias) || 0, ativo !== undefined ? (ativo ? 1 : 0) : 1, icone || 'ph-credit-card'],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });
            broadcast();
            res.json({ success: true, id: this.lastID });
          }
        );
      }
    });
  });

  // POST /api/formas-pagamento/:id/toggle
  router.post('/:id/toggle', (req, res) => {
    const { ativo } = req.body || {};
    getContext().withTenant(req, () => {
      getDb().run('UPDATE formas_pagamento SET ativo = ? WHERE id = ?', [ativo ? 1 : 0, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        broadcast();
        res.json({ success: true });
      });
    });
  });

  // DELETE /api/formas-pagamento/:id
  router.delete('/:id', (req, res) => {
    getContext().withTenant(req, () => {
      const db = getDb();
      db.get('SELECT nome FROM formas_pagamento WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Forma de pagamento não encontrada.' });
        db.get('SELECT COUNT(*) as count FROM pedidos WHERE paymentMethod = ?', [row.nome], (e, r) => {
          if (!e && r && r.count > 0) {
            return res.status(400).json({ error: `"${row.nome}" não pode ser excluído pois já foi utilizado em ${r.count} pedido(s). Apenas desative-o.` });
          }
          db.run('DELETE FROM formas_pagamento WHERE id = ?', [req.params.id], function (err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            broadcast();
            res.json({ success: true });
          });
        });
      });
    });
  });

  return router;
}

module.exports = { createNfceRouter, createSatRouter, createFormasPagamentoRouter };
