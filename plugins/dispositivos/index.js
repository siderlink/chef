/**
 * Plugin: dispositivos
 * Gerenciamento de dispositivos conectados (routes + sockets)
 */
module.exports = function({ app, db, io, options, log }) {
  const { verificarToken, activeSockets, getTempoConectadoStr } = options;

  /* ── Deduplicar lista por serial (manter conexão mais recente) ── */
  function dedupDevices(deviceList) {
    const bySerial = {};
    const noSerial = [];
    deviceList.forEach(d => {
      if (d.serial) {
        if (!bySerial[d.serial] || d.connectedAt > bySerial[d.serial].connectedAt) {
          bySerial[d.serial] = d;
        } else {
          /* Guardar todos os socket IDs do mesmo serial no entry mais recente */
        }
        if (!bySerial[d.serial]._allSocketIds) bySerial[d.serial]._allSocketIds = [];
        bySerial[d.serial]._allSocketIds.push(d.id);
      } else {
        noSerial.push(d);
      }
    });
    return [...Object.values(bySerial), ...noSerial];
  }

  function buildDeviceList() {
    const raw = Array.from(activeSockets.values()).map(d => ({
      ...d,
      tempoConectadoStr: getTempoConectadoStr(d.connectedAt)
    }));
    return dedupDevices(raw);
  }

  log('Registering routes...');

  app.get('/api/dispositivos', verificarToken, (req, res) => {
    const deduped = buildDeviceList();
    const serials = [...new Set(deduped.map(d => d.serial).filter(Boolean))];
    if (!serials.length) return res.json(deduped);
    db.all(`SELECT serial, apelido, tipo, modo FROM dispositivos WHERE serial IN (${serials.map(() => '?').join(',')})`, serials, (err, rows) => {
      if (!err && rows) {
        const mapa = {};
        rows.forEach(r => { mapa[r.serial] = r; });
        deduped.forEach(d => {
          if (d.serial && mapa[d.serial]) {
            d.apelido = d.apelido || mapa[d.serial].apelido || '';
            d.tipo = d.tipo || mapa[d.serial].tipo || '';
            d.modo = d.modo || mapa[d.serial].modo || 'normal';
          }
        });
      }
      res.json(deduped);
    });
  });

  app.post('/api/dispositivos/:id/renomear', verificarToken, (req, res) => {
    const { id } = req.params;
    const { novoNome } = req.body || {};
    if (!novoNome) return res.status(400).json({ error: 'Nome é obrigatório' });

    const conn = activeSockets.get(id);
    if (conn) {
      conn.model = novoNome.trim();
      conn.device = `${conn.model} (${conn.os} • ${conn.browser})`;
      const targetSocket = io.sockets.sockets.get(id);
      if (targetSocket) {
        targetSocket.emit('apelido_atualizado_remoto', { apelido: novoNome.trim() });
      }
      io.emit('connected_devices_updated');
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Dispositivo não encontrado ou desconectado' });
    }
  });

  app.post('/api/dispositivos/:id/desconectar', verificarToken, (req, res) => {
    const { id } = req.params;
    const targetSocket = io.sockets.sockets.get(id);
    if (targetSocket) {
      targetSocket.emit('sessao_derrubada_remotamente');
      targetSocket.disconnect(true);
      activeSockets.delete(id);
      io.emit('connected_devices_updated');
      res.json({ success: true });
    } else {
      activeSockets.delete(id);
      res.json({ success: true });
    }
  });

  log('Registering sockets...');

  io.on('connection', (socket) => {
    socket.on('get_connected_devices', () => {
      const deduped = buildDeviceList();
      const serials = [...new Set(deduped.map(d => d.serial).filter(Boolean))];
      if (!serials.length) return socket.emit('connected_devices', deduped);
      db.all(`SELECT serial, apelido, tipo, modo FROM dispositivos WHERE serial IN (${serials.map(() => '?').join(',')})`, serials, (err, rows) => {
        if (!err && rows) {
          const mapa = {};
          rows.forEach(r => { mapa[r.serial] = r; });
          deduped.forEach(d => {
            if (d.serial && mapa[d.serial]) {
              d.apelido = d.apelido || mapa[d.serial].apelido || '';
              d.tipo = d.tipo || mapa[d.serial].tipo || '';
              d.modo = d.modo || mapa[d.serial].modo || 'normal';
            }
          });
        }
        socket.emit('connected_devices', deduped);
      });
    });

    socket.on('dono_ativar_totem_dispositivo', (data) => {
      const deviceId = data && data.device_id;
      if (!deviceId) return;
      const targetSocket = io.sockets.sockets.get(deviceId);
      if (targetSocket) {
        targetSocket.emit('navegar_para', { destino: 'totem.html', solicitadoPor: 'Dono' });
        targetSocket.emit('ir_para_totem');
      }
      if (activeSockets && activeSockets.has(deviceId)) {
        const conn = activeSockets.get(deviceId);
        conn.tipo = 'totem';
        conn.cargo = 'Totem';
        if (conn.serial) {
          db.run(`UPDATE dispositivos SET modo = 'totem', tipo = 'totem' WHERE serial = ?`, [conn.serial], () => {});
        }
      }
      io.emit('connected_devices_updated');
    });

    socket.on('dono_liberar_totem_dispositivo', (data) => {
      const deviceId = data && data.device_id;
      if (!deviceId) return;
      const targetSocket = io.sockets.sockets.get(deviceId);
      if (targetSocket) {
        targetSocket.emit('totem_liberado');
      }
      if (activeSockets && activeSockets.has(deviceId)) {
        const conn = activeSockets.get(deviceId);
        conn.tipo = 'tablet';
        conn.cargo = 'Normal';
        if (conn.serial) {
          db.run(`UPDATE dispositivos SET modo = 'normal' WHERE serial = ?`, [conn.serial], () => {});
        }
      }
      io.emit('connected_devices_updated');
    });

    socket.on('dono_rotacionar_totem_dispositivo', (data) => {
      const deviceId = data && data.device_id;
      if (!deviceId) return;
      const targetSocket = io.sockets.sockets.get(deviceId);
      if (targetSocket) {
        targetSocket.emit('totem_rotacionar');
      }
    });
  });

  log('Routes + sockets registered.');
};
