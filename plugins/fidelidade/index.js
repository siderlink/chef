/**
 * Plugin: fidelidade
 * Programa de fidelidade completo — pontos, check-in, benefícios, ofertas, parceiros, avaliações
 */
module.exports = function({ app, db, io, options, log }) {
  const { withTenant, verificarToken, isValidId, exigirAdminSocket, resumirUserAgent } = options;

  const ORDEM_NIVEIS = { 'Bronze': 0, 'Prata': 1, 'Ouro': 2, 'Diamante': 3 };

  // Migrações e schema de fidelidade & avaliações
  try {
    db.run(`CREATE TABLE IF NOT EXISTS parceiros_fidelidade (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      categoria TEXT,
      telefone TEXT,
      endereco TEXT,
      bairro TEXT,
      cidade TEXT,
      latitude REAL,
      longitude REAL,
      pontos_minimos INTEGER DEFAULT 0,
      descricao TEXT,
      logo_url TEXT,
      ativo INTEGER DEFAULT 1,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
    )`, () => {});

    db.run(`CREATE TABLE IF NOT EXISTS avaliacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_nome TEXT,
      mesa TEXT,
      nota INTEGER NOT NULL,
      comentario TEXT,
      origem TEXT DEFAULT 'interno',
      criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
    )`, () => {});
    db.run(`ALTER TABLE beneficios ADD COLUMN categoria TEXT`, () => {});
    db.run(`ALTER TABLE beneficios ADD COLUMN descricao TEXT`, () => {});
  } catch (e) {
    if (typeof log === 'function') log('Erro ao inicializar tabelas de fidelidade: ' + e.message);
  }

  // ── HTTP Routes ──
  log('Registering routes...');

  app.get('/api/fidelidade/parceiros', (req, res) => {
    withTenant(req, () => {
      db.all(`SELECT * FROM parceiros_fidelidade ORDER BY ativo DESC, nome ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar parceiros.' });
        res.json({ parceiros: rows || [] });
      });
    });
  });

  app.post('/api/fidelidade/parceiros', verificarToken, (req, res) => {
    withTenant(req, () => {
      const b = req.body || {};
      const nome = String(b.nome || '').trim().slice(0, 120);
      if (!nome) return res.status(400).json({ success: false, error: 'Nome do parceiro é obrigatório.' });
      const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; };
      const dados = [
        nome,
        String(b.categoria || '').trim().slice(0, 60),
        String(b.telefone || '').trim().slice(0, 30),
        String(b.endereco || '').trim().slice(0, 200),
        String(b.bairro || '').trim().slice(0, 80),
        String(b.cidade || '').trim().slice(0, 80),
        num(b.latitude), num(b.longitude),
        parseInt(b.pontos_minimos, 10) || 0,
        String(b.descricao || '').trim().slice(0, 400),
        String(b.logo_url || '').trim().slice(0, 300),
        b.ativo === false ? 0 : 1
      ];
      if (b.id) {
        db.run(`UPDATE parceiros_fidelidade SET nome=?, categoria=?, telefone=?, endereco=?, bairro=?, cidade=?,
          latitude=?, longitude=?, pontos_minimos=?, descricao=?, logo_url=?, ativo=? WHERE id=?`,
          [...dados, parseInt(b.id, 10)], (err) => {
            if (err) return res.status(500).json({ success: false, error: 'Erro ao salvar parceiro.' });
            res.json({ success: true });
          });
      } else {
        db.run(`INSERT INTO parceiros_fidelidade (nome, categoria, telefone, endereco, bairro, cidade,
          latitude, longitude, pontos_minimos, descricao, logo_url, ativo)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, dados, (err) => {
          if (err) return res.status(500).json({ success: false, error: 'Erro ao cadastrar parceiro.' });
          res.json({ success: true });
        });
      }
    });
  });

  app.delete('/api/fidelidade/parceiros/:id', verificarToken, (req, res) => {
    withTenant(req, () => {
      db.run(`DELETE FROM parceiros_fidelidade WHERE id = ?`, [parseInt(req.params.id, 10)], (err) => {
        if (err) return res.status(500).json({ success: false, error: 'Erro ao excluir.' });
        res.json({ success: true });
      });
    });
  });

  app.get('/api/avaliacoes', verificarToken, (req, res) => {
    withTenant(req, () => {
      db.all(`SELECT * FROM avaliacoes ORDER BY id DESC LIMIT 200`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar avaliações.' });
        const lista = rows || [];
        const media = lista.length ? Math.round((lista.reduce((s, a) => s + (a.nota || 0), 0) / lista.length) * 10) / 10 : 0;
        db.all(`SELECT chave, valor FROM configuracoes WHERE chave LIKE 'avaliacao_%'`, [], (e2, cfgRows) => {
          const cfg = {};
          (cfgRows || []).forEach(r => { cfg[r.chave] = r.valor; });
          res.json({
            avaliacoes: lista,
            media,
            total: lista.length,
            google_sync_enabled: cfg.avaliacao_google_sync === 'true',
            google_place_id: cfg.avaliacao_google_place_id || ''
          });
        });
      });
    });
  });

  app.post('/api/avaliacoes', (req, res) => {
    withTenant(req, () => {
      const b = req.body || {};
      const nota = parseInt(b.nota, 10);
      if (!(nota >= 1 && nota <= 5)) return res.status(400).json({ error: 'Nota deve ser de 1 a 5.' });
      const tid = options.tenantContext ? options.tenantContext.getStore() || 1 : 1;
      db.run(`INSERT INTO avaliacoes (cliente_nome, mesa, nota, comentario, origem) VALUES (?,?,?,?, 'interno')`,
        [String(b.cliente_nome || '').trim().slice(0, 100) || 'Cliente', String(b.mesa || '').trim().slice(0, 60), nota,
         String(b.comentario || '').trim().slice(0, 500)],
        function (err) {
          if (err) return res.status(500).json({ error: 'Erro ao registrar avaliação.' });
          const sincronizaGoogle = nota >= 4;
          io.to('restaurante_' + tid).emit('avaliacao_nova', {
            id: this.lastID, nota, comentario: b.comentario || '', mesa: b.mesa || '',
            cliente_nome: b.cliente_nome || 'Cliente', criado_em: new Date().toISOString()
          });
          res.json({
            success: true,
            mensagem: sincronizaGoogle
              ? 'Obrigado! Que tal deixar sua avaliação também no Google?'
              : 'Obrigado pelo seu feedback!'
          });
        });
    });
  });

  app.post('/api/avaliacoes/google-sync', verificarToken, (req, res) => {
    withTenant(req, () => {
      const enabled = (req.body && req.body.enabled === true) ? 'true' : 'false';
      const placeId = String((req.body && req.body.place_id) || '').trim().slice(0, 120);
      db.run(`INSERT INTO configuracoes (chave, valor) VALUES ('avaliacao_google_sync', ?)
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [enabled], (e1) => {
        db.run(`INSERT INTO configuracoes (chave, valor) VALUES ('avaliacao_google_place_id', ?)
          ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [placeId], (e2) => {
          if (e1 || e2) return res.status(500).json({ success: false, error: 'Erro ao salvar config.' });
          res.json({ success: true });
        });
      });
    });
  });

  // ── Socket Handlers ──
  log('Registering sockets...');

  io.on('connection', (socket) => {
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

    socket.on('admin_atualizar_pix_config', (cfg) => {
      const campos = ['pix_chave', 'pix_nome_recebedor', 'pix_cidade'];
      let pendentes = campos.length;
      const finalizar = () => { pendentes--; if (pendentes <= 0) socket.emit('pix_config_salvo', { success: true }); };
      campos.forEach(k => {
        if (cfg && cfg[k] !== undefined) {
          const valorLimpo = k === 'pix_chave' ? String(cfg[k]).trim() : String(cfg[k]);
          db.run(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, valorLimpo], finalizar);
        } else { finalizar(); }
      });
    });

    socket.on('get_pix_config', () => {
      db.all(`SELECT chave, valor FROM configuracoes WHERE chave IN ('pix_chave','pix_nome_recebedor','pix_cidade')`, [], (err, rows) => {
        const cfg = { pix_chave: '', pix_nome_recebedor: '', pix_cidade: '' };
        (rows || []).forEach(r => { cfg[r.chave] = r.valor || ''; });
        socket.emit('pix_config_atual', cfg);
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
          db.run(`UPDATE clientes SET pontos = pontos + ?, ultimo_checkin = ?, dispositivo = ? WHERE id = ?`,
            [pontos, hoje, resumirUserAgent(socket.handshake && socket.handshake.headers && socket.handshake.headers['user-agent']), cliente.id],
            (err2) => {
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

    socket.on('cliente_login', (telefone) => {
      db.get(`SELECT * FROM clientes WHERE telefone = ?`, [telefone], (err, cliente) => {
        if (err) return socket.emit('cliente_login_response', { error: 'Erro no servidor' });
        if (cliente) {
          socket.emit('cliente_login_response', { success: true, cliente });
        } else {
          socket.emit('cliente_login_response', { error: 'Cliente não encontrado. Solicite seu cadastro no caixa.' });
        }
      });
    });

    socket.on('get_beneficios', () => {
      db.all(`SELECT * FROM beneficios WHERE ativo = 1 ORDER BY pontos ASC`, (err, rows) => {
        socket.emit('beneficios_lista', rows || []);
      });
    });

    socket.on('resgatar_beneficio', ({ cliente_id, beneficio_id }) => {
      db.get(`SELECT pontos FROM clientes WHERE id = ?`, [cliente_id], (err, cliente) => {
        if (!cliente) return socket.emit('resgate_response', { error: 'Cliente inválido' });
        db.get(`SELECT pontos, nome FROM beneficios WHERE id = ? AND ativo = 1`, [beneficio_id], (err, beneficio) => {
          if (!beneficio) return socket.emit('resgate_response', { error: 'Benefício inválido' });
          if (cliente.pontos < beneficio.pontos) {
            return socket.emit('resgate_response', { error: 'Pontos insuficientes' });
          }
          const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();
          const custo = beneficio.pontos;
          db.run(`UPDATE clientes SET pontos = pontos - ? WHERE id = ? AND pontos >= ?`, [custo, cliente_id, custo], (err) => {
            if (!err) {
              db.run(`INSERT INTO resgates (cliente_id, beneficio_id, codigo, data) VALUES (?, ?, ?, datetime('now', 'localtime'))`,
                [cliente_id, beneficio_id, codigo], () => {
                  const novoSaldo = cliente.pontos - custo;
                  socket.emit('resgate_response', { success: true, codigo, novoSaldo });
                  db.all(`SELECT * FROM clientes`, (e, r) => io.emit('clientes_lista', r || []));
                });
            }
          });
        });
      });
    });

    socket.on('get_resgates_cliente', (cliente_id) => {
      db.all(`SELECT r.*, b.nome as beneficio_nome FROM resgates r JOIN beneficios b ON r.beneficio_id = b.id WHERE r.cliente_id = ? ORDER BY r.id DESC`,
        [cliente_id], (err, rows) => {
          socket.emit('resgates_cliente_lista', rows || []);
        });
    });

    socket.on('get_cliente_pedidos', (data) => {
      const { cliente_id, telefone } = data || {};
      if (!cliente_id && !telefone) return socket.emit('cliente_pedidos_response', []);
      let query, params;
      if (cliente_id) {
        query = `SELECT p.id, p.localName as mesa, p.status, p.total, p.productName, p.quantity, p.time as hora, p.createdAt as data FROM pedidos p WHERE p.cliente_id = ? AND p.status NOT IN ('Cancelado', 'Chamada') ORDER BY p.id DESC LIMIT 20`;
        params = [cliente_id];
      } else {
        query = `SELECT p.id, p.localName as mesa, p.status, p.total, p.productName, p.quantity, p.time as hora, p.createdAt as data FROM pedidos p WHERE p.userName = ? AND p.status NOT IN ('Cancelado', 'Chamada') ORDER BY p.id DESC LIMIT 20`;
        params = [telefone];
      }
      db.all(query, params, (err, rows) => {
        socket.emit('cliente_pedidos_response', rows || []);
      });
    });

    socket.on('get_cliente_visitas', (data) => {
      const { cliente_id, telefone } = data || {};
      if (!cliente_id && !telefone) return socket.emit('cliente_visitas_response', []);
      let query, params;
      if (cliente_id) {
        query = `SELECT v.mesa, v.data_visita as data, v.pontos_ganhos, v.contabilizado FROM cliente_visitas v WHERE v.cliente_id = ? ORDER BY v.id DESC LIMIT 30`;
        params = [cliente_id];
      } else {
        query = `SELECT v.mesa, v.data_visita as data, v.pontos_ganhos, v.contabilizado FROM cliente_visitas v WHERE v.cliente_telefone = ? ORDER BY v.id DESC LIMIT 30`;
        params = [telefone];
      }
      db.all(query, params, (err, rows) => {
        socket.emit('cliente_visitas_response', rows || []);
      });
    });

    socket.on('registrar_visita', (data) => {
      const { cliente_id, cliente_nome, cliente_telefone, mesa } = data || {};
      if (!cliente_id && !cliente_telefone) return;
      db.run(`INSERT INTO cliente_visitas (cliente_id, cliente_nome, cliente_telefone, mesa) VALUES (?, ?, ?, ?)`,
        [cliente_id || null, cliente_nome || '', cliente_telefone || '', mesa || ''], (err) => {
          if (!err) socket.emit('visita_registrada', { success: true });
        });
    });

    socket.on('admin_get_beneficios', () => {
      db.all(`SELECT * FROM beneficios`, (err, rows) => socket.emit('admin_beneficios_lista', rows || []));
    });
    socket.on('add_beneficio', (b) => {
      db.run(`INSERT INTO beneficios (nome, pontos, imagem_url, ativo) VALUES (?, ?, ?, ?)`, [b.nome, b.pontos, b.imagem_url, b.ativo ? 1 : 0], () => {
        db.all(`SELECT * FROM beneficios`, (err, rows) => io.emit('admin_beneficios_lista', rows || []));
      });
    });
    socket.on('edit_beneficio', (b) => {
      db.run(`UPDATE beneficios SET nome=?, pontos=?, imagem_url=?, ativo=? WHERE id=?`, [b.nome, b.pontos, b.imagem_url, b.ativo ? 1 : 0, b.id], () => {
        db.all(`SELECT * FROM beneficios`, (err, rows) => io.emit('admin_beneficios_lista', rows || []));
      });
    });
    socket.on('delete_beneficio', (id) => {
      if (!exigirAdminSocket(socket)) return;
      db.run(`DELETE FROM beneficios WHERE id=?`, [id], () => {
        db.all(`SELECT * FROM beneficios`, (err, rows) => io.emit('admin_beneficios_lista', rows || []));
      });
    });
  });

  log('Routes + sockets registered.');
};
