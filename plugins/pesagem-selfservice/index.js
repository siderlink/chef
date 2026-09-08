/**
 * Backend do Módulo de Pesagem Automática & Autoatendimento Buffet
 * Suporte a Web Serial API, Totem Touch, Antifraude de Tickets, Integração Fiscal e Relatórios XLSX
 */
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

module.exports = function ({ app, db, io, log }) {
  log('Módulo de Pesagem Automática & Buffet inicializado com sucesso.');

  const configFile = path.join(__dirname, 'config.json');

  // Inicializa tabela SQLite de pesagens se não existir
  if (db && typeof db.run === 'function') {
    db.run(`
      CREATE TABLE IF NOT EXISTS pesagens (
        id TEXT PRIMARY KEY,
        timestamp DATETIME DEFAULT (datetime('now', 'localtime')),
        modo TEXT DEFAULT 'peso',
        peso_bruto REAL DEFAULT 0,
        tara REAL DEFAULT 0,
        peso_liquido REAL DEFAULT 0,
        preco_kg REAL DEFAULT 0,
        valor_total REAL DEFAULT 0,
        descricao TEXT,
        comanda_id TEXT,
        mesa_id TEXT,
        cliente_nome TEXT,
        status TEXT DEFAULT 'pendente',
        produto_id INTEGER,
        usado_em DATETIME,
        turno_id INTEGER
      )
    `, (err) => {
      if (err) log(`[Pesagem] Erro ao criar tabela pesagens: ${err.message}`);
      else log('[Pesagem] Tabela pesagens verificada e pronta.');
    });
  }

  function carregarConfig() {
    const padrao = {
      precoKg: 69.90,
      precoLivre: 35.00,
      taraPratoKg: 0.450,
      modoPadrao: 'peso', // 'peso' | 'livre' | 'hibrido'
      autoImprimirTicket: true,
      segundosAutoImprimir: 2,
      exigirQrComanda: false,
      nomeProdutoBalanca: 'Buffet por Quilo',
      nomeProdutoLivre: 'Buffet Livre',
      produtoQuiloId: null,
      produtoLivreId: null,
      balancaProtocolo: 'toledo_prix3', // 'toledo_prix3' | 'filizola' | 'elgin' | 'urano'
      balancaBaudRate: 9600
    };
    if (fs.existsSync(configFile)) {
      try {
        const salvos = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        return Object.assign(padrao, salvos);
      } catch (e) {}
    }
    return padrao;
  }

  function salvarConfig(cfg) {
    fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2), 'utf8');
  }

  // 1. Obter configurações de pesagem
  app.get('/api/modulo/pesagem-selfservice/config', (req, res) => {
    try {
      res.json({ sucesso: true, config: carregarConfig() });
    } catch (e) {
      res.status(500).json({ sucesso: false, error: e.message });
    }
  });

  // 2. Salvar configurações de pesagem
  app.post('/api/modulo/pesagem-selfservice/config', (req, res) => {
    try {
      const cfg = carregarConfig();
      if (req.body.precoKg !== undefined) cfg.precoKg = parseFloat(req.body.precoKg) || 0;
      if (req.body.precoLivre !== undefined) cfg.precoLivre = parseFloat(req.body.precoLivre) || 0;
      if (req.body.taraPratoKg !== undefined) cfg.taraPratoKg = parseFloat(req.body.taraPratoKg) || 0;
      if (req.body.modoPadrao !== undefined) cfg.modoPadrao = req.body.modoPadrao;
      if (req.body.autoImprimirTicket !== undefined) cfg.autoImprimirTicket = !!req.body.autoImprimirTicket;
      if (req.body.segundosAutoImprimir !== undefined) cfg.segundosAutoImprimir = parseInt(req.body.segundosAutoImprimir) || 2;
      if (req.body.exigirQrComanda !== undefined) cfg.exigirQrComanda = !!req.body.exigirQrComanda;
      if (req.body.nomeProdutoBalanca !== undefined) cfg.nomeProdutoBalanca = String(req.body.nomeProdutoBalanca).trim();
      if (req.body.nomeProdutoLivre !== undefined) cfg.nomeProdutoLivre = String(req.body.nomeProdutoLivre).trim();
      if (req.body.produtoQuiloId !== undefined) cfg.produtoQuiloId = req.body.produtoQuiloId ? parseInt(req.body.produtoQuiloId) : null;
      if (req.body.produtoLivreId !== undefined) cfg.produtoLivreId = req.body.produtoLivreId ? parseInt(req.body.produtoLivreId) : null;
      if (req.body.balancaProtocolo !== undefined) cfg.balancaProtocolo = req.body.balancaProtocolo;
      if (req.body.balancaBaudRate !== undefined) cfg.balancaBaudRate = parseInt(req.body.balancaBaudRate) || 9600;

      salvarConfig(cfg);
      log(`[Pesagem] Configurações atualizadas: R$ ${cfg.precoKg}/kg | Livre R$ ${cfg.precoLivre} | Tara ${cfg.taraPratoKg}kg`);
      res.json({ sucesso: true, config: cfg });
    } catch (e) {
      res.status(500).json({ sucesso: false, error: e.message });
    }
  });

  // 3. Registrar Pesagem (pelo Totem, Balança Serial ou Caixa)
  app.post('/api/modulo/pesagem-selfservice/pesar', (req, res) => {
    try {
      const { pesoBruto, modo, comandaId, mesaId, clienteNome, turnoId } = req.body;
      const cfg = carregarConfig();

      let pesoLiquido = 0;
      let valorTotal = 0;
      let descricaoItem = '';
      let produtoId = null;

      if (modo === 'livre') {
        valorTotal = cfg.precoLivre;
        descricaoItem = `${cfg.nomeProdutoLivre} (R$ ${cfg.precoLivre.toFixed(2)})`;
        produtoId = cfg.produtoLivreId || null;
      } else {
        const bruto = parseFloat(pesoBruto) || 0;
        pesoLiquido = Math.max(0, bruto - cfg.taraPratoKg);
        valorTotal = parseFloat((pesoLiquido * cfg.precoKg).toFixed(2));
        descricaoItem = `${cfg.nomeProdutoBalanca} (${pesoLiquido.toFixed(3)}kg @ R$ ${cfg.precoKg.toFixed(2)}/kg)`;
        produtoId = cfg.produtoQuiloId || null;
      }

      const id = 'PESO-' + Date.now().toString().slice(-6);
      const isDiretoConta = !!(comandaId || mesaId);
      const statusInicial = isDiretoConta ? 'utilizado' : 'pendente';
      const cNome = clienteNome || (comandaId ? `Comanda #${comandaId}` : (mesaId ? `Mesa #${mesaId}` : 'Cliente Avulso'));

      // Inserir registro na tabela pesagens
      if (db && typeof db.run === 'function') {
        db.run(
          `INSERT INTO pesagens (
            id, modo, peso_bruto, tara, peso_liquido, preco_kg, valor_total,
            descricao, comanda_id, mesa_id, cliente_nome, status, produto_id,
            usado_em, turno_id, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
          [
            id,
            modo || 'peso',
            parseFloat(pesoBruto) || 0,
            cfg.taraPratoKg,
            parseFloat(pesoLiquido.toFixed(3)),
            cfg.precoKg,
            valorTotal,
            descricaoItem,
            comandaId || null,
            mesaId || null,
            cNome,
            statusInicial,
            produtoId,
            isDiretoConta ? new Date().toISOString() : null,
            turnoId || null
          ],
          function (err) {
            if (err) log(`[Pesagem] Erro ao gravar pesagem: ${err.message}`);
          }
        );

        // Se houver comanda ou mesa especificada, lança diretamente na tabela pedidos
        if (isDiretoConta) {
          const localAlvo = comandaId ? `Comanda ${comandaId.toString().replace(/comanda\s*/i, '')}` : `Mesa ${mesaId.toString().replace(/mesa\s*/i, '')}`;
          const horaFormatada = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

          db.run(
            `INSERT INTO pedidos (
              productName, productEmoji, quantity, total, status, localName,
              userName, time, sector, createdAt
            ) VALUES (?, '⚖️', 1, ?, 'Entregue', ?, 'Totem Balança', ?, 'Buffet', datetime('now', 'localtime'))`,
            [descricaoItem, valorTotal.toFixed(2), localAlvo, horaFormatada],
            function (errPed) {
              if (errPed) {
                log(`[Pesagem] Erro ao inserir item na conta: ${errPed.message}`);
              } else {
                const pedidoId = this.lastID;
                log(`[Pesagem] Item lançado com sucesso na conta ${localAlvo} (Pedido #${pedidoId})`);
                if (io) {
                  io.emit('novo_pedido', {
                    id: pedidoId,
                    productName: descricaoItem,
                    productEmoji: '⚖️',
                    quantity: 1,
                    total: valorTotal.toFixed(2),
                    status: 'Entregue',
                    localName: localAlvo,
                    sector: 'Buffet',
                    time: horaFormatada
                  });
                  io.emit('pedido_atualizado', { localName: localAlvo });
                }
              }
            }
          );
        }
      }

      const registro = {
        id,
        timestamp: new Date().toISOString(),
        modo: modo || 'peso',
        pesoBruto: parseFloat(pesoBruto) || 0,
        tara: cfg.taraPratoKg,
        pesoLiquido: parseFloat(pesoLiquido.toFixed(3)),
        precoKg: cfg.precoKg,
        valorTotal,
        descricaoItem,
        comandaId: comandaId || null,
        mesaId: mesaId || null,
        clienteNome: cNome,
        status: statusInicial
      };

      // Notificar todas as telas conectadas via Socket.io
      if (io) {
        io.emit('pesagem_realizada', registro);
      }

      log(`[Pesagem] Registrada: ${registro.id} - ${descricaoItem} -> R$ ${valorTotal.toFixed(2)} [${statusInicial}]`);

      res.json({
        sucesso: true,
        registro,
        ticketQr: `PESO|${registro.id}|${registro.valorTotal}|${registro.pesoLiquido}`
      });
    } catch (e) {
      res.status(500).json({ sucesso: false, error: e.message });
    }
  });

  // 4. Consultar detalhes de um ticket
  app.get('/api/modulo/pesagem-selfservice/ticket/:id', (req, res) => {
    const ticketId = (req.params.id || '').toUpperCase().trim();
    if (!db || typeof db.get !== 'function') {
      return res.status(500).json({ sucesso: false, error: 'Banco de dados indisponível.' });
    }

    db.get('SELECT * FROM pesagens WHERE id = ?', [ticketId], (err, row) => {
      if (err) return res.status(500).json({ sucesso: false, error: err.message });
      if (!row) return res.status(404).json({ sucesso: false, error: 'Ticket não encontrado.' });
      res.json({ sucesso: true, ticket: row });
    });
  });

  // 5. Validar e Resgatar Ticket no Caixa (Antifraude com uso único)
  app.post('/api/modulo/pesagem-selfservice/ticket/:id/resgatar', (req, res) => {
    const rawId = (req.params.id || '').trim();
    // Suporta código direto ou payload completo do QR (ex: PESO|PESO-123456|35.00)
    let ticketId = rawId;
    if (rawId.includes('|')) {
      const parts = rawId.split('|');
      ticketId = parts[1] || parts[0];
    }
    ticketId = ticketId.toUpperCase().trim();

    if (!db || typeof db.get !== 'function') {
      return res.status(500).json({ sucesso: false, error: 'Banco de dados indisponível.' });
    }

    db.get('SELECT * FROM pesagens WHERE id = ?', [ticketId], (err, row) => {
      if (err) return res.status(500).json({ sucesso: false, error: err.message });
      if (!row) {
        return res.status(404).json({
          sucesso: false,
          error: `Ticket ${ticketId} não localizado no sistema.`
        });
      }

      if (row.status === 'utilizado') {
        return res.status(409).json({
          sucesso: false,
          jaUtilizado: true,
          error: `⚠️ ATENÇÃO: O ticket ${ticketId} já foi utilizado em ${row.usado_em || 'momento anterior'}!`,
          ticket: row
        });
      }

      if (row.status === 'cancelado') {
        return res.status(400).json({
          sucesso: false,
          error: `O ticket ${ticketId} foi cancelado e não pode ser resgatado.`,
          ticket: row
        });
      }

      // Marcar como utilizado
      const agora = new Date().toISOString();
      db.run(
        `UPDATE pesagens SET status = 'utilizado', usado_em = ? WHERE id = ?`,
        [agora, ticketId],
        function (errUpd) {
          if (errUpd) return res.status(500).json({ sucesso: false, error: errUpd.message });

          row.status = 'utilizado';
          row.usado_em = agora;

          if (io) {
            io.emit('ticket_resgatado', row);
          }

          log(`[Pesagem] Ticket ${ticketId} RESGATADO com sucesso no Caixa (R$ ${row.valor_total.toFixed(2)})`);

          res.json({
            sucesso: true,
            mensagem: `Ticket ${ticketId} validado e liberado com sucesso!`,
            ticket: row
          });
        }
      );
    });
  });

  // 6. Relatório Analítico de Pesagens
  app.get('/api/modulo/pesagem-selfservice/relatorio', (req, res) => {
    if (!db || typeof db.all !== 'function') {
      return res.status(500).json({ sucesso: false, error: 'Banco indisponível.' });
    }

    const { periodo, data } = req.query;
    let whereClause = "WHERE 1=1";
    let params = [];

    if (data) {
      whereClause += " AND date(timestamp) = date(?)";
      params.push(data);
    } else if (periodo === 'hoje' || !periodo) {
      whereClause += " AND date(timestamp) = date('now', 'localtime')";
    } else if (periodo === '7dias') {
      whereClause += " AND timestamp >= datetime('now', '-7 days', 'localtime')";
    } else if (periodo === 'mes') {
      whereClause += " AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now', 'localtime')";
    }

    const sqlResumo = `
      SELECT
        COUNT(*) as totalPratos,
        COALESCE(SUM(peso_liquido), 0) as totalKg,
        COALESCE(SUM(CASE WHEN modo = 'peso' THEN valor_total ELSE 0 END), 0) as faturamentoQuilo,
        COALESCE(SUM(CASE WHEN modo = 'livre' THEN valor_total ELSE 0 END), 0) as faturamentoLivre,
        COALESCE(SUM(valor_total), 0) as faturamentoTotal,
        COALESCE(SUM(CASE WHEN status = 'pendente' THEN 1 ELSE 0 END), 0) as ticketsPendentes,
        COALESCE(SUM(CASE WHEN status = 'utilizado' THEN 1 ELSE 0 END), 0) as ticketsUtilizados
      FROM pesagens ${whereClause}
    `;

    const sqlLista = `
      SELECT * FROM pesagens ${whereClause}
      ORDER BY timestamp DESC LIMIT 150
    `;

    db.get(sqlResumo, params, (err1, resumo) => {
      if (err1) return res.status(500).json({ sucesso: false, error: err1.message });

      db.all(sqlLista, params, (err2, lista) => {
        if (err2) return res.status(500).json({ sucesso: false, error: err2.message });

        const pesoMedio = resumo.totalPratos > 0 ? (resumo.totalKg / resumo.totalPratos) : 0;
        const ticketMedioValor = resumo.totalPratos > 0 ? (resumo.faturamentoTotal / resumo.totalPratos) : 0;

        res.json({
          sucesso: true,
          resumo: {
            ...resumo,
            pesoMedioPrato: parseFloat(pesoMedio.toFixed(3)),
            ticketMedioValor: parseFloat(ticketMedioValor.toFixed(2))
          },
          pesagens: lista
        });
      });
    });
  });

  // 7. Exportar Pesagens para Excel (XLSX)
  app.get('/api/modulo/pesagem-selfservice/exportar-excel', (req, res) => {
    if (!db || typeof db.all !== 'function') {
      return res.status(500).json({ sucesso: false, error: 'Banco indisponível.' });
    }

    const { periodo, data } = req.query;
    let whereClause = "WHERE 1=1";
    let params = [];

    if (data) {
      whereClause += " AND date(timestamp) = date(?)";
      params.push(data);
    } else if (periodo === 'hoje' || !periodo) {
      whereClause += " AND date(timestamp) = date('now', 'localtime')";
    } else if (periodo === '7dias') {
      whereClause += " AND timestamp >= datetime('now', '-7 days', 'localtime')";
    } else if (periodo === 'mes') {
      whereClause += " AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now', 'localtime')";
    }

    db.all(`SELECT * FROM pesagens ${whereClause} ORDER BY timestamp DESC`, params, (err, rows) => {
      if (err) return res.status(500).json({ sucesso: false, error: err.message });

      try {
        const dadosFormatados = rows.map(r => ({
          'Código': r.id,
          'Data / Hora': r.timestamp,
          'Modo': r.modo === 'livre' ? 'Buffet Livre' : 'Por Quilo',
          'Peso Bruto (kg)': r.peso_bruto ? r.peso_bruto.toFixed(3) : '0.000',
          'Tara (kg)': r.tara ? r.tara.toFixed(3) : '0.000',
          'Peso Líquido (kg)': r.peso_liquido ? r.peso_liquido.toFixed(3) : '0.000',
          'Preço / Kg (R$)': r.preco_kg ? r.preco_kg.toFixed(2) : '0.00',
          'Valor Total (R$)': r.valor_total ? r.valor_total.toFixed(2) : '0.00',
          'Status': r.status ? r.status.toUpperCase() : 'PENDENTE',
          'Comanda / Mesa': r.comanda_id ? `Comanda #${r.comanda_id}` : (r.mesa_id ? `Mesa #${r.mesa_id}` : 'Avulso'),
          'Usado em': r.usado_em || '-'
        }));

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(dadosFormatados);
        xlsx.utils.book_append_sheet(wb, ws, 'Pesagens_Buffet');

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const filename = `Pesagens_ChefCozinha_${new Date().toISOString().slice(0, 10)}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
      } catch (errXlsx) {
        res.status(500).json({ sucesso: false, error: errXlsx.message });
      }
    });
  });

  // 8. Obter Produtos do Cardápio para Vinculação Fiscal (NFC-e)
  app.get('/api/modulo/pesagem-selfservice/produtos-fiscais', (req, res) => {
    if (!db || typeof db.all !== 'function') {
      return res.status(500).json({ sucesso: false, error: 'Banco indisponível.' });
    }

    db.all(
      `SELECT id, nome, preco, categoria, unidade, categoria_fiscal FROM produtos WHERE status = 'ativo' ORDER BY nome ASC`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ sucesso: false, error: err.message });
        res.json({ sucesso: true, produtos: rows || [] });
      }
    );
  });

  // 9. Servir a página do Totem de Pesagem
  app.get('/plugins/pesagem-selfservice/totem', (req, res) => {
    res.sendFile(path.join(__dirname, 'totem.html'));
  });

  // 10. Servir a página de Relatórios de Pesagem
  app.get('/plugins/pesagem-selfservice/relatorio', (req, res) => {
    res.sendFile(path.join(__dirname, 'relatorio.html'));
  });
};
