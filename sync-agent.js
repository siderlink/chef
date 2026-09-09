const crypto = require('crypto');
const os = require('os');

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
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function generateMsgId() {
  return crypto.randomUUID();
}

function wrapMessage(type, payload) {
  return {
    msg_id: generateMsgId(),
    instance_id: instanceId,
    type,
    timestamp: new Date().toISOString(),
    version: ctx.deploymentConfig ? ctx.deploymentConfig.getSoftwareVersion() : '1.0.0',
    payload,
    signature: hmacSign(JSON.stringify(payload), ctx.deploymentConfig.getInstanceSecret())
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

async function flushOutbox() {
  // Reseta itens presos em 'sending' (WS caiu durante flush)
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
      // Marca como 'sending' — só vira 'sent' quando ACK do servidor chegar
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
      if (params.features && ctx.masterDb) {
        const tenantId = await getTenantId();
        const featuresJson = JSON.stringify(params.features);
        await new Promise((resolve, reject) => {
          ctx.masterDb.run(
            `INSERT INTO tenant_features (restaurante_id, overrides_json, updated_at)
             VALUES (?, ?, datetime('now','localtime'))
             ON CONFLICT(restaurante_id) DO UPDATE SET overrides_json = ?, updated_at = datetime('now','localtime')`,
            [tenantId, featuresJson, featuresJson],
            (err) => err ? reject(err) : resolve()
          );
        });
      }
      return { ok: true, features: params.features };
    }
    case 'force_sync': {
      await flushOutbox();
      return { ok: true, flushed: true };
    }
    case 'deactivate': {
      await run(`UPDATE configuracoes SET valor = 'inativo' WHERE chave = 'restaurant_status'`, []);
      return { ok: true, deactivated: true };
    }
    case 'reactivate': {
      await run(`UPDATE configuracoes SET valor = 'ativo' WHERE chave = 'restaurant_status'`, []);
      return { ok: true, reactivated: true };
    }
    case 'get_status': {
      const tables = await query(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
      const identities = await queryGet(`SELECT * FROM instance_identity`);
      return {
        ok: true,
        version: ctx.deploymentConfig.getSoftwareVersion(),
        tables: tables.map(t => t.name),
        identity: identities,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        connected: connected
      };
    }
    case 'send_message': {
      if (ctx.io && params.title) {
        ctx.io.emit('sync_message', { title: params.title, body: params.body, type: params.type || 'info' });
      }
      return { ok: true, sent: true };
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
    const funcionarioCount = await queryGet(`SELECT COUNT(*) as c FROM funcionarios WHERE status = 'Ativo'`);
    const mem = process.memoryUsage();
    const msg = wrapMessage('metrics', {
      orders_count: pedidoCount ? pedidoCount.c : 0,
      active_users: funcionarioCount ? funcionarioCount.c : 0,
      uptime_seconds: Math.floor(process.uptime()),
      memory_usage_mb: Math.floor(mem.heapUsed / 1024 / 1024),
      db_size_bytes: 0,
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
    try { ws.emit(event, data); } catch (e) {
      console.error('[Sync] Erro ao enviar via WS:', e.message);
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
  const superUrl = ctx.deploymentConfig.getSuperAdminUrl();
  if (!superUrl) return;

  try {
    const idRow = await queryGet(`SELECT value FROM instance_identity WHERE key = 'instance_id'`);
    if (!idRow) return;

    const secret = ctx.deploymentConfig.getInstanceSecret();
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
      }
    }
  } catch (e) {
    console.error('[Sync] Erro no HTTP poll:', e.message);
  }
}

async function registerInstance() {
  const superUrl = ctx.deploymentConfig.getSuperAdminUrl();
  if (!superUrl) {
    console.warn('[Sync] SUPER_ADMIN_URL não configurada. Instância funciona offline.');
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
      console.log('[Sync] Registrado com sucesso no servidor. Instance ID:', identity.instance_id);
      if (result.token) {
        await ctx.instanceIdentity.set(ctx.db, 'server_token', result.token);
        await ctx.instanceIdentity.set(ctx.db, 'registered_at', new Date().toISOString());
      }
    } else {
      console.warn('[Sync] Registro retornou status:', response.status);
    }
  } catch (e) {
    console.warn('[Sync] Não foi possível registrar:', e.message);
  }
}

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    if (!connected) return;
    try {
      const mem = process.memoryUsage();
      const msg = wrapMessage('heartbeat', {
        status: 'online',
        uptime_seconds: Math.floor(process.uptime()),
        connected_clients: ctx.activeSockets ? ctx.activeSockets.size : 0,
        software_version: ctx.deploymentConfig.getSoftwareVersion(),
        memory_usage_mb: Math.floor(mem.heapUsed / 1024 / 1024),
        cpu_usage_percent: os.loadavg() ? Math.round(os.loadavg()[0] * 100 / os.cpus().length) : 0
      });
      sendToServer('instance:heartbeat', msg);
    } catch (e) {
      console.error('[Sync] Erro no heartbeat:', e.message);
    }
  }, 30000);
}

function connectWebSocket() {
  const superUrl = ctx.deploymentConfig.getSuperAdminUrl();
  if (!superUrl) {
    console.warn('[Sync] SUPER_ADMIN_URL não definida. Modo offline.');
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
      console.log('[Sync] Conectado ao servidor super admin via WebSocket.');

      startHeartbeat();

      ws.emit('instance:register', wrapMessage('instance:register', {
        instance_id: instanceId,
        software_version: ctx.deploymentConfig.getSoftwareVersion(),
        os_info: `${os.platform()} ${os.release()}`
      }));

      flushOutbox();
    });

    ws.on('server:command', async (msg) => {
      if (!msg || !msg.payload) return;
      const { command_id, command, params } = msg.payload;
      try {
        await run(
          `INSERT OR IGNORE INTO pending_commands (command_id, command, params, status) VALUES (?, ?, ?, 'pending')`,
          [command_id, command, JSON.stringify(params || {})]
        );
        await processPendingCommands();
        const result = await queryGet(`SELECT result FROM pending_commands WHERE command_id = ?`, [command_id]);
        ws.emit('instance:command_ack', wrapMessage('instance:command_ack', {
          command_id,
          status: result ? result.status : 'completed',
          result: result ? result.result : null
        }));
      } catch (e) {
        console.error('[Sync] Erro ao processar comando:', e.message);
      }
    });

    ws.on('server:config_push', async (msg) => {
      if (msg && msg.payload) {
        await executeCommand('push_config', msg.payload);
      }
    });

    ws.on('server:plan_update', async (msg) => {
      if (msg && msg.payload) {
        await executeCommand('push_config', { configs: msg.payload });
      }
    });

    ws.on('server:data_push', async (msg) => {
      if (msg && msg.payload && msg.payload.records && ctx.masterDb) {
        const tenantId = await getTenantId();
        ctx.masterDb.run(
          `UPDATE instance_registry SET last_sync_at = datetime('now','localtime') WHERE instance_id = ?`,
          [instanceId]
        );
      }
    });

    ws.on('server:sync_ack', async (msg) => {
      if (msg && msg.payload) {
        console.log('[Sync] ACK recebido:', msg.payload.status);
        if (msg.payload.status === 'received') {
          try {
            await run(
              `UPDATE sync_outbox SET status = 'sent' WHERE status = 'sending'`,
              []
            );
          } catch (e) {}
        }
      }
    });

    ws.on('disconnect', () => {
      connected = false;
      console.log('[Sync] Desconectado do servidor. Reconectando...');
      scheduleReconnect();
    });

    ws.on('connect_error', (err) => {
      connected = false;
      console.error('[Sync] Erro de conexão:', err.message);
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
    console.log(`[Sync] Tentando reconectar (${reconnectDelay / 1000}s)...`);
    connectWebSocket();
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
  }, reconnectDelay);
}

function startHttpPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(httpPoll, 60000);
}

async function initialize(deps) {
  ctx = deps;

  await ctx.instanceIdentity.ensureTable(ctx.db);
  instanceId = await ctx.instanceIdentity.getOrCreateInstanceId(ctx.db);
  console.log('[Sync] Instance ID:', instanceId);

  await registerInstance();
  connectWebSocket();
  startHttpPolling();

  setInterval(async () => {
    await sendMetrics();
    await flushOutbox();
  }, 300000);
}

module.exports = {
  initialize,
  isConnected: () => connected,
  getInstanceId: () => instanceId,
  flushOutbox,
  enqueueData: async function (messageType, payload) {
    try {
      await run(
        `INSERT INTO sync_outbox (message_type, payload, direction, status) VALUES (?, ?, 'up', 'pending')`,
        [messageType, JSON.stringify(payload)]
      );
    } catch (e) {
      console.error('[Sync] Erro ao enqueue:', e.message);
    }
  },
  getStatus: () => ({
    connected,
    instanceId,
    version: ctx.deploymentConfig ? ctx.deploymentConfig.getSoftwareVersion() : 'unknown',
    superAdminUrl: ctx.deploymentConfig ? ctx.deploymentConfig.getSuperAdminUrl() : null,
    uptime: process.uptime()
  })
};
