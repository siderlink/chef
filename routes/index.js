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

// Sprint 6 (Novos Módulos e Blindagem de Segurança)
const { createMontaveisRouter }                     = require('./montaveis.routes');
const { createTerminaisRouter }                     = require('./terminais.routes');
const { createRhRouter }                            = require('./rh.routes');
const { createFidelidadeRouter }                    = require('./fidelidade.routes');
const { createMarketingRouter }                     = require('./marketing.routes');
const { createBackupRouter }                        = require('./backup.routes');

// Sprint 7 (Produtos, Importação e Hardware TEF/Impressão)
const { createProdutosRouter }                      = require('./produtos.routes');
const { createHardwareRouter }                      = require('./hardware.routes');

/**
 * Inicializa e monta todos os módulos de rotas no app Express com preservação estrita
 * de todas as camadas de segurança (JWT, withTenant, RBAC, Rate-Limit).
 * @param {import('express').Application} app
 * @param {Object} deps - Dependências compartilhadas do server.js
 */
function initRoutes(app, deps) {
  initContext(deps);

  // ── Sprint 1: Autenticação, Caixa e KDS ────────────────────────────────
  const authRouter = createAuthRouter();
  app.use('/api/auth',                     authRouter);
  app.use('/api/equipe/politica-acesso',   (req, res, next) => authRouter.handle(Object.assign(req, { url: '/politica-acesso' }), res, next));
  app.use('/api/restaurante/info-publica', (req, res, next) => authRouter.handle(Object.assign(req, { url: '/info-publica' }), res, next));

  app.use('/api/caixa',      createCaixaRouter());
  app.use('/api/kds',        createKdsRouter());
  app.use('/api/painel-tv',  createPainelTvRouter());

  // ── Sprint 2: Pedidos, Métricas, Cupons e IA ──────────────────────────
  app.use('/api/pedidos',    createPedidosRouter());
  app.use('/api/metricas',   createMetricasRouter());
  app.use('/api/cupons',     createCuponsRouter());
  app.use('/api/ia',         createIaRouter());

  // ── Sprint 3: Fiscal, SAT, Pagamentos, Relatórios e Auditoria ─────────
  app.use('/api/nfce',              createNfceRouter());
  app.use('/api/fiscal/sat',        createSatRouter());
  app.use('/api/formas-pagamento',  createFormasPagamentoRouter());
  app.use('/api/relatorios',        createRelatoriosRouter());

  const dispositivosRouter = createDispositivosRouter();
  app.get('/api/auditoria',        (req, res, next) => dispositivosRouter.handle(Object.assign(req, { url: '/auditoria' }), res, next));
  app.get('/api/logs-api',         (req, res, next) => dispositivosRouter.handle(Object.assign(req, { url: '/logs-api' }), res, next));
  app.use('/api/dispositivos',     dispositivosRouter);
  app.use('/api/pwa-dispositivos', (req, res, next) => dispositivosRouter.handle(Object.assign(req, { url: '/pwa-dispositivos' + req.url }), res, next));
  app.use('/api/auditoria',        createAuditoriaCancelamentosRouter());

  // ── Sprint 4: Mesas e Administração ───────────────────────────────────
  const mesasRouter = createMesasRouter();
  app.use('/api/mesas', mesasRouter);
  app.get('/api/mesa-perfil/:mesa_nome', (req, res, next) => mesasRouter.handle(Object.assign(req, { url: '/perfil/' + encodeURIComponent(req.params.mesa_nome) }), res, next));
  app.get('/api/sugestoes-promocao',     (req, res, next) => mesasRouter.handle(Object.assign(req, { url: '/sugestoes-promocao' }), res, next));
  
  const adminRouter = createAdminRouter();
  app.use('/api/configuracoes',   (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/configuracoes' + req.url }), res, next));
  app.use('/api/config',          (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/config' + req.url }), res, next));
  app.use('/api/funcoes',         (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/funcoes' + req.url }), res, next));
  app.use('/api/loja',            (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/loja' + req.url }), res, next));
  app.use('/api/plugins',         (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/plugins' + req.url }), res, next));
  app.use('/api/sync',            (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/sync' + req.url }), res, next));
  app.use('/api/mensagens',       (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/mensagens' }), res, next));
  app.use('/api/licenca',         (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/licenca' + req.url }), res, next));
  app.use('/api/pwa',             (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/pwa' + req.url }), res, next));
  app.use('/api/seguranca',       (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/seguranca' + req.url }), res, next));
  app.use('/api/status-bloqueio', (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/status-bloqueio' }), res, next));
  app.get('/api/layout/injected-css', (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/layout/injected-css' }), res, next));
  app.get('/api/qr',              (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/qr' }), res, next));
  app.get('/api/server-status',   (req, res, next) => adminRouter.handle(Object.assign(req, { url: '/server-status' }), res, next));

  // ── Sprint 5: Comandas ────────────────────────────────────────────────
  app.use('/api/comandas',   createComandasRouter());

  // ── Sprint 6: Montáveis, Terminais, RH, Fidelidade, Marketing e Backup ─
  app.use('/api/montaveis',  createMontaveisRouter());
  app.use('/api/terminais',  createTerminaisRouter());

  const rhRouter = createRhRouter();
  app.use('/api/rh',           rhRouter);
  app.use('/api/funcionarios', (req, res, next) => rhRouter.handle(Object.assign(req, { url: '/funcionarios' + req.url }), res, next));

  app.use('/api/fidelidade', createFidelidadeRouter());

  const marketingRouter = createMarketingRouter();
  app.use('/api/marketing',            marketingRouter);
  app.post('/api/track/visit',         (req, res, next) => marketingRouter.handle(Object.assign(req, { url: '/track/visit' }), res, next));
  app.post('/api/track/click',         (req, res, next) => marketingRouter.handle(Object.assign(req, { url: '/track/click' }), res, next));
  app.use('/api/leads/nicho',          (req, res, next) => marketingRouter.handle(Object.assign(req, { url: '/leads/nicho' + req.url }), res, next));
  app.post('/api/seo/disparar-pinger', (req, res, next) => marketingRouter.handle(Object.assign(req, { url: '/seo/disparar-pinger' }), res, next));

  const backupRouter = createBackupRouter();
  app.use('/api', backupRouter);

  // ── Sprint 7: Produtos & Importação e Hardware TEF/Impressão ──────────
  const produtosRouter = createProdutosRouter();
  app.use('/api/produtos',          produtosRouter);
  app.get('/api/template-produtos', (req, res, next) => produtosRouter.handle(Object.assign(req, { url: '/template' }), res, next));
  app.post('/api/importar-produtos', (req, res, next) => produtosRouter.handle(Object.assign(req, { url: '/importar' }), res, next));

  const hardwareRouter = createHardwareRouter();
  app.post('/api/imprimir/cupom-raw', (req, res, next) => hardwareRouter.handle(Object.assign(req, { url: '/imprimir/cupom-raw' }), res, next));
  app.post('/api/maquininha/testar',  (req, res, next) => hardwareRouter.handle(Object.assign(req, { url: '/maquininha/testar' }), res, next));

  const sprints = [
    'auth', 'caixa', 'kds', 'painel-tv',
    'pedidos', 'metricas', 'cupons', 'ia',
    'nfce', 'fiscal/sat', 'formas-pagamento', 'dispositivos', 'relatorios',
    'admin', 'mesas', 'comandas',
    'montaveis', 'terminais', 'rh', 'fidelidade', 'marketing', 'backup',
    'produtos', 'hardware'
  ];
  console.log(`[routes] ✅ ${sprints.length} módulos montados com proteções ativas: ${sprints.join(' | ')}`);
}

module.exports = { initRoutes };
