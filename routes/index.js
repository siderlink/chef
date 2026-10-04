/**
 * routes/index.js
 * ──────────────────────────────────────────────────────────────────────────
 * Ponto central de montagem de todos os módulos de rotas extraídos.
 *
 * COMO USAR no server.js:
 *   const { initRoutes } = require('./routes');
 *   initRoutes(app, { db, masterDb, getTenantDb, verificarToken, io, ... });
 * ──────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { initContext } = require('./shared/context');

// Sprint 1
const { createAuthRouter }                          = require('./auth.routes');
const { createCaixaRouter }                         = require('./caixa.routes');
const { createKdsRouter, createPainelTvRouter }     = require('./kds.routes');

// Sprint 2
const { createPedidosRouter, createMetricasRouter } = require('./pedidos.routes');
const { createCuponsRouter }                        = require('./cupons.routes');
const { createIaRouter }                            = require('./ia.routes');

// Sprint 3
const { createNfceRouter, createSatRouter, createFormasPagamentoRouter } = require('./fiscal.routes');
const { createDispositivosRouter }                  = require('./dispositivos.routes');
const { createRelatoriosRouter, createAuditoriaCancelamentosRouter } = require('./relatorios.routes');

/**
 * Inicializa e monta todos os módulos de rotas no app Express.
 * @param {import('express').Application} app
 * @param {Object} deps - Dependências compartilhadas do server.js
 */
function initRoutes(app, deps) {
  initContext(deps);

  // ── Sprint 1 ─────────────────────────────────────────────────────────
  app.use('/api/auth',       createAuthRouter());
  app.use('/api/caixa',      createCaixaRouter());
  app.use('/api/kds',        createKdsRouter());
  app.use('/api/painel-tv',  createPainelTvRouter());

  app.get('/api/mesas', (req, res) => {
    deps.getTenantDb().all('SELECT * FROM mesas ORDER BY id ASC', [], (err, rows) => {
      res.json(rows || []);
    });
  });

  // ── Sprint 2 ─────────────────────────────────────────────────────────
  app.use('/api/pedidos',    createPedidosRouter());
  app.use('/api/metricas',   createMetricasRouter());
  app.use('/api/cupons',     createCuponsRouter());
  app.use('/api/ia',         createIaRouter());

  // ── Sprint 3 ─────────────────────────────────────────────────────────
  app.use('/api/nfce',              createNfceRouter());
  app.use('/api/fiscal/sat',        createSatRouter());
  app.use('/api/formas-pagamento',  createFormasPagamentoRouter());
  app.use('/api/relatorios',        createRelatoriosRouter());

  // Auditoria e dispositivos montados em /api diretamente
  const dispositivosRouter = createDispositivosRouter();
  app.get('/api/auditoria',    (req, res, next) => dispositivosRouter.handle(Object.assign(req, { url: '/auditoria' }), res, next));
  app.get('/api/logs-api',     (req, res, next) => dispositivosRouter.handle(Object.assign(req, { url: '/logs-api'   }), res, next));
  app.use('/api/dispositivos', createDispositivosRouter());
  app.use('/api/auditoria',    createAuditoriaCancelamentosRouter());

  const sprints = [
    'auth', 'caixa', 'kds', 'painel-tv',
    'pedidos', 'metricas', 'cupons', 'ia',
    'nfce', 'fiscal/sat', 'formas-pagamento', 'dispositivos', 'relatorios'
  ];
  console.log(`[routes] ✅ ${sprints.length} módulos montados: ${sprints.join(' | ')}`);
}

module.exports = { initRoutes };
