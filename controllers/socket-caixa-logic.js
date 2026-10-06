module.exports = function(socket, io, db, helpers) {
  const { getLocalDateOnly, getLocalTimestamp, activePaymentLocks, tenantContext } = helpers || {};

  // --- CAIXA LOGIC ---
  function checkCaixa(callback) {
    db.get(`SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, (err, row) => {
      callback(row);
    });
  }

  socket.on('mp_iniciar_pagamento', ({ valor, metodo }) => {
    db.all(`SELECT * FROM configuracoes`, async (err, rows) => {
      if (err) {
        socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Erro ao carregar configurações.' });
        return;
      }
      const config = {};
      if (rows) rows.forEach(r => config[r.chave] = r.valor);

      const provider = config.mp_provider || 'none';
      if (provider === 'none') {
        socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Nenhuma maquininha configurada. Acesse Configurações → Maquininhas.' });
        return;
      }

      if (mpPollInterval) {
        clearInterval(mpPollInterval);
        mpPollInterval = null;
      }

      // ===================================================
      // PROVEDOR: MERCADO PAGO POINT
      // ===================================================
      if (provider === 'mercadopago') {
        const token = config.mp_access_token;
        const deviceId = config.mp_device_id;
        if (!token || !deviceId) {
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Mercado Pago não configurado. Verifique Access Token e Device ID.' });
          return;
        }
        try {
          const idempotencyKey = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          const response = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${deviceId}/payment-intents`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify({
              amount: parseFloat(valor),
              description: 'Pagamento PDV - Chef Cozinha',
              payment: {
                installments: 1,
                type: metodo === 'Cartão de Débito' ? 'debit_card' : 'credit_card'
              }
            })
          });
          const data = await response.json();
          if (!response.ok || !data.id) {
            socket.emit('mp_status_pagamento', { status: 'failed', msg: data.message || 'Falha ao criar cobrança na maquininha.' });
            return;
          }
          mpCurrentIntentId = data.id;
          mpCurrentDeviceId = deviceId;
          socket.emit('mp_status_pagamento', { status: 'processando', intentId: data.id, msg: '🔵 Cobrança enviada! Aguardando cartão na Maquininha Mercado Pago...' });
          let elapsedSeconds = 0;
          mpPollInterval = setInterval(async () => {
            elapsedSeconds += 2;
            if (elapsedSeconds > 180) {
              clearInterval(mpPollInterval); mpPollInterval = null;
              socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Tempo limite esgotado. Transação cancelada.' });
              return;
            }
            try {
              const statusResponse = await fetch(`https://api.mercadopago.com/point/integration-api/payment-intents/${mpCurrentIntentId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                if (statusData.status === 'finished') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'aprovado', payment: statusData, msg: 'Pagamento aprovado com sucesso!' });
                } else if (statusData.status === 'canceled' || statusData.status === 'expired') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'failed', msg: `Pagamento ${statusData.status === 'canceled' ? 'cancelado' : 'expirado'} na maquininha.` });
                }
              }
            } catch (pollErr) { console.error('[MP] Polling error:', pollErr); }
          }, 2000);
        } catch (apiErr) {
          console.error('[Mercado Pago] Erro:', apiErr);
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Erro de conexão com o Mercado Pago.' });
        }
        return;
      }

      // ===================================================
      // PROVEDOR: STONE / TON (TEF LOCAL)
      // ===================================================
      if (provider === 'stone') {
        const stoneCode = config.stone_stonecode;
        const stonePorta = config.stone_porta || '8080';
        if (!stoneCode) {
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Stone não configurado. Verifique o Stone Code.' });
          return;
        }
        try {
          const modalidade = metodo === 'Cartão de Débito' ? 2 : 3;
          const response = await fetch(`http://localhost:${stonePorta}/charge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: Math.round(parseFloat(valor) * 100),
              payment_type: modalidade,
              installments: 1,
              stone_code: stoneCode,
              description: 'Chef Cozinha PDV'
            }),
            signal: AbortSignal.timeout(10000)
          });
          const data = await response.json();
          if (!response.ok || data.error) {
            socket.emit('mp_status_pagamento', { status: 'failed', msg: data.message || data.error || 'Falha ao enviar cobrança para Stone Client.' });
            return;
          }
          const transactionId = data.transaction_id || data.id;
          socket.emit('mp_status_pagamento', { status: 'processando', intentId: transactionId, msg: '🟢 Cobrança enviada! Aguardando cartão na maquininha Stone...' });
          let stoneElapsed = 0;
          mpPollInterval = setInterval(async () => {
            stoneElapsed += 3;
            if (stoneElapsed > 180) {
              clearInterval(mpPollInterval); mpPollInterval = null;
              socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Tempo limite esgotado. Verifique a maquininha Stone.' });
              return;
            }
            try {
              const statusResp = await fetch(`http://localhost:${stonePorta}/charge/${transactionId}`, { signal: AbortSignal.timeout(5000) });
              if (statusResp.ok) {
                const sd = await statusResp.json();
                const st = (sd.status || '').toLowerCase();
                if (st === 'approved' || st === 'confirmed' || st === 'success') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'aprovado', payment: sd, msg: '✅ Pagamento Stone aprovado!' });
                } else if (st === 'failed' || st === 'denied' || st === 'canceled') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'failed', msg: `Pagamento ${st} na maquininha Stone.` });
                }
              }
            } catch (e) { console.error('[Stone] Polling error:', e); }
          }, 3000);
        } catch (stoneErr) {
          console.error('[Stone] Erro:', stoneErr);
          socket.emit('mp_status_pagamento', { status: 'failed', msg: `Erro ao conectar com Stone Client TEF na porta ${config.stone_porta || 8080}. Verifique se o Stone Client está rodando.` });
        }
        return;
      }

      // ===================================================
      // PROVEDOR: PAGBANK / PAGSEGURO
      // ===================================================
      if (provider === 'pagbank') {
        const pgToken = config.pagbank_token;
        const pgTerminal = config.pagbank_terminal;
        if (!pgToken || !pgTerminal) {
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'PagBank não configurado. Verifique Token e Terminal ID.' });
          return;
        }
        try {
          const paymentType = metodo === 'Cartão de Débito' ? 'DEBIT_CARD' : 'CREDIT_CARD';
          const response = await fetch('https://api.pagseguro.com/terminal/v1/payments', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${pgToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              terminal_id: pgTerminal,
              payment_method: { type: paymentType, installments: 1 },
              amount: { value: Math.round(parseFloat(valor) * 100), currency: 'BRL' },
              description: 'Chef Cozinha PDV'
            })
          });
          const data = await response.json();
          if (!response.ok || !data.id) {
            const errMsg = data.message || (data.error_messages && data.error_messages[0] && data.error_messages[0].description) || 'Falha ao criar cobrança no PagBank.';
            socket.emit('mp_status_pagamento', { status: 'failed', msg: errMsg });
            return;
          }
          const pgPaymentId = data.id;
          socket.emit('mp_status_pagamento', { status: 'processando', intentId: pgPaymentId, msg: '🟠 Cobrança enviada! Aguardando cartão na maquininha PagBank...' });
          let pgElapsed = 0;
          mpPollInterval = setInterval(async () => {
            pgElapsed += 3;
            if (pgElapsed > 180) {
              clearInterval(mpPollInterval); mpPollInterval = null;
              socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Tempo limite esgotado. Verifique a maquininha PagBank.' });
              return;
            }
            try {
              const statusResp = await fetch(`https://api.pagseguro.com/terminal/v1/payments/${pgPaymentId}`, {
                headers: { 'Authorization': `Bearer ${pgToken}` }
              });
              if (statusResp.ok) {
                const sd = await statusResp.json();
                const st = (sd.status || '').toUpperCase();
                if (st === 'PAID' || st === 'AUTHORIZED' || st === 'COMPLETED') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'aprovado', payment: sd, msg: '✅ Pagamento PagBank aprovado!' });
                } else if (st === 'DECLINED' || st === 'CANCELED' || st === 'ERROR') {
                  clearInterval(mpPollInterval); mpPollInterval = null;
                  socket.emit('mp_status_pagamento', { status: 'failed', msg: `Pagamento ${st} na maquininha PagBank.` });
                }
              }
            } catch (e) { console.error('[PagBank] Polling error:', e); }
          }, 3000);
        } catch (pgErr) {
          console.error('[PagBank] Erro:', pgErr);
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Erro de conexão com API do PagBank.' });
        }
        return;
      }

      // ===================================================
      // PROVEDOR: SiTef GENÉRICO (TCP/IP)
      // ===================================================
      if (provider === 'sitef') {
        const sitefIp = config.sitef_ip;
        const sitefPorta = parseInt(config.sitef_porta || '4096');
        const sitefTerminal = config.sitef_terminal;
        const sitefEstab = config.sitef_estabelecimento;
        if (!sitefIp || !sitefTerminal) {
          socket.emit('mp_status_pagamento', { status: 'failed', msg: 'SiTef não configurado. Verifique IP e Número do Terminal.' });
          return;
        }
        const net = require('net');
        const modalidade = metodo === 'Cartão de Débito' ? '02' : '03';
        const valorCentavos = String(Math.round(parseFloat(valor) * 100)).padStart(12, '0');
        const terminal = (sitefTerminal).padEnd(8, ' ').substring(0, 8);
        const estab = (sitefEstab || '00000000').padEnd(16, ' ').substring(0, 16);
        const msgPayload = `0001${String(42).padStart(4, '0')}${terminal}${estab}${modalidade}${valorCentavos}`;
        const msgLen = String(msgPayload.length).padStart(4, '0');
        const fullMsg = `${msgLen}${msgPayload}`;
        socket.emit('mp_status_pagamento', { status: 'processando', msg: '⚙️ Enviando cobrança para servidor SiTef...' });
        const client = new net.Socket();
        let sitefBuf = '';
        client.setTimeout(90000);
        client.connect(sitefPorta, sitefIp, () => { client.write(Buffer.from(fullMsg, 'utf8')); });
        client.on('data', (data) => {
          sitefBuf += data.toString('utf8');
          if (sitefBuf.length >= 4) {
            const respLen = parseInt(sitefBuf.substring(0, 4));
            if (sitefBuf.length >= 4 + respLen) {
              client.destroy();
              const response = sitefBuf.substring(4);
              const resultCode = response.substring(0, 4).trim();
              if (resultCode === '0000' || resultCode === '000') {
                socket.emit('mp_status_pagamento', { status: 'aprovado', payment: { raw: response }, msg: '✅ Pagamento SiTef aprovado!' });
              } else {
                socket.emit('mp_status_pagamento', { status: 'failed', msg: `Transação SiTef recusada. Código: ${resultCode}` });
              }
            }
          }
        });
        client.on('timeout', () => { client.destroy(); socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Timeout SiTef. Servidor SiTef inacessível.' }); });
        client.on('error', (err) => { socket.emit('mp_status_pagamento', { status: 'failed', msg: `Erro SiTef: ${err.message}` }); });
        return;
      }

      socket.emit('mp_status_pagamento', { status: 'failed', msg: `Provedor desconhecido: ${provider}` });
    });
  });

  socket.on('mp_cancelar_pagamento', () => {
    if (mpPollInterval) {
      clearInterval(mpPollInterval);
      mpPollInterval = null;
    }

    if (!mpCurrentIntentId || !mpCurrentDeviceId) {
      socket.emit('mp_status_pagamento', { status: 'failed', msg: 'Nenhuma transação activa para cancelar.' });
      return;
    }

    db.all(`SELECT * FROM configuracoes`, async (err, rows) => {
      if (err) return;
      const config = {};
      if (rows) rows.forEach(r => config[r.chave] = r.valor);
      const token = config.mp_access_token;

      if (token) {
        try {
          await fetch(`https://api.mercadopago.com/point/integration-api/devices/${mpCurrentDeviceId}/payment-intents/${mpCurrentIntentId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
        } catch (cancelErr) {
          console.error('[Mercado Pago] Erro ao cancelar intent:', cancelErr);
        }
      }

      socket.emit('mp_status_pagamento', { status: 'cancelado', msg: 'Cobrança cancelada pelo operador.' });
      mpCurrentIntentId = null;
      mpCurrentDeviceId = null;
    });
  });

  // Dashboard Stats
  socket.on('get_dashboard_stats', () => {
    const stats = {};
    const today = getLocalDateOnly();
    const firstDayOfMonth = getLocalDateOnly().slice(0, 8) + '01'; // YYYY-MM-01

    let queries = 0;
    const checkDone = () => {
      queries--;
      if (queries === 0) {
        if (stats.pedidosHoje > 0) {
          stats.ticketMedio = stats.faturamentoHoje / stats.pedidosHoje;
        } else {
          stats.ticketMedio = 0;
        }
        const dayOfMonth = parseInt(today.slice(8, 10));
        const year = parseInt(today.slice(0, 4));
        const month = parseInt(today.slice(5, 7));
        const totalDaysInMonth = new Date(year, month, 0).getDate();
        stats.diasTranscorridos = dayOfMonth;
        stats.diasTotalMes = totalDaysInMonth;
        stats.projecaoMensal = dayOfMonth > 0 ? (stats.faturamentoMensal / dayOfMonth) * totalDaysInMonth : 0;
        socket.emit('dashboard_stats_result', stats);
      }
    };

    queries++;
    // Faturamento Hoje (from movimentacoes of type Entrada today)
    db.get(`SELECT SUM(valor) as fatHoje FROM movimentacoes WHERE tipo='Entrada' AND date(data) = ?`, [today], (err, row) => {
      stats.faturamentoHoje = row ? row.fatHoje || 0 : 0;
      checkDone();
    });

    queries++;
    // Faturamento Mensal (from movimentacoes of type Entrada this month)
    db.get(`SELECT SUM(valor) as fatMensal FROM movimentacoes WHERE tipo='Entrada' AND date(data) >= ?`, [firstDayOfMonth], (err, row) => {
      stats.faturamentoMensal = row ? row.fatMensal || 0 : 0;
      checkDone();
    });

    queries++;
    // Pedidos Hoje (count from pedidos where createdAt is today, sem linhas de pagamento)
    db.get(`SELECT count(DISTINCT time || localName) as qtdPedidos FROM pedidos WHERE date(createdAt) = ? AND status='Finalizado' AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%'`, [today], (err, row) => {
      stats.pedidosHoje = row ? row.qtdPedidos || 0 : 0;
      checkDone();
    });

    queries++;
    // Vendas por dia (últimos 7 dias)
    db.all(`SELECT date(data) as d, SUM(valor) as total FROM movimentacoes WHERE tipo='Entrada' GROUP BY date(data) ORDER BY date(data) DESC LIMIT 7`, (err, rows) => {
      stats.vendasDias = rows ? rows.reverse() : [];
      checkDone();
    });

    queries++;
    // Receitas e Despesas (Mês Atual)
    db.all(`SELECT tipo, SUM(valor) as total FROM movimentacoes WHERE date(data) >= ? GROUP BY tipo`, [firstDayOfMonth], (err, rows) => {
      stats.receitasDespesas = rows || [];
      checkDone();
    });

    queries++;
    // Produtos Mais Vendidos (All time, top 5, sem linhas de pagamento)
    db.all(`SELECT productName, SUM(quantity) as qty FROM pedidos WHERE status='Finalizado' AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%' GROUP BY productName ORDER BY qty DESC LIMIT 5`, (err, rows) => {
      stats.produtosPopulares = rows || [];
      checkDone();
    });

    queries++;
    // Categorias mais vendidas (All time, top 5)
    db.all(`SELECT p.categoria, SUM(pd.quantity) as qty FROM pedidos pd JOIN produtos p ON pd.productName = p.nome WHERE pd.status='Finalizado' AND p.categoria IS NOT NULL GROUP BY p.categoria ORDER BY qty DESC LIMIT 5`, (err, rows) => {
      stats.categoriasPopulares = rows || [];
      checkDone();
    });

    queries++;
    // Formas de pagamento
    db.all(`SELECT forma_pagamento, COUNT(*) as qty FROM movimentacoes WHERE tipo='Entrada' GROUP BY forma_pagamento`, (err, rows) => {
      stats.formasPagamento = rows || [];
      checkDone();
    });

    queries++;
    // Entregas por entregador
    db.all(`SELECT f.nome as entregador, COUNT(DISTINCT pd.time || pd.localName) as entregas FROM pedidos pd JOIN funcionarios f ON pd.entregador_id = f.id WHERE pd.status='Finalizado' GROUP BY pd.entregador_id ORDER BY entregas DESC LIMIT 5`, (err, rows) => {
      stats.entregadores = rows || [];
      checkDone();
    });

    queries++;
    // Clientes top
    db.all(`SELECT c.nome, COUNT(DISTINCT pd.time || pd.localName) as pedidos, SUM(CAST(pd.total AS REAL)) as gasto FROM pedidos pd JOIN clientes c ON pd.cliente_id = c.id WHERE pd.status='Finalizado' GROUP BY pd.cliente_id ORDER BY gasto DESC LIMIT 5`, (err, rows) => {
      stats.topClientes = rows || [];
      checkDone();
    });
  });

  socket.on('reservar_mesa', ({ mesaName, observacao, cliente, telefone }) => {
    db.run(`UPDATE mesas SET status = 'Reservada', observacao = ? WHERE nome = ?`, [observacao, mesaName], () => {
      const finalizar = () => {
        if (cliente) {
          db.run(
            `INSERT INTO mesa_clientes (mesa, cliente_id, cliente_nome, cliente_telefone, updated_at)
             VALUES (?, NULL, ?, ?, datetime('now','localtime'))
             ON CONFLICT(mesa) DO UPDATE SET
               cliente_nome = excluded.cliente_nome,
               cliente_telefone = COALESCE(NULLIF(excluded.cliente_telefone,''), cliente_telefone),
               updated_at = datetime('now','localtime')`,
            [mesaName, cliente, telefone || ''], () => {
              broadcastMesaClientes();
              db.all(`SELECT * FROM mesas`, (err, rows) => io.emit('mesas_atualizadas', rows || []));
            });
        } else {
          db.all(`SELECT * FROM mesas`, (err, rows) => io.emit('mesas_atualizadas', rows || []));
        }
      };
      if (cliente && telefone) {
        db.get(`SELECT id FROM clientes WHERE telefone = ?`, [telefone], (err, row) => {
          if (row) {
            db.run(`UPDATE clientes SET nome = ? WHERE id = ?`, [cliente, row.id], () => finalizar());
          } else {
            db.run(`INSERT INTO clientes (nome, telefone, observacao, endereco, data_nascimento, pontos) VALUES (?, ?, '', '', '', 0)`,
              [cliente, telefone], () => finalizar());
          }
        });
      } else if (cliente) {
        db.get(`SELECT id FROM clientes WHERE nome = ? ORDER BY id DESC LIMIT 1`, [cliente], (err, row) => {
          if (!row) {
            db.run(`INSERT INTO clientes (nome, telefone, observacao, endereco, data_nascimento, pontos) VALUES (?, '', '', '', '', 0)`,
              [cliente], () => finalizar());
          } else {
            finalizar();
          }
        });
      } else {
        finalizar();
      }
    });
  });

  socket.on('cancelar_reserva', ({ mesaName }) => {
    db.run(`UPDATE mesas SET status = 'Disponível', observacao = '' WHERE nome = ?`, [mesaName], () => {
      db.run(`DELETE FROM mesa_clientes WHERE mesa = ?`, [mesaName], () => broadcastMesaClientes());
      db.all(`SELECT * FROM mesas`, (err, rows) => io.emit('mesas_atualizadas', rows || []));
    });
  });

};
