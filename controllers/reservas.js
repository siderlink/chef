/**
 * controllers/reservas.js
 * Módulo Pilar 5: Concierge Gastronômico & Hub de Reservas de Mesas Cheff.pro
 * - Agendamento de mesas autônomo e pelo salão/maitre
 * - Validação em tempo real de capacidade de salão por turno (Almoço / Jantar)
 * - Confirmação instantânea via Socket.IO e link dinâmico de WhatsApp
 */
'use strict';

module.exports = function(app, options) {
  const { db: defaultDb, io, getTenantDb } = options || {};

  function resolveDb(req) {
    if (typeof getTenantDb === 'function') {
      try {
        const tId = req && (req.tenantId || (req.headers && req.headers['x-tenant-id']));
        const tDb = getTenantDb(tId);
        if (tDb) return tDb;
      } catch (e) {}
    }
    return defaultDb;
  }

  function migrarSchema(db) {
    if (!db || !db.run) return;
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS reservas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome_cliente TEXT NOT NULL,
          telefone TEXT NOT NULL,
          email TEXT,
          num_pessoas INTEGER NOT NULL DEFAULT 2,
          data_reserva DATE NOT NULL,
          hora_reserva TEXT NOT NULL,
          turno TEXT DEFAULT 'Jantar',
          mesa_designada TEXT,
          status TEXT DEFAULT 'Pendente',
          observacoes TEXT,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      db.run(`CREATE INDEX IF NOT EXISTS idx_reservas_data ON reservas(data_reserva)`, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS reservas_config (
          id INTEGER PRIMARY KEY DEFAULT 1,
          capacidade_max_almoco INTEGER DEFAULT 60,
          capacidade_max_jantar INTEGER DEFAULT 80,
          dias_antecedencia INTEGER DEFAULT 30,
          tolerancia_minutos INTEGER DEFAULT 15,
          mensagem_whatsapp TEXT DEFAULT 'Olá {nome}, sua reserva para {pessoas} pessoas no dia {data} às {hora} foi confirmada! Esperamos por você.'
        )
      `, () => {
        db.get(`SELECT COUNT(*) as total FROM reservas_config`, (err, row) => {
          if (!err && (!row || row.total === 0)) {
            db.run(`INSERT INTO reservas_config (id) VALUES (1)`, () => {});
          }
        });
      });
    });
  }

  migrarSchema(defaultDb);

  // 1. Listar Reservas com Filtro Opcional de Data e Status
  app.get('/api/reservas', (req, res) => {
    const db = resolveDb(req);
    migrarSchema(db);

    const dataFiltro = req.query.data;
    const statusFiltro = req.query.status;

    let sql = `SELECT * FROM reservas WHERE 1=1`;
    const params = [];

    if (dataFiltro) {
      sql += ` AND data_reserva = ?`;
      params.push(dataFiltro);
    }
    if (statusFiltro && statusFiltro !== 'Todos') {
      sql += ` AND status = ?`;
      params.push(statusFiltro);
    }

    sql += ` ORDER BY data_reserva ASC, hora_reserva ASC`;

    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error('[Reservas] Erro ao listar:', err);
        return res.status(500).json({ error: 'Erro ao listar reservas' });
      }
      res.json(rows || []);
    });
  });

  // 2. Criar Nova Reserva
  app.post('/api/reservas', (req, res) => {
    const db = resolveDb(req);
    migrarSchema(db);

    const { nome_cliente, telefone, email, num_pessoas, data_reserva, hora_reserva, turno, mesa_designada, observacoes } = req.body || {};

    if (!nome_cliente || !telefone || !data_reserva || !hora_reserva) {
      return res.status(400).json({ error: 'Campos obrigatórios: Nome, WhatsApp, Data e Horário.' });
    }

    const pessoas = parseInt(num_pessoas) || 2;
    const turnoFinal = turno || (parseInt(hora_reserva.split(':')[0]) < 17 ? 'Almoço' : 'Jantar');

    const sql = `
      INSERT INTO reservas (nome_cliente, telefone, email, num_pessoas, data_reserva, hora_reserva, turno, mesa_designada, status, observacoes, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Confirmada', ?, datetime('now', 'localtime'))
    `;

    db.run(sql, [nome_cliente, telefone, email || null, pessoas, data_reserva, hora_reserva, turnoFinal, mesa_designada || null, observacoes || null], function(err) {
      if (err) {
        console.error('[Reservas] Erro ao criar:', err);
        return res.status(500).json({ error: 'Erro ao salvar reserva' });
      }

      const novaReserva = {
        id: this.lastID,
        nome_cliente,
        telefone,
        num_pessoas: pessoas,
        data_reserva,
        hora_reserva,
        turno: turnoFinal,
        mesa_designada,
        status: 'Confirmada',
        observacoes
      };

      if (io) {
        io.emit('reserva_criada', novaReserva);
      }

      res.status(201).json({
        sucesso: true,
        reserva: novaReserva,
        mensagem: 'Reserva confirmada com sucesso!'
      });
    });
  });

  // 3. Atualizar Status ou Mesa da Reserva
  app.put('/api/reservas/:id/status', (req, res) => {
    const db = resolveDb(req);
    migrarSchema(db);

    const id = parseInt(req.params.id);
    const { status, mesa_designada } = req.body || {};

    if (!id || !status) {
      return res.status(400).json({ error: 'ID e novo status são obrigatórios' });
    }

    let sql = `UPDATE reservas SET status = ?`;
    const params = [status];

    if (mesa_designada !== undefined) {
      sql += `, mesa_designada = ?`;
      params.push(mesa_designada);
    }

    sql += ` WHERE id = ?`;
    params.push(id);

    db.run(sql, params, function(err) {
      if (err) {
        return res.status(500).json({ error: 'Erro ao atualizar status da reserva' });
      }

      db.get(`SELECT * FROM reservas WHERE id = ?`, [id], (errGet, reserva) => {
        if (io && reserva) {
          io.emit('reserva_atualizada', reserva);
        }
        res.json({ sucesso: true, reserva });
      });
    });
  });

  // 4. Checar Disponibilidade e Capacidade do Salão
  app.get('/api/reservas/disponibilidade', (req, res) => {
    const db = resolveDb(req);
    migrarSchema(db);

    const data = req.query.data || new Date().toISOString().slice(0, 10);

    db.get(`SELECT * FROM reservas_config WHERE id = 1`, (errCfg, cfg) => {
      const capAlmoco = (cfg && cfg.capacidade_max_almoco) || 60;
      const capJantar = (cfg && cfg.capacidade_max_jantar) || 80;

      const sqlOcupacao = `
        SELECT 
          turno,
          COALESCE(SUM(num_pessoas), 0) as pessoas_reservadas,
          COUNT(id) as total_mesas_reservadas
        FROM reservas 
        WHERE data_reserva = ? AND status IN ('Pendente', 'Confirmada', 'Acomodada')
        GROUP BY turno
      `;

      db.all(sqlOcupacao, [data], (err, rows) => {
        const ocupacao = { 'Almoço': 0, 'Jantar': 0 };
        (rows || []).forEach(r => {
          if (r.turno && (r.turno === 'Almoço' || r.turno === 'Almoco')) ocupacao['Almoço'] = r.pessoas_reservadas;
          if (r.turno && r.turno === 'Jantar') ocupacao['Jantar'] = r.pessoas_reservadas;
        });

        res.json({
          data,
          almoco: {
            capacidade_max: capAlmoco,
            reservadas: ocupacao['Almoço'],
            vagas_restantes: Math.max(0, capAlmoco - ocupacao['Almoço']),
            lotado: ocupacao['Almoço'] >= capAlmoco
          },
          jantar: {
            capacidade_max: capJantar,
            reservadas: ocupacao['Jantar'],
            vagas_restantes: Math.max(0, capJantar - ocupacao['Jantar']),
            lotado: ocupacao['Jantar'] >= capJantar
          }
        });
      });
    });
  });

  // 5. Configurações de Reservas
  app.get('/api/reservas/config', (req, res) => {
    const db = resolveDb(req);
    migrarSchema(db);

    db.get(`SELECT * FROM reservas_config WHERE id = 1`, (err, cfg) => {
      res.json(cfg || { capacidade_max_almoco: 60, capacidade_max_jantar: 80 });
    });
  });

  app.post('/api/reservas/config', (req, res) => {
    const db = resolveDb(req);
    migrarSchema(db);

    const { capacidade_max_almoco, capacidade_max_jantar, mensagem_whatsapp } = req.body || {};

    const sql = `
      INSERT INTO reservas_config (id, capacidade_max_almoco, capacidade_max_jantar, mensagem_whatsapp)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        capacidade_max_almoco = excluded.capacidade_max_almoco,
        capacidade_max_jantar = excluded.capacidade_max_jantar,
        mensagem_whatsapp = excluded.mensagem_whatsapp
    `;

    db.run(sql, [
      parseInt(capacidade_max_almoco) || 60,
      parseInt(capacidade_max_jantar) || 80,
      mensagem_whatsapp || null
    ], function(err) {
      if (err) return res.status(500).json({ error: 'Erro ao salvar configuração de reservas' });
      res.json({ sucesso: true, mensagem: 'Configurações de reservas salvas com sucesso' });
    });
  });
};
