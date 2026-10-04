/**
 * middleware/safe-handler.js
 * Middleware global de resiliência anti-crash para o servidor Chef Cozinha.
 *
 * - asyncHandler: encapsula qualquer handler assíncrono em try/catch transparente
 * - setupProcessGuard: registra handlers globais para uncaughtException e unhandledRejection
 *   garantindo que o servidor NUNCA derrube todos os clientes conectados por causa de um erro pontual
 */
'use strict';

/**
 * Encapsula um handler Express assíncrono para capturar erros e repassá-los ao next()
 * sem travar o processo.
 *
 * @param {Function} fn - async function(req, res, next)
 * @returns {Function} - handler seguro
 */
function asyncHandler(fn) {
  return function safeHandler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(err => {
      console.error('[safe-handler] Erro capturado em rota:', req.method, req.path, '—', err && err.message);
      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          erro: 'Erro interno no servidor. Por favor tente novamente.',
          ref: `${new Date().toISOString()}:${req.method}:${req.path}`
        });
      }
    });
  };
}

// Silencia erros de stream fechado (EPIPE/EOF) em stdout e stderr quando desconectados
if (process.stdout && typeof process.stdout.on === 'function') {
  process.stdout.on('error', (err) => {
    if (err && (err.code === 'EPIPE' || err.code === 'EOF')) return;
  });
}
if (process.stderr && typeof process.stderr.on === 'function') {
  process.stderr.on('error', (err) => {
    if (err && (err.code === 'EPIPE' || err.code === 'EOF')) return;
  });
}

let isHandlingException = false;

/**
 * Configura proteção global do processo Node.js contra erros não capturados.
 * Registra o erro em log estruturado e mantém o servidor online.
 *
 * @param {Object} options
 * @param {Function} [options.onError] - callback opcional para lógica customizada (notificações, alertas)
 */
function setupProcessGuard({ onError } = {}) {
  process.on('uncaughtException', (err) => {
    // Ignora erros de pipe quebrado para evitar loops recursivos de log
    if (err && (err.code === 'EPIPE' || (err.message && err.message.includes('EPIPE')))) {
      return;
    }

    if (isHandlingException) return;
    isHandlingException = true;

    try {
      const msg = `[PROCESS GUARD] uncaughtException: ${err && err.message}`;
      try { console.error(msg, err && err.stack); } catch (_) {}
      if (typeof onError === 'function') {
        try { onError('uncaughtException', err); } catch (_) {}
      }
    } finally {
      isHandlingException = false;
    }
    // NÃO chamar process.exit() — manter o servidor online
  });

  process.on('unhandledRejection', (reason, promise) => {
    if (reason && (reason.code === 'EPIPE' || (reason.message && String(reason.message).includes('EPIPE')))) {
      return;
    }

    if (isHandlingException) return;
    isHandlingException = true;

    try {
      const msg = `[PROCESS GUARD] unhandledRejection: ${reason && (reason.message || reason)}`;
      try { console.error(msg, reason && reason.stack ? reason.stack : promise); } catch (_) {}
      if (typeof onError === 'function') {
        try { onError('unhandledRejection', reason); } catch (_) {}
      }
    } finally {
      isHandlingException = false;
    }
    // NÃO chamar process.exit()
  });

  try {
    console.log('[safe-handler] Proteção de processo global ativada (uncaughtException + unhandledRejection).');
  } catch (_) {}
}

/**
 * Middleware Express de erro global.
 * Deve ser registrado APÓS todas as rotas com: app.use(globalErrorMiddleware)
 */
function globalErrorMiddleware(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Erro interno no servidor.';

  console.error('[global-error-middleware]', req.method, req.path, status, message);

  if (res.headersSent) return next(err);

  res.status(status).json({
    ok: false,
    erro: message,
    ref: `${new Date().toISOString()}:${req.method}:${req.path}`
  });
}

module.exports = { asyncHandler, setupProcessGuard, globalErrorMiddleware };
