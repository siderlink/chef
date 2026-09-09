const crypto = require('crypto');

let ctx = {};
let connectedInstances = new Map();
let offlineDetectorInterval = null;

function hmacSign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function generateCommandId() {
  return 'cmd_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

function dbRun(sql, params) {
  return new Promise((resolve, reject) => {
    ctx.masterDb.run(sql, params || [], function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params) {
  return new Promise((resolve, reject) => {
    ctx.masterDb.get(sql, params || [], (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function dbAll(sql, params) {
  return new Promise((resolve, reject) => {
    ctx.masterDb.all(sql, params || [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function startOfflineDetector() {
  if (offlineDetectorInterval) clearInterval(offlineDetectorInterval);
  offlineDetectorInterval = setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 90000).toISOString();
      await dbRun(
        `UPDATE instance_registry SET status = 'offline' WHERE last_heartbeat_at < ? AND status = 'online'`,
        [cutoff]
      );
    } catch (e) {
      console.error('[Sync Server] Erro no offline detector:', e.message);
    }
  }, 60000);
}

async function handleRegistration(instanceData, socket) {
  const { instance_id, tenant_id, instance_name, software_version, os_info, secret } = instanceData;
  if (!instance_id) return { error: 'instance_id obrigatório' };

  const existing = await dbGet(`SELECT * FROM instance_registry WHERE instance_id = ?`, [instance_id]);

  if (existing) {
    await dbRun(
      `UPDATE instance_registry SET status = 'online', last_heartbeat_at = datetime('now','localtime'),
       software_version = ?, os_info = ?, ip_address = ? WHERE instance_id = ?`,
      [software_version || existing.software_version, os_info || existing.os_info, socket.handshake.address, instance_id]
    );
  } else {
    await dbRun(
      `INSERT INTO instance_registry (instance_id, tenant_id, instance_name, software_version, os_info, ip_address, status)
       VALUES (?, ?, ?, ?, ?, ?, 'online')`,
      [instance_id, tenant_id || null, instance_name || 'On-Premise', software_version || '1.0.0', os_info || '', socket.handshake.address]
    );
  }

  return { ok: true, registered: true };
}

async function handleHeartbeat(instanceId, data) {
  if (!instanceId) return;
  try {
    await dbRun(
      `UPDATE instance_registry SET status = 'online', last_heartbeat_at = datetime('now','localtime'),
       software_version = COALESCE(?, software_version) WHERE instance_id = ?`,
      [data.software_version, instanceId]
    );
    connectedInstances.set(instanceId, {
      lastHeartbeat: Date.now(),
      data
    });
  } catch (e) {
    console.error('[Sync Server] Erro ao processar heartbeat:', e.message);
  }
}

async function processDataPush(instanceId, payload) {
  if (!instanceId || !payload) return;
  try {
    await dbRun(
      `UPDATE instance_registry SET last_sync_at = datetime('now','localtime') WHERE instance_id = ?`,
      [instanceId]
    );
    console.log(`[Sync Server] Data push recebido de ${instanceId}: ${payload.table || 'unknown'}`);
  } catch (e) {
    console.error('[Sync Server] Erro ao processar data_push:', e.message);
  }
}

async function processMetrics(instanceId, data) {
  if (!instanceId) return;
  try {
    const existing = await dbGet(
      `SELECT id FROM metrica_picos WHERE restaurante_id = (SELECT tenant_id FROM instance_registry WHERE instance_id = ?) AND dia = date('now','localtime') AND hora = CAST(strftime('%H','now','localtime') AS INTEGER)`,
      [instanceId]
    );
    if (existing) {
      await dbRun(
        `UPDATE metrica_picos SET sockets = ? WHERE id = ?`,
        [data.connected_clients || 0, existing.id]
      );
    }
  } catch (e) {
    console.error('[Sync Server] Erro ao processar métricas:', e.message);
  }
}

async function queueCommand(instanceId, command, params, issuedBy) {
  const commandId = generateCommandId();

  await dbRun(
    `INSERT INTO remote_commands (instance_id, command, params, issued_by, status) VALUES (?, ?, ?, ?, 'pending')`,
    [instanceId, command, JSON.stringify(params || {}), issuedBy || 'super_admin']
  );

  await dbRun(
    `INSERT INTO sync_queue (instance_id, message_type, payload, priority, status) VALUES (?, 'command', ?, ?, 'pending')`,
    [instanceId, JSON.stringify({ command_id: commandId, command, params: params || {} }), command === 'deactivate' ? 1 : 5]
  );

  return commandId;
}

async function pushConfig(instanceId, configs, issuedBy) {
  return queueCommand(instanceId, 'push_config', { configs }, issuedBy);
}

async function pushPlan(instanceId, plan, features, validade, issuedBy) {
  return queueCommand(instanceId, 'update_plan', { plan, features, validade }, issuedBy);
}

function initialize(deps) {
  ctx = deps;

  const syncNsp = ctx.io.of('/sync');

  syncNsp.use((socket, next) => {
    const { instance_id, secret } = socket.handshake.auth || {};
    if (!instance_id || !secret) {
      return next(new Error('Autenticação obrigatória'));
    }
    socket.instanceId = instance_id;
    next();
  });

  syncNsp.on('connection', (socket) => {
    const instanceId = socket.instanceId;
    console.log(`[Sync Server] Instância conectada: ${instanceId}`);

    socket.on('instance:register', async (msg) => {
      const result = await handleRegistration(msg.payload || msg, socket);
      socket.emit('server:sync_ack', { type: 'register', result });
    });

    socket.on('instance:heartbeat', async (msg) => {
      await handleHeartbeat(instanceId, msg.payload || {});
    });

    socket.on('instance:data_push', async (msg) => {
      await processDataPush(instanceId, msg.payload);
      socket.emit('server:sync_ack', { msg_id: msg.msg_id, status: 'received' });
    });

    socket.on('instance:metrics', async (msg) => {
      await processMetrics(instanceId, msg.payload || {});
    });

    socket.on('instance:command_ack', async (msg) => {
      if (msg && msg.payload && msg.payload.command_id) {
        const { command_id, status, result } = msg.payload;
        try {
          const cmdId = parseInt(String(command_id).replace('cmd_', ''), 10);
          if (!isNaN(cmdId)) {
            await dbRun(
              `UPDATE remote_commands SET status = ?, result = ?, acknowledged_at = datetime('now','localtime') WHERE id = ? AND instance_id = ? AND status = 'pending'`,
              [status || 'completed', JSON.stringify(result || {}), cmdId, instanceId]
            );
          }
          await dbRun(
            `UPDATE sync_queue SET status = 'acked', acked_at = datetime('now','localtime') WHERE instance_id = ? AND message_type = 'command' AND status IN ('pending', 'sent')`,
            [instanceId]
          );
        } catch (e) {
          console.error('[Sync Server] Erro ao processar command_ack:', e.message);
        }
      }
    });

    socket.on('instance:sync_request', async (msg) => {
      try {
        const pending = await dbAll(
          `SELECT * FROM sync_queue WHERE instance_id = ? AND status IN ('pending') ORDER BY priority ASC, id ASC`,
          [instanceId]
        );
        for (const item of pending) {
          socket.emit('server:command', {
            msg_id: item.id,
            type: 'command',
            payload: JSON.parse(item.payload)
          });
          await dbRun(
            `UPDATE sync_queue SET status = 'sent', sent_at = datetime('now','localtime') WHERE id = ?`,
            [item.id]
          );
        }
      } catch (e) {
        console.error('[Sync Server] Erro ao processar sync_request:', e.message);
      }
    });

    socket.on('disconnect', async () => {
      console.log(`[Sync Server] Instância desconectada: ${instanceId}`);
      connectedInstances.delete(instanceId);
      try {
        await dbRun(
          `UPDATE instance_registry SET status = 'offline' WHERE instance_id = ?`,
          [instanceId]
        );
      } catch (e) {}
    });
  });

  startOfflineDetector();

  // ── HTTP FALLBACK ENDPOINTS ──────────────────────────────────────
  // On-premise instances use these when WebSocket is unavailable.
  // All endpoints require HMAC-SHA256 signature: sig = HMAC(instance_id + ts, secret)

  function verifyHmac(req) {
    const instanceId = req.query.instance_id || (req.body && req.body.instance_id);
    const ts = req.query.ts || req.body && req.body.ts;
    const sig = req.query.sig || (req.body && req.body.sig);
    if (!instanceId || !ts || !sig) return false;
    const now = Date.now();
    const timestamp = parseInt(ts, 10);
    if (isNaN(timestamp) || Math.abs(now - timestamp) > 120000) return false;
    const crypto = require('crypto');
    const expected = crypto.createHmac('sha256', 'sync-secret-key').update(instanceId + ts).digest('hex');
    return sig === expected;
  }

  if (ctx.app && ctx.app.post) {
    // POST /api/sync/register — instance registration via HTTP
    ctx.app.post('/api/sync/register', async (req, res) => {
      const { instance_id, tenant_id, instance_name, software_version, os_info } = req.body;
      if (!instance_id) return res.status(400).json({ ok: false, error: 'instance_id obrigatório' });

      try {
        const existing = await dbGet(`SELECT * FROM instance_registry WHERE instance_id = ?`, [instance_id]);
        if (existing) {
          await dbRun(
            `UPDATE instance_registry SET status = 'online', last_heartbeat_at = datetime('now','localtime'),
             software_version = ?, os_info = ?, ip_address = ? WHERE instance_id = ?`,
            [software_version || existing.software_version, os_info || existing.os_info, req.ip, instance_id]
          );
        } else {
          await dbRun(
            `INSERT INTO instance_registry (instance_id, tenant_id, instance_name, software_version, os_info, ip_address, status)
             VALUES (?, ?, ?, ?, ?, ?, 'online')`,
            [instance_id, tenant_id || null, instance_name || 'On-Premise', software_version || '1.0.0', os_info || '', req.ip]
          );
        }
        res.json({ ok: true, registered: true, instance_id });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });

    // POST /api/sync/activate — ativação da instância via chave de ativação ou login/senha
    ctx.app.post('/api/sync/activate', async (req, res) => {
      const { type, chave_ativacao, email, senha, instance_id, machine_id, hostname } = req.body || {};
      const bcrypt = require('bcrypt');

      try {
        if (type === 'key' || chave_ativacao) {
          const chave = String(chave_ativacao || '').trim().toUpperCase();
          if (!chave) return res.status(400).json({ ok: false, success: false, error: 'Chave de ativação é obrigatória.' });

          // Localiza restaurante por chave_ativacao ou fallback formatado CHEF-LOCAL-000X / CHEF-000X
          const row = await dbGet(
            `SELECT * FROM restaurantes 
             WHERE UPPER(TRIM(COALESCE(chave_ativacao, ''))) = ? 
                OR UPPER(TRIM('CHEF-LOCAL-' || printf('%04d', id))) = ?
                OR UPPER(TRIM('CHEF-' || printf('%04d', id))) = ?
             LIMIT 1`,
            [chave, chave, chave]
          );

          if (!row) {
            return res.status(404).json({ ok: false, success: false, error: 'Chave de ativação inválida ou não encontrada.' });
          }

          if (row.ativo === 0) {
            return res.status(403).json({ ok: false, success: false, error: 'Este restaurante está inativo no sistema.' });
          }

          const instId = instance_id || ('inst_' + row.id + '_' + Date.now());
          const instName = row.nome || ('Restaurante #' + row.id);

          const existing = await dbGet(`SELECT id FROM instance_registry WHERE instance_id = ?`, [instId]);
          if (existing) {
            await dbRun(
              `UPDATE instance_registry SET tenant_id = ?, instance_name = ?, status = 'online', last_heartbeat_at = datetime('now','localtime'), os_info = ?, ip_address = ? WHERE instance_id = ?`,
              [row.id, instName, hostname || machine_id || '', req.ip, instId]
            );
          } else {
            await dbRun(
              `INSERT INTO instance_registry (instance_id, tenant_id, instance_name, software_version, os_info, ip_address, status, last_heartbeat_at)
               VALUES (?, ?, ?, '1.0.0', ?, ?, 'online', datetime('now','localtime'))`,
              [instId, row.id, instName, hostname || machine_id || '', req.ip]
            );
          }

          const finalKey = row.chave_ativacao || ('CHEF-LOCAL-' + String(row.id).padStart(4, '0'));
          return res.json({
            ok: true,
            success: true,
            restaurant_id: row.id,
            restaurant_name: row.nome,
            activation_key: finalKey,
            plan: row.licenca || 'premium',
            instance_id: instId,
            message: `Restaurante '${row.nome}' ativado com sucesso via chave!`
          });
        }
        else if (type === 'login' || (email && senha)) {
          const userLogin = String(email || '').trim().toLowerCase();
          const userPass = String(senha || '');

          if (!userLogin || !userPass) {
            return res.status(400).json({ ok: false, success: false, error: 'Preencha usuário/e-mail e senha.' });
          }

          const user = await dbGet(
            `SELECT u.*, r.id as r_id, r.nome as r_nome, r.chave_ativacao as r_chave, r.ativo as r_ativo, r.licenca as r_licenca, r.dono_email
             FROM usuarios u
             JOIN restaurantes r ON u.restaurante_id = r.id
             WHERE (LOWER(u.username) = ? OR LOWER(COALESCE(r.dono_email, '')) = ?) AND u.ativo = 1
             ORDER BY u.id ASC LIMIT 1`,
            [userLogin, userLogin]
          );

          if (!user) {
            return res.status(401).json({ ok: false, success: false, error: 'Usuário não encontrado ou inativo.' });
          }

          if (user.r_ativo === 0) {
            return res.status(403).json({ ok: false, success: false, error: 'Este restaurante está inativo no sistema.' });
          }

          const match = await bcrypt.compare(userPass, user.password_hash);
          if (!match) {
            return res.status(401).json({ ok: false, success: false, error: 'Senha incorreta.' });
          }

          const instId = instance_id || ('inst_' + user.r_id + '_' + Date.now());
          const instName = user.r_nome || ('Restaurante #' + user.r_id);

          const existing = await dbGet(`SELECT id FROM instance_registry WHERE instance_id = ?`, [instId]);
          if (existing) {
            await dbRun(
              `UPDATE instance_registry SET tenant_id = ?, instance_name = ?, status = 'online', last_heartbeat_at = datetime('now','localtime'), os_info = ?, ip_address = ? WHERE instance_id = ?`,
              [user.r_id, instName, hostname || machine_id || '', req.ip, instId]
            );
          } else {
            await dbRun(
              `INSERT INTO instance_registry (instance_id, tenant_id, instance_name, software_version, os_info, ip_address, status, last_heartbeat_at)
               VALUES (?, ?, ?, '1.0.0', ?, ?, 'online', datetime('now','localtime'))`,
              [instId, user.r_id, instName, hostname || machine_id || '', req.ip]
            );
          }

          const finalKey = user.r_chave || ('CHEF-LOCAL-' + String(user.r_id).padStart(4, '0'));
          return res.json({
            ok: true,
            success: true,
            restaurant_id: user.r_id,
            restaurant_name: user.r_nome,
            activation_key: finalKey,
            account_email: user.username,
            plan: user.r_licenca || 'premium',
            instance_id: instId,
            message: `Restaurante '${user.r_nome}' logado e ativado com sucesso!`
          });
        }
        else {
          return res.status(400).json({ ok: false, success: false, error: 'Informe a chave de ativação ou usuário e senha.' });
        }
      } catch (err) {
        console.error('[Sync Server] Erro no endpoint /api/sync/activate:', err.message);
        return res.status(500).json({ ok: false, success: false, error: 'Erro interno ao processar ativação: ' + err.message });
      }
    });

    // GET /api/sync/poll — on-premise polls for pending commands/data
    ctx.app.get('/api/sync/poll', async (req, res) => {
      const { instance_id } = req.query;
      if (!instance_id) return res.status(400).json({ ok: false, error: 'instance_id obrigatório' });

      try {
        await dbRun(
          `UPDATE instance_registry SET status = 'online', last_heartbeat_at = datetime('now','localtime') WHERE instance_id = ?`,
          [instance_id]
        );
        const rows = await dbAll(
          `SELECT sq.id as queue_id, rc.id as command_id, rc.command, rc.params
           FROM sync_queue sq
           JOIN remote_commands rc ON rc.instance_id = sq.instance_id
           WHERE sq.instance_id = ? AND sq.status = 'pending'
           ORDER BY sq.priority ASC, sq.id ASC LIMIT 20`,
          [instance_id]
        );
        const commands = rows.map(r => ({
          command_id: r.command_id,
          command: r.command,
          params: r.params ? JSON.parse(r.params) : {}
        }));
        res.json({ ok: true, commands });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });

    // POST /api/sync/push — on-premise pushes data up
    ctx.app.post('/api/sync/push', async (req, res) => {
      const { instance_id, message_type, payload } = req.body;
      if (!instance_id) return res.status(400).json({ ok: false, error: 'instance_id obrigatório' });

      try {
        await dbRun(
          `UPDATE instance_registry SET last_sync_at = datetime('now','localtime') WHERE instance_id = ?`,
          [instance_id]
        );
        console.log(`[Sync Server] HTTP push de ${instance_id}: ${message_type || 'unknown'}`);
        res.json({ ok: true, received: true });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });

    // POST /api/sync/ack — on-premise acknowledges command execution
    ctx.app.post('/api/sync/ack', async (req, res) => {
      const { instance_id, command_id, status, result } = req.body;
      if (!instance_id || !command_id) return res.status(400).json({ ok: false, error: 'instance_id e command_id obrigatórios' });

      try {
        const cmdId = parseInt(String(command_id), 10);
        if (!isNaN(cmdId)) {
          await dbRun(
            `UPDATE remote_commands SET status = ?, result = ?, acknowledged_at = datetime('now','localtime') WHERE id = ? AND instance_id = ? AND status = 'pending'`,
            [status || 'completed', JSON.stringify(result || {}), cmdId, instance_id]
          );
        }
        await dbRun(
          `UPDATE sync_queue SET status = 'acked', acked_at = datetime('now','localtime') WHERE instance_id = ? AND message_type = 'command' AND status IN ('pending', 'sent')`,
          [instance_id]
        );
        res.json({ ok: true, acked: true });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });
  }

  console.log('[Sync Server] Inicializado. Namespace /sync + HTTP fallback ativos.');
}

async function getAllInstances() {
  return dbAll(`SELECT * FROM instance_registry ORDER BY last_heartbeat_at DESC`);
}

async function getInstance(instanceId) {
  return dbGet(`SELECT * FROM instance_registry WHERE instance_id = ?`, [instanceId]);
}

async function getPendingCommands(instanceId) {
  return dbAll(
    `SELECT * FROM remote_commands WHERE instance_id = ? AND status IN ('pending', 'acknowledged') ORDER BY issued_at DESC`,
    [instanceId]
  );
}

async function getSyncConflicts(instanceId, limit) {
  const l = limit || 50;
  return dbAll(
    `SELECT * FROM sync_conflicts WHERE instance_id = ? ORDER BY resolved_at DESC LIMIT ?`,
    [instanceId, l]
  );
}

async function getSyncQueue(instanceId) {
  return dbAll(
    `SELECT * FROM sync_queue WHERE instance_id = ? ORDER BY created_at DESC LIMIT 100`,
    [instanceId]
  );
}

module.exports = {
  initialize,
  queueCommand,
  pushConfig,
  pushPlan,
  getAllInstances,
  getInstance,
  getPendingCommands,
  getSyncConflicts,
  getSyncQueue,
  getConnectedInstances: () => connectedInstances
};
