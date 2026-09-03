/*
  ── SEPARAÇÃO DE CONTA PELO CLIENTE (QR CODE) ──────────────────────────────
  Fluxo:
    1. Garçom gera um token de sessão para a mesa (criar_split_mesa).
    2. Cliente lê o QR → separar-conta.html?restaurante_id=X&token=TOKEN.
    3. A página consome split_data_mesa (itens da mesa + já pago por item).
    4. Cliente "pega" itens/frações que são dele e paga (registrar_split_pagamento).
    5. Se pagar acima do que pegou: o excedente vira GORJETA ou ABATE nos itens
       compartilhados, conforme a configuração split_excedente do restaurante.
*/
module.exports = function (socket, io, db, helpers) {
  const { checkCaixa, broadcastPedidos, broadcastMesaClientes } = helpers || {};
  const aprovacaoLocks = new Set();

  function registrarAuditoria() {
    if (typeof global.registrarAuditoria === 'function') {
      return global.registrarAuditoria.apply(global, arguments);
    }
  }

  function localTimestamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function toNum(v) {
    return parseFloat(String(v == null ? '' : v).replace(',', '.')) || 0;
  }

  function gerarToken() {
    return require('crypto').randomBytes(24).toString('hex');
  }

  function getConfig(chave, cb) {
    db.get(`SELECT valor FROM configuracoes WHERE chave = ?`, [chave], (err, row) => {
      cb && cb(row ? String(row.valor) : null);
    });
  }

  function carregarTabelas() {
    db.run(`CREATE TABLE IF NOT EXISTS mesa_split_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      mesa TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS mesa_split_pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT,
      mesa TEXT NOT NULL,
      cliente_nome TEXT,
      comanda TEXT,
      valor REAL NOT NULL DEFAULT 0,
      tipo TEXT NOT NULL DEFAULT 'itens',
      metodo TEXT,
      observacao TEXT,
      turno_id INTEGER,
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS mesa_split_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pagamento_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      qtd REAL NOT NULL,
      valor REAL NOT NULL
    )`);
    // Créditos / movimentações financeiras por comanda (itens compartilhados)
    db.run(`CREATE TABLE IF NOT EXISTS comanda_creditos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mesa TEXT NOT NULL,
      comanda TEXT,
      valor REAL NOT NULL DEFAULT 0,
      tipo TEXT NOT NULL DEFAULT 'compartilhado',
      metodo TEXT,
      operador TEXT,
      observacao TEXT,
      turno_id INTEGER,
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )`);
    // Comandas prontas (pedidos de separação de conta enviados pelo cliente p/ aprovação do caixa)
    db.run(`CREATE TABLE IF NOT EXISTS comandas_prontas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT,
      mesa TEXT NOT NULL,
      cliente_nome TEXT,
      comanda TEXT,
      metodo TEXT,
      valor_itens REAL NOT NULL DEFAULT 0,
      valor_servico REAL NOT NULL DEFAULT 0,
      valor_gorjeta REAL NOT NULL DEFAULT 0,
      valor_total REAL NOT NULL DEFAULT 0,
      itens_json TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      operador TEXT,
      aprovado_em TEXT,
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )`);
    // Caixinha da empresa (gorjetas +3/+8/+20 / agradecer) dividida no último domingo do mês
    db.run(`CREATE TABLE IF NOT EXISTS caixinha (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mesa TEXT NOT NULL,
      comanda TEXT,
      valor REAL NOT NULL DEFAULT 0,
      metodo TEXT,
      origem TEXT NOT NULL DEFAULT 'gorjeta',
      cliente_nome TEXT,
      descricao TEXT,
      turno_id INTEGER,
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )`);
  }

  carregarTabelas();

  socket.on('criar_split_mesa', ({ mesa }) => {
    const mesaName = (mesa || '').toString().trim();
    if (!mesaName) return socket.emit('split_erro', { code: 'SEM_MESA', msg: 'Informe a mesa.' });

    db.get(`SELECT * FROM mesa_split_tokens WHERE mesa = ? AND ativo = 1 ORDER BY id DESC LIMIT 1`, [mesaName], (err, existente) => {
      if (existente) return socket.emit('split_token_criado', { success: true, token: existente.token, mesa: mesaName, reutilizado: true });
      const token = gerarToken();
      db.run(`INSERT INTO mesa_split_tokens (token, mesa) VALUES (?, ?)`, [token, mesaName], (e2) => {
        if (e2) return socket.emit('split_erro', { code: 'BANCO', msg: 'Falha ao gerar o QR: ' + (e2.message || '') });
        socket.emit('split_token_criado', { success: true, token, mesa: mesaName, reutilizado: false });
      });
    });
  });

  socket.on('split_data_mesa', ({ token }) => {
    const tok = (token || '').toString().trim();
    if (!tok) return socket.emit('split_erro', { code: 'SEM_TOKEN', msg: 'Link inválido (sem token).' });

    db.get(
      `SELECT t.*, m.status AS mesa_status, m.observacao AS mesa_obs FROM mesa_split_tokens t
       LEFT JOIN mesas m ON m.nome = t.mesa WHERE t.token = ? AND t.ativo = 1`,
      [tok],
      (err, sessao) => {
        if (err || !sessao) {
          return socket.emit('split_erro', { code: 'TOKEN_INVALIDO', msg: 'QR inválido ou expirado. Peça ao garçom um novo QR.' });
        }
        const mesaName = sessao.mesa;

        db.all(
          `SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND status != 'Finalizado' AND status != 'Cancelado' AND total >= 0 ORDER BY id ASC`,
          [mesaName, mesaName],
          (e2, itens) => {
            const listaItens = (itens || []).map(r => {
              const total = toNum(r.total);
              const qty = toNum(r.quantity) || 1;
              return {
                id: r.id,
                productName: String(r.productName || ''),
                productEmoji: String(r.productEmoji || ''),
                quantity: qty,
                unitTotal: qty > 0 ? Math.round((total / qty) * 100) / 100 : total,
                total,
                status: r.status,
                mesa_comanda: r.mesa_comanda || null,
                sector: r.sector || ''
              };
            });

            db.all(
              `SELECT si.item_id AS item_id, SUM(si.qtd) AS qtd, SUM(si.valor) AS valor
               FROM mesa_split_itens si JOIN mesa_split_pagamentos p ON p.id = si.pagamento_id
               WHERE p.mesa = ? GROUP BY si.item_id`,
              [mesaName],
              (e3, claims) => {
                const pagoPorItem = {};
                (claims || []).forEach(c => { pagoPorItem[c.item_id] = { qtd: toNum(c.qtd), valor: toNum(c.valor) }; });

                db.all(
                  `SELECT * FROM mesa_split_pagamentos WHERE mesa = ? ORDER BY id DESC LIMIT 30`,
                  [mesaName],
                  (e4, pagos) => {
                    const listaPagos = (pagos || []).map(p => ({
                      id: p.id,
                      cliente_nome: p.cliente_nome || 'Cliente',
                      comanda: p.comanda || null,
                      valor: toNum(p.valor),
                      tipo: p.tipo,
                      metodo: p.metodo || 'Dinheiro',
                      criado_em: p.criado_em
                    }));
                    db.all(`SELECT * FROM configuracoes`, [], (e5, cfgs) => {
                      const cfg = {};
                      (cfgs || []).forEach(r => { cfg[r.chave] = r.valor; });

                      db.all(`SELECT * FROM comanda_creditos WHERE mesa = ? ORDER BY id ASC`, [mesaName], (e6, creditosRows) => {
                        const creditos = (creditosRows || []).map(r => ({
                          id: r.id,
                          comanda: r.comanda || null,
                          valor: toNum(r.valor),
                          tipo: r.tipo || 'comanda',
                          metodo: r.metodo || 'Dinheiro',
                          operador: r.operador || 'Caixa',
                          observacao: r.observacao || null,
                          criado_em: r.criado_em
                        }));

                        db.get(`SELECT * FROM comandas_prontas WHERE token = ? ORDER BY id DESC LIMIT 1`, [tok], (e7, cp) => {
                          let comandaPronta = null;
                          if (cp) {
                            comandaPronta = {
                              id: cp.id,
                              clienteNome: cp.cliente_nome || 'Cliente',
                              comanda: cp.comanda || null,
                              metodo: cp.metodo || 'Dinheiro',
                              valorItens: toNum(cp.valor_itens),
                              valorServico: toNum(cp.valor_servico),
                              valorGorjeta: toNum(cp.valor_gorjeta),
                              valorTotal: toNum(cp.valor_total),
                              status: cp.status
                            };
                          }

                          socket.emit('split_dados', {
                            success: true,
                            mesa: mesaName,
                            mesa_status: sessao.mesa_status || 'Ocupada',
                            itens: listaItens,
                            pagoPorItem,
                            pagamentos: listaPagos,
                            creditos,
                            comanda_pronta: comandaPronta,
                            configs: {
                              split_excedente: String(cfg.split_excedente || 'perguntar'),
                              taxa_servico: parseFloat(cfg.taxa_servico) || 10,
                              qr_pix_key: cfg.qr_pix_key || '',
                              qr_pix_name: cfg.qr_pix_name || '',
                              nome_restaurante: cfg.nome_restaurante || ''
                            }
                          });
                        });
                      });
                    });
                  }
                );
              }
            );
          }
        );
      }
    );
  });

  socket.on('registrar_split_pagamento', (d) => {
    const d2 = d || {};
    const tok = String(d2.token || '').toString().trim();
    if (!tok) return socket.emit('split_erro', { code: 'SEM_TOKEN', msg: 'Link inválido (sem token).' });

    const claims = Array.isArray(d2.itens) ? d2.itens : [];
    const metodo = String(d2.metodo || 'Dinheiro').trim();
    const clienteNome = String(d2.clienteNome || '').trim() || 'Cliente';
    const comanda = String(d2.comanda || '').trim() || null;
    const excedenteTipo = String(d2.excedenteTipo || 'abater').trim().toLowerCase();

    checkCaixa(turno => {
      if (!turno) {
        return socket.emit('split_erro', { code: 'CAIXA_FECHADO', msg: 'O caixa está fechado. Peça ao garçom para abrir o caixa.' });
      }

      db.get(`SELECT * FROM mesa_split_tokens WHERE token = ? AND ativo = 1`, [tok], (err, sessao) => {
        if (err || !sessao) {
          return socket.emit('split_erro', { code: 'TOKEN_INVALIDO', msg: 'QR inválido ou expirado. Peça ao garçom um novo QR.' });
        }
        const mesaName = sessao.mesa;

        db.all(
          `SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND status != 'Finalizado' AND status != 'Cancelado' AND total >= 0`,
          [mesaName, mesaName],
          (e2, rows) => {
            const itensMesa = {};
            (rows || []).forEach(r => { itensMesa[r.id] = r; });

            db.all(
              `SELECT si.item_id, SUM(si.qtd) AS qtd FROM mesa_split_itens si
               JOIN mesa_split_pagamentos p ON p.id = si.pagamento_id WHERE p.mesa = ? GROUP BY si.item_id`,
              [mesaName],
              (e3, claimsRows) => {
                const pagoPorItem = {};
                (claimsRows || []).forEach(c => { pagoPorItem[c.item_id] = toNum(c.qtd); });

                let valorItens = 0;
                const validClaims = [];
                for (let i = 0; i < claims.length; i++) {
                  const c = claims[i] || {};
                  const item = itensMesa[c.itemId];
                  if (!item) continue;
                  const qty = toNum(c.qtd);
                  if (qty <= 0) continue;
                  const disponivel = toNum(item.quantity) - (pagoPorItem[c.itemId] || 0);
                  const qtdOk = Math.min(qty, disponivel);
                  if (qtdOk <= 0) continue;
                  const unitTotal = toNum(item.total) / (toNum(item.quantity) || 1);
                  const valor = Math.round(qtdOk * unitTotal * 100) / 100;
                  pagoPorItem[c.itemId] = (pagoPorItem[c.itemId] || 0) + qtdOk;
                  validClaims.push({ itemId: c.itemId, qtd: qtdOk, valor });
                  valorItens += valor;
                }
                valorItens = Math.round(valorItens * 100) / 100;

                if (validClaims.length === 0) {
                  return socket.emit('split_erro', { code: 'SEM_ITENS', msg: 'Selecione ao menos um item para pagar.' });
                }

                const valorPago = toNum(d2.valorPago);
                if (valorPago <= 0) {
                  return socket.emit('split_erro', { code: 'VALOR_INVALIDO', msg: 'Informe um valor a pagar.' });
                }
                if (valorPago < valorItens - 0.01) {
                  return socket.emit('split_erro', { code: 'VALOR_MENOR', msg: `O valor a pagar (R$ ${valorPago.toFixed(2)}) é menor que o total dos itens selecionados (R$ ${valorItens.toFixed(2)}).` });
                }

                const excesso = Math.round((valorPago - valorItens) * 100) / 100;
                getConfig('split_excedente', cfgTipo => {
                  let tipoExcedente = null;
                  if (excesso > 0.005) {
                    const cfg = String(cfgTipo || 'perguntar');
                    if (cfg === 'gorjeta') tipoExcedente = 'gorjeta';
                    else if (cfg === 'abater') tipoExcedente = 'abater';
                    else tipoExcedente = (excedenteTipo === 'gorjeta' ? 'gorjeta' : 'abater');
                  }

                  const registraTudo = () => {
                    const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                    const inserePagar =
                      `INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, mesa_grupo, mesa_comanda, userName, time, sector, createdAt)
                       VALUES (?, '💸', 1, ?, 'Entregue', ?, NULL, ?, ?, ?, 'Caixa', datetime('now', 'localtime'))`;
                    const insertPedido = (productName, valorNumero) => new Promise((resolve) => {
                      db.run(inserePagar,
                        [productName, (-Math.abs(valorNumero)).toFixed(2).replace('.', ','), mesaName, comanda, clienteNome, timeStr],
                        () => resolve(true));
                    });
                    const insertMov = (valorNumero, descricao) => new Promise((resolve) => {
                      db.run(
                        `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, 'Entrada', ?, ?, ?, datetime('now', 'localtime'))`,
                        [turno.id, valorNumero, metodo, descricao],
                        () => resolve(true));
                    });

                    const registraPagamentoHistory = (tipo, valor, obs) => new Promise((resolve) => {
                      db.run(
                        `INSERT INTO mesa_split_pagamentos (token, mesa, cliente_nome, comanda, valor, tipo, metodo, observacao, turno_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [tok, mesaName, clienteNome, comanda, valor, tipo, metodo, obs || null, turno.id],
                        function (err2) { resolve(err2 ? null : this.lastID); });
                    });

                    (async () => {
                      let pagId = null;
                      // 1. Pagamento dos itens selecionados (sempre reduz a conta da mesa)
                      if (valorItens > 0.001) {
                        await insertPedido(`Pgto Parcial Cliente (${metodo})`, valorItens);
                        pagId = await registraPagamentoHistory('itens', valorItens, null);
                        await insertMov(valorItens, `Pgto Cliente: ${clienteNome} (${mesaName}) - separação de itens`);

                        if (pagId) {
                          const stmt = db.prepare(`INSERT INTO mesa_split_itens (pagamento_id, item_id, qtd, valor) VALUES (?, ?, ?, ?)`);
                          validClaims.forEach(c => { stmt.run([pagId, c.itemId, c.qtd, c.valor]); });
                          stmt.finalize();
                        }
                      }

                      // 2. Excedente: abate OU gorjeta
                      if (excesso > 0.005 && tipoExcedente) {
                        if (tipoExcedente === 'abater') {
                          await insertPedido(`Pgto Parcial Cliente Abate (${metodo})`, excesso);
                          await registraPagamentoHistory('abate', excesso, null);
                          await insertMov(excesso, `Pgto Cliente ${clienteNome} (${mesaName}) - abate em itens compartilhados`);
                        } else {
                          await registraPagamentoHistory('gorjeta', excesso, null);
                          await insertMov(excesso, `Gorjeta ${clienteNome} (${mesaName}) - excedente de separação de conta`);
                        }
                      }

                      // 3. Broadcasts
                      if (typeof broadcastPedidos === 'function') broadcastPedidos();
                      const valorAbatido = valorItens + (tipoExcedente === 'abater' ? excesso : 0);
                      io.emit('itens_mesa_recebidos', { mesaName, items: [] });
                      db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND status != 'Finalizado'`, [mesaName, mesaName], (en, rItens) => {
                        io.emit('itens_mesa_recebidos', { mesaName, items: rItens || [] });
                      });
                      setTimeout(() => io.emit('atualizacao_caixa'), 300);
                      io.emit('pagamento_parcial_registrado', {
                        mesaName, valor: Math.round(valorAbatido * 100) / 100,
                        gorjeta: tipoExcedente === 'gorjeta' ? excesso : null,
                        excedenteTipo: tipoExcedente, metodo, userName: clienteNome,
                        comandaName: comanda, originSocket: socket.id, origem: 'split'
                      });
                      if (typeof broadcastMesaClientes === 'function') broadcastMesaClientes();
                      registrarAuditoria('Cliente', 'PAGAMENTO_SEPARACAO_CONTA',
                        `${clienteNome} pagou R$ ${valorPago.toFixed(2)} (${metodo}) na ${mesaName}${tipoExcedente ? ' | excedente=' + tipoExcedente + ' R$ ' + excesso.toFixed(2) : ''}`, 'Financeiro', 'MEDIO');

                      socket.emit('split_pagamento_sucesso', {
                        success: true, mesa: mesaName, valorItens,
                        valorPago, excesso, excedenteTipo: tipoExcedente, metodo
                      });
                    })();
                  };
                  registraTudo();
                });
              }
            );
          }
        );
      });
    });
  });

  // ════════ COMANDA PRONTA (cliente envia → caixa aprova) ════════
  // O cliente seleciona os itens + método e NÃO finaliza o pagamento.
  // Ele envia uma "comanda pronta" para o caixa, que aprova e registra.

  socket.on('enviar_comanda_pronta', (d) => {
    const d2 = d || {};
    const tok = String(d2.token || '').toString().trim();
    if (!tok) return socket.emit('split_erro', { code: 'SEM_TOKEN', msg: 'Link inválido (sem token).' });

    const claims = Array.isArray(d2.itens) ? d2.itens : [];
    const metodo = String(d2.metodo || 'Dinheiro').trim() || 'Dinheiro';
    const clienteNome = String(d2.clienteNome || '').trim() || 'Cliente';
    const comanda = String(d2.comanda || '').trim() || null;
    const valorItens = toNum(d2.valorItens);
    const valorServico = toNum(d2.valorServico);
    const valorGorjeta = toNum(d2.valorGorjeta);
    if (claims.length === 0 || valorItens <= 0) {
      return socket.emit('split_erro', { code: 'SEM_ITENS', msg: 'Selecione ao menos um item para enviar.' });
    }

    db.get(`SELECT * FROM mesa_split_tokens WHERE token = ? AND ativo = 1`, [tok], (err, sessao) => {
      if (err || !sessao) return socket.emit('split_erro', { code: 'TOKEN_INVALIDO', msg: 'QR inválido ou expirado.' });
      const mesaName = sessao.mesa;

      db.get(`SELECT id FROM comandas_prontas WHERE token = ? AND status = 'pendente'`, [tok], (e1, pendente) => {
        if (pendente) {
          return socket.emit('split_erro', { code: 'JA_ENVIADA', msg: 'Você já enviou uma comanda para o caixa. Aguarde a aprovação.' });
        }
        const valorTotal = Math.round((valorItens + valorServico + valorGorjeta) * 100) / 100;
        const itensJson = JSON.stringify(claims.map(c => ({ itemId: toNum(c.itemId), qtd: toNum(c.qtd) })));
        db.run(
          `INSERT INTO comandas_prontas (token, mesa, cliente_nome, comanda, metodo, valor_itens, valor_servico, valor_gorjeta, valor_total, itens_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`,
          [tok, mesaName, clienteNome, comanda, metodo,
            Math.round(valorItens * 100) / 100, Math.round(valorServico * 100) / 100,
            Math.round(valorGorjeta * 100) / 100, valorTotal, itensJson],
          function (e2) {
            if (e2) return socket.emit('split_erro', { code: 'BANCO', msg: 'Falha ao enviar a comanda.' });
            const id = this.lastID;
            io.emit('comanda_pronta_nova', { id, mesa: mesaName, clienteNome, comanda, metodo, valorTotal });
            io.emit('comanda_pronta_atualizada', { mesa: mesaName });
            socket.emit('comanda_pronta_enviada', { success: true, id, mesa: mesaName });
            registrarAuditoria('Cliente', 'COMANDA_PRONTA',
              `${clienteNome} enviou separação p/ aprovação (${mesaName}) R$ ${valorTotal.toFixed(2)}`, 'Financeiro', 'BAIXO');
          }
        );
      });
    });
  });

  socket.on('listar_comandas_prontas', () => {
    db.all(`SELECT * FROM comandas_prontas WHERE status = 'pendente' ORDER BY id DESC`, [], (err, rows) => {
      const lista = (rows || []).map(r => {
        let itens = [];
        try { itens = JSON.parse(r.itens_json || '[]'); } catch (e) { itens = []; }
        return {
          id: r.id, mesa: r.mesa, clienteNome: r.cliente_nome, comanda: r.comanda,
          metodo: r.metodo || 'Dinheiro',
          valorItens: toNum(r.valor_itens), valorServico: toNum(r.valor_servico),
          valorGorjeta: toNum(r.valor_gorjeta), valorTotal: toNum(r.valor_total),
          itens, criado_em: r.criado_em
        };
      });
      socket.emit('comandas_prontas_lista', { success: true, itens: lista });
    });
  });

  socket.on('aproveitar_comanda_pronta', ({ id, operador }) => {
    const cpId = parseInt(id, 10);
    if (!cpId) return socket.emit('comanda_pronta_resposta', { success: false, msg: 'Comanda inválida.' });

    checkCaixa(turno => {
      if (!turno) {
        return socket.emit('comanda_pronta_resposta', { success: false, msg: 'O caixa está fechado! Abra o caixa para aprovar pagamentos.' });
      }

      db.get(`SELECT * FROM comandas_prontas WHERE id = ? AND status = 'pendente'`, [cpId], (err, cp) => {
        if (err || !cp) return socket.emit('comanda_pronta_resposta', { success: false, msg: 'Esta comanda não está mais pendente.' });
        const mesaName = cp.mesa;
        const metodo = cp.metodo || 'Dinheiro';
        const operadorNome = String(operador || 'Caixa').trim() || 'Caixa';
        const clienteNome = cp.cliente_nome || 'Cliente';
        const comanda = cp.comanda || null;

        let claims = [];
        try { claims = JSON.parse(cp.itens_json || '[]'); } catch (e) { claims = []; }

        const lockKey = `aproveitar_comanda_${cpId}`;
        if (aprovacaoLocks.has(lockKey)) return;
        aprovacaoLocks.add(lockKey);
        setTimeout(() => aprovacaoLocks.delete(lockKey), 1500);

        db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND status NOT IN ('Finalizado','Cancelado') AND total >= 0`, [mesaName, mesaName], (eItens, rows) => {
          const itensMesa = {};
          (rows || []).forEach(r => { itensMesa[r.id] = r; });
          const pagoPorItemOk = {}; // qtd já paga p/ mesmos itens via divisões anteriores

          db.all(`SELECT si.item_id, SUM(si.qtd) AS qtd FROM mesa_split_itens si JOIN mesa_split_pagamentos p ON p.id = si.pagamento_id WHERE p.mesa = ? GROUP BY si.item_id`, [mesaName], (e3, claimsRows) => {
            (claimsRows || []).forEach(c => { pagoPorItemOk[c.item_id] = toNum(c.qtd); });

            let valorItens = 0;
            const validClaims = [];
            claims.forEach(c => {
              const item = itensMesa[c.itemId];
              if (!item) return;
              const qty = toNum(c.qtd);
              if (qty <= 0) return;
              const disponivel = toNum(item.quantity) - (pagoPorItemOk[c.itemId] || 0);
              const qtdOk = Math.min(qty, disponivel);
              if (qtdOk <= 0) return;
              const unitTotal = toNum(item.total) / (toNum(item.quantity) || 1);
              const valor = Math.round(qtdOk * unitTotal * 100) / 100;
              pagoPorItemOk[c.itemId] = (pagoPorItemOk[c.itemId] || 0) + qtdOk;
              validClaims.push({ itemId: c.itemId, qtd: qtdOk, valor });
              valorItens += valor;
            });
            valorItens = Math.round(valorItens * 100) / 100;

            if (validClaims.length === 0) {
              aprovacaoLocks.delete(lockKey);
              return socket.emit('comanda_pronta_resposta', { success: false, msg: 'Nenhum item disponível para aprovar nesta comanda.' });
            }

            const valorServico = toNum(cp.valor_servico);
            const valorGorjeta = toNum(cp.valor_gorjeta);
            const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const insertPedido = (productName, valorNumero) => new Promise((resolve) => {
              db.run(
                `INSERT INTO pedidos (productName, productEmoji, quantity, total, status, localName, mesa_grupo, mesa_comanda, userName, time, sector, createdAt) VALUES (?, '💸', 1, ?, 'Entregue', ?, NULL, ?, ?, ?, 'Caixa', datetime('now', 'localtime'))`,
                [productName, (-Math.abs(valorNumero)).toFixed(2).replace('.', ','), mesaName, comanda, operadorNome, timeStr],
                () => resolve(true));
            });
            const insertMov = (valorNumero, descricao) => new Promise((resolve) => {
              db.run(
                `INSERT INTO movimentacoes (turno_id, tipo, valor, forma_pagamento, descricao, data) VALUES (?, 'Entrada', ?, ?, ?, datetime('now', 'localtime'))`,
                [turno.id, Math.round(valorNumero * 100) / 100, metodo, descricao],
                () => resolve(true));
            });
            const inserirCaixinha = (valor) => new Promise((resolve) => {
              db.run(
                `INSERT INTO caixinha (mesa, comanda, valor, metodo, origem, cliente_nome, descricao, turno_id) VALUES (?, ?, ?, ?, 'gorjeta', ?, ?, ?)`,
                [mesaName, comanda, Math.round(valor * 100) / 100, metodo, clienteNome, `Agradecer ${clienteNome} (${mesaName})`, turno.id],
                () => resolve(true));
            });
            const registraPagamentoHistory = (tipo, valor, obs) => new Promise((resolve) => {
              db.run(
                `INSERT INTO mesa_split_pagamentos (token, mesa, cliente_nome, comanda, valor, tipo, metodo, observacao, turno_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [cp.token, mesaName, clienteNome, comanda, valor, tipo, metodo, obs || null, turno.id],
                function (err2) { resolve(err2 ? null : this.lastID); });
            });

            (async () => {
              // 1. Consumo (itens + serviço 10%)
              if (valorItens + valorServico > 0.001) {
                await insertPedido(`Pgto Separação (${metodo})`, valorItens + valorServico);
                await insertMov(valorItens + valorServico, `Pgto Separação ${clienteNome} (${mesaName})${comanda ? ' - Comanda ' + comanda : ''}${valorServico > 0 ? ' (inclui 10% serviço)' : ''}`);

                const pagId = await registraPagamentoHistory('itens', valorItens + valorServico, null);
                if (pagId) {
                  const stmt = db.prepare(`INSERT INTO mesa_split_itens (pagamento_id, item_id, qtd, valor) VALUES (?, ?, ?, ?)`);
                  validClaims.forEach(c => { stmt.run([pagId, c.itemId, c.qtd, c.valor]); });
                  stmt.finalize();
                }
              }

              // 2. Gorjeta → caixinha
              if (valorGorjeta > 0.001) {
                await insertPedido(`Gorjeta Caixinha (${metodo})`, valorGorjeta);
                await insertMov(valorGorjeta, `Gorjeta Caixinha ${clienteNome} (${mesaName}) - agradecer`);
                await inserirCaixinha(valorGorjeta);
              }

              // 3. Marca como aprovada
              db.run(`UPDATE comandas_prontas SET status='aprovado', operador=?, aprovado_em=datetime('now','localtime') WHERE id=?`, [operadorNome, cpId]);

              // 4. Marca itens como pagos
              const ids = validClaims.map(c => c.itemId);
              if (ids.length > 0) {
                const ph = ids.map(() => '?').join(',');
                db.run(`UPDATE pedidos SET status='Pago', turno_id=? WHERE id IN (${ph})`, [turno.id, ...ids]);
              }

              // 5. Broadcasts
              if (typeof broadcastPedidos === 'function') broadcastPedidos();
              io.emit('itens_mesa_recebidos', { mesaName, items: [] });
              db.all(`SELECT * FROM pedidos WHERE (localName = ? OR mesa_grupo = ?) AND status != 'Finalizado'`, [mesaName, mesaName], (en, rItens) => {
                io.emit('itens_mesa_recebidos', { mesaName, items: rItens || [] });
              });
              setTimeout(() => io.emit('atualizacao_caixa'), 300);
              io.emit('pagamento_parcial_registrado', {
                mesaName, valor: Math.round((valorItens + valorServico + valorGorjeta) * 100) / 100,
                gorjeta: valorGorjeta > 0 ? valorGorjeta : null, excedenteTipo: valorGorjeta > 0 ? 'gorjeta' : null,
                metodo, userName: clienteNome, comandaName: comanda, originSocket: socket.id, origem: 'comanda_pronta'
              });
              if (typeof broadcastMesaClientes === 'function') broadcastMesaClientes();
              registrarAuditoria(operadorNome, 'COMANDA_PRONTA_APROVADA',
                `${clienteNome} aprovado: R$ ${(valorItens + valorServico).toFixed(2)} (${metodo}) + caixinha R$ ${valorGorjeta.toFixed(2)} na ${mesaName}`, 'Financeiro', 'MEDIO');

              io.emit('comanda_pronta_atualizada', { mesa: mesaName });
              socket.emit('comanda_pronta_resposta', { success: true, id: cpId, mesa: mesaName, valorTotal: Math.round((valorItens + valorServico + valorGorjeta) * 100) / 100 });
            })();
          });
        });
      });
    });
  });

  socket.on('recusar_comanda_pronta', ({ id, operador }) => {
    const cpId = parseInt(id, 10);
    if (!cpId) return;
    db.get(`SELECT * FROM comandas_prontas WHERE id = ? AND status='pendente'`, [cpId], (e, cp) => {
      db.run(`UPDATE comandas_prontas SET status='recusado', operador=?, aprovado_em=datetime('now','localtime') WHERE id=?`, [String(operador || 'Caixa').trim() || 'Caixa', cpId], () => {
        io.emit('comanda_pronta_atualizada', { mesa: cp ? cp.mesa : null });
        socket.emit('comanda_pronta_resposta', { success: true, recusada: true, id: cpId });
      });
    });
  });

  socket.on('caixinha_status', () => {
    db.get(`SELECT COALESCE(SUM(valor),0) AS total FROM caixinha`, [], (e, r) => {
      socket.emit('caixinha_status_result', { success: true, total: toNum(r && r.total) });
    });
  });

  socket.on('caixinha_relatorio', () => {
    db.all(`SELECT * FROM caixinha ORDER BY id DESC`, [], (e, rows) => {
      const total = (rows || []).reduce((s, r) => s + toNum(r.valor), 0);
      db.all(`SELECT id, nome, cargo FROM funcionarios WHERE status COLLATE NOCASE = 'Ativo' OR status IS NULL`, [], (e2, funcs) => {
        const lista = funcs || [];
        const divisao = lista.length > 0 ? Math.round((total / lista.length) * 100) / 100 : 0;
        socket.emit('caixinha_relatorio_result', { success: true, total, divisao, funcionarios: lista.map(f => ({ id: f.id, nome: f.nome, cargo: f.cargo })), registros: rows || [] });
      });
    });
  });

};
