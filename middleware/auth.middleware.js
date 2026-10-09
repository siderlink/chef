/**
 * middleware/auth.middleware.js
 * Middleware de Autenticação JWT, Controle de Permissões (RBAC) e Isolamento de Tenant.
 *
 * Camadas de proteção implementadas:
 * 1. Validação de formato de cabeçalho Bearer Token
 * 2. Validação criptográfica com JWT_SECRET (algoritmo estrito HS256)
 * 3. Injeção de identidade na requisição: req.restaurante_id, req.user_role, req.user_id, req.user_nome
 * 4. Contexto de isolamento de dados via tenantContext (AsyncLocalStorage)
 * 5. Middleware requireRole para proteção de rotas restritas a gerentes/administradores
 */

'use strict';

const jwt = require('jsonwebtoken');

/**
 * Cria a função de middleware verificarToken utilizando a chave secreta e o contexto fornecidos.
 * @param {string} jwtSecret - Chave secreta de assinatura JWT
 * @param {Object} [tenantContext] - Instância de AsyncLocalStorage para isolamento multi-tenant
 * @returns {Function} Express middleware (req, res, next)
 */
function createAuthMiddleware(jwtSecret, tenantContext) {
  return function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(403).json({ success: false, ok: false, error: 'Nenhum token fornecido.' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return res.status(401).json({ success: false, ok: false, error: 'Formato de token inválido. Esperado Bearer <token>.' });
    }

    const token = parts[1];
    jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }, (err, decoded) => {
      if (err || !decoded) {
        return res.status(401).json({ success: false, ok: false, error: 'Sessão expirada ou token inválido.' });
      }

      req.restaurante_id = decoded.restaurante_id;
      req.user_role = decoded.role || decoded.cargo || 'usuario';
      req.user_id = decoded.id;
      req.user_nome = decoded.nome;
      req.user_tipo = decoded.tipo || 'usuario';

      if (tenantContext && typeof tenantContext.run === 'function' && decoded.restaurante_id) {
        tenantContext.run(decoded.restaurante_id, () => {
          next();
        });
      } else {
        next();
      }
    });
  };
}

/**
 * Middleware para exigir perfil administrativo ou gerencial.
 * @param {string[]} allowedRoles - Lista de papéis autorizados (ex: ['admin', 'gerente'])
 */
function requireRole(allowedRoles = ['admin', 'gerente']) {
  return function roleGuard(req, res, next) {
    if (!req.user_role || !allowedRoles.includes(req.user_role.toLowerCase())) {
      return res.status(403).json({
        success: false,
        ok: false,
        error: 'Acesso negado: operação restrita a administradores ou gerentes.'
      });
    }
    next();
  };
}

module.exports = {
  createAuthMiddleware,
  requireRole
};
