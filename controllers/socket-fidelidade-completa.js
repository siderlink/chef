module.exports = function(socket, io, db, helpers) {
  const { getLocalDateOnly, getLocalTimestamp, activePaymentLocks, tenantContext } = helpers || {};

  // --- FIDELIDADE COMPLETA (config, níveis, check-in QR, ofertas) ---
  const ORDEM_NIVEIS = { 'Bronze': 0, 'Prata': 1, 'Ouro': 2, 'Diamante': 3 };

  function fidelidadeNivelServer(totalGasto, cfg) {
    const prata = parseFloat(cfg.fidelidade_nivel_prata) || 500;
    const ouro = parseFloat(cfg.fidelidade_nivel_ouro) || 1500;
    const diamante = parseFloat(cfg.fidelidade_nivel_diamante) || 3500;
    if (totalGasto >= diamante) return 'Diamante';
    if (totalGasto >= ouro) return 'Ouro';
    if (totalGasto >= prata) return 'Prata';
    return 'Bronze';
  }

  socket.on('get_fidelidade_config', () => {
    db.all(`SELECT chave, valor FROM configuracoes`, (err, rows) => {
      const cfg = {};
      if (rows) rows.forEach(r => cfg[r.chave] = r.valor);
      socket.emit('fidelidade_config_atual', {
        enabled: cfg.fidelidade_enabled !== 'false',
        pontos_por_real: parseFloat(cfg.fidelidade_pontos_por_real) || 1,
        checkin_pontos: parseInt(cfg.fidelidade_checkin_pontos) || 5,
        checkin_diario: cfg.fidelidade_checkin_diario !== 'false',
        niveis: [
          { nome: 'Bronze', minimo: 0, bonus: 0 },
          { nome: 'Prata', minimo: parseInt(cfg.fidelidade_nivel_prata) || 500, bonus: parseInt(cfg.fidelidade_bonus_prata) || 10 },
          { nome: 'Ouro', minimo: parseInt(cfg.fidelidade_nivel_ouro) || 1500, bonus: parseInt(cfg.fidelidade_bonus_ouro) || 20 },
          { nome: 'Diamante', minimo: parseInt(cfg.fidelidade_nivel_diamante) || 3500, bonus: parseInt(cfg.fidelidade_bonus_diamante) || 30 }
        ]
      });
    });
  });

  socket.on('admin_atualizar_fidelidade_config', (cfg) => {
    const campos = ['fidelidade_enabled', 'fidelidade_pontos_por_real', 'fidelidade_checkin_pontos', 'fidelidade_checkin_diario', 'fidelidade_nivel_prata', 'fidelidade_nivel_ouro', 'fidelidade_nivel_diamante', 'fidelidade_bonus_prata', 'fidelidade_bonus_ouro', 'fidelidade_bonus_diamante'];
    let pendentes = campos.length;
    const finalizar = () => { pendentes--; if (pendentes <= 0) socket.emit('fidelidade_config_salvo', { success: true }); };
    campos.forEach(k => {
      if (cfg && cfg[k] !== undefined) {
        db.run(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, String(cfg[k])], finalizar);
      } else { finalizar(); }
    });
  });

  socket.on('cliente_checkin', (data) => {
    const { cliente_id, telefone } = data || {};
    const whereClause = isValidId(cliente_id) ? 'id = ?' : 'telefone = ?';
    const param = isValidId(cliente_id) ? cliente_id : String(telefone || '').replace(/\D/g, '');
    db.get(`SELECT * FROM clientes WHERE ${whereClause}`, [param], (err, cliente) => {
      if (!cliente) return socket.emit('checkin_response', { error: 'Cliente não encontrado. Cadastre-se no caixa.' });
      db.all(`SELECT chave, valor FROM configuracoes`, (eCfg, cfgRows) => {
        const cfg = {};
        if (cfgRows) cfgRows.forEach(r => cfg[r.chave] = r.valor);
        if (cfg.fidelidade_enabled === 'false') return socket.emit('checkin_response', { error: 'Programa de fidelidade desativado.' });
        const pontos = Math.max(1, parseInt(cfg.fidelidade_checkin_pontos) || 5);
        const diario = cfg.fidelidade_checkin_diario !== 'false';
        const agora = new Date();
        const hoje = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0') + '-' + String(agora.getDate()).padStart(2, '0');
        if (diario && cliente.ultimo_checkin === hoje) {
          return socket.emit('checkin_response', { success: false, error: 'Você já fez check-in hoje. Volte amanhã!' });
        }
        db.run(`UPDATE clientes SET pontos = pontos + ?, ultimo_checkin = ? WHERE id = ?`, [pontos, hoje, cliente.id], (err2) => {
          if (err2) return socket.emit('checkin_response', { error: 'Erro ao registrar check-in.' });
          db.run(`INSERT INTO checkins_fidelidade (cliente_id, pontos, data) VALUES (?, ?, datetime('now', 'localtime'))`, [cliente.id, pontos], () => {
            socket.emit('checkin_response', { success: true, pontos, novoSaldo: (parseInt(cliente.pontos) || 0) + pontos });
            db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_atualizados', r || []));
          });
        });
      });
    });
  });

  socket.on('get_cliente_checkins', (cliente_id) => {
    if (!isValidId(cliente_id)) return socket.emit('cliente_checkins_lista', []);
    db.all(`SELECT * FROM checkins_fidelidade WHERE cliente_id = ? ORDER BY id DESC LIMIT 30`, [cliente_id], (err, rows) => {
      socket.emit('cliente_checkins_lista', rows || []);
    });
  });

  socket.on('get_ofertas_fidelidade', (cliente_id) => {
    db.get(`SELECT nivel, total_gasto FROM clientes WHERE id = ?`, [cliente_id], (err, cliente) => {
      const nivel = (cliente && cliente.nivel) || 'Bronze';
      const idx = ORDEM_NIVEIS[nivel] !== undefined ? ORDEM_NIVEIS[nivel] : 0;
      db.all(`SELECT * FROM ofertas_fidelidade WHERE ativo = 1 ORDER BY id DESC`, [], (err, rows) => {
        const permitidos = (rows || []).filter(o => (ORDEM_NIVEIS[o.nivel] !== undefined ? ORDEM_NIVEIS[o.nivel] : 0) <= idx);
        socket.emit('ofertas_fidelidade_lista', permitidos);
      });
    });
  });

  socket.on('admin_get_ofertas_fidelidade', () => {
    db.all(`SELECT * FROM ofertas_fidelidade ORDER BY id DESC`, (err, rows) => socket.emit('admin_ofertas_fidelidade_lista', rows || []));
  });
  socket.on('add_oferta_fidelidade', (o) => {
    db.run(`INSERT INTO ofertas_fidelidade (titulo, descricao, nivel, ativo) VALUES (?, ?, ?, ?)`, [o.titulo, o.descricao, o.nivel || 'Bronze', o.ativo ? 1 : 0], () => {
      db.all(`SELECT * FROM ofertas_fidelidade ORDER BY id DESC`, (err, rows) => io.emit('admin_ofertas_fidelidade_lista', rows || []));
    });
  });
  socket.on('edit_oferta_fidelidade', (o) => {
    db.run(`UPDATE ofertas_fidelidade SET titulo=?, descricao=?, nivel=?, ativo=? WHERE id=?`, [o.titulo, o.descricao, o.nivel || 'Bronze', o.ativo ? 1 : 0, o.id], () => {
      db.all(`SELECT * FROM ofertas_fidelidade ORDER BY id DESC`, (err, rows) => io.emit('admin_ofertas_fidelidade_lista', rows || []));
    });
  });
  socket.on('delete_oferta_fidelidade', (id) => {
    if (!exigirAdminSocket(socket)) return;
    if (!isValidId(id)) return;
    db.run(`DELETE FROM ofertas_fidelidade WHERE id=?`, [id], () => {
      db.all(`SELECT * FROM ofertas_fidelidade ORDER BY id DESC`, (err, rows) => io.emit('admin_ofertas_fidelidade_lista', rows || []));
    });
  });

};
