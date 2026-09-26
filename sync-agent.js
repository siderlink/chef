const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

let ctx = {};
let instanceId = null;
let ws = null;
let connected = false;
let heartbeatInterval = null;
let pollInterval = null;
let reconnectTimer = null;
let reconnectDelay = 5000;
let lastSyncTimestamp = null;

function hmacSign(payload, secret) {
  return crypto.createHmac('sha256', secret || 'sync-secret-key').update(payload).digest('hex');
}

function generateMsgId() {
  return crypto.randomUUID();
}

function wrapMessage(type, payload) {
  const secret = ctx.deploymentConfig ? ctx.deploymentConfig.getInstanceSecret() : 'sync-secret-key';
  return {
    msg_id: generateMsgId(),
    instance_id: instanceId,
    type,
    timestamp: new Date().toISOString(),
    version: ctx.deploymentConfig ? ctx.deploymentConfig.getSoftwareVersion() : '1.0.0',
    payload,
    signature: hmacSign(JSON.stringify(payload), secret)
  };
}

function query(sql, params) {
  return new Promise((resolve, reject) => {
    ctx.db.all(sql, params || [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function queryGet(sql, params) {
  return new Promise((resolve, reject) => {
    ctx.db.get(sql, params || [], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function run(sql, params) {
  return new Promise((resolve, reject) => {
    ctx.db.run(sql, params || [], function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function ensureTables() {
  try {
    await run(`CREATE TABLE IF NOT EXISTS sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      direction TEXT DEFAULT 'up',
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      sent_at DATETIME,
      retry_count INTEGER DEFAULT 0
    )`);

    await run(`CREATE TABLE IF NOT EXISTS pending_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command_id TEXT NOT NULL UNIQUE,
      command TEXT NOT NULL,
      params TEXT,
      received_at DATETIME DEFAULT (datetime('now','localtime')),
      status TEXT DEFAULT 'pending',
      result TEXT
    )`);

    await run(`CREATE TABLE IF NOT EXISTS configuracoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chave TEXT UNIQUE,
      valor TEXT
    )`);
  } catch (err) {
    console.warn('[Sync Agent] Aviso ao garantir tabelas sync locais:', err.message);
  }
}

function getDbSizeBytes() {
  try {
    for (const f of ['pedidos.sqlite', 'database.sqlite', 'master.sqlite', 'chef.sqlite']) {
      const p = path.join(process.cwd(), f);
      if (fs.existsSync(p)) return fs.statSync(p).size;
    }
  } catch (e) {}
  return 0;
}

async function flushOutbox() {
  // Reseta itens presos em 'sending' (se conexão caiu durante envio)
  try {
    await run(`UPDATE sync_outbox SET status = 'pending', retry_count = retry_count + 1 WHERE status = 'sending'`, []);
  } catch (e) {}

  const pending = await query(
    `SELECT * FROM sync_outbox WHERE status = 'pending' AND direction = 'up' AND retry_count < 10 ORDER BY id ASC LIMIT 50`
  );
  if (!pending.length) return;

  const grouped = {};
  pending.forEach(item => {
    if (!grouped[item.message_type]) grouped[item.message_type] = [];
    grouped[item.message_type].push(item);
  });

  for (const [msgType, items] of Object.entries(grouped)) {
    const records = items.map(i => {
      try { return JSON.parse(i.payload); } catch (e) { return null; }
    }).filter(Boolean);

    if (!records.length) continue;

    const msg = wrapMessage('data_push', { table: msgType, records });
    sendToServer('instance:data_push', msg);

    for (const item of items) {
      await run(`UPDATE sync_outbox SET status = 'sending', sent_at = datetime('now','localtime') WHERE id = ?`, [item.id]);
    }
  }
}

async function processPendingCommands() {
  const pending = await query(
    `SELECT * FROM pending_commands WHERE status = 'pending' ORDER BY id ASC`
  );
  for (const cmd of pending) {
    try {
      await run(`UPDATE pending_commands SET status = 'executing' WHERE id = ?`, [cmd.id]);
      const result = await executeCommand(cmd.command, cmd.params ? JSON.parse(cmd.params) : {});
      await run(
        `UPDATE pending_commands SET status = 'completed', result = ? WHERE id = ?`,
        [JSON.stringify(result), cmd.id]
      );
    } catch (err) {
      await run(
        `UPDATE pending_commands SET status = 'failed', result = ? WHERE id = ?`,
        [JSON.stringify({ error: err.message }), cmd.id]
      );
    }
  }
}

async function executeCommand(command, params) {
  console.log(`[Sync Agent] ⚡ Executando comando remoto recebido: '${command}'`, params || {});

  switch (command) {
    case 'push_config': {
      if (params.configs) {
        for (const [chave, valor] of Object.entries(params.configs)) {
          await run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)`, [chave, String(valor)]);
        }
      }
      return { ok: true, applied: Object.keys(params.configs || {}).length };
    }

    case 'update_features': {
      if (params.features) {
        for (const [feat, val] of Object.entries(params.features)) {
          await run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)`, [feat, String(val)]);
        }
        if (ctx.io) {
          ctx.io.emit('features_atualizadas', { features: params.features });
        }
      }
      return { ok: true, features: params.features };
    }

    case 'update_plan': {
      if (params.plan) {
        await run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('licenca', ?)`, [params.plan]);
      }
      if (params.validade) {
        await run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('validade_licenca', ?)`, [params.validade]);
      }
      if (params.max_dispositivos) {
        await run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('max_dispositivos', ?)`, [String(params.max_dispositivos)]);
      }
      if (ctx.io) {
        ctx.io.emit('plano_atualizado', {
          plan: params.plan,
          validade: params.validade,
          max_dispositivos: params.max_dispositivos
        });
      }
      return { ok: true, plan: params.plan, validade: params.validade };
    }

    case 'force_sync': {
      await flushOutbox();
      await sendMetrics();
      return { ok: true, flushed: true };
    }

    case 'deactivate': {
      const motivo = params.motivo || 'Instalação temporariamente suspensa pelo Super Administrador.';
      const contato = params.contato || 'Suporte Técnico Chef Cozinha';

      await run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('restaurant_status', 'bloqueado')`, []);
      await run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('bloqueado_motivo', ?)`, [motivo]);

      global.__RESTAURANT_BLOQUEADO = true;
      global.__BLOQUEIO_MOTIVO = motivo;

      if (ctx.io) {
        ctx.io.emit('sistema_bloqueado_remoto', {
          motivo,
          contato,
          timestamp: new Date().toISOString()
        });
      }

      console.warn(`[Sync Agent] 🔒 INSTÂNCIA BLOQUEADA REMOTAMENTE: ${motivo}`);
      return { ok: true, deactivated: true, status: 'bloqueado', motivo };
    }

    case 'reactivate': {
      await run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES ('restaurant_status', 'ativo')`, []);
      await run(`DELETE FROM configuracoes WHERE chave = 'bloqueado_motivo'`, []);

      global.__RESTAURANT_BLOQUEADO = false;
      global.__BLOQUEIO_MOTIVO = null;

      if (ctx.io) {
        ctx.io.emit('sistema_desbloqueado_remoto', {
          timestamp: new Date().toISOString(),
          mensagem: 'Instalação reativada com sucesso pela administração central.'
        });
      }

      console.log(`[Sync Agent] 🔓 INSTÂNCIA REATIVADA COM SUCESSO!`);
      return { ok: true, reactivated: true, status: 'ativo' };
    }

    case 'send_message': {
      const title = params.title || 'Aviso da Central';
      const body = params.body || params.mensagem || '';
      const type = params.type || 'info'; // 'info' | 'warning' | 'danger' | 'success'
      const duracao = params.duracao || 10000;

      if (ctx.io && (title || body)) {
        ctx.io.emit('notificacao_super_admin', {
          title,
          body,
          type,
          duracao,
          timestamp: new Date().toISOString()
        });
      }

      return { ok: true, sent: true, title, body };
    }

    case 'restart': {
      if (ctx.io) {
        ctx.io.emit('servidor_reiniciando', {
          mensagem: 'O servidor está sendo reiniciado pela administração central. Reconectando em 3s...',
          tempo: 3
        });
      }

      setTimeout(() => {
        console.warn('[Sync Agent] 🔄 Reinicialização do processo solicitada pelo Super Admin...');
        process.exit(0);
      }, 1500);

      return { ok: true, restarting: true, delay_ms: 1500 };
    }

    case 'wipe_sessions': {
      if (ctx.io) {
        ctx.io.emit('forcar_logout_geral', {
          motivo: params.motivo || 'Todas as sessões de funcionários foram invalidadas pelo Super Admin.'
        });
      }
      return { ok: true, sessions_wiped: true };
    }

    case 'get_status': {
      const tables = await query(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
      const identities = await queryGet(`SELECT * FROM instance_identity`);
      const statusCaixa = await queryGet(`SELECT status, operador, fundo_troco, data_abertura FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`);
      const vendasHoje = await queryGet(`SELECT COALESCE(SUM(total), 0) as s, COUNT(*) as c FROM pedidos WHERE date(COALESCE(createdAt, time)) = date('now','localtime') AND status != 'Cancelado'`);
      const mesasOcupadas = await queryGet(`SELECT COUNT(*) as c FROM mesas WHERE status != 'Livre'`);

      return {
        ok: true,
        version: ctx.deploymentConfig ? ctx.deploymentConfig.getSoftwareVersion() : '1.0.0',
        tables: tables.map(t => t.name),
        identity: identities,
        uptime_seconds: Math.floor(process.uptime()),
        memory_usage_mb: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
        connected_ws: connected,
        vendas_hoje: vendasHoje ? vendasHoje.s : 0,
        pedidos_hoje: vendasHoje ? vendasHoje.c : 0,
        mesas_abertas: mesasOcupadas ? mesasOcupadas.c : 0,
        caixa_aberto: Boolean(statusCaixa),
        caixa_operador: statusCaixa ? statusCaixa.operador : null,
        db_size_bytes: getDbSizeBytes(),
        node_version: process.version,
        platform: os.platform() + ' ' + os.release()
      };
    }

    default:
      return { ok: false, error: 'Comando desconhecido: ' + command };
  }
}

async function getTenantId() {
  const row = await queryGet(`SELECT value FROM instance_identity WHERE key = 'tenant_id'`);
  return row ? parseInt(row.value, 10) : 1;
}

async function sendMetrics() {
  try {
    const pedidoCount = await queryGet(`SELECT COUNT(*) as c FROM pedidos`);
    const vendasHoje = await queryGet(
      `SELECT COALESCE(SUM(total), 0) as s, COUNT(*) as c FROM pedidos 
       WHERE date(COALESCE(createdAt, time)) = date('now','localtime') AND status != 'Cancelado'`
    );
    const mesasOcupadas = await queryGet(`SELECT COUNT(*) as c FROM mesas WHERE status != 'Livre'`);
    const statusCaixa = await queryGet(`SELECT status, operador FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`);
    const funcionarioCount = await queryGet(`SELECT COUNT(*) as c FROM funcionarios WHERE status = 'Ativo'`);
    const mem = process.memoryUsage();

    const msg = wrapMessage('metrics', {
      orders_count: pedidoCount ? pedidoCount.c : 0,
      pedidos_hoje: vendasHoje ? vendasHoje.c : 0,
      vendas_hoje: vendasHoje ? vendasHoje.s : 0,
      mesas_abertas: mesasOcupadas ? mesasOcupadas.c : 0,
      caixa_aberto: Boolean(statusCaixa),
      caixa_operador: statusCaixa ? statusCaixa.operador : '',
      active_users: funcionarioCount ? funcionarioCount.c : 0,
      uptime_seconds: Math.floor(process.uptime()),
      memory_usage_mb: Math.floor(mem.heapUsed / 1024 / 1024),
      db_size_bytes: getDbSizeBytes(),
      connected_clients: ctx.activeSockets ? ctx.activeSockets.size : 0,
      cpu_usage_percent: os.loadavg() ? Math.round(os.loadavg()[0] * 100 / os.cpus().length) : 0
    });

    sendToServer('instance:metrics', msg);
  } catch (e) {
    console.error('[Sync] Erro ao enviar métricas:', e.message);
  }
}

function sendToServer(event, data) {
  if (ws && connected) {
    try {
      ws.emit(event, data);
    } catch (e) {
      console.error('[Sync] Erro ao enviar via WS:', e.message);
      queueForHttpPush(event, data);
    }
  } else {
    queueForHttpPush(event, data);
  }
}

async function queueForHttpPush(event, data) {
  try {
    await run(
      `INSERT INTO sync_outbox (message_type, payload, direction, status) VALUES (?, ?, 'up', 'pending')`,
      [event, JSON.stringify(data)]
    );
  } catch (e) {
    console.error('[Sync] Erro ao enfileirar para HTTP push:', e.message);
  }
}

async function httpPoll() {
  if (connected) return;
  const superUrl = ctx.deploymentConfig ? ctx.deploymentConfig.getSuperAdminUrl() : null;
  if (!superUrl) return;

  try {
    const idRow = await queryGet(`SELECT value FROM instance_identity WHERE key = 'instance_id'`);
    if (!idRow) return;

    const secret = ctx.deploymentConfig ? ctx.deploymentConfig.getInstanceSecret() : 'sync-secret-key';
    const timestamp = Date.now().toString();
    const sig = hmacSign(idRow.value + timestamp, secret);

    const fetchUrl = `${superUrl}/api/sync/poll?instance_id=${encodeURIComponent(idRow.value)}&ts=${timestamp}&sig=${encodeURIComponent(sig)}`;
    const response = await fetch(fetchUrl);

    if (response.ok) {
      const data = await response.json();
      if (data.commands && data.commands.length) {
        for (const cmd of data.commands) {
          await run(
            `INSERT OR IGNORE INTO pending_commands (command_id, command, params, status) VALUES (?, ?, ?, 'pending')`,
            [cmd.command_id, cmd.command, JSON.stringify(cmd.params || {})]
          );
        }
        await processPendingCommands();

        // Envia ACK para cada comando executado via HTTP
        for (const cmd of data.commands) {
          const resRow = await queryGet(`SELECT result, status FROM pending_commands WHERE command_id = ?`, [cmd.command_id]);
          await fetch(`${superUrl}/api/sync/ack`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instance_id: idRow.value,
              command_id: cmd.command_id,
              status: resRow ? resRow.status : 'completed',
              result: resRow ? resRow.result : null
            })
          }).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('[Sync] Erro no HTTP poll:', e.message);
  }
}

async function registerInstance() {
  const superUrl = ctx.deploymentConfig ? ctx.deploymentConfig.getSuperAdminUrl() : null;
  if (!superUrl) {
    console.warn('[Sync] SUPER_ADMIN_URL não configurada. Instância funcionando no modo local.');
    return;
  }

  try {
    const identity = await ctx.instanceIdentity.getAll(ctx.db);
    const tenantId = identity.tenant_id ? parseInt(identity.tenant_id, 10) : null;
    const nome = identity.restaurant_name || 'Instância On-Premise';

    const regData = {
      instance_id: identity.instance_id,
      tenant_id: tenantId,
      instance_name: nome,
      software_version: ctx.deploymentConfig.getSoftwareVersion(),
      os_info: `${os.platform()} ${os.release()}`,
      secret: ctx.deploymentConfig.getInstanceSecret()
    };

    const response = await fetch(`${superUrl}/api/sync/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(regData)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('[Sync] ✅ Registrado com sucesso no Super Admin Hub! Instance ID:', identity.instance_id);
      if (result.token) {
        await ctx.instanceIdentity.set(ctx.db, 'server_token', result.token);
        await ctx.instanceIdentity.set(ctx.db, 'registered_at', new Date().toISOString());
      }
    } else {
      console.warn('[Sync] Registro retornou status:', response.status);
    }
  } catch (e) {
    console.warn('[Sync] Não foi possível registrar agora (sem conexão ou hub offline):', e.message);
  }
}

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    if (!connected) return;
    try {
      const mem = process.memoryUsage();
      const msg = wrapMessage('heartbeat', {
        status: global.__RESTAURANT_BLOQUEADO ? 'deactivated' : 'online',
        uptime_seconds: Math.floor(process.uptime()),
        connected_clients: ctx.activeSockets ? ctx.activeSockets.size : 0,
        software_version: ctx.deploymentConfig ? ctx.deploymentConfig.getSoftwareVersion() : '1.0.0',
        memory_usage_mb: Math.floor(mem.heapUsed / 1024 / 1024),
        cpu_usage_percent: os.loadavg() ? Math.round(os.loadavg()[0] * 100 / os.cpus().length) : 0
      });
      sendToServer('instance:heartbeat', msg);
    } catch (e) {
      console.error('[Sync] Erro no heartbeat:', e.message);
    }
  }, 25000);
}

function connectWebSocket() {
  const superUrl = ctx.deploymentConfig ? ctx.deploymentConfig.getSuperAdminUrl() : null;
  if (!superUrl) {
    console.warn('[Sync] SUPER_ADMIN_URL não definida. Modo offline ativo.');
    startHttpPolling();
    return;
  }

  try {
    const { io: socketClient } = require('socket.io-client');
    ws = socketClient(superUrl, {
      path: '/sync',
      transports: ['websocket', 'polling'],
      reconnection: false,
      auth: {
        instance_id: instanceId,
        secret: ctx.deploymentConfig.getInstanceSecret(),
        version: ctx.deploymentConfig.getSoftwareVersion()
      }
    });

    ws.on('connect', () => {
      connected = true;
      reconnectDelay = 5000;
      console.log('[Sync] 🟢 Conectado ao Super Admin Hub via WebSocket!');

      startHeartbeat();

      ws.emit('instance:register', wrapMessage('instance:register', {
        instance_id: instanceId,
        software_version: ctx.deploymentConfig.getSoftwareVersion(),
        os_info: `${os.platform()} ${os.release()}`
      }));

      // Solicita imediatamente comandos pendentes
      ws.emit('instance:sync_request');

      // Envia telemetria atual e esvazia outbox
      sendMetrics();
      flushOutbox();
    });

    ws.on('server:command', async (msg) => {
      if (!msg || !msg.payload) return;
      const { command_id, command, params } = msg.payload;
      console.log(`[Sync] 📩 Comando recebido do Super Admin: ${command} (${command_id})`);

      try {
        await run(
          `INSERT OR IGNORE INTO pending_commands (command_id, command, params, status) VALUES (?, ?, ?, 'pending')`,
          [command_id, command, JSON.stringify(params || {})]
        );
        const result = await executeCommand(command, params || {});
        await run(
          `UPDATE pending_commands SET status = 'completed', result = ? WHERE command_id = ?`,
          [JSON.stringify(result || {}), command_id]
        );

        // Devolve o ACK imediatamente via WebSocket
        ws.emit('instance:command_ack', wrapMessage('instance:command_ack', {
          command_id,
          status: 'completed',
          result
        }));
      } catch (e) {
        console.error('[Sync] Erro ao executar comando recebido:', e.message);
        await run(
          `UPDATE pending_commands SET status = 'failed', result = ? WHERE command_id = ?`,
          [JSON.stringify({ error: e.message }), command_id]
        ).catch(() => {});

        ws.emit('instance:command_ack', wrapMessage('instance:command_ack', {
          command_id,
          status: 'failed',
          result: { error: e.message }
        }));
      }
    });

    ws.on('server:config_push', async (msg) => {
      if (msg && msg.payload) {
        await executeCommand('push_config', msg.payload);
      }
    });

    ws.on('server:plan_update', async (msg) => {
      if (msg && msg.payload) {
        await executeCommand('update_plan', msg.payload);
      }
    });

    ws.on('server:sync_ack', async (msg) => {
      if (msg && msg.payload && msg.payload.status === 'received') {
        try {
          await run(`UPDATE sync_outbox SET status = 'sent' WHERE status = 'sending'`, []);
        } catch (e) {}
      }
    });

    ws.on('disconnect', () => {
      connected = false;
      console.log('[Sync] 🔴 Desconectado do Super Admin. Reconectando...');
      scheduleReconnect();
    });

    ws.on('connect_error', (err) => {
      connected = false;
      scheduleReconnect();
    });

  } catch (e) {
    console.error('[Sync] Falha ao criar conexão WS:', e.message);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connectWebSocket();
    reconnectDelay = Math.min(reconnectDelay * 1.5, 60000);
  }, reconnectDelay);
}

function startHttpPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(httpPoll, 45000);
}

async function initialize(deps) {
  ctx = deps;

  await ensureTables();
  await ctx.instanceIdentity.ensureTable(ctx.db);
  instanceId = await ctx.instanceIdentity.getOrCreateInstanceId(ctx.db);
  console.log('[Sync] Instance ID local:', instanceId);

  // Verifica se o restaurante já estava bloqueado previamente
  try {
    const statusCfg = await queryGet(`SELECT valor FROM configuracoes WHERE chave = 'restaurant_status'`);
    if (statusCfg && statusCfg.valor === 'bloqueado') {
      global.__RESTAURANT_BLOQUEADO = true;
      const motRow = await queryGet(`SELECT valor FROM configuracoes WHERE chave = 'bloqueado_motivo'`);
      global.__BLOQUEIO_MOTIVO = motRow ? motRow.valor : 'Instalação suspensa pela administração central.';
      console.warn('[Sync] ⚠️ Instância inicializada em estado BLOQUEADO.');
    }
  } catch (e) {}

  await registerInstance();
  connectWebSocket();
  startHttpPolling();

  // Envio periódico de métricas comerciais e esvaziamento do outbox a cada 2 minutos
  setInterval(async () => {
    await sendMetrics();
    await flushOutbox();
  }, 120000);
}

module.exports = {
  initialize,
  isConnected: () => connected,
  getInstanceId: () => instanceId,
  flushOutbox,
  sendMetrics,
  enqueueData: async function (messageType, payload) {
    try {
      await run(
        `INSERT INTO sync_outbox (message_type, payload, direction, status) VALUES (?, ?, 'up', 'pending')`,
        [messageType, JSON.stringify(payload)]
      );
    } catch (e) {
      console.error('[Sync] Erro ao enfileirar sync_outbox:', e.message);
    }
  },
  triggerLiveSync: async function() {
    await flushOutbox();
    await sendMetrics();
  },
  getStatus: () => ({
    connected,
    instanceId,
    version: ctx.deploymentConfig ? ctx.deploymentConfig.getSoftwareVersion() : 'unknown',
    superAdminUrl: ctx.deploymentConfig ? ctx.deploymentConfig.getSuperAdminUrl() : null,
    uptime: process.uptime(),
    bloqueado: Boolean(global.__RESTAURANT_BLOQUEADO)
  })
};
