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

// Sprint 4
const { createAdminRouter }                         = require('./admin.routes');
const { createMesasRouter }                         = require('./mesas.routes');

// Sprint 5
const { createComandasRouter }                      = require('./comandas.routes');

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

  // ── Sprint 4 ─────────────────────────────────────────────────────────
  app.use('/api/mesas',      createMesasRouter());
  
  const adminRouter = createAdminRouter();
  app.use('/api/configuracoes', (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/configuracoes' + req.url }), res, next));
  app.use('/api/config',        (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/config' + req.url }), res, next));
  app.use('/api/funcoes',       (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/funcoes' + req.url }), res, next));
  app.use('/api/loja',          (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/loja' + req.url }), res, next));
  app.use('/api/plugins',       (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/plugins' + req.url }), res, next));
  app.use('/api/sync',          (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/sync' + req.url }), res, next));
  app.use('/api/mensagens',     (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/mensagens' }), res, next));
  app.use('/api/licenca',       (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/licenca' + req.url }), res, next));
  app.use('/api/pwa',           (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/pwa' + req.url }), res, next));
  app.use('/api/seguranca',     (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/seguranca' + req.url }), res, next));
  app.use('/api/status-bloqueio', (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/status-bloqueio' }), res, next));

  // ── Sprint 5 ─────────────────────────────────────────────────────────
  app.use('/api/comandas',   createComandasRouter());

  const sprints = [
    'auth', 'caixa', 'kds', 'painel-tv',
    'pedidos', 'metricas', 'cupons', 'ia',
    'nfce', 'fiscal/sat', 'formas-pagamento', 'dispositivos', 'relatorios',
    'admin', 'mesas', 'comandas'
  ];
  console.log(`[routes] ✅ ${sprints.length} módulos montados: ${sprints.join(' | ')}`);
}

module.exports = { initRoutes };
