/**
 * src/utils/port-guard.js
 * Prevenção Ativa de Porta Ocupada (EADDRINUSE) & Graceful Shutdown
 * Garante que instâncias órfãs/zumbis sejam encerradas automaticamente
 * e que desligamentos salvem o estado do banco SQLite sem corrupção.
 */

'use strict';

const { execSync } = require('child_process');
const os = require('os');

/**
 * Detecta PIDs que estejam escutando na porta especificada.
 * @param {number} port
 * @returns {number[]} Lista de PIDs encontrados
 */
function detectarPidsNaPorta(port) {
  const pids = new Set();
  const currentPid = process.pid;

  if (process.platform === 'win32') {
    try {
      const output = execSync('netstat -ano -p tcp', { encoding: 'utf8', windowsHide: true, timeout: 3000 });
      const lines = output.split('\n');
      for (const line of lines) {
        if (!line.includes('LISTENING')) continue;
        // Verifica se a linha referencia a porta exata (:8080 ou 0.0.0.0:8080 ou 127.0.0.1:8080 ou [::]:8080)
        const portRegex = new RegExp(`[:.]${port}\\s+`);
        if (portRegex.test(line)) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (Number.isFinite(pid) && pid > 4 && pid !== currentPid) {
            pids.add(pid);
          }
        }
      }
    } catch (_) { }
  } else {
    // Linux / macOS
    try {
      const output = execSync(`lsof -ti :${port}`, { encoding: 'utf8', timeout: 3000 });
      output.split('\n').forEach(p => {
        const pid = parseInt(p.trim(), 10);
        if (Number.isFinite(pid) && pid > 0 && pid !== currentPid) {
          pids.add(pid);
        }
      });
    } catch (_) {
      try {
        const fuserOut = execSync(`fuser ${port}/tcp 2>/dev/null`, { encoding: 'utf8', timeout: 3000 });
        fuserOut.split(/\s+/).forEach(p => {
          const pid = parseInt(p.trim(), 10);
          if (Number.isFinite(pid) && pid > 0 && pid !== currentPid) {
            pids.add(pid);
          }
        });
      } catch (_) { }
    }
  }

  return Array.from(pids);
}

/**
 * Encerra um processo pelo PID de forma segura e forçada se necessário.
 * @param {number} pid
 */
function encerrarProcesso(pid) {
  if (!pid || pid === process.pid || pid <= 4) return false;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', windowsHide: true, timeout: 4000 });
    } else {
      process.kill(pid, 'SIGKILL');
    }
    return true;
  } catch (e) {
    try {
      process.kill(pid, 'SIGKILL');
      return true;
    } catch (_) {
      return false;
    }
  }
}

/**
 * Pausa síncrona leve para permitir que a pilha de rede do SO libere o socket TCP.
 * @param {number} ms
 */
function sleepSync(ms) {
  try {
    const sab = new SharedArrayBuffer(4);
    const int32 = new Int32Array(sab);
    Atomics.wait(int32, 0, 0, ms);
  } catch (_) {
    const end = Date.now() + ms;
    while (Date.now() < end) { }
  }
}

/**
 * Libera ativamente a porta antes do bind, se houver processo zumbi.
 * @param {number} port
 * @param {object} [opts]
 * @returns {{ freed: boolean, killedPids: number[] }}
 */
function liberarPortaSeOcupada(port, opts = {}) {
  const pids = detectarPidsNaPorta(port);
  const killedPids = [];

  if (pids.length > 0) {
    console.log(`\x1b[33m⚡ [PortGuard] Detectado(s) ${pids.length} processo(s) anterior(es) ocupando a porta ${port}: PIDs [${pids.join(', ')}].\x1b[0m`);
    console.log(`\x1b[33m⚡ [PortGuard] Finalizando instâncias órfãs para evitar EADDRINUSE...\x1b[0m`);

    for (const pid of pids) {
      const ok = encerrarProcesso(pid);
      if (ok) {
        killedPids.push(pid);
        console.log(`\x1b[32m✔ [PortGuard] Processo zumbi PID ${pid} finalizado com sucesso.\x1b[0m`);
      }
    }

    // Aguarda o SO reciclar o socket TCP (TIME_WAIT / SO_REUSEADDR)
    sleepSync(opts.waitMs || 500);
  }

  return { freed: killedPids.length > 0, killedPids };
}

/**
 * Configura rotina completa de Graceful Shutdown (SIGINT, SIGTERM, SIGHUP, SIGBREAK).
 * Garante que:
 * 1. Todos os bancos SQLite executem PRAGMA wal_checkpoint(TRUNCATE) para não corromper.
 * 2. Conexões de WebSocket / Socket.IO sejam notificadas e encerradas.
 * 3. O servidor HTTP seja fechado liberando o descritor de arquivo.
 * @param {object} server Instância http.Server
 * @param {object} options Opções contendo io, getDatabases, etc.
 */
function setupGracefulShutdown(server, options = {}) {
  const { io, getDatabases, onShutdown } = options;
  let isShuttingDown = false;

  function executarShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n\x1b[36m[GracefulShutdown] Sinal ${signal} recebido. Iniciando encerramento seguro...\x1b[0m`);

    // Timeout de segurança para não travar indefinidamente
    const forceExitTimer = setTimeout(() => {
      console.warn('\x1b[31m[GracefulShutdown] Timeout de 5s atingido. Forçando encerramento.\x1b[0m');
      process.exit(0);
    }, 5000);
    forceExitTimer.unref();

    // 1. Fechar WebSockets
    if (io) {
      try {
        io.emit('servidor_reiniciando', { msg: 'O servidor está sendo reiniciado com segurança.' });
        io.close();
        console.log('\x1b[32m✔ [GracefulShutdown] Conexões de tempo real (Socket.IO) encerradas.\x1b[0m');
      } catch (eIo) {
        console.warn('[GracefulShutdown] Erro ao fechar Socket.IO:', eIo.message);
      }
    }

    // 2. Fechar conexões ativas do HTTP Server
    if (server) {
      try {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      } catch (_) { }
    }

    // 3. Checkpoint e Fechamento dos Bancos SQLite (Proteção Anti-Corrupção de Queda de Energia)
    const dbs = typeof getDatabases === 'function' ? getDatabases() : [];
    const flushPromises = [];

    for (const item of dbs) {
      const dbInstance = item && item.db ? item.db : item;
      const dbNome = item && item.name ? item.name : 'SQLite';

      if (dbInstance && typeof dbInstance.run === 'function') {
        const p = new Promise((resolve) => {
          try {
            // WAL Checkpoint TRUNCATE garante que todos os dados do log sejam gravados no .sqlite
            dbInstance.run('PRAGMA wal_checkpoint(TRUNCATE);', (errCp) => {
              if (errCp) {
                console.warn(`[GracefulShutdown] Aviso ao executar checkpoint no banco ${dbNome}:`, errCp.message);
              } else {
                console.log(`\x1b[32m✔ [GracefulShutdown] WAL Checkpoint executado com sucesso no ${dbNome}.\x1b[0m`);
              }
              if (typeof dbInstance.close === 'function') {
                dbInstance.close((errClose) => {
                  if (errClose) console.warn(`[GracefulShutdown] Erro ao fechar ${dbNome}:`, errClose.message);
                  resolve();
                });
              } else {
                resolve();
              }
            });
          } catch (eDb) {
            resolve();
          }
        });
        flushPromises.push(p);
      }
    }

    Promise.all(flushPromises).then(() => {
      if (typeof onShutdown === 'function') {
        try { onShutdown(); } catch (_) { }
      }

      if (server) {
        server.close(() => {
          console.log('\x1b[32m✔ [GracefulShutdown] Servidor HTTP finalizado e porta liberada com sucesso.\x1b[0m');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });
  }

  process.on('SIGINT', () => executarShutdown('SIGINT'));
  process.on('SIGTERM', () => executarShutdown('SIGTERM'));
  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => executarShutdown('SIGBREAK'));
  }
  process.on('SIGHUP', () => executarShutdown('SIGHUP'));
}

/**
 * Anexa interceptor de erro EADDRINUSE no servidor HTTP para auto-recuperação.
 * @param {object} server
 * @param {number} port
 * @param {Function} onRetry
 */
function attachEaddrinuseRecovery(server, port, onRetry) {
  if (!server) return;
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(`\x1b[31m⚠ [PortGuard] Erro EADDRINUSE detectado na porta ${port}.\x1b[0m`);
      console.log(`\x1b[33m⚡ [PortGuard] Tentando recuperação automática e finalização de processos ocupantes...\x1b[0m`);
      const { freed, killedPids } = liberarPortaSeOcupada(port, { waitMs: 800 });
      if (freed && typeof onRetry === 'function') {
        console.log(`\x1b[32m✔ [PortGuard] Porta liberada (PIDs: ${killedPids.join(', ')}). Retentando inicialização...\x1b[0m`);
        setTimeout(() => {
          onRetry();
        }, 300);
      } else {
        console.error(`\x1b[31m✖ [PortGuard] Não foi possível liberar automaticamente a porta ${port}. Finalize os processos manualmente.\x1b[0m`);
      }
    }
  });
}

module.exports = {
  detectarPidsNaPorta,
  liberarPortaSeOcupada,
  setupGracefulShutdown,
  attachEaddrinuseRecovery
};
