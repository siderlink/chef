/**
 * Watchdog Robusto — Chef Cozinha SaaS
 *
 * Reinicia o servidor backend se ele cair, com:
 * - Backoff exponencial (3 → 5 → 10 → 30s)
 * - Limite de 10 restarts consecutivos (depois pausa 60s)
 * - Monitoramento de RAM ( >80% = restart graceful )
 * - Health check periódico via /healthz (3 falhas seguidas = restart)
 * - Logs estruturados com timestamp
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ── Configuração ──────────────────────────────────────────────────────
const PORT = process.env.PORT || (() => {
  try { return parseInt(fs.readFileSync(path.join(__dirname, 'port.txt'), 'utf8').trim(), 10) || 8080; }
  catch (e) { return 8080; }
})();

const MAX_RESTARTS = 10;           // restarts consecutivos antes de pausar
const PAUSE_AFTER_MAX = 60000;     // pausa de 60s após atingir o limite
const BACKOFF_STEPS = [3000, 5000, 10000, 30000]; // ms entre restarts
const RAM_THRESHOLD_MB = parseInt(process.env.WATCHDOG_RAM_MB, 10) || 2048; // 2GB
const HEALTH_INTERVAL = 30000;     // intervalo entre health checks (30s)
const HEALTH_FAIL_LIMIT = 3;       // falhas seguidas antes de restart
const HEALTH_TIMEOUT = 8000;       // timeout do health check

// ── Estado ────────────────────────────────────────────────────────────
let restartCount = 0;
let consecutiveCrashes = 0;
let healthFails = 0;
let isShuttingDown = false;
let currentChild = null;
let viteChild = null;
let healthTimer = null;
let ramTimer = null;

const LOG_FILE = path.join(__dirname, 'logs', 'watchdog.log');

// ── Logging ───────────────────────────────────────────────────────────
function ensureLogDir() {
  const dir = path.join(__dirname, 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function log(level, msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(line);
  try {
    ensureLogDir();
    fs.appendFileSync(LOG_FILE, line + '\n');
    // Rotação simples: se >5MB, mantém últimas 1000 linhas
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > 5 * 1024 * 1024) {
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n');
      fs.writeFileSync(LOG_FILE, lines.slice(-1000).join('\n'));
    }
  } catch (e) { }
}

function getBackoffMs() {
  const idx = Math.min(consecutiveCrashes, BACKOFF_STEPS.length - 1);
  return BACKOFF_STEPS[idx];
}

// ── Kill port owner ───────────────────────────────────────────────────
function killPortOwner(port) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve();
    const cmd = `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`;
    const ps = spawn('powershell', ['-NoProfile', '-Command', cmd], { windowsHide: true });
    ps.on('close', () => setTimeout(resolve, 800));
    ps.on('error', () => resolve());
  });
}

// ── Health check via HTTP ─────────────────────────────────────────────
function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/healthz`, { timeout: HEALTH_TIMEOUT }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve(j.status === 'ok');
        } catch (e) {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function healthLoop() {
  if (isShuttingDown) return;
  const ok = await checkHealth();
  if (isShuttingDown) return;

  if (ok) {
    healthFails = 0;
    return;
  }

  healthFails++;
  log('WARN', `Health check falhou (${healthFails}/${HEALTH_FAIL_LIMIT})`);

  if (healthFails >= HEALTH_FAIL_LIMIT) {
    log('ALERT', 'Limite de health checks atingido — forçando restart do servidor.');
    healthFails = 0;
    restartServer('health_check_fail');
  }
}

// ── RAM monitor ───────────────────────────────────────────────────────
function checkRam() {
  if (isShuttingDown || !currentChild) return;
  const used = process.memoryUsage();
  const rssMB = Math.round(used.rss / 1024 / 1024);

  if (rssMB > RAM_THRESHOLD_MB) {
    log('ALERT', `RAM acima do limite: ${rssMB}MB (limite: ${RAM_THRESHOLD_MB}MB) — restart graceful.`);
    restartServer('ram_overflow');
  }
}

// ── Start / Restart ───────────────────────────────────────────────────
async function restartServer(reason) {
  if (isShuttingDown) return;
  if (currentChild) {
    try {
      currentChild.removeAllListeners('exit');
      currentChild.kill('SIGTERM');
    } catch (e) {}
    currentChild = null;
  }
  return startServer(reason);
}

async function startServer(reason) {
  if (isShuttingDown) return;

  const isRestart = reason !== 'initial';
  if (isRestart) {
    restartCount++;
    consecutiveCrashes++;
    const backoff = getBackoffMs();
    log('INFO', `Reiniciando em ${Math.round(backoff / 1000)}s (motivo: ${reason}, #${restartCount}, consecutive: ${consecutiveCrashes})`);
    await new Promise(r => setTimeout(r, backoff));
  } else {
    log('INFO', 'Iniciando servidor pela primeira vez.');
  }

  await killPortOwner(PORT);

  // Limpa timers anteriores
  if (healthTimer) clearInterval(healthTimer);
  if (ramTimer) clearInterval(ramTimer);

  // Inicia backend
  currentChild = spawn(process.execPath, ['server.js'], {
    stdio: 'inherit',
    cwd: __dirname,
    env: { ...process.env, WATCHDOG_ACTIVE: '1' }
  });

  // Inicia Vite (apenas na primeira inicialização para não duplicar instâncias)
  if (!viteChild) {
    const viteCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    viteChild = spawn(viteCmd, ['vite', '--host'], {
      stdio: 'inherit',
      cwd: __dirname,
      shell: true
    });

    viteChild.on('exit', (code, signal) => {
      viteChild = null;
      if (!isShuttingDown && currentChild) {
        log('WARN', `Vite encerrou (code=${code}, signal=${signal}) — encerrando backend junto.`);
        currentChild.kill();
      }
    });
  }

  log('INFO', `Servidor iniciado (PID: ${currentChild.pid}, Vite PID: ${viteChild ? viteChild.pid : 'existente'})`);

  // Health check loop — só começa 10s após o start
  setTimeout(() => {
    if (!isShuttingDown && currentChild) {
      healthTimer = setInterval(healthLoop, HEALTH_INTERVAL);
    }
  }, 10000);

  // RAM monitor — a cada 60s
  ramTimer = setInterval(checkRam, 60000);

  // Se o backend morre
  currentChild.on('exit', async (code, signal) => {
    currentChild = null;
    if (isShuttingDown) {
      log('INFO', 'Servidor encerrado normalmente.');
      process.exit(0);
    }

    // Limpa timers
    if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
    if (ramTimer) { clearInterval(ramTimer); ramTimer = null; }

    log('WARN', `Servidor caiu! (code=${code}, signal=${signal})`);

    // Se atingiu limite de restarts, pausa
    if (consecutiveCrashes >= MAX_RESTARTS) {
      log('ALERT', `Limite de ${MAX_RESTARTS} restarts atingido. Pausando ${PAUSE_AFTER_MAX / 1000}s antes de tentar novamente.`);
      await new Promise(r => setTimeout(r, PAUSE_AFTER_MAX));
      consecutiveCrashes = 0; // reseta após a pausa
    }

    restartServer(`crash(code=${code},signal=${signal})`);
  });
}

// ── Shutdown limpo ────────────────────────────────────────────────────
function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('INFO', `Encerramento solicitado (${signal}) — matando processos filhos...`);

  if (healthTimer) clearInterval(healthTimer);
  if (ramTimer) clearInterval(ramTimer);

  if (viteChild) {
    try { viteChild.kill('SIGINT'); } catch (e) { }
  }
  if (currentChild) {
    try { currentChild.kill('SIGINT'); } catch (e) { }
  }

  setTimeout(() => {
    log('INFO', 'Watchdog encerrado.');
    process.exit(0);
  }, 2000);
}

['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(sig => {
  process.on(sig, () => gracefulShutdown(sig));
});

// ── Start ─────────────────────────────────────────────────────────────
startServer('initial');
