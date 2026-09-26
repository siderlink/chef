/**
 * plugins/fila-espera/index.js
 * Backend do Módulo de Fila de Espera Digital com QR Code no Salão
 */
'use strict';

module.exports = function ({ app, db, masterDb, io, options, log }) {
  const logger = typeof log === 'function' ? log : console.log;
  logger('[Fila de Espera] Inicializando plugin de Fila de Espera Digital...');

  function getTargetDb(req) {
    if (options && typeof options.getTenantDb === 'function') {
      const tId = req && (req.tenantId || (req.headers && req.headers['x-tenant-id']));
      const tDb = options.getTenantDb(tId);
      if (tDb) return tDb;
    }
    return db;
  }

  // 1. Garantir tabela no banco SQLite
  if (db && typeof db.run === 'function') {
    db.run(`
      CREATE TABLE IF NOT EXISTS fila_espera (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_nome TEXT NOT NULL,
        cliente_telefone TEXT,
        pessoas INTEGER DEFAULT 2,
        mesa_preferida TEXT,
        observacao TEXT,
        status TEXT DEFAULT 'Aguardando',
        mesa_ofertada TEXT,
        pre_pedidos TEXT,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
        notificado_em DATETIME,
        atendido_em DATETIME
      )
    `, (err) => {
      if (err) logger('[Fila de Espera] Erro ao criar tabela: ' + err.message);
      else {
        db.run(`ALTER TABLE fila_espera ADD COLUMN mesa_ofertada TEXT`, () => {});
        db.run(`ALTER TABLE fila_espera ADD COLUMN pre_pedidos TEXT`, () => {});
      }
    });
  }

  function broadcastFila(targetDb = db) {
    if (!targetDb || !targetDb.all) return;
    targetDb.all(
      `SELECT * FROM fila_espera WHERE status NOT IN ('Atendido', 'Cancelado') ORDER BY id ASC`,
      [],
      (err, rows) => {
        if (!err && io) {
          io.emit('fila_espera_atualizada', rows || []);
        }
      }
    );
  }

  // 2. Endpoints REST
  if (app) {
    // Listar clientes aguardando na fila
    app.get('/api/fila-espera', (req, res) => {
      const activeDb = getTargetDb(req);
      activeDb.all(
        `SELECT * FROM fila_espera WHERE status NOT IN ('Atendido', 'Cancelado') ORDER BY id ASC`,
        [],
        (err, rows) => {
          if (err) return res.status(500).json({ ok: false, erro: err.message });
          res.json({ ok: true, fila: rows || [] });
        }
      );
    });

    // Adicionar cliente na fila (via recepção ou QR Code do salão)
    app.post('/api/fila-espera', (req, res) => {
      const activeDb = getTargetDb(req);
      const { cliente_nome, cliente_telefone, pessoas, mesa_preferida, observacao } = req.body || {};
      if (!cliente_nome || !cliente_nome.trim()) {
        return res.status(400).json({ ok: false, erro: 'Nome do cliente é obrigatório.' });
      }

      activeDb.run(
        `INSERT INTO fila_espera (cliente_nome, cliente_telefone, pessoas, mesa_preferida, observacao, status)
         VALUES (?, ?, ?, ?, ?, 'Aguardando')`,
        [cliente_nome.trim(), (cliente_telefone || '').trim(), parseInt(pessoas, 10) || 2, (mesa_preferida || '').trim(), (observacao || '').trim()],
        function (err) {
          if (err) return res.status(500).json({ ok: false, erro: err.message });
          const id = this.lastID;
          broadcastFila(activeDb);
          res.json({ ok: true, id, mensagem: 'Cliente inserido na fila de espera com sucesso!' });
        }
      );
    });

    // Posição na fila e status (consultado pelo celular do cliente via QR Code na calçada)
    app.get('/api/fila-espera/posicao/:id', (req, res) => {
      const activeDb = getTargetDb(req);
      const id = parseInt(req.params.id, 10);
      activeDb.all(
        `SELECT id, cliente_nome, pessoas, status, mesa_ofertada, pre_pedidos, criado_em
         FROM fila_espera WHERE status NOT IN ('Atendido', 'Cancelado') ORDER BY id ASC`,
        [],
        (err, rows) => {
          if (err) return res.status(500).json({ ok: false, erro: err.message });
          const fila = rows || [];
          const idx = fila.findIndex(c => c.id === id);
          if (idx === -1) {
            return res.json({ ok: true, ativo: false, mensagem: 'Você não está mais na fila de espera ou já foi atendido!' });
          }
          const item = fila[idx];
          res.json({
            ok: true,
            ativo: true,
            posicao: idx + 1,
            totalFila: fila.length,
            tempoEstimadoMinutos: (idx + 1) * 8,
            cliente: item
          });
        }
      );
    });

    // Pré-pedido de bebidas/entradas enquanto aguarda
    app.post('/api/fila-espera/pre-pedido', (req, res) => {
      const activeDb = getTargetDb(req);
      const { id, itens } = req.body || {};
      if (!id || !Array.isArray(itens)) {
        return res.status(400).json({ ok: false, erro: 'ID da fila e itens de pré-pedido obrigatórios.' });
      }

      activeDb.run(
        `UPDATE fila_espera SET pre_pedidos = ? WHERE id = ?`,
        [JSON.stringify(itens), id],
        (err) => {
          if (err) return res.status(500).json({ ok: false, erro: err.message });
          broadcastFila(activeDb);
          res.json({ ok: true, mensagem: 'Pré-pedido registrado! Será preparado assim que sua mesa for liberada.' });
        }
      );
    });

    // Atualizar status (Notificado, Mesa Ofertada, etc.)
    app.put('/api/fila-espera/:id/status', (req, res) => {
      const activeDb = getTargetDb(req);
      const id = parseInt(req.params.id, 10);
      const { status, mesa_ofertada } = req.body || {};
      activeDb.run(
        `UPDATE fila_espera SET status = ?, mesa_ofertada = ?, notificado_em = datetime('now', 'localtime') WHERE id = ?`,
        [status || 'Notificado', mesa_ofertada || null, id],
        (err) => {
          if (err) return res.status(500).json({ ok: false, erro: err.message });
          broadcastFila(activeDb);
          res.json({ ok: true });
        }
      );
    });

    // Remover da fila
    app.delete('/api/fila-espera/:id', (req, res) => {
      const activeDb = getTargetDb(req);
      const id = parseInt(req.params.id, 10);
      activeDb.run(`UPDATE fila_espera SET status = 'Cancelado' WHERE id = ?`, [id], (err) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        broadcastFila(activeDb);
        res.json({ ok: true });
      });
    });
  }

  // 3. Handlers Socket.IO Real-Time
  if (io) {
    io.on('connection', (socket) => {
      socket.on('get_fila_espera', () => {
        if (!db || !db.all) return;
        db.all(`SELECT * FROM fila_espera WHERE status NOT IN ('Atendido', 'Cancelado') ORDER BY id ASC`, [], (err, rows) => {
          if (!err) socket.emit('fila_espera_atualizada', rows || []);
        });
      });

      socket.on('adicionar_fila_espera', (dados) => {
        if (!db || !dados || !dados.cliente_nome) return;
        db.run(
          `INSERT INTO fila_espera (cliente_nome, cliente_telefone, pessoas, mesa_preferida, observacao, status)
           VALUES (?, ?, ?, ?, ?, 'Aguardando')`,
          [dados.cliente_nome.trim(), (dados.cliente_telefone || '').trim(), parseInt(dados.pessoas, 10) || 2, (dados.mesa_preferida || '').trim(), (dados.observacao || '').trim()],
          () => broadcastFila(db)
        );
      });

      socket.on('remover_fila_espera', (id) => {
        if (!db || !id) return;
        db.run(`UPDATE fila_espera SET status = 'Cancelado' WHERE id = ?`, [id], () => broadcastFila(db));
      });

      socket.on('atualizar_status_fila_espera', ({ id, status, mesa_ofertada }) => {
        if (!db || !id) return;
        db.run(`UPDATE fila_espera SET status = ?, mesa_ofertada = ? WHERE id = ?`, [status || 'Notificado', mesa_ofertada || null, id], () => broadcastFila(db));
      });

      socket.on('acomodar_cliente_fila', ({ id, mesaName }) => {
        if (!db || !id) return;
        db.get(`SELECT * FROM fila_espera WHERE id = ?`, [id], (err, cliente) => {
          if (!err && cliente) {
            db.run(`UPDATE fila_espera SET status = 'Atendido', atendido_em = datetime('now', 'localtime'), mesa_ofertada = ? WHERE id = ?`, [mesaName, id], () => {
              // Se tiver pré-pedidos, lança automaticamente na comanda da mesa
              if (cliente.pre_pedidos) {
                try {
                  const itens = JSON.parse(cliente.pre_pedidos);
                  if (Array.isArray(itens) && itens.length > 0) {
                    itens.forEach(it => {
                      db.run(
                        `INSERT INTO pedidos (localName, productName, productEmoji, quantity, total, userName, status, sector, time)
                         VALUES (?, ?, ?, ?, ?, ?, 'Em espera', ?, time('now', 'localtime'))`,
                        [mesaName, it.nome || it.productName, it.emoji || '🍽️', it.quantity || 1, Number(it.total || it.preco || 0).toFixed(2), cliente.cliente_nome, it.sector || 'Cozinha 1']
                      );
                    });
                    db.all(`SELECT * FROM pedidos WHERE status != 'Finalizado'`, (e, r) => {
                      if (!e) io.emit('pedidos_atualizados', r || []);
                    });
                  }
                } catch (eJson) {}
              }
              db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ?`, [mesaName], () => {
                db.all(`SELECT * FROM mesas`, (errM, rowsM) => {
                  if (!errM) io.emit('mesas_atualizadas', rowsM || []);
                });
              });
              broadcastFila(db);
            });
          }
        });
      });
    });
  }

  logger('[Fila de Espera] Módulo pronto e operacional.');
};
