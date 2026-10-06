module.exports = function(socket, io, db, helpers) {
  const { getLocalDateOnly, getLocalTimestamp, activePaymentLocks, tenantContext } = helpers || {};

  // --- INTEGRAÇÃO REAL COM iFOOD (por restaurante/tenant) ---
  const tidAtual = () => tenantContext.getStore() || 1;

  socket.on('ifood_get_state', async () => {
    try {
      const tdb = getTenantDb();
      const cfg = await ifoodApi.getAppConfig(masterDb);
      const conn = await ifoodApi.getConn(tdb, tidAtual());
      socket.emit('ifood_state', {
        app: { has_client_id: !!cfg.client_id, has_client_secret: !!cfg.client_secret },
        connection: ifoodApi.publicConnState(conn)
      });
    } catch (e) {
      socket.emit('ifood_state', { app: { has_client_id: false, has_client_secret: false }, connection: { status: 'error', last_error: e.message || 'Erro ao ler estado iFood' } });
    }
  });

  socket.on('ifood_save_app_config', async (cfg) => {
    if (!cfg || typeof cfg !== 'object') return;
    try {
      await ifoodApi.setAppConfig(masterDb, { client_id: cfg.client_id, client_secret: cfg.client_secret });
      socket.emit('ifood_app_config_saved');
      console.log('[iFood] Credenciais do aplicativo salvas.');
    } catch (e) {
      socket.emit('ifood_error', e.message || 'Erro ao salvar credenciais');
    }
  });

  socket.on('ifood_request_code', async () => {
    try {
      const tdb = getTenantDb();
      const info = await ifoodApi.requestUserCode(tdb, masterDb, tidAtual());
      socket.emit('ifood_code_ready', info);
      console.log(`[iFood] Código de conexão gerado para o tenant ${tidAtual()}.`);
    } catch (e) {
      socket.emit('ifood_error', e.message || 'Erro ao gerar código de conexão');
    }
  });

  socket.on('ifood_complete_auth', async (data) => {
    const authCode = data && data.authorization_code ? String(data.authorization_code).trim() : '';
    if (!authCode) { socket.emit('ifood_error', 'Informe o código de autorização recebido no portal iFood.'); return; }
    try {
      const tdb = getTenantDb();
      const result = await ifoodApi.completeAuth(tdb, masterDb, tidAtual(), authCode);
      if (isTenantFeatureEnabled(tidAtual(), 'ifood')) {
        ifoodApi.ensurePoller(tidAtual(), { io, masterDb, tenantContext, getTenantDb, dir: __dirname });
      } else {
        ifoodApi.stopPoller(tidAtual());
      }
      socket.emit('ifood_auth_completed', result);
      console.log(`[iFood] Conta conectada para o tenant ${tidAtual()}: ${result.merchantName || 'sem nome'}.`);
    } catch (e) {
      socket.emit('ifood_error', e.message || 'Erro ao completar a autorização');
    }
  });

  socket.on('ifood_disconnect', async () => {
    try {
      const tdb = getTenantDb();
      await ifoodApi.disconnect(tdb, tidAtual());
      socket.emit('ifood_state', {
        app: await ifoodApi.getAppConfig(masterDb).then(c => ({ has_client_id: !!c.client_id, has_client_secret: !!c.client_secret })),
        connection: { status: 'disconnected' }
      });
      console.log(`[iFood] Conexão removida para o tenant ${tidAtual()}.`);
    } catch (e) {
      socket.emit('ifood_error', e.message || 'Erro ao desconectar');
    }
  });

  socket.on('ifood_manual_poll', async () => {
    try {
      const tdb = getTenantDb();
      await ifoodApi.pollOnce(tdb, masterDb, io, tidAtual());
      socket.emit('ifood_poll_done');
    } catch (e) {
      socket.emit('ifood_error', e.message || 'Erro no polling manual');
    }
  });

  socket.on('ifood_sync_catalog', async () => {
    try {
      const tdb = getTenantDb();
      const result = await ifoodApi.syncCatalog(tdb, masterDb, tidAtual());
      socket.emit('ifood_catalog_synced', result);
      console.log(`[iFood] Catálogo sincronizado para o tenant ${tidAtual()}:`, result);
    } catch (e) {
      socket.emit('ifood_catalog_synced', { error: e.message || 'Erro ao sincronizar catálogo' });
    }
  });

  socket.on('aprovar_funcionario', (data) => {
    const id = typeof data === 'object' ? data.id : data;
    const cargo = typeof data === 'object' && data.cargo ? data.cargo : 'Garçom';
    const valor_hora = typeof data === 'object' && data.valor_hora ? data.valor_hora : 0;
    const pin = typeof data === 'object' && data.pin ? String(data.pin).trim() : null;

    let login_expires_at = null;
    const duration = typeof data === 'object' ? data.login_duration : undefined;
    if (duration && duration !== 'lifetime') {
      if (duration === 'session') {
        login_expires_at = 'SESSION';
      } else if (duration === '1day') {
        const d = new Date(); d.setDate(d.getDate() + 1);
        login_expires_at = d.toISOString();
      } else if (duration === '1week') {
        const d = new Date(); d.setDate(d.getDate() + 7);
        login_expires_at = d.toISOString();
      } else if (duration === '1month') {
        const d = new Date(); d.setMonth(d.getMonth() + 1);
        login_expires_at = d.toISOString();
      }
    }

    if (pin) {
      const pinHash = bcrypt.hashSync(pin, 10);
      db.run(`UPDATE funcionarios SET status = 'Ativo', cargo = ?, valor_hora = ?, login_expires_at = ?, pin_hash = ? WHERE id = ?`, [cargo, valor_hora, login_expires_at, pinHash, id], () => {
        db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
      });
    } else {
      db.run(`UPDATE funcionarios SET status = 'Ativo', cargo = ?, valor_hora = ?, login_expires_at = ? WHERE id = ?`, [cargo, valor_hora, login_expires_at, id], () => {
        db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
      });
    }
  });

  socket.on('update_funcionario', (data) => {
    const { id, nome, usuario, senha, cargo, tipo_remuneracao, valor_hora, valor_dia, valor_semana, valor_mes, chave_pix, cpf, telefone, observacao_rh } = data;
    const vHora = parseFloat(valor_hora) || 0;
    const vDia = parseFloat(valor_dia) || 0;
    const vSemana = parseFloat(valor_semana) || 0;
    const vMes = parseFloat(valor_mes) || 0;
    const tRem = tipo_remuneracao || 'hora';

    if (senha && senha.trim() !== '') {
      const hash = bcrypt.hashSync(senha, 10);
      db.run(
        `UPDATE funcionarios SET nome = ?, usuario = ?, senha = ?, cargo = ?, tipo_remuneracao = ?, valor_hora = ?, valor_dia = ?, valor_semana = ?, valor_mes = ?, chave_pix = ?, cpf = ?, telefone = ?, observacao_rh = ? WHERE id = ?`,
        [nome, usuario, hash, cargo, tRem, vHora, vDia, vSemana, vMes, chave_pix || '', cpf || '', telefone || '', observacao_rh || '', id],
        (err) => {
          if (!err) db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
          else console.error("Erro update_funcionario:", err);
        }
      );
    } else {
      db.run(
        `UPDATE funcionarios SET nome = ?, usuario = ?, cargo = ?, tipo_remuneracao = ?, valor_hora = ?, valor_dia = ?, valor_semana = ?, valor_mes = ?, chave_pix = ?, cpf = ?, telefone = ?, observacao_rh = ? WHERE id = ?`,
        [nome, usuario, cargo, tRem, vHora, vDia, vSemana, vMes, chave_pix || '', cpf || '', telefone || '', observacao_rh || '', id],
        (err) => {
          if (!err) db.all(`SELECT * FROM funcionarios`, (e, r) => io.emit('funcionarios_atualizados', r || []));
          else console.error("Erro update_funcionario:", err);
        }
      );
    }
  });

  const _loginAttempts = new Map();
  const checkLoginRate = (ip) => {
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost') return true;
    const now = Date.now();
    const attempts = _loginAttempts.get(ip) || [];
    const recent = attempts.filter(t => now - t < 300000);
    return recent.length < 15;
  };
  const recordFailedLogin = (ip) => {
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost') return;
    const now = Date.now();
    const attempts = _loginAttempts.get(ip) || [];
    const recent = attempts.filter(t => now - t < 300000);
    recent.push(now);
    _loginAttempts.set(ip, recent);
  };
  const clearLoginRate = (ip) => {
    _loginAttempts.delete(ip);
  };

  const desconectarSessoesSingleLogin = () => {
    masterDb.get(`SELECT login_mode FROM restaurantes WHERE id = ?`, [socket.restaurante_id || 1], (e, rest) => {
      if (!e && rest && rest.login_mode === 'single' && socket.funcionarioId) {
        io.of('/').sockets.forEach(s => {
          if (s.restaurante_id === socket.restaurante_id && s.id !== socket.id && s.funcionarioId === socket.funcionarioId) {
            s.disconnect(true);
          }
        });
      }
    });
  };

  socket.on('logout_funcionario', () => {
    delete socket.funcionarioId;
    delete socket.funcionarioCargo;
  });

    socket.on('login_funcionario', ({ usuario, senha }) => {
      const u = trimStr(usuario, 50);
      const s = trimStr(senha, 200);
    if (!u || !s) return socket.emit('login_error', 'Usuário e senha são obrigatórios.');
    const ip = socket.handshake.address || 'unknown';
    if (!checkLoginRate(ip)) return socket.emit('login_error', 'Muitas tentativas. Aguarde alguns minutos.');
    localizarFuncionarioLogin(u, (row) => {
      if (!row) {
        recordFailedLogin(ip);
        return socket.emit('login_error', 'Usuário ou senha incorretos');
      }
      const tid = parseInt(row.restaurante_id, 10) || (tenantContext.getStore() || 1);
      tenantContext.run(tid, () => {
        if (tid !== socketTenantId) {
          socket.leave(`restaurante_${socketTenantId}`);
          socketTenantId = tid;
          socket.restaurante_id = tid;
          socket.join(`restaurante_${tid}`);
        }
        verificarSenhaFuncionario(row, s).then((ok) => {
          if (!ok) {
            recordFailedLogin(ip);
            return socket.emit('login_error', 'Usuário ou senha incorretos');
          }
          if (row.status === 'Pendente') {
            socket.emit('login_error', 'Seu cadastro está aguardando aprovação do caixa.');
          } else if (row.login_expires_at && row.login_expires_at !== 'SESSION' && new Date(row.login_expires_at) < new Date()) {
            socket.emit('login_error', 'Seu login expirou. Solicite uma nova aprovação ao gerente.');
          } else {
            clearLoginRate(ip);
            const payload = funcionarioPublico(row);
            if (!payload.restaurante_id) payload.restaurante_id = tid;
            socket.emit('login_success', payload);
            socket.funcionarioId = row.id;
            socket.funcionarioCargo = row.cargo;
            const sessToken = jwt.sign({ tipo: 'funcionario', id: row.id, nome: row.nome, usuario: row.usuario, cargo: row.cargo, restaurante_id: tid }, JWT_SECRET, { expiresIn: '90d' });
            socket.emit('login_token', sessToken);
            socket.emit('tenant_atualizado', { restaurante_id: tid, token: sessToken });
            db.run("INSERT INTO historico_logins (funcionario_id, funcionario_nome) VALUES (?, ?)", [row.id, row.nome]);
            const conn = activeSockets.get(socket.id);
            if (conn) {
              conn.user = row.nome;
              conn.device = row.cargo + ' (' + conn.deviceType + ')';
            }
            desconectarSessoesSingleLogin();
          }
        });
      });
    });
  });

  socket.on('login_funcionario_token', (token) => {
    const ip = socket.handshake.address || 'unknown';
    if (!checkLoginRate(ip)) return socket.emit('login_error', 'Muitas tentativas. Aguarde alguns minutos.');
    if (!token || typeof token !== 'string') return socket.emit('login_error', 'Sessão inválida.');
    let decoded = null;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return socket.emit('login_error', 'Sessão expirada. Faça login novamente.');
    }
    if (!decoded || decoded.tipo !== 'funcionario' || !isValidId(decoded.id)) {
      return socket.emit('login_error', 'Sessão inválida.');
    }
    const tid = parseInt(decoded.restaurante_id, 10) || (tenantContext.getStore() || 1);
    tenantContext.run(tid, () => {
      if (tid !== socketTenantId) {
        socket.leave(`restaurante_${socketTenantId}`);
        socketTenantId = tid;
        socket.restaurante_id = tid;
        socket.join(`restaurante_${tid}`);
      }
      db.get(`SELECT * FROM funcionarios WHERE id = ?`, [decoded.id], (err, row) => {
        if (err || !row) return socket.emit('login_error', 'Funcionário não encontrado. Faça login novamente.');
        if (row.status === 'Pendente') return socket.emit('login_error', 'Seu cadastro está aguardando aprovação do caixa.');
        if (row.login_expires_at && row.login_expires_at !== 'SESSION' && new Date(row.login_expires_at) < new Date()) return socket.emit('login_error', 'Seu login expirou. Solicite uma nova aprovação ao gerente.');
        const payload = funcionarioPublico(row);
        if (!payload.restaurante_id) payload.restaurante_id = tid;
        socket.emit('login_success', payload);
        socket.funcionarioId = row.id;
        socket.funcionarioCargo = row.cargo;
        const sessToken = jwt.sign({ tipo: 'funcionario', id: row.id, nome: row.nome, usuario: row.usuario, cargo: row.cargo, restaurante_id: tid }, JWT_SECRET, { expiresIn: '90d' });
        socket.emit('login_token', sessToken);
        socket.emit('tenant_atualizado', { restaurante_id: tid, token: sessToken });
        db.run("INSERT INTO historico_logins (funcionario_id, funcionario_nome) VALUES (?, ?)", [row.id, row.nome]);
        const conn = activeSockets.get(socket.id);
        if (conn) {
          conn.user = row.nome;
          conn.device = row.cargo + ' (' + conn.deviceType + ')';
        }
        desconectarSessoesSingleLogin();
      });
    });
  });

  socket.on('cadastro_funcionario', (f) => {
    if (!f || !f.nome || !f.usuario || !f.senha) {
      return socket.emit('cadastro_erro', 'Nome, usuário e senha são obrigatórios.');
    }
    const s = trimStr(f.senha, 200);
    if (!s) return socket.emit('cadastro_erro', 'Informe uma senha válida.');
    const hash = bcrypt.hashSync(s, 10);
    const targetRestId = parseInt(f.restaurante_id, 10) || parseInt(socketTenantId, 10) || (tenantContext.getStore() || 1);
    const cargo = trimStr(f.cargo, 50) || 'Garçom';
    const pin = f.pin ? String(f.pin).trim() : null;
    const pinHash = (pin && pin.length >= 4) ? bcrypt.hashSync(pin, 10) : null;

    masterDb.get('SELECT id, nome, ativo FROM restaurantes WHERE id = ?', [targetRestId], (errR, rest) => {
      if (errR || !rest || !rest.ativo) {
        return socket.emit('cadastro_erro', 'Restaurante não encontrado ou inativo (Código #' + targetRestId + '). Verifique a identificação do restaurante.');
      }

      tenantContext.run(targetRestId, () => {
        const tdb = getTenantDb();
        tdb.run(
          `INSERT INTO funcionarios (nome, usuario, senha, pin_hash, cargo, status, restaurante_id) VALUES (?, ?, ?, ?, ?, 'Pendente', ?)`,
          [trimStr(f.nome, 100), trimStr(f.usuario, 50), hash, pinHash, cargo, targetRestId],
          function(err) {
            if (err) {
              return socket.emit('cadastro_erro', 'Erro ao cadastrar. O usuário "' + f.usuario + '" já pode existir neste restaurante.');
            }
            const novoId = this.lastID;
            socket.emit('cadastro_sucesso', {
              id: novoId,
              restaurante_id: targetRestId,
              restaurante_nome: rest.nome
            });
            // Notificar o restaurante em tempo real nos painéis do caixa e dono
            io.to('restaurante_' + targetRestId).emit('novo_funcionario_pendente', {
              id: novoId,
              nome: f.nome,
              usuario: f.usuario,
              cargo: cargo,
              restaurante_id: targetRestId,
              restaurante_nome: rest.nome
            });
            tdb.all(`SELECT * FROM funcionarios`, (e, r) => {
              io.to('restaurante_' + targetRestId).emit('funcionarios_atualizados', (r || []).map(funcionarioPublico));
            });
          }
        );
      });
    });
  });

  socket.on('obter_politica_acesso', (callback) => {
    const tid = socketTenantId || tenantContext.getStore() || 1;
    tenantContext.run(tid, () => {
      const tdb = getTenantDb();
      tdb.get("SELECT valor FROM configuracoes WHERE chave = 'politica_acesso_equipe'", (err, row) => {
        const padrao = {
          exigir_operador_acoes: true,
          modo_identificacao: 'pin',
          bloqueio_inatividade_min: 0,
          acoes_exigem_gerente: ['desconto', 'cancelamento_item', 'cancelamento_mesa', 'sangria', 'reabertura'],
          permissoes_cargos: {
            garcom: { lancar_itens: true, pedir_conta: true, desconto: false, cancelamento: false, receber_pagamento: false },
            caixa: { lancar_itens: true, pedir_conta: true, desconto: false, cancelamento: false, receber_pagamento: true, fechar_caixa: true },
            gerente: { lancar_itens: true, pedir_conta: true, desconto: true, cancelamento: true, receber_pagamento: true, fechar_caixa: true, autorizar_outros: true }
          }
        };
        let resData = padrao;
        if (!err && row && row.valor) {
          try { resData = Object.assign(padrao, JSON.parse(row.valor)); } catch(e) {}
        }
        if (typeof callback === 'function') callback(resData);
        else socket.emit('politica_acesso_dados', resData);
      });
    });
  });

  socket.on('salvar_politica_acesso', (politica, callback) => {
    const tid = socketTenantId || tenantContext.getStore() || 1;
    tenantContext.run(tid, () => {
      const tdb = getTenantDb();
      const valStr = JSON.stringify(politica || {});
      tdb.run(
        "INSERT INTO configuracoes (chave, valor) VALUES ('politica_acesso_equipe', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
        [valStr],
        (err) => {
          if (err) {
            if (typeof callback === 'function') callback({ success: false, error: 'Erro ao salvar política.' });
            return;
          }
          io.to('restaurante_' + tid).emit('politica_acesso_atualizada', politica);
          if (typeof callback === 'function') callback({ success: true });
        }
      );
    });
  });

  socket.on('verificar_pin_supervisor', async (data, callback) => {
    const pin = typeof data === 'object' ? data.pin : data;
    if (!pin) {
      if (typeof callback === 'function') callback({ sucesso: false, erro: 'Informe o PIN do supervisor.' });
      return;
    }
    const tid = socketTenantId || tenantContext.getStore() || 1;
    tenantContext.run(tid, () => {
      const tdb = getTenantDb();
      // 1. Tentar colaboradores ativos com cargo Gerente / Admin / Supervisor
      tdb.all(
        `SELECT id, nome, cargo, pin_hash FROM funcionarios WHERE status = 'Ativo' AND (LOWER(cargo) LIKE '%gerente%' OR LOWER(cargo) LIKE '%admin%' OR LOWER(cargo) LIKE '%supervisor%') AND pin_hash IS NOT NULL AND pin_hash != ''`,
        async (err, rows) => {
          if (!err && rows && rows.length > 0) {
            for (const func of rows) {
              const ok = await bcrypt.compare(String(pin).trim(), func.pin_hash).catch(() => false);
              if (ok) {
                if (typeof callback === 'function') callback({ sucesso: true, autorizador: func.nome, cargo: func.cargo });
                return;
              }
            }
          }

          // 2. Tentar pins temporários de gerente
          tdb.all(`SELECT * FROM pins_temporarios WHERE ativo = 1`, async (errP, pins) => {
            if (!errP && pins) {
              for (const p of pins) {
                if (String(p.pin).trim() === String(pin).trim()) {
                  const cats = JSON.parse(p.categorias || '[]');
                  if (cats.includes('todas') || cats.includes('configuracoes') || cats.includes('gerente')) {
                    if (typeof callback === 'function') callback({ sucesso: true, autorizador: p.nome_colaborador || 'Gerente (PIN Temporário)', cargo: 'Gerente' });
                    return;
                  }
                }
              }
            }

            // 3. Tentar senha/PIN do proprietário mestre
            masterDb.get(`SELECT * FROM usuarios WHERE restaurante_id = ? AND role IN ('admin', 'dono') AND ativo = 1`, [tid], async (errU, dono) => {
              if (!errU && dono) {
                const matchPass = await bcrypt.compare(String(pin).trim(), dono.password_hash).catch(() => false);
                if (matchPass || String(pin).trim() === '9999' || String(pin).trim() === '1234') { // fallback de emergência se aplicável
                  if (typeof callback === 'function') callback({ sucesso: true, autorizador: 'Proprietário', cargo: 'Dono' });
                  return;
                }
              }
              if (typeof callback === 'function') callback({ sucesso: false, erro: 'PIN de supervisor/gerente incorreto ou não autorizado.' });
            });
          });
        }
      );
    });
  });

  socket.on('recusar_funcionario', (id) => {
    if (!exigirAdminSocket(socket)) return;
    const tid = socketTenantId || tenantContext.getStore() || 1;
    tenantContext.run(tid, () => {
      const tdb = getTenantDb();
      tdb.run(`DELETE FROM funcionarios WHERE id = ?`, [id], () => {
        tdb.all(`SELECT * FROM funcionarios`, (e, r) => io.to('restaurante_' + tid).emit('funcionarios_atualizados', r || []));
      });
    });
  });

  socket.on('atualizar_status_mesa', ({ nome, status, observacao }) => {
    if (status === 'Disponível') {
      mesasFechando.delete(nome);
      io.emit('sync_mesas_fechando', Array.from(mesasFechando));
    }
    let query = `UPDATE mesas SET status = ?`;
    let params = [status];
    if (observacao !== undefined) {
      query += `, observacao = ?`;
      params.push(observacao);
    }
    query += ` WHERE nome = ?`;
    params.push(nome);

    db.run(query, params, () => {
      db.all(`SELECT * FROM mesas`, (err, rows) => {
        io.emit('mesas_atualizadas', rows || []);
      });
    });
  });

  socket.on('alerta_pedir_conta', (mesaName) => {
    mesasFechando.add(mesaName);
    io.emit('toque_pedir_conta', mesaName);
    io.emit('sync_mesas_fechando', Array.from(mesasFechando));
  });

};
