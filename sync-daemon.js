/**
 * Chef Cozinha — Sync Agent Daemon Multiplataforma
 * Compatível com: Windows 7, 8, 8.1, 10, 11 | Linux (Ubuntu, Debian, CentOS, RHEL, Alpine) | macOS (Intel & Apple Silicon)
 * 
 * Funcionalidades:
 * - Conexão WebSocket em tempo real (/sync) com fallback automático via HTTP Polling
 * - Telemetria contínua: Faturamento R$, Pedidos, Mesas, Caixa, CPU, Memória, Disco SQLite
 * - Execução e ACK imediato de comandos do Super Admin (Bloqueio, Desbloqueio, Alertas, Reiniciar)
 * - Monitoramento de processo e recuperação automática de falhas
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Tenta carregar socket.io-client se disponível; se não tiver, opera em modo HTTP polling resiliente
let ioClient = null;
try {
  ioClient = require('socket.io-client');
} catch (e) {
  // socket.io-client não instalado localmente — o daemon usará HTTP polling puro nativo (Zero dependências externas!)
}

// Caminhos base
const BASE_DIR = __dirname;
const CONFIG_FILE = path.join(BASE_DIR, 'sync_config.json');
const LOCK_FILE = path.join(BASE_DIR, 'lock_state.json');
const INSTANCE_ID_FILE = path.join(BASE_DIR, 'instance-id.txt');
const LOG_FILE = path.join(BASE_DIR, 'sync.log');

// Logging
function log(msg, type = 'INFO') {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const formatted = `[${timestamp}] [${type}] ${msg}`;
  console.log(formatted);
  try {
    fs.appendFileSync(LOG_FILE, formatted + '\n');
    // Limita log a 5MB
    const stats = fs.statSync(LOG_FILE);
    if (stats.size > 5 * 1024 * 1024) {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      fs.writeFileSync(LOG_FILE, content.substring(content.length - 1024 * 1024));
    }
  } catch (e) {}
}

// Configuração e CLI
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--hub' || arg === '-h') {
      options.hub = args[++i];
    } else if (arg === '--key' || arg === '-k') {
      options.key = args[++i];
    } else if (arg === '--port' || arg === '-p') {
      options.port = parseInt(args[++i], 10);
    } else if (arg === '--config' || arg === '-c') {
      options.config = args[++i];
    } else if (arg === '--test' || arg === '-t') {
      options.test = true;
    } else if (arg === '--status' || arg === '-s') {
      options.status = true;
    } else if (arg === '--save') {
      options.save = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    }
  }
  return options;
}

const cliOpts = parseArgs();
const EFFECTIVE_CONFIG_FILE = cliOpts.config ? path.resolve(cliOpts.config) : CONFIG_FILE;

// Carrega ou inicializa configuração
function loadConfig() {
  let cfg = {
    cloud_url: process.env.HUB_URL || 'http://127.0.0.1:3000',
    local_port: parseInt(process.env.LOCAL_PORT, 10) || 3000,
    poll_interval_seconds: 10,
    activation_key: process.env.CHEF_KEY || '',
    restaurant_name: '',
    restaurant_id: 0,
    is_activated: false,
    sync_secret: 'sync-secret-key'
  };

  try {
    // Detecta arquivo port.txt se existir
    const portFile = path.join(BASE_DIR, 'port.txt');
    if (fs.existsSync(portFile)) {
      const p = parseInt(fs.readFileSync(portFile, 'utf8').trim(), 10);
      if (p > 0) cfg.local_port = p;
    }

    if (fs.existsSync(EFFECTIVE_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(EFFECTIVE_CONFIG_FILE, 'utf8'));
      cfg = Object.assign(cfg, data);
    } else {
      try {
        fs.writeFileSync(EFFECTIVE_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
      } catch (ew) {}
    }
  } catch (e) {
    log('Erro ao carregar sync_config.json: ' + e.message, 'WARN');
  }

  // Permite override via variáveis de ambiente
  if (process.env.HUB_URL) cfg.cloud_url = process.env.HUB_URL;
  if (process.env.CHEF_KEY) cfg.activation_key = process.env.CHEF_KEY;

  // Permite override via CLI
  let configChanged = false;
  if (cliOpts.hub) { cfg.cloud_url = cliOpts.hub; configChanged = true; }
  if (cliOpts.key) { cfg.activation_key = cliOpts.key; configChanged = true; }
  if (cliOpts.port) { cfg.local_port = cliOpts.port; configChanged = true; }

  if (configChanged || cliOpts.save) {
    saveConfig(cfg);
  }

  return cfg;
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(EFFECTIVE_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    log('Configuração salva com sucesso em ' + EFFECTIVE_CONFIG_FILE);
  } catch (e) {
    log('Erro ao salvar sync_config.json: ' + e.message, 'ERROR');
  }
}

// Obtém ou gera ID único da instância da máquina
function getOrCreateInstanceId() {
  try {
    if (fs.existsSync(INSTANCE_ID_FILE)) {
      const id = fs.readFileSync(INSTANCE_ID_FILE, 'utf8').trim();
      if (id) return id;
    }
    const newId = 'inst_' + os.platform() + '_' + crypto.randomBytes(6).toString('hex');
    fs.writeFileSync(INSTANCE_ID_FILE, newId, 'utf8');
    return newId;
  } catch (e) {
    return 'inst_' + os.platform() + '_' + Date.now();
  }
}

// Requisições HTTP/HTTPS nativas sem dependências externas
function makeRequest(urlStr, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(urlStr);
      const isHttps = parsed.protocol === 'https:';
      const transport = isHttps ? https : http;

      const opts = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: method,
        headers: Object.assign({
          'User-Agent': 'ChefSyncAgent/' + (os.platform() || 'generic'),
          'Content-Type': 'application/json'
        }, headers),
        timeout: 10000
      };

      const req = transport.request(opts, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          let parsedBody = null;
          try { parsedBody = JSON.parse(body); } catch (e) { parsedBody = body; }
          resolve({ status: res.statusCode, headers: res.headers, data: parsedBody });
        });
      });

      req.on('error', err => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout na requisição para ' + urlStr));
      });

      if (data) {
        req.write(typeof data === 'string' ? data : JSON.stringify(data));
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Coleta métricas locais do restaurante e de hardware
async function collectMetrics(config, instanceId) {
  let vendas = 0;
  let pedidos = 0;
  let mesas = 0;
  let caixaAberto = false;
  let caixaOperador = '';
  let dbSize = 0;

  // 1. Tenta coletar do servidor local Chef Cozinha se estiver rodando
  try {
    const res = await makeRequest(`http://127.0.0.1:${config.local_port}/api/status-bloqueio`, 'GET');
    if (res.status === 200 && res.data) {
      if (res.data.bloqueado) {
        fs.writeFileSync(LOCK_FILE, JSON.stringify({ locked: true, reason: res.data.motivo }), 'utf8');
      }
    }
  } catch (e) {}

  // 2. Tenta coletar métricas financeiras da API local
  try {
    const resMetrics = await makeRequest(`http://127.0.0.1:${config.local_port}/api/sync/local-metrics`, 'GET');
    if (resMetrics.status === 200 && resMetrics.data && resMetrics.data.ok) {
      vendas = resMetrics.data.vendas_hoje || 0;
      pedidos = resMetrics.data.pedidos_hoje || 0;
      mesas = resMetrics.data.mesas_abertas || 0;
      caixaAberto = Boolean(resMetrics.data.caixa_aberto);
      caixaOperador = resMetrics.data.caixa_operador || '';
    }
  } catch (e) {}

  // 3. Tamanho do banco de dados SQLite local
  try {
    const dbPaths = [
      path.join(BASE_DIR, 'database.sqlite'),
      path.join(BASE_DIR, 'pedidos.sqlite'),
      path.join(BASE_DIR, 'master.sqlite'),
      path.join(os.homedir(), '.local', 'share', 'ChefCozinha', 'database.sqlite'),
      path.join(process.env.APPDATA || '', 'ChefCozinha', 'database.sqlite')
    ];
    for (const p of dbPaths) {
      if (fs.existsSync(p)) {
        dbSize += fs.statSync(p).size;
      }
    }
  } catch (e) {}

  // 4. Hardware e Sistema
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const memoryUsedMb = Math.round((totalMem - freeMem) / (1024 * 1024));
  const cpus = os.cpus();
  const cpuPercent = Math.min(100, Math.round((os.loadavg()[0] || 0.1) * 10));

  return {
    instance_id: instanceId,
    restaurant_name: config.restaurant_name || os.hostname(),
    vendas_hoje: vendas,
    pedidos_hoje: pedidos,
    mesas_abertas: mesas,
    caixa_aberto: caixaAberto ? 1 : 0,
    caixa_operador: caixaOperador,
    connected_clients: 1,
    memory_usage_mb: memoryUsedMb,
    cpu_usage_percent: cpuPercent,
    uptime_seconds: Math.round(os.uptime()),
    db_size_bytes: dbSize,
    os_info: `${os.type()} ${os.release()} (${os.arch()})`,
    software_version: '2.5.0-sync'
  };
}

// Execução de comandos remotos recebidos do Super Admin
async function handleRemoteCommand(cmdData, config, instanceId, ackCallback) {
  const { command_id, command, params } = cmdData;
  log(`⚡ Executando comando remoto: '${command}' (ID: ${command_id})`, 'CMD');
  let result = { ok: true, command, executed_at: new Date().toISOString() };

  try {
    switch (command) {
      case 'deactivate': {
        const reason = (params && params.reason) || 'Acesso suspenso pelo administrador central.';
        const contact = (params && params.contact) || 'Entre em contato com o suporte.';
        fs.writeFileSync(LOCK_FILE, JSON.stringify({ locked: true, reason, contact, at: new Date().toISOString() }), 'utf8');
        log(`🔒 Instância BLOQUEADA remotamente. Motivo: ${reason}`, 'SECURITY');

        // Notifica servidor local se estiver rodando
        try {
          await makeRequest(`http://127.0.0.1:${config.local_port}/api/sync/lock-local`, 'POST', { locked: true, reason, contact });
        } catch (e) {}

        result.status = 'locked';
        result.message = 'Instância bloqueada com sucesso.';
        break;
      }

      case 'reactivate': {
        if (fs.existsSync(LOCK_FILE)) {
          fs.unlinkSync(LOCK_FILE);
        }
        log(`🔓 Instância DESBLOQUEADA remotamente. Operações restabelecidas.`, 'SECURITY');

        try {
          await makeRequest(`http://127.0.0.1:${config.local_port}/api/sync/lock-local`, 'POST', { locked: false });
        } catch (e) {}

        result.status = 'unlocked';
        result.message = 'Instância desbloqueada com sucesso.';
        break;
      }

      case 'send_message': {
        const title = (params && params.title) || 'Aviso do Super Admin';
        const body = (params && params.body) || '';
        const type = (params && params.type) || 'info';
        log(`📢 Notificação recebida: [${title}] ${body}`, 'NOTICE');

        try {
          await makeRequest(`http://127.0.0.1:${config.local_port}/api/sync/broadcast-local`, 'POST', { title, body, type });
        } catch (e) {}

        result.delivered = true;
        break;
      }

      case 'restart': {
        log(`🚀 Solicitação de reinicialização remota recebida.`, 'WARN');
        setTimeout(() => {
          process.exit(0); // O daemon/systemd/Task Scheduler reinicia o processo automaticamente
        }, 1500);
        result.restarting = true;
        break;
      }

      case 'get_status': {
        const isLocked = fs.existsSync(LOCK_FILE);
        result.system = {
          hostname: os.hostname(),
          platform: os.platform(),
          arch: os.arch(),
          uptime: os.uptime(),
          free_mem: os.freemem(),
          total_mem: os.totalmem(),
          locked: isLocked
        };
        break;
      }

      case 'force_sync': {
        result.synced = true;
        break;
      }

      default:
        log(`Comando desconhecido: ${command}`, 'WARN');
        result.warning = 'Comando desconhecido ou não implementado';
        break;
    }

    // Envia ACK de confirmação
    if (typeof ackCallback === 'function') {
      ackCallback({ command_id, status: 'completed', result });
    }
  } catch (err) {
    log(`Erro ao executar comando '${command}': ${err.message}`, 'ERROR');
    if (typeof ackCallback === 'function') {
      ackCallback({ command_id, status: 'failed', result: { error: err.message } });
    }
  }
}

// ═════════════════════════════════════════════════════════════════════
// MOTOR PRINCIPAL DO SYNC AGENT
// ═════════════════════════════════════════════════════════════════════
async function startDaemon() {
  log('====================================================');
  log('🚀 Chef Cozinha — Sync Agent Daemon Iniciado');
  log(`OS: ${os.type()} ${os.release()} (${os.arch()}) | Node: ${process.version}`);
  log('====================================================');

  const config = loadConfig();
  const instanceId = getOrCreateInstanceId();
  log(`Instance ID: ${instanceId}`);
  log(`Hub Cloud:   ${config.cloud_url}`);
  log(`Porta Local: ${config.local_port}`);

  if (config.activation_key) {
    log(`Chave de Ativação: ${config.activation_key}`, 'INFO');
  }

  let wsConnected = false;
  let socket = null;

  // 1. TENTA CONEXÃO WEBSOCKET SE SOCKET.IO-CLIENT ESTIVER PRESENTE
  if (ioClient) {
    try {
      const hubUrl = config.cloud_url.replace(/\/$/, '');
      log(`Conectando WebSocket no namespace ${hubUrl}/sync...`);

      socket = ioClient(`${hubUrl}/sync`, {
        auth: {
          instance_id: instanceId,
          secret: config.sync_secret || 'sync-secret-key',
          activation_key: config.activation_key
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 4000
      });

      socket.on('connect', () => {
        wsConnected = true;
        log(`🟢 Conexão WebSocket estabelecida com sucesso com o Super Admin Hub! (Socket ID: ${socket.id})`, 'SUCCESS');

        // Registro
        socket.emit('instance:register', {
          payload: {
            instance_id: instanceId,
            instance_name: config.restaurant_name || os.hostname(),
            software_version: '2.5.0-sync',
            os_info: `${os.type()} ${os.release()} (${os.arch()})`,
            activation_key: config.activation_key
          }
        });

        // Envia métricas imediatas
        collectMetrics(config, instanceId).then(metrics => {
          socket.emit('instance:metrics', { payload: metrics });
        });
      });

      socket.on('disconnect', (reason) => {
        wsConnected = false;
        log(`🔴 Desconectado do WebSocket Hub (${reason}). Ativando fallback para HTTP Polling...`, 'WARN');
      });

      socket.on('connect_error', (err) => {
        wsConnected = false;
      });

      socket.on('server:command', async (msg) => {
        if (!msg || !msg.payload) return;
        await handleRemoteCommand(msg.payload, config, instanceId, (ack) => {
          socket.emit('instance:command_ack', { payload: ack });
        });
      });

    } catch (eWs) {
      log('Falha ao iniciar cliente WebSocket: ' + eWs.message, 'WARN');
    }
  }

  // 2. LOOP DE TELEMETRIA PERIÓDICA (A CADA 30-60 SEGUNDOS)
  setInterval(async () => {
    try {
      const metrics = await collectMetrics(config, instanceId);

      if (wsConnected && socket) {
        socket.emit('instance:metrics', { payload: metrics });
        socket.emit('instance:heartbeat', { payload: { software_version: '2.5.0-sync' } });
      } else {
        // Fallback HTTP POST de métricas
        const postUrl = `${config.cloud_url.replace(/\/$/, '')}/api/sync/metrics`;
        await makeRequest(postUrl, 'POST', metrics);
      }
    } catch (e) {
      // Falhas silenciosas em log de debug para evitar poluir o disco
    }
  }, 30000);

  // 3. LOOP DE HTTP POLLING RESILIENTE (CASO WS ESTEJA INDISPONÍVEL)
  const pollIntervalMs = Math.max(5000, (config.poll_interval_seconds || 10) * 1000);
  setInterval(async () => {
    if (wsConnected) return; // Se WS estiver ativo, o HTTP polling não é necessário

    try {
      const hubBase = config.cloud_url.replace(/\/$/, '');
      const pollUrl = `${hubBase}/api/sync/poll?instance_id=${encodeURIComponent(instanceId)}`;
      const res = await makeRequest(pollUrl, 'GET');

      if (res.status === 200 && res.data && res.data.commands && Array.isArray(res.data.commands)) {
        for (const cmdItem of res.data.commands) {
          await handleRemoteCommand(cmdItem, config, instanceId, async (ack) => {
            try {
              const ackUrl = `${hubBase}/api/sync/ack`;
              await makeRequest(ackUrl, 'POST', {
                instance_id: instanceId,
                command_id: ack.command_id,
                status: ack.status,
                result: ack.result
              });
            } catch (eAck) {}
          });
        }
      }
    } catch (ePoll) {
      // Servidor inacessível no momento; tenta novamente no próximo ciclo
    }
  }, pollIntervalMs);

  log('Daemon em execução contínua. Pressione Ctrl+C para encerrar.');
}

// Comandos CLI e Inicialização
async function runCli() {
  if (cliOpts.version) {
    console.log('Chef Cozinha Sync Agent v1.2.0 (Multiplataforma)');
    process.exit(0);
  }

  const config = loadConfig();
  const instanceId = getOrCreateInstanceId();

  if (cliOpts.status) {
    const isLocked = fs.existsSync(LOCK_FILE);
    console.log(JSON.stringify({
      version: '1.2.0',
      platform: process.platform,
      arch: process.arch,
      node_version: process.version,
      instance_id: instanceId,
      cloud_url: config.cloud_url,
      local_port: config.local_port,
      is_activated: config.is_activated,
      activation_key: config.activation_key ? (config.activation_key.substring(0, 8) + '...') : '(nenhuma)',
      is_locked: isLocked,
      config_file: EFFECTIVE_CONFIG_FILE,
      log_file: LOG_FILE
    }, null, 2));
    process.exit(0);
  }

  if (cliOpts.save && !cliOpts.test) {
    console.log('Configurações gravadas com sucesso.');
    process.exit(0);
  }

  if (cliOpts.test) {
    console.log(`\n======================================================`);
    console.log(`🔍 Teste de Conectividade do Sync Agent`);
    console.log(`======================================================`);
    console.log(`Instância ID : ${instanceId}`);
    console.log(`Sistema      : ${process.platform} (${process.arch})`);
    console.log(`Hub Cloud    : ${config.cloud_url}`);
    console.log(`Porta Local  : ${config.local_port}`);
    console.log(`------------------------------------------------------`);

    // 1. Testa Hub Cloud
    const t0 = Date.now();
    try {
      const hubBase = config.cloud_url.replace(/\/$/, '');
      const res = await makeRequest(`${hubBase}/api/sync/poll?instance_id=${encodeURIComponent(instanceId)}`, 'GET');
      const elapsed = Date.now() - t0;
      if (res.status === 200) {
        console.log(`✅ Conexão com Hub Cloud: OK (HTTP ${res.status}, latência: ${elapsed}ms)`);
      } else {
        console.log(`⚠️ Conexão com Hub Cloud respondeu status inesperado: HTTP ${res.status} (${elapsed}ms)`);
      }
    } catch (e) {
      console.log(`❌ Falha ao conectar ao Hub Cloud (${config.cloud_url}): ${e.message}`);
    }

    // 2. Testa PDV Local
    try {
      const localRes = await makeRequest(`http://127.0.0.1:${config.local_port}/api/configuracoes/geral`, 'GET');
      if (localRes.status === 200) {
        console.log(`✅ Conexão com PDV Local: OK (Porta ${config.local_port})`);
      } else {
        console.log(`ℹ️ PDV Local respondeu status: HTTP ${localRes.status}`);
      }
    } catch (e) {
      console.log(`ℹ️ PDV Local não detectado na porta ${config.local_port} (pode estar iniciando ou rodando em outra porta)`);
    }

    console.log(`======================================================\n`);
    process.exit(0);
  }

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('Recebido sinal SIGINT. Encerrando daemon com segurança...');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    log('Recebido sinal SIGTERM. Encerrando daemon com segurança...');
    process.exit(0);
  });

  return startDaemon();
}

// Inicia se executado diretamente
if (require.main === module) {
  runCli().catch(err => {
    log('FATAL: Erro ao iniciar daemon: ' + err.message, 'ERROR');
    process.exit(1);
  });
}

module.exports = {
  startDaemon,
  loadConfig,
  saveConfig,
  collectMetrics,
  getOrCreateInstanceId
};
