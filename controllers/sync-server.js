const crypto = require('crypto');

let ctx = {};
let connectedInstances = new Map(); // instance_id -> { socket, lastHeartbeat, data, ip, connectedAt }
let offlineDetectorInterval = null;

function hmacSign(payload, secret) {
  return crypto.createHmac('sha256', secret || 'sync-secret-key').update(payload).digest('hex');
}

function generateCommandId() {
  return 'cmd_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

function generateActivationKeyString() {
  const p1 = 'CHEF';
  const p2 = new Date().getFullYear();
  const p3 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const p4 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${p1}-${p2}-${p3}-${p4}`;
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
  }, 30000);
}

async function handleRegistration(instanceData, socket) {
  const { instance_id, tenant_id, instance_name, software_version, os_info, secret } = instanceData || {};
  if (!instance_id) return { error: 'instance_id obrigatório' };

  const clientIp = socket ? (socket.handshake.headers['x-forwarded-for'] || socket.handshake.address) : null;
  const existing = await dbGet(`SELECT * FROM instance_registry WHERE instance_id = ?`, [instance_id]);

  if (existing) {
    await dbRun(
      `UPDATE instance_registry SET status = 'online', last_heartbeat_at = datetime('now','localtime'),
       software_version = ?, os_info = ?, ip_address = COALESCE(?, ip_address) WHERE instance_id = ?`,
      [software_version || existing.software_version, os_info || existing.os_info, clientIp, instance_id]
    );
  } else {
    await dbRun(
      `INSERT INTO instance_registry (instance_id, tenant_id, instance_name, software_version, os_info, ip_address, status, last_heartbeat_at)
       VALUES (?, ?, ?, ?, ?, ?, 'online', datetime('now','localtime'))`,
      [instance_id, tenant_id || null, instance_name || 'On-Premise', software_version || '1.0.0', os_info || '', clientIp]
    );
  }

  return { ok: true, registered: true, instance_id };
}

async function handleHeartbeat(instanceId, data, socket) {
  if (!instanceId) return;
  try {
    const existing = await dbGet(`SELECT status FROM instance_registry WHERE instance_id = ?`, [instanceId]);
    const currentStatus = (existing && existing.status === 'deactivated') ? 'deactivated' : 'online';

    await dbRun(
      `UPDATE instance_registry SET status = ?, last_heartbeat_at = datetime('now','localtime'),
       software_version = COALESCE(?, software_version) WHERE instance_id = ?`,
      [currentStatus, data.software_version, instanceId]
    );

    const prev = connectedInstances.get(instanceId) || {};
    connectedInstances.set(instanceId, {
      socket: socket || prev.socket,
      lastHeartbeat: Date.now(),
      data: Object.assign(prev.data || {}, data)
    });

    if (ctx.io) {
      ctx.io.emit('super:instance_heartbeat', {
        instanceId,
        status: currentStatus,
        last_heartbeat_at: new Date().toISOString()
      });
    }
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

    // Se houver registros sincronizados (pedidos ou movimentações), podemos registrar no histórico
    const tableName = payload.table || 'dados';
    const recordsCount = Array.isArray(payload.records) ? payload.records.length : 0;
    console.log(`[Sync Server] Push de dados de ${instanceId}: tabela '${tableName}' (${recordsCount} itens).`);

    if (ctx.io) {
      ctx.io.emit('super:instance_sync_event', {
        instanceId,
        table: tableName,
        count: recordsCount,
        timestamp: new Date().toISOString()
      });
    }
  } catch (e) {
    console.error('[Sync Server] Erro ao processar data_push:', e.message);
  }
}

async function processMetrics(instanceId, data) {
  if (!instanceId || !data) return;
  try {
    const vendas = parseFloat(data.vendas_hoje) || 0;
    const pedidos = parseInt(data.pedidos_hoje, 10) || parseInt(data.orders_count, 10) || 0;
    const mesas = parseInt(data.mesas_abertas, 10) || 0;
    const caixaAberto = data.caixa_aberto ? 1 : 0;
    const caixaOperador = String(data.caixa_operador || '');
    const clients = parseInt(data.connected_clients, 10) || 0;
    const mem = parseInt(data.memory_usage_mb, 10) || 0;
    const cpu = parseInt(data.cpu_usage_percent, 10) || 0;
    const uptime = parseInt(data.uptime_seconds, 10) || 0;
    const dbSize = parseInt(data.db_size_bytes, 10) || 0;

    await dbRun(
      `UPDATE instance_registry SET 
        vendas_hoje = ?, 
        pedidos_hoje = ?, 
        mesas_abertas = ?, 
        caixa_aberto = ?, 
        caixa_operador = ?, 
        connected_clients = ?, 
        memory_mb = ?, 
        cpu_percent = ?, 
        uptime_seconds = ?, 
        db_size_bytes = ?, 
        last_metrics_at = datetime('now','localtime'),
        status = CASE WHEN status = 'deactivated' THEN 'deactivated' ELSE 'online' END,
        last_heartbeat_at = datetime('now','localtime')
       WHERE instance_id = ?`,
      [vendas, pedidos, mesas, caixaAberto, caixaOperador, clients, mem, cpu, uptime, dbSize, instanceId]
    );

    // Atualiza tabela de métricas de pico se associada a tenant
    try {
      const inst = await dbGet(`SELECT tenant_id FROM instance_registry WHERE instance_id = ?`, [instanceId]);
      if (inst && inst.tenant_id) {
        const existingPico = await dbGet(
          `SELECT id FROM metrica_picos WHERE restaurante_id = ? AND dia = date('now','localtime') AND hora = CAST(strftime('%H','now','localtime') AS INTEGER)`,
          [inst.tenant_id]
        );
        if (existingPico) {
          await dbRun(`UPDATE metrica_picos SET sockets = ? WHERE id = ?`, [clients, existingPico.id]);
        }
      }
    } catch (ePico) {}

    // Notifica em tempo real o Super Admin
    if (ctx.io) {
      ctx.io.emit('super:instance_metrics', {
        instanceId,
        vendas_hoje: vendas,
        pedidos_hoje: pedidos,
        mesas_abertas: mesas,
        caixa_aberto: caixaAberto,
        caixa_operador: caixaOperador,
        connected_clients: clients,
        memory_mb: mem,
        cpu_percent: cpu,
        uptime_seconds: uptime,
        db_size_bytes: dbSize,
        last_metrics_at: new Date().toISOString()
      });
    }
  } catch (e) {
    console.error('[Sync Server] Erro ao processar métricas:', e.message);
  }
}

async function queueCommand(instanceId, command, params, issuedBy) {
  const commandId = generateCommandId();

  const cmdRes = await dbRun(
    `INSERT INTO remote_commands (instance_id, command, params, issued_by, status, command_id) VALUES (?, ?, ?, ?, 'pending', ?)`,
    [instanceId, command, JSON.stringify(params || {}), issuedBy || 'super_admin', commandId]
  ).catch(async () => {
    // Fallback se coluna command_id ainda não existir
    return await dbRun(
      `INSERT INTO remote_commands (instance_id, command, params, issued_by, status) VALUES (?, ?, ?, ?, 'pending')`,
      [instanceId, command, JSON.stringify(params || {}), issuedBy || 'super_admin']
    );
  });

  const qResult = await dbRun(
    `INSERT INTO sync_queue (instance_id, message_type, payload, priority, status) VALUES (?, 'command', ?, ?, 'pending')`,
    [instanceId, JSON.stringify({ command_id: commandId, command, params: params || {} }), (command === 'deactivate' || command === 'wipe_sessions') ? 1 : 5]
  );

  let sentLive = false;
  const entry = connectedInstances.get(instanceId);
  if (entry && entry.socket && entry.socket.connected) {
    try {
      entry.socket.emit('server:command', {
        msg_id: (cmdRes && cmdRes.lastID) || qResult.lastID || commandId,
        type: 'command',
        payload: { command_id: commandId, command, params: params || {} }
      });
      await dbRun(
        `UPDATE sync_queue SET status = 'sent', sent_at = datetime('now','localtime') WHERE id = ?`,
        [qResult.lastID]
      );
      sentLive = true;
      console.log(`[Sync Server] ⚡ Comando '${command}' emitido em TEMPO REAL para '${instanceId}' via WebSocket.`);
    } catch (err) {
      console.error('[Sync Server] Erro ao emitir comando via WS:', err.message);
    }
  } else {
    console.log(`[Sync Server] 📦 Comando '${command}' enfileirado para '${instanceId}' (instância offline ou polling).`);
  }

  return { command_id: commandId, sent_live: sentLive };
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
    if (!instance_id) {
      return next(new Error('instance_id obrigatório'));
    }
    socket.instanceId = instance_id;
    next();
  });

  syncNsp.on('connection', async (socket) => {
    const instanceId = socket.instanceId;
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    console.log(`[Sync Server] 🟢 Instância conectada: ${instanceId} (IP: ${clientIp})`);

    // Registra conexão ativa e guarda a referência do socket
    connectedInstances.set(instanceId, {
      socket,
      lastHeartbeat: Date.now(),
      connectedAt: Date.now(),
      ip: clientIp,
      data: {}
    });

    // Atualiza status online no banco
    try {
      await dbRun(
        `UPDATE instance_registry SET status = CASE WHEN status = 'deactivated' THEN 'deactivated' ELSE 'online' END,
         last_heartbeat_at = datetime('now','localtime'), ip_address = COALESCE(?, ip_address) WHERE instance_id = ?`,
        [clientIp, instanceId]
      );
    } catch (e) {}

    // Despacho imediato de comandos pendentes acumulados para esta instância
    try {
      const pending = await dbAll(
        `SELECT * FROM sync_queue WHERE instance_id = ? AND status = 'pending' ORDER BY priority ASC, id ASC`,
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
      if (pending.length) {
        console.log(`[Sync Server] Entregues ${pending.length} comandos pendentes para ${instanceId}.`);
      }
    } catch (e) {
      console.error('[Sync Server] Erro ao despachar comandos pendentes:', e.message);
    }

    if (ctx.io) {
      ctx.io.emit('super:instance_connected', { instanceId, ip: clientIp, status: 'online' });
    }

    // ── EVENTOS DO SOCKET ──────────────────────────────────────────
    socket.on('instance:register', async (msg) => {
      const result = await handleRegistration(msg.payload || msg, socket);
      socket.emit('server:sync_ack', { type: 'register', result });
    });

    socket.on('instance:heartbeat', async (msg) => {
      await handleHeartbeat(instanceId, msg.payload || {}, socket);
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
          const resStr = typeof result === 'string' ? result : JSON.stringify(result || {});
          const numId = parseInt(String(command_id).replace(/\D/g, ''), 10) || 0;
          await dbRun(
            `UPDATE remote_commands SET status = ?, result = ?, acknowledged_at = datetime('now','localtime') 
             WHERE id = ? OR (instance_id = ? AND status = 'pending')`,
            [status || 'completed', resStr, numId, instanceId]
          );

          await dbRun(
            `UPDATE sync_queue SET status = 'acked', acked_at = datetime('now','localtime') 
             WHERE instance_id = ? AND payload LIKE ? AND status IN ('pending', 'sent')`,
            [instanceId, '%' + command_id + '%']
          );

          console.log(`[Sync Server] ACK recebido de ${instanceId} para comando ${command_id}: ${status}`);

          if (ctx.io) {
            ctx.io.emit('super:command_ack', {
              instanceId,
              command_id,
              status: status || 'completed',
              result
            });
          }
        } catch (e) {
          console.error('[Sync Server] Erro ao processar command_ack:', e.message);
        }
      }
    });

    socket.on('instance:sync_request', async () => {
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
      console.log(`[Sync Server] 🔴 Instância desconectada: ${instanceId}`);
      connectedInstances.delete(instanceId);
      try {
        await dbRun(
          `UPDATE instance_registry SET status = CASE WHEN status = 'deactivated' THEN 'deactivated' ELSE 'offline' END WHERE instance_id = ?`,
          [instanceId]
        );
      } catch (e) {}

      if (ctx.io) {
        ctx.io.emit('super:instance_disconnected', { instanceId, status: 'offline' });
      }
    });
  });

  startOfflineDetector();

  // ── HTTP FALLBACK ENDPOINTS ──────────────────────────────────────
  if (ctx.app && ctx.app.post) {
    // POST /api/sync/register — registro de instância via HTTP
    ctx.app.post('/api/sync/register', async (req, res) => {
      const { instance_id, tenant_id, instance_name, software_version, os_info } = req.body || {};
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
            `INSERT INTO instance_registry (instance_id, tenant_id, instance_name, software_version, os_info, ip_address, status, last_heartbeat_at)
             VALUES (?, ?, ?, ?, ?, ?, 'online', datetime('now','localtime'))`,
            [instance_id, tenant_id || null, instance_name || 'On-Premise', software_version || '1.0.0', os_info || '', req.ip]
          );
        }
        res.json({ ok: true, registered: true, instance_id });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });

    // POST /api/sync/activate — ativação via chave de ativação ou login/senha
    ctx.app.post('/api/sync/activate', async (req, res) => {
      const { type, chave_ativacao, email, senha, instance_id, machine_id, hostname } = req.body || {};
      const bcrypt = require('bcrypt');

      try {
        if (type === 'key' || chave_ativacao) {
          const chave = String(chave_ativacao || '').trim().toUpperCase();
          if (!chave) return res.status(400).json({ ok: false, success: false, error: 'Chave de ativação é obrigatória.' });

          // Localiza restaurante por chave_ativacao em restaurantes ou chaves_ativacao
          let row = await dbGet(
            `SELECT * FROM restaurantes 
             WHERE UPPER(TRIM(COALESCE(chave_ativacao, ''))) = ? 
                OR UPPER(TRIM('CHEF-LOCAL-' || printf('%04d', id))) = ?
                OR UPPER(TRIM('CHEF-' || printf('%04d', id))) = ?
             LIMIT 1`,
            [chave, chave, chave]
          );

          // Se não achou em restaurantes, procura em chaves_ativacao
          if (!row) {
            const chaveRow = await dbGet(`SELECT * FROM chaves_ativacao WHERE UPPER(TRIM(chave)) = ? LIMIT 1`, [chave]);
            if (chaveRow && chaveRow.restaurante_id) {
              row = await dbGet(`SELECT * FROM restaurantes WHERE id = ?`, [chaveRow.restaurante_id]);
            }
          }

          if (!row) {
            return res.status(404).json({ ok: false, success: false, error: 'Chave de ativação inválida ou não encontrada no Super Admin.' });
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

          // Marca chave como usada se estiver na tabela chaves_ativacao
          try {
            await dbRun(`UPDATE chaves_ativacao SET status = 'usada', usada_em = datetime('now','localtime') WHERE UPPER(TRIM(chave)) = ?`, [chave]);
          } catch (eChave) {}

          const finalKey = row.chave_ativacao || chave;
          return res.json({
            ok: true,
            success: true,
            restaurant_id: row.id,
            restaurant_name: row.nome,
            activation_key: finalKey,
            plan: row.licenca || 'premium',
            validade: row.validade_licenca || null,
            max_dispositivos: row.max_dispositivos || 999,
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
            `SELECT u.*, r.id as r_id, r.nome as r_nome, r.chave_ativacao as r_chave, r.ativo as r_ativo, r.licenca as r_licenca, r.validade_licenca, r.dono_email
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
            validade: user.validade_licenca || null,
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

    // GET /api/sync/poll — polling HTTP quando WebSocket não está conectado
    ctx.app.get('/api/sync/poll', async (req, res) => {
      const { instance_id } = req.query;
      if (!instance_id) return res.status(400).json({ ok: false, error: 'instance_id obrigatório' });

      try {
        await dbRun(
          `UPDATE instance_registry SET status = CASE WHEN status = 'deactivated' THEN 'deactivated' ELSE 'online' END,
           last_heartbeat_at = datetime('now','localtime') WHERE instance_id = ?`,
          [instance_id]
        );
        const rows = await dbAll(
          `SELECT sq.id as queue_id, sq.payload
           FROM sync_queue sq
           WHERE sq.instance_id = ? AND sq.status = 'pending'
           ORDER BY sq.priority ASC, sq.id ASC LIMIT 20`,
          [instance_id]
        );
        const commands = rows.map(r => {
          try {
            return JSON.parse(r.payload);
          } catch(e) {
            return null;
          }
        }).filter(Boolean);

        for (const r of rows) {
          await dbRun(`UPDATE sync_queue SET status = 'sent', sent_at = datetime('now','localtime') WHERE id = ?`, [r.queue_id]);
        }

        res.json({ ok: true, commands });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });

    // POST /api/sync/push — push HTTP de métricas ou dados
    ctx.app.post('/api/sync/push', async (req, res) => {
      const { instance_id, message_type, payload } = req.body || {};
      if (!instance_id) return res.status(400).json({ ok: false, error: 'instance_id obrigatório' });

      try {
        if (message_type === 'instance:metrics' || message_type === 'metrics') {
          await processMetrics(instance_id, payload);
        } else {
          await processDataPush(instance_id, payload);
        }
        res.json({ ok: true, received: true });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });

    // POST /api/sync/ack — confirmação de execução de comando via HTTP
    ctx.app.post('/api/sync/ack', async (req, res) => {
      const { instance_id, command_id, status, result } = req.body || {};
      if (!instance_id || !command_id) return res.status(400).json({ ok: false, error: 'instance_id e command_id obrigatórios' });

      try {
        const resStr = typeof result === 'string' ? result : JSON.stringify(result || {});
        const numId = parseInt(String(command_id).replace(/\D/g, ''), 10) || 0;
        await dbRun(
          `UPDATE remote_commands SET status = ?, result = ?, acknowledged_at = datetime('now','localtime') 
           WHERE id = ? OR (instance_id = ? AND status = 'pending')`,
          [status || 'completed', resStr, numId, instance_id]
        );
        await dbRun(
          `UPDATE sync_queue SET status = 'acked', acked_at = datetime('now','localtime') 
           WHERE instance_id = ? AND payload LIKE ? AND status IN ('pending', 'sent')`,
          [instance_id, '%' + command_id + '%']
        );
        res.json({ ok: true, acked: true });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
      }
    });
  }

  console.log('[Sync Server] 🚀 Inicializado com sucesso. Namespace /sync WebSocket & HTTP ativos.');
}

async function getAllInstances() {
  const rows = await dbAll(`SELECT * FROM instance_registry ORDER BY last_heartbeat_at DESC`);
  return (rows || []).map(r => {
    const isLive = connectedInstances.has(r.instance_id) && connectedInstances.get(r.instance_id).socket && connectedInstances.get(r.instance_id).socket.connected;
    return Object.assign({}, r, {
      is_ws_connected: Boolean(isLive),
      status: (r.status === 'deactivated' || r.status === 'bloqueado') ? 'deactivated' : (isLive ? 'online' : r.status)
    });
  });
}

async function getInstance(instanceId) {
  const r = await dbGet(`SELECT * FROM instance_registry WHERE instance_id = ?`, [instanceId]);
  if (!r) return null;
  const isLive = connectedInstances.has(r.instance_id) && connectedInstances.get(r.instance_id).socket && connectedInstances.get(r.instance_id).socket.connected;
  return Object.assign({}, r, {
    is_ws_connected: Boolean(isLive),
    status: (r.status === 'deactivated' || r.status === 'bloqueado') ? 'deactivated' : (isLive ? 'online' : r.status)
  });
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

async function generateActivationKey(options = {}) {
  const { restaurante_id, restaurante_nome, plano, tipo, validade_dias } = options;
  const chave = generateActivationKeyString();
  const dias = parseInt(validade_dias, 10) || 30;

  let restId = restaurante_id ? parseInt(restaurante_id, 10) : null;

  // Se não foi passado restaurante_id, mas foi passado restaurante_nome, cria ou busca
  if (!restId && restaurante_nome) {
    const existing = await dbGet(`SELECT id FROM restaurantes WHERE LOWER(nome) = LOWER(?)`, [restaurante_nome]);
    if (existing) {
      restId = existing.id;
    } else {
      const res = await dbRun(
        `INSERT INTO restaurantes (nome, licenca, ativo, chave_ativacao, validade_licenca) 
         VALUES (?, ?, 1, ?, datetime('now', '+${dias} days'))`,
        [restaurante_nome, plano || 'premium', chave]
      );
      restId = res.lastID;
    }
  }

  // Atualiza chave no restaurante
  if (restId) {
    await dbRun(
      `UPDATE restaurantes SET chave_ativacao = ?, licenca = COALESCE(?, licenca), validade_licenca = datetime('now', '+${dias} days'), ativo = 1 WHERE id = ?`,
      [chave, plano || 'premium', restId]
    );
  }

  // Registra na tabela chaves_ativacao
  await dbRun(
    `INSERT INTO chaves_ativacao (chave, tipo, status, restaurante_id, observacao, criada_em)
     VALUES (?, ?, 'ativa', ?, ?, datetime('now','localtime'))`,
    [chave, tipo || 'offline_first', restId, `Gerada para ${restaurante_nome || 'Restaurante #' + restId} (${plano || 'premium'}, ${dias} dias)`]
  );

  return {
    ok: true,
    chave,
    restaurante_id: restId,
    restaurante_nome: restaurante_nome || `Restaurante #${restId}`,
    plano: plano || 'premium',
    validade_dias: dias,
    validade_data: new Date(Date.now() + dias * 24 * 3600 * 1000).toISOString().slice(0, 10)
  };
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
  generateActivationKey,
  getConnectedInstances: () => connectedInstances
};
