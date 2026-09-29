/**
 * Plugin: reserves
 * Sistema de reservas futuras de mesas
 */
module.exports = function({ app, db, io, options, log }) {
  const { verificarToken } = options;

  // Migrações e schema de reservas
  try {
    db.run(`CREATE TABLE IF NOT EXISTS reservas_futuras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mesa_nome TEXT,
      cliente_nome TEXT,
      cliente_telefone TEXT,
      cliente_id INTEGER,
      data_reserva TEXT,
      horario TEXT,
      pessoas INTEGER DEFAULT 2,
      observacao TEXT,
      status TEXT DEFAULT 'pendente_aprovacao',
      origem TEXT DEFAULT 'cliente',
      motivo_pendente TEXT,
      validada_qr INTEGER DEFAULT 0,
      checked_in_at DATETIME,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
    )`, () => {});

    db.all(`PRAGMA table_info(mesas)`, [], (errPragma, cols) => {
      if (!errPragma && Array.isArray(cols)) {
        if (!cols.some(c => c.name === 'lugares')) {
          db.run(`ALTER TABLE mesas ADD COLUMN lugares INTEGER DEFAULT 4`, () => {});
        }
        if (!cols.some(c => c.name === 'grupo_juncao')) {
          db.run(`ALTER TABLE mesas ADD COLUMN grupo_juncao TEXT`, () => {});
        }
      }
    });
  } catch (e) {
    if (typeof log === 'function') log('Erro na migracao de reservas: ' + e.message);
  }

  function getReservasPrazoMaxDias(cb) {
    db.get(`SELECT valor FROM configuracoes WHERE chave = 'reservas_prazo_max_dias'`, [], (err, row) => {
      const dias = parseInt((row && row.valor), 10);
      cb(!err && dias > 0 ? dias : 30);
    });
  }

  function hojeLocal() {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  // ── HTTP Routes ──
  log('Registering routes...');

  app.get('/api/reservas/config', (req, res) => {
    getReservasPrazoMaxDias((dias) => res.json({ ok: true, prazo_max_dias: dias }));
  });

  app.post('/api/reservas/config', verificarToken, (req, res) => {
    if (!['admin', 'gerente'].includes(req.usuario?.cargo || '')) return res.status(403).json({ ok: false, erro: 'Apenas administradores.' });
    const dias = Math.min(365, Math.max(0, parseInt((req.body || {}).prazo_max_dias, 10)));
    if (isNaN(dias)) return res.json({ ok: false, erro: 'Informe o prazo em dias.' });
    db.run(`INSERT INTO configuracoes (chave, valor) VALUES ('reservas_prazo_max_dias', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [String(dias)], (err) => {
      if (err) return res.json({ ok: false, erro: err.message });
      res.json({ ok: true, prazo_max_dias: dias, mensagem: `Prazo salvo! Reservas até ${dias === 0 ? 'HOJE' : dias + ' dia(s) à frente'} são confirmadas na hora.` });
    });
  });

  app.get('/api/reservas/disponibilidade', (req, res) => {
    const data = String((req.query.data || '')).match(/^\d{4}-\d{2}-\d{2}$/) ? req.query.data : '';
    if (!data) return res.json({ ok: false, erro: 'Data inválida.' });
    db.all(`SELECT nome, status FROM mesas ORDER BY id`, [], (eM, mesas) => {
      if (eM) return res.json({ ok: false, erro: eM.message });
      db.all(`SELECT mesa_nome, horario, status FROM reservas_futuras WHERE data_reserva = ? AND status IN ('confirmada','pendente_aprovacao','checkin')`, [data], (eR, reservas) => {
        if (eR) return res.json({ ok: false, erro: eR.message });
        res.json({ ok: true, data, mesas: (mesas || []).map(m => ({ nome: m.nome, ocupada_hoje: !['Disponível', 'Disponivel', 'Livre', ''].includes(String(m.status || '').toLowerCase()) && m.status !== 'Reservada' })), reservas_do_dia: (reservas || []).map(r => ({ mesa: r.mesa_nome, horario: r.horario, status: r.status })) });
      });
    });
  });

  app.post('/api/reservas', (req, res) => {
    const b = req.body || {};
    const mesaNome = String(b.mesa_nome || '').trim().slice(0, 60);
    const nome = String(b.nome || '').trim().slice(0, 80);
    const telefone = String(b.telefone || '').replace(/\D/g, '').slice(0, 15);
    const data = String(b.data || '');
    const horario = (/^\d{2}:\d{2}$/.test(String(b.horario || '')) ? b.horario : '19:00');
    const pessoas = Math.min(50, Math.max(1, parseInt(b.pessoas, 10) || 2));
    const observacao = String(b.observacao || '').trim().slice(0, 400);

    if (!mesaNome || !nome || !telefone) return res.json({ ok: false, erro: 'Informe mesa, seu nome e telefone.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.json({ ok: false, erro: 'Escolha a data da reserva.' });

    const hojeStr = hojeLocal();
    if (data < hojeStr) return res.json({ ok: false, erro: 'Não é possível reservar para datas passadas.' });

    getReservasPrazoMaxDias((prazoMax) => {
      const diffDias = Math.round((new Date(data + 'T12:00:00') - new Date(hojeStr + 'T12:00:00')) / 86400000);
      const dentroDoPrazo = diffDias <= prazoMax;

      db.get(`SELECT nome FROM mesas WHERE nome = ?`, [mesaNome], (eMesa, mesaRow) => {
        if (eMesa || !mesaRow) return res.json({ ok: false, erro: 'Mesa não encontrada.' });

        const finalizar = (status, motivoPendente) => {
          db.get(`SELECT id FROM reservas_futuras WHERE mesa_nome = ? AND data_reserva = ? AND status IN ('confirmada','checkin')`, [mesaNome, data], (eConf, conflito) => {
            if (eConf) return res.json({ ok: false, erro: eConf.message });
            if (conflito && status === 'confirmada') return res.json({ ok: false, erro: `A ${mesaNome} já está reservada neste dia.`, conflito: true });

            /* Cadastra/associa cliente automaticamente */
            const criarReserva = (clienteId) => {
              db.run(`INSERT INTO reservas_futuras (mesa_nome, cliente_nome, cliente_telefone, cliente_id, data_reserva, horario, pessoas, observacao, status, origem, motivo_pendente) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'cliente', ?)`,
                [mesaNome, nome, telefone, clienteId || null, data, horario, pessoas, observacao, status, motivoPendente || ''],
                function (eIns) {
                  if (eIns) return res.json({ ok: false, erro: 'Falha ao registrar.' });
                  try { io.emit('reservas_atualizadas'); if (status === 'pendente_aprovacao') io.emit('reserva_aguardando_aprovacao', { id: this.lastID, mesa: mesaNome, cliente: nome, data, horario, pessoas }); } catch (e) { }
                  res.json({ ok: true, id: this.lastID, status, mensagem: status === 'confirmada' ? `Reserva confirmada! ${mesaNome} separada para ${data.split('-').reverse().join('/')} às ${horario}.` : `Pedido recebido! Fora do prazo automático (${prazoMax} dias), aguardando aprovação.` });
                });
            };

            if (telefone) {
              db.get(`SELECT id FROM clientes WHERE telefone = ?`, [telefone], (eCli, cli) => {
                if (!eCli && cli) return criarReserva(cli.id);
                db.run(`INSERT INTO clientes (nome, telefone) VALUES (?, ?)`, [nome, telefone], function (eNew) {
                  criarReserva(eNew ? null : this.lastID);
                });
              });
            } else {
              criarReserva(null);
            }
          });
        };

        dentroDoPrazo ? finalizar('confirmada') : finalizar('pendente_aprovacao', `Fora do prazo (${diffDias} > ${prazoMax})`);
      });
    });
  });

  app.get('/api/reservas', verificarToken, (req, res) => {
    const de = String(req.query.de || '').match(/^\d{4}-\d{2}-\d{2}$/) ? req.query.de : null;
    const ate = String(req.query.ate || '').match(/^\d{4}-\d{2}-\d{2}$/) ? req.query.ate : null;
    let sql = `SELECT * FROM reservas_futuras`;
    const conds = [], params = [];
    if (de) { conds.push('data_reserva >= ?'); params.push(de); }
    if (ate) { conds.push('data_reserva <= ?'); params.push(ate); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY data_reserva ASC, horario ASC LIMIT 500';
    db.all(sql, params, (err, rows) => { err ? res.json({ ok: false, erro: err.message }) : res.json({ ok: true, reservas: rows || [] }); });
  });

  app.get('/api/reservas/pendentes', verificarToken, (req, res) => {
    db.all(`SELECT * FROM reservas_futuras WHERE status = 'pendente_aprovacao' ORDER BY criada_em DESC LIMIT 100`, [], (err, rows) => { err ? res.json({ ok: false, erro: err.message }) : res.json({ ok: true, pendentes: rows || [] }); });
  });

  app.post('/api/reservas/:id/aprovar', verificarToken, (req, res) => {
    if (!['admin', 'gerente'].includes(req.usuario?.cargo || '')) return res.status(403).json({ ok: false, erro: 'Apenas administradores.' });
    db.run(`UPDATE reservas_futuras SET status = 'confirmada', motivo_pendente = '' WHERE id = ? AND status = 'pendente_aprovacao'`, [parseInt(req.params.id)], function (err) {
      if (err) return res.json({ ok: false, erro: err.message });
      if (!this.changes) return res.json({ ok: false, erro: 'Não encontrada.' });
      try { io.emit('reservas_atualizadas'); } catch (e) { }
      res.json({ ok: true, mensagem: 'Aprovada!' });
    });
  });

  app.post('/api/reservas/:id/recusar', verificarToken, (req, res) => {
    if (!['admin', 'gerente'].includes(req.usuario?.cargo || '')) return res.status(403).json({ ok: false, erro: 'Apenas administradores.' });
    const motivo = String((req.body || {}).motivo || '').trim().slice(0, 300);
    db.run(`UPDATE reservas_futuras SET status = 'cancelada', motivo_pendente = ? WHERE id = ? AND status IN ('pendente_aprovacao','confirmada')`,
      [motivo ? 'Recusada: ' + motivo : 'Recusada', parseInt(req.params.id)], function (err) {
        if (err) return res.json({ ok: false, erro: err.message });
        if (!this.changes) return res.json({ ok: false, erro: 'Não encontrada.' });
        try { io.emit('reservas_atualizadas'); } catch (e) { }
        res.json({ ok: true, mensagem: 'Recusada.' });
      });
  });

  app.delete('/api/reservas/:id', verificarToken, (req, res) => {
    const id = parseInt(req.params.id, 10);
    db.run(`DELETE FROM reservas_futuras WHERE id = ?`, [id], function (err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      try { io.emit('reservas_atualizadas'); } catch (e) {}
      res.json({ ok: true, mensagem: 'Reserva excluída com sucesso.' });
    });
  });

  app.post('/api/reservas/checkin', (req, res) => {
    const telefone = String((req.body || {}).telefone || '').replace(/\D/g, '');
    const id = parseInt((req.body || {}).id, 10);
    if (!telefone && !id) return res.json({ ok: false, erro: 'Informe telefone.' });
    const hojeStr = hojeLocal();
    const sql = id ? `SELECT * FROM reservas_futuras WHERE id = ?` : `SELECT * FROM reservas_futuras WHERE cliente_telefone = ? AND status IN ('confirmada') ORDER BY data_reserva ASC LIMIT 1`;
    db.get(sql, id ? [id] : [telefone], (err, reserva) => {
      if (err) return res.json({ ok: false, erro: err.message });
      if (!reserva) return res.json({ ok: false, erro: 'Nenhuma reserva encontrada.' });
      if (reserva.data_reserva !== hojeStr) return res.json({ ok: false, erro: `Reserva é para ${reserva.data_reserva.split('-').reverse().join('/')}.` });
      db.run(`UPDATE reservas_futuras SET status = 'checkin', checked_in_at = datetime('now', 'localtime') WHERE id = ?`, [reserva.id], (eUp) => {
        if (eUp) return res.json({ ok: false, erro: eUp.message });
        db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ? AND status IN ('Disponível','Disponivel','Reservada')`, [reserva.mesa_nome], () => {
          try { io.emit('reservas_atualizadas'); io.emit('reserva_checkin', { id: reserva.id, mesa: reserva.mesa_nome, cliente: reserva.cliente_nome, pessoas: reserva.pessoas }); } catch (e) { }
          res.json({ ok: true, mensagem: `Bem-vindo(a), ${reserva.cliente_nome}! Sua ${reserva.mesa_nome} está pronta. 🎉` });
        });
      });
    });
  });

  app.get('/api/reservas/minhas', (req, res) => {
    const telefone = String(req.query.telefone || '').replace(/\D/g, '');
    if (!telefone) return res.json({ ok: false, erro: 'Informe telefone.' });
    db.all(`SELECT id, mesa_nome, data_reserva, horario, pessoas, status FROM reservas_futuras WHERE cliente_telefone = ? ORDER BY data_reserva DESC LIMIT 20`, [telefone], (err, rows) => { err ? res.json({ ok: false, erro: err.message }) : res.json({ ok: true, reservas: rows || [] }); });
  });

  app.get('/api/reservas/qr-contexto', (req, res) => {
    const mesa = String(req.query.mesa || '').trim();
    if (!mesa) return res.json({ ok: false, erro: 'Mesa não informada.' });
    const hoje = hojeLocal();
    db.get(`SELECT * FROM reservas_futuras WHERE mesa_nome = ? AND data_reserva = ? AND status = 'confirmada' ORDER BY horario ASC LIMIT 1`, [mesa, hoje], (err, r) => {
      if (err) return res.json({ ok: false, erro: err.message });
      db.get(`SELECT nome, status, lugares FROM mesas WHERE nome = ?`, [mesa], (eM, mesaRow) => {
        res.json({ ok: true, hoje, mesa: mesaRow ? { nome: mesaRow.nome, status: mesaRow.status, lugares: mesaRow.lugares } : null, reserva: r ? { id: r.id, cliente_nome: r.cliente_nome, pessoas: r.pessoas, horario: r.horario, observacao: r.observacao || '', telefone_ult8: String(r.cliente_telefone || '').replace(/\D/g, '').slice(-8), validada_qr: !!r.validada_qr } : null });
      });
    });
  });

  app.post('/api/reservas/qr-validar', (req, res) => {
    const b = req.body || {};
    const id = parseInt(b.reserva_id, 10);
    const digitos = String(b.digitos || '').replace(/\D/g, '').slice(-8);
    if (!id || digitos.length < 4) return res.json({ ok: false, erro: 'Informe os dígitos.' });
    db.get(`SELECT * FROM reservas_futuras WHERE id = ?`, [id], (err, r) => {
      if (err || !r) return res.json({ ok: false, erro: 'Não encontrada.' });
      const esperado = String(r.cliente_telefone || '').replace(/\D/g, '').slice(-8);
      if (digitos !== esperado) return res.json({ ok: false, erro: 'Não bateu.' });
      db.run(`UPDATE reservas_futuras SET validada_qr = 1, status = 'checkin', checked_in_at = datetime('now','localtime') WHERE id = ?`, [id], (eUp) => {
        if (eUp) return res.json({ ok: false, erro: eUp.message });
        db.run(`UPDATE mesas SET status = 'Ocupada' WHERE nome = ? AND status IN ('Disponível','Disponivel','Reservada')`, [r.mesa_nome], () => {});
        if (b.cliente_id) {
          db.get(`SELECT visitas_mesa FROM clientes WHERE id = ?`, [b.cliente_id], (eC, c) => {
            let vm = {}; try { vm = JSON.parse((c && c.visitas_mesa) || '{}') || {}; } catch (e) { vm = {}; }
            vm[r.mesa_nome] = (vm[r.mesa_nome] || 0) + 1;
            db.run(`UPDATE clientes SET visitas_mesa = ? WHERE id = ?`, [JSON.stringify(vm), b.cliente_id], () => {});
          });
        }
        try { io.emit('reservas_atualizadas'); io.emit('reserva_checkin', { id: r.id, mesa: r.mesa_nome, cliente: r.cliente_nome, pessoas: r.pessoas }); } catch (e) { }
        res.json({ ok: true, mensagem: `Perfeito, ${r.cliente_nome}! 🎉`, mesa: r.mesa_nome });
      });
    });
  });

  app.get('/api/reservas/mesas-livres', (req, res) => {
    db.all(`SELECT m.nome, m.lugares FROM mesas m WHERE (m.status LIKE 'Dispon%ivel%') AND LOWER(m.nome) NOT LIKE '%comanda%' AND m.grupo_juncao IS NULL ORDER BY m.lugares DESC, m.nome ASC LIMIT 30`, [], (err, rows) => { err ? res.json({ ok: false, erro: err.message }) : res.json({ ok: true, mesas: rows || [] }); });
  });

  // ── Socket Handlers ──
  io.on('connection', (socket) => {
    socket.on('sugerir_juncao', ({ pessoas, reserva_id } = {}, ack) => {
      if (typeof ack !== 'function') return;
      db.all(`SELECT * FROM mesas WHERE status LIKE 'Dispon%ivel%' OR status = 'Disponível' OR status = 'Disponivel'`, [], (e, todas) => {
        if (e) return ack({ ok: false, sugestoes: [] });
        const livres = (todas || []).filter(m => !m.grupo_juncao && !String(m.nome || '').toLowerCase().includes('comanda'));
        ack({ ok: true, sugestoes: livres.slice(0, 10).map(m => ({ mesas: [m.nome], lugares: m.lugares, reserva_id: reserva_id || null, rotulo: m.nome })) });
      });
    });

    socket.on('reservar_mesa', ({ mesaName, observacao, cliente, telefone }) => {
      db.run(`UPDATE mesas SET status = 'Reservada', observacao = ? WHERE nome = ?`, [observacao, mesaName], () => {
        db.all(`SELECT * FROM mesas`, (err, rows) => io.emit('mesas_atualizadas', rows || []));
      });
    });

    socket.on('cancelar_reserva', ({ mesaName }) => {
      db.run(`UPDATE mesas SET status = 'Disponível', observacao = '' WHERE nome = ?`, [mesaName], () => {
        db.all(`SELECT * FROM mesas`, (err, rows) => io.emit('mesas_atualizadas', rows || []));
      });
    });
  });

  log('Routes + sockets registered.');
};
