/**
 * routes/dispositivos.routes.js
 * Módulo de Dispositivos e Auditoria extraído do server.js (linhas 9470–9528)
 *
 * Rotas:
 *   GET  /api/auditoria
 *   GET  /api/logs-api
 *   GET  /api/dispositivos
 *   POST /api/dispositivos/:id/renomear
 *   POST /api/dispositivos/:id/desconectar
 */
'use strict';

const { Router } = require('express');
const { getContext } = require('./shared/context');

function createDispositivosRouter() {
  const router = Router();
  const { verificarToken } = getContext();
  const getDb = () => getContext().getTenantDb();

  // GET /api/auditoria
  router.get('/auditoria', verificarToken, (req, res) => {
    getDb().all('SELECT * FROM auditoria ORDER BY id DESC LIMIT 300', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });

  // GET /api/logs-api
  router.get('/logs-api', verificarToken, (req, res) => {
    getDb().all('SELECT * FROM api_logs ORDER BY id DESC LIMIT 300', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });

  // GET /api/dispositivos — lista dispositivos conectados
  router.get('/', verificarToken, (req, res) => {
    const { activeSockets } = getContext();
    const deviceList = Array.from((activeSockets || new Map()).values()).map(d => ({
      ...d,
      tempoConectadoStr: d.connectedAt
        ? (() => {
            const ms = Date.now() - new Date(d.connectedAt).getTime();
            const m = Math.floor(ms / 60000);
            return m < 60 ? `${m}min` : `${Math.floor(m / 60)}h${m % 60}min`;
          })()
        : '--'
    }));
    res.json(deviceList);
  });

  // POST /api/dispositivos/:id/renomear
  router.post('/:id/renomear', verificarToken, (req, res) => {
    const { id } = req.params;
    const { novoNome } = req.body || {};
    if (!novoNome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const { activeSockets, io } = getContext();
    const conn = (activeSockets || new Map()).get(id);
    if (conn) {
      conn.model  = novoNome.trim();
      conn.device = `${conn.model} (${conn.os || 'OS'} • ${conn.browser || 'Browser'})`;
      const targetSocket = io.sockets.sockets.get(id);
      if (targetSocket) targetSocket.emit('apelido_atualizado_remoto', { apelido: novoNome.trim() });
      io.emit('connected_devices_updated');
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Dispositivo não encontrado ou desconectado' });
    }
  });

  // POST /api/dispositivos/:id/desconectar
  router.post('/:id/desconectar', verificarToken, (req, res) => {
    const { activeSockets, io } = getContext();
    const { id } = req.params;
    const targetSocket = io.sockets.sockets.get(id);
    if (targetSocket) {
      targetSocket.emit('sessao_derrubada_remotamente');
      targetSocket.disconnect(true);
    }
    (activeSockets || new Map()).delete(id);
    io.emit('connected_devices_updated');
    res.json({ success: true });
  });

  // ── GERENCIAMENTO DE DISPOSITIVOS PWA ──────────────────────────────────────
  const { withTenant } = getContext();

  router.get('/pwa-dispositivos', verificarToken, (req, res) => {
    withTenant(req, () => {
      getDb().all(`SELECT * FROM pwa_dispositivos ORDER BY last_seen DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar dispositivos' });
        res.json(rows || []);
      });
    });
  });

  router.post('/pwa-dispositivos/:deviceId/remover', verificarToken, (req, res) => {
    withTenant(req, () => {
      getDb().run(`DELETE FROM pwa_dispositivos WHERE device_id = ?`, [req.params.deviceId], function(err) {
        if (err) return res.status(500).json({ error: 'Erro ao remover' });
        res.json({ success: true });
      });
    });
  });

  router.post('/pwa-dispositivos/:deviceId/permissoes', verificarToken, (req, res) => {
    const { tipo, classe, genero, grau } = req.body || {};
    withTenant(req, () => {
      getDb().run(
        `UPDATE pwa_dispositivos SET perm_tipo = ?, perm_classe = ?, perm_genero = ?, perm_grau = ? WHERE device_id = ?`,
        [tipo || null, classe || null, genero || null, grau || null, req.params.deviceId],
        function(err) {
          if (err) return res.status(500).json({ error: 'Erro ao salvar permissões' });
          res.json({ success: true });
        }
      );
    });
  });

  return router;
}

module.exports = { createDispositivosRouter };
