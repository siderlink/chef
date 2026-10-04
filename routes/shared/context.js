/**
 * routes/shared/context.js
 * Contêiner de dependências compartilhadas entre todos os módulos de rotas.
 * O server.js injeta as dependências UMA VEZ na inicialização.
 * Os módulos de rotas as consomem via getContext().
 */

let _ctx = null;

/**
 * Inicializa o contexto com as dependências do server.js.
 * Chamar apenas UMA VEZ no boot do servidor.
 * @param {Object} deps
 * @param {Object} deps.db           - Banco de dados tenant ativo (getter dinâmico)
 * @param {Object} deps.masterDb     - Banco mestre de restaurantes/usuários
 * @param {Function} deps.getTenantDb  - Função que retorna o db do tenant corrente
 * @param {Function} deps.verificarToken - Middleware JWT
 * @param {Object} deps.io           - Instância do Socket.io
 * @param {Object} deps.upload       - Instância do multer
 * @param {string} deps.JWT_SECRET   - Chave JWT
 * @param {Function} deps.withTenant - Helper de contexto de tenant
 * @param {Object} deps.bcrypt       - Módulo bcrypt
 * @param {Object} deps.jwt          - Módulo jsonwebtoken
 */
function initContext(deps) {
  if (_ctx) {
    console.warn('[routes/shared] initContext chamado mais de uma vez — ignorando.');
    return;
  }
  _ctx = deps;
}

/**
 * Retorna o contexto de dependências.
 * Lança erro se initContext não foi chamado antes.
 */
function getContext() {
  if (!_ctx) {
    throw new Error('[routes/shared] Contexto não inicializado. Chame initContext() no boot.');
  }
  return _ctx;
}

module.exports = { initContext, getContext };
