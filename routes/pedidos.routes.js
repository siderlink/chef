/**
 * routes/pedidos.routes.js
 * Módulo de Pedidos extraído do server.js (linhas 9531–9720)
 *
 * Rotas:
 *   GET  /api/pedidos
 *   POST /api/pedidos/:id/status
 *   POST /api/pedidos/chamar-garcom
 *   GET  /api/metricas/garcons
 */
'use strict';

const { Router } = require('express');
const { getContext } = require('./shared/context');

function createPedidosRouter() {
  const router = Router();
  const { verificarToken, io, withTenant, sendPush } = getContext();
  const getDb = () => getContext().getTenantDb();

  // GET /api/pedidos — fila ativa (não finalizados)
  router.get('/', verificarToken, (req, res) => {
    getDb().all(
      "SELECT * FROM pedidos WHERE status NOT IN ('Finalizado','Entregue','Pago','Cancelado') ORDER BY createdAt ASC",
      [],
      (err, rows) => res.json(rows || [])
    );
  });

  // POST /api/pedidos/:id/status — atualizar status via fila-lite
  router.post('/:id/status', verificarToken, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const validStatus = ['Em espera', 'Em preparo', 'Pronto'];
    if (!status || !validStatus.includes(status)) {
      return res.status(400).json({ error: 'Status inválido. Use: Em espera, Em preparo ou Pronto' });
    }
    const prontoUpdate = status === 'Pronto' ? ", prontoEm = datetime('now', 'localtime')" : '';
    const db = getDb();
    db.run('UPDATE pedidos SET status = ?' + prontoUpdate + ' WHERE id = ?', [status, id], function (err) {
      if (err) return res.status(500).json({ error: 'Erro ao atualizar status' });
      if (this.changes === 0) return res.status(404).json({ error: 'Pedido não encontrado' });
      db.get('SELECT * FROM pedidos WHERE id = ?', [id], (err2, row) => {
        if (err2 || !row) return res.status(500).json({ error: 'Erro ao buscar pedido' });
        io.emit('status_atualizado', row);
        if (status === 'Pronto') {
          io.emit('pedido_pronto', row);
          if (typeof sendPush === 'function') {
            sendPush('garcom', '✅ Pedido Pronto!', `${row.quantity || 1}x ${row.productName || 'Item'} — ${row.localName || ''}`.trim(), 'pronto-' + id, '/garcom.html');
          }
        }
        res.json({ success: true, pedido: row });
      });
    });
  });

  // POST /api/pedidos/chamar-garcom — cliente chama garçom pela mesa
  router.post('/chamar-garcom', (req, res) => {
    const { mesa, localName } = req.body || {};
    const nomeMesa = mesa || localName || 'Mesa';
    io.emit('garcom_chamado', { mesa: nomeMesa, timestamp: new Date().toISOString() });
    if (typeof sendPush === 'function') {
      sendPush('garcom', '🔔 Chamada de Garçom!', `${nomeMesa} está chamando.`, 'garcom-' + nomeMesa, '/garcom.html');
    }
    res.json({ success: true, mensagem: `Garçom chamado para ${nomeMesa}.` });
  });

  return router;
}

// ── Métricas de garçons (montado em /api/metricas) ───────────────────────

function createMetricasRouter() {
  const router = Router();
  const { verificarToken } = getContext();
  const getDb = () => getContext().getTenantDb();

  router.get('/garcons', verificarToken, (req, res) => {
    const db = getDb();
    db.all("SELECT * FROM funcionarios WHERE status = 'Ativo' ORDER BY nome", [], (errFunc, funcionarios) => {
      if (errFunc) return res.json({ ok: false, erro: 'Erro ao consultar funcionários.' });
      db.all('SELECT * FROM pedidos ORDER BY id', [], (errPed, pedidos) => {
        if (errPed) return res.json({ ok: false, erro: 'Erro ao consultar pedidos.' });
        const hojeStr = new Date().toISOString().slice(0, 10);
        const metricas = (funcionarios || []).map(f => {
          const fPedidos = (pedidos || []).filter(p => p.userName === f.nome || p.userName === f.usuario);
          const total = fPedidos.length;
          const entregues = fPedidos.filter(p => ['Entregue', 'Finalizado', 'Pago'].includes(p.status)).length;
          const emAndamento = fPedidos.filter(p => !['Entregue', 'Finalizado', 'Pago', 'Cancelado'].includes(p.status)).length;
          let somaMin = 0, countMin = 0, totalGasto = 0;
          fPedidos.forEach(p => {
            const val = parseFloat(p.total);
            if (!isNaN(val)) totalGasto += val;
            if (p.entregueEm && p.createdAt) {
              const diff = new Date(p.entregueEm) - new Date(p.createdAt);
              if (diff > 0) { somaMin += diff / 60000; countMin++; }
            }
          });
          return {
            id: f.id, nome: f.nome, usuario: f.usuario,
            total, entregues, emAndamento,
            taxaEficiencia: total > 0 ? Math.round((entregues / total) * 100) : 0,
            tempoMedioEntrega: countMin > 0 ? Math.round(somaMin / countMin) : null,
            totalGasto: Math.round(totalGasto * 100) / 100,
            pedidosHoje: fPedidos.filter(p => p.createdAt && p.createdAt.slice(0, 10) === hojeStr).length
          };
        });
        metricas.sort((a, b) => b.total - a.total);
        res.json({ ok: true, metricas });
      });
    });
  });

  return router;
}

module.exports = { createPedidosRouter, createMetricasRouter };
