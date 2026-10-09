/**
 * middleware/tenant.middleware.js
 * Middleware de Resolução de Tenant e Isolamento de Estabelecimentos.
 *
 * Prioridade de resolução de tenant:
 * 1. Domínio próprio (ex: restaurantenovo.com.br)
 * 2. Subdomínio por slug (ex: filial1.sistema.com)
 * 3. Token JWT autenticado (Bearer Token — prioridade máxima se logado)
 * 4. Header HTTP de proxy interno (x-tenant-id / x-restaurante-id)
 * 5. Query string para links públicos (QR Code da mesa, cardápio digital)
 *
 * Injeta:
 * - req.tenantId (número inteiro estrito)
 * - Execução delimitada em tenantContext (AsyncLocalStorage) para o banco de dados correto
 */

'use strict';

const jwt = require('jsonwebtoken');

function createTenantMiddleware({ domainMap, slugMap, baseDomain = '', jwtSecret, tenantContext }) {
  return function resolveTenant(req, res, next) {
    let tenantId = null;
    const rawHost = (req.headers.host || req.hostname || '').split(':')[0].toLowerCase();

    // 1. Domínio próprio
    if (domainMap && typeof domainMap.has === 'function' && domainMap.has(rawHost)) {
      tenantId = domainMap.get(rawHost);
    }
    // 2. Subdomínio por slug
    else if (rawHost && slugMap && typeof slugMap.has === 'function') {
      let sub = '';
      if (baseDomain && rawHost.endsWith('.' + baseDomain)) {
        sub = rawHost.replace('.' + baseDomain, '').split('.')[0];
      } else if (rawHost.includes('.') && !rawHost.startsWith('www.')) {
        sub = rawHost.split('.')[0];
      }
      if (sub && sub !== 'www' && slugMap.has(sub)) {
        tenantId = slugMap.get(sub);
      }
    }

    // 3. Token JWT
    if (!tenantId) {
      const authHeader = req.headers['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) {
        const rawToken = authHeader.slice(7).trim();
        if (rawToken && jwtSecret) {
          try {
            const decoded = jwt.decode(rawToken);
            if (decoded && decoded.restaurante_id) {
              tenantId = parseInt(decoded.restaurante_id, 10);
            }
          } catch (_) {}
        }
      }
    }

    // 4. Header HTTP interno de proxy
    if (!tenantId) {
      const headerTid = req.headers['x-tenant-id'] || req.headers['x-restaurante-id'];
      if (headerTid) tenantId = parseInt(headerTid, 10);
    }

    // 5. Query string para rotas públicas (Cardápio QR code, autoatendimento)
    if (!tenantId && req.query && req.query.restaurante_id) {
      const qTid = parseInt(req.query.restaurante_id, 10);
      if (Number.isFinite(qTid) && qTid > 0) tenantId = qTid;
    }

    const finalTid = (Number.isFinite(tenantId) && tenantId > 0) ? tenantId : 1;
    req.tenantId = finalTid;

    if (tenantContext && typeof tenantContext.run === 'function') {
      tenantContext.run(finalTid, () => next());
    } else {
      next();
    }
  };
}

module.exports = { createTenantMiddleware };
