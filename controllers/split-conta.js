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

                        socket.emit('split_dados', {
                          success: true,
                          mesa: mesaName,
                          mesa_status: sessao.mesa_status || 'Ocupada',
                          itens: listaItens,
                          pagoPorItem,
                          pagamentos: listaPagos,
                          creditos,
                          configs: {
                            split_excedente: String(cfg.split_excedente || 'perguntar'),
                            qr_pix_key: cfg.qr_pix_key || '',
                            qr_pix_name: cfg.qr_pix_name || '',
                            nome_restaurante: cfg.nome_restaurante || ''
                          }
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
};