/**
 * Backend do Módulo de Pesagem Automática & Autoatendimento Buffet
 * Suporte a Web Serial API, Totem Touch, Antifraude de Tickets, Integração Fiscal,
 * Alerta Inteligente de Demanda para a Cozinha e Área do Cliente Mobile (PIX & QR Caixa).
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
      else {
        log('[Pesagem] Tabela pesagens verificada e pronta.');
        // Garantir colunas de catraca na tabela pesagens
        db.run(`ALTER TABLE pesagens ADD COLUMN catraca_liberada INTEGER DEFAULT 0`, () => {});
        db.run(`ALTER TABLE pesagens ADD COLUMN catraca_liberada_em DATETIME`, () => {});
      }
    });

    // Cria tabela de auditoria de acessos de catraca
    db.run(`
      CREATE TABLE IF NOT EXISTS catraca_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_lido TEXT,
        tipo TEXT,
        liberado INTEGER,
        motivo TEXT,
        identificador TEXT,
        timestamp DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `, (errC) => {
      if (!errC) log('[Catraca] Tabela catraca_logs pronta para registro de giros.');
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
      balancaProtocolo: 'toledo_prix3',
      balancaBaudRate: 9600,
      // Alerta de Demanda para a Cozinha
      alertaDemandaAtivo: true,
      demandaMetaPratos: 6, // Meta de pratos no intervalo
      demandaJanelaMinutos: 15, // Janela em minutos
      demandaMetaKg: 3.5, // Meta de quilos no intervalo
      demandaCooldownMinutos: 8, // Cooldown entre alertas repetidos
      ultimoAlertaDemanda: 0,
      // Configuração de Pagamento PIX na Área do Cliente
      chavePixRestaurante: 'pix@chefcozinha.com.br',
      nomeBeneficiarioPix: 'CHEF COZINHA RESTAURANTE',
      cidadePix: 'SAO PAULO',
      // Integração com Catracas de Saída (Tolerância e Liberação)
      catracaAtiva: true,
      toleranciaSaidaMinutos: 15, // Tolerância de até 15 minutos para sair após pagar
      catracaMensagemLiberado: 'Acesso Liberado! Obrigado e volte sempre.',
      catracaMensagemBloqueado: 'Acesso bloqueado: comanda não paga ou prazo expirado.'
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

  // Helper para Geração de Código PIX Copia e Cola (EMV QRCPS-MPM padrão BACEN)
  function gerarPixPayload(chave, nome, cidade, valor, txid) {
    function formatField(id, val) {
      const len = String(val.length).padStart(2, '0');
      return id + len + val;
    }
    const chaveLimpa = (chave || 'pix@chefcozinha.com.br').trim();
    const gui = formatField('00', 'br.gov.bcb.pix') + formatField('01', chaveLimpa);
    let payload =
      formatField('00', '01') +
      formatField('26', gui) +
      formatField('52', '0000') +
      formatField('53', '986') +
      formatField('54', Number(valor).toFixed(2)) +
      formatField('58', 'BR') +
      formatField('59', (nome || 'CHEF COZINHA').slice(0, 25).toUpperCase()) +
      formatField('60', (cidade || 'BRASIL').slice(0, 15).toUpperCase()) +
      formatField('62', formatField('05', (txid || '***').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25)));
    payload += '6304';

    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
      crc ^= (payload.charCodeAt(i) << 8);
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
        else crc = (crc << 1) & 0xFFFF;
      }
    }
    const crcHex = (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    return payload.slice(0, -4) + formatField('63', crcHex);
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

      // Configurações do Alerta de Demanda
      if (req.body.alertaDemandaAtivo !== undefined) cfg.alertaDemandaAtivo = !!req.body.alertaDemandaAtivo;
      if (req.body.demandaMetaPratos !== undefined) cfg.demandaMetaPratos = parseInt(req.body.demandaMetaPratos) || 6;
      if (req.body.demandaJanelaMinutos !== undefined) cfg.demandaJanelaMinutos = parseInt(req.body.demandaJanelaMinutos) || 15;
      if (req.body.demandaMetaKg !== undefined) cfg.demandaMetaKg = parseFloat(req.body.demandaMetaKg) || 3.5;
      if (req.body.demandaCooldownMinutos !== undefined) cfg.demandaCooldownMinutos = parseInt(req.body.demandaCooldownMinutos) || 8;

      // Configurações PIX
      if (req.body.chavePixRestaurante !== undefined) cfg.chavePixRestaurante = String(req.body.chavePixRestaurante).trim();
      if (req.body.nomeBeneficiarioPix !== undefined) cfg.nomeBeneficiarioPix = String(req.body.nomeBeneficiarioPix).trim();
      if (req.body.cidadePix !== undefined) cfg.cidadePix = String(req.body.cidadePix).trim();

      salvarConfig(cfg);
      log(`[Pesagem] Configurações atualizadas: R$ ${cfg.precoKg}/kg | Livre R$ ${cfg.precoLivre} | Meta Demanda: ${cfg.demandaMetaPratos} pratos / ${cfg.demandaJanelaMinutos}min`);
      res.json({ sucesso: true, config: cfg });
    } catch (e) {
      res.status(500).json({ sucesso: false, error: e.message });
    }
  });

  // 3. Registrar Pesagem com Verificação de Demanda para a Cozinha
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
            if (err) {
              log(`[Pesagem] Erro ao gravar pesagem: ${err.message}`);
              return;
            }

            // --- VERIFICAÇÃO INTELIGENTE DE DEMANDA DO BUFFET (AVISO PARA COZINHA / KDS) ---
            if (cfg.alertaDemandaAtivo) {
              const janela = cfg.demandaJanelaMinutos || 15;
              const sqlDemanda = `
                SELECT COUNT(*) as totalPratos, COALESCE(SUM(peso_liquido), 0) as totalKg
                FROM pesagens
                WHERE timestamp >= datetime('now', 'localtime', '-${janela} minutes')
              `;
              db.get(sqlDemanda, [], (errD, rowD) => {
                if (!errD && rowD) {
                  const bateuPratos = cfg.demandaMetaPratos && rowD.totalPratos >= cfg.demandaMetaPratos;
                  const bateuKg = cfg.demandaMetaKg && rowD.totalKg >= cfg.demandaMetaKg;
                  const agoraMs = Date.now();
                  const cooldownMs = (cfg.demandaCooldownMinutos || 8) * 60 * 1000;
                  const ultimoAlerta = cfg.ultimoAlertaDemanda || 0;

                  if ((bateuPratos || bateuKg) && (agoraMs - ultimoAlerta >= cooldownMs)) {
                    cfg.ultimoAlertaDemanda = agoraMs;
                    salvarConfig(cfg);

                    const payloadAlerta = {
                      tipo: 'alerta_buffet_cozinha',
                      titulo: '🚨 Atenção Cozinha: Demanda Alta no Buffet!',
                      mensagem: `Demanda acima da média: foram pesados ${rowD.totalPratos} pratos (${rowD.totalKg.toFixed(2)} kg) nos últimos ${janela} minutos. Favor conferir reposição do buffet!`,
                      totalPratos: rowD.totalPratos,
                      totalKg: parseFloat(rowD.totalKg.toFixed(2)),
                      janelaMinutos: janela,
                      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    };

                    log(`[Pesagem] ALERTA DE DEMANDA DISPARADO PARA A COZINHA: ${rowD.totalPratos} pratos / ${rowD.totalKg.toFixed(2)}kg`);

                    if (io) {
                      io.emit('alerta_buffet_cozinha', payloadAlerta);
                      io.emit('super_notificacao', {
                        tipo: 'alerta',
                        titulo: 'Demanda Alta no Buffet',
                        mensagem: payloadAlerta.mensagem
                      });
                    }
                  }
                }
                responder();
              });
            } else {
              responder();
            }
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
      } else {
        responder();
      }

      function responder() {
        if (res.headersSent) return;
        if (io) {
          io.emit('pesagem_realizada', registro);
        }
        log(`[Pesagem] Registrada: ${registro.id} - ${descricaoItem} -> R$ ${valorTotal.toFixed(2)} [${statusInicial}]`);
        res.json({
          sucesso: true,
          registro,
          ticketQr: `PESO|${registro.id}|${registro.valorTotal}|${registro.pesoLiquido}`
        });
      }
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

  // --- 6. ÁREA DO CLIENTE: CONSULTAR EXTRATO DA COMANDA / TICKET ---
  app.get('/api/modulo/pesagem-selfservice/comanda/:id/extrato', (req, res) => {
    const rawId = decodeURIComponent(req.params.id || '').trim();
    if (!rawId) return res.status(400).json({ sucesso: false, error: 'Identificador obrigatório.' });

    if (!db || typeof db.all !== 'function') {
      return res.status(500).json({ sucesso: false, error: 'Banco indisponível.' });
    }

    // Caso seja ticket direto (ex: PESO-123456)
    if (rawId.toUpperCase().startsWith('PESO-')) {
      db.get('SELECT * FROM pesagens WHERE id = ?', [rawId.toUpperCase()], (err, ticket) => {
        if (err) return res.status(500).json({ sucesso: false, error: err.message });
        if (!ticket) return res.status(404).json({ sucesso: false, error: 'Ticket não encontrado.' });

        return res.json({
          sucesso: true,
          tipo: 'ticket',
          identificador: ticket.id,
          status: ticket.status,
          total: ticket.valor_total,
          itens: [{
            nome: ticket.descricao,
            quantidade: 1,
            precoUnitario: ticket.valor_total,
            subtotal: ticket.valor_total,
            emoji: '⚖️'
          }],
          usadoEm: ticket.usado_em,
          criadoEm: ticket.timestamp
        });
      });
      return;
    }

    // Busca por Comanda ou Mesa
    const numLimpo = rawId.replace(/\D/g, '');
    const nomesBusca = [
      rawId,
      `Comanda ${numLimpo}`,
      `Mesa ${numLimpo}`,
      numLimpo
    ];

    db.all(
      `SELECT id, productName, productEmoji, quantity, total, status, localName, createdAt
       FROM pedidos
       WHERE (localName = ? OR localName = ? OR localName = ? OR localName = ?)
         AND status NOT IN ('Pago', 'Finalizado', 'Cancelado')
       ORDER BY id ASC`,
      nomesBusca,
      (err, rows) => {
        if (err) return res.status(500).json({ sucesso: false, error: err.message });

        if (!rows || rows.length === 0) {
          // Busca em pesagens caso ainda não tenha sido inserido em pedidos
          db.all(
            `SELECT * FROM pesagens
             WHERE (comanda_id = ? OR mesa_id = ? OR comanda_id = ? OR mesa_id = ?)
               AND status = 'pendente'`,
            [numLimpo, numLimpo, rawId, rawId],
            (errT, tickets) => {
              if (errT) return res.status(500).json({ sucesso: false, error: errT.message });
              if (!tickets || tickets.length === 0) {
                return res.status(404).json({
                  sucesso: false,
                  error: `Nenhum consumo pendente encontrado para "${rawId}".`
                });
              }

              const itensT = tickets.map(t => ({
                nome: t.descricao,
                quantidade: 1,
                precoUnitario: t.valor_total,
                subtotal: t.valor_total,
                emoji: '⚖️'
              }));
              const totalT = tickets.reduce((acc, t) => acc + t.valor_total, 0);

              return res.json({
                sucesso: true,
                tipo: 'comanda',
                identificador: rawId,
                status: 'aberto',
                total: parseFloat(totalT.toFixed(2)),
                itens: itensT
              });
            }
          );
          return;
        }

        const itens = rows.map(r => {
          const sub = parseFloat(r.total) || 0;
          const q = parseInt(r.quantity) || 1;
          return {
            id: r.id,
            nome: r.productName,
            emoji: r.productEmoji || '🍽️',
            quantidade: q,
            precoUnitario: q > 0 ? parseFloat((sub / q).toFixed(2)) : sub,
            subtotal: sub,
            status: r.status
          };
        });

        const total = itens.reduce((acc, item) => acc + item.subtotal, 0);

        res.json({
          sucesso: true,
          tipo: rawId.toLowerCase().includes('mesa') ? 'mesa' : 'comanda',
          identificador: rawId,
          status: 'aberto',
          total: parseFloat(total.toFixed(2)),
          itens
        });
      }
    );
  });

  // --- 7. ÁREA DO CLIENTE: GERAR PIX PARA PAGAMENTO DIRETO NO CELULAR ---
  app.post('/api/modulo/pesagem-selfservice/comanda/:id/gerar-pix', (req, res) => {
    const rawId = decodeURIComponent(req.params.id || '').trim();
    const { valor } = req.body;
    const cfg = carregarConfig();

    const valFloat = parseFloat(valor) || 0;
    if (valFloat <= 0) {
      return res.status(400).json({ sucesso: false, error: 'Valor da comanda inválido.' });
    }

    const txid = ('P' + Date.now().toString().slice(-6) + rawId.replace(/\D/g, '')).slice(0, 25);
    const pixCopiaECola = gerarPixPayload(
      cfg.chavePixRestaurante,
      cfg.nomeBeneficiarioPix,
      cfg.cidadePix,
      valFloat,
      txid
    );

    res.json({
      sucesso: true,
      pixCopiaECola,
      txid,
      valor: valFloat,
      beneficiario: cfg.nomeBeneficiarioPix,
      chave: cfg.chavePixRestaurante
    });
  });

  // --- 8. ÁREA DO CLIENTE: PAGAR DIRETO VIA PIX (SELF-CHECKOUT) ---
  app.post('/api/modulo/pesagem-selfservice/comanda/:id/pagar-pix', (req, res) => {
    const rawId = decodeURIComponent(req.params.id || '').trim();
    const numLimpo = rawId.replace(/\D/g, '');
    const agora = new Date().toISOString();

    if (!db || typeof db.run !== 'function') {
      return res.status(500).json({ sucesso: false, error: 'Banco indisponível.' });
    }

    // Se for ticket individual
    if (rawId.toUpperCase().startsWith('PESO-')) {
      db.run(
        `UPDATE pesagens SET status = 'utilizado', usado_em = ? WHERE id = ?`,
        [agora, rawId.toUpperCase()],
        function (err) {
          if (err) return res.status(500).json({ sucesso: false, error: err.message });
          if (io) {
            io.emit('comanda_paga_cliente', { identificador: rawId, metodo: 'PIX', pagoEm: agora });
          }
          log(`[Pesagem] Ticket ${rawId} PAGO DIRETAMENTE VIA PIX PELO CLIENTE.`);
          return res.json({ sucesso: true, mensagem: 'Pagamento PIX confirmado com sucesso!', pagoEm: agora });
        }
      );
      return;
    }

    // Se for comanda ou mesa
    const nomesBusca = [rawId, `Comanda ${numLimpo}`, `Mesa ${numLimpo}`, numLimpo];
    db.run(
      `UPDATE pedidos SET status = 'Pago', paymentMethod = 'PIX'
       WHERE (localName = ? OR localName = ? OR localName = ? OR localName = ?)
         AND status NOT IN ('Pago', 'Finalizado', 'Cancelado')`,
      nomesBusca,
      function (errP) {
        if (errP) return res.status(500).json({ sucesso: false, error: errP.message });

        // Atualiza também eventuais pesagens vinculadas
        db.run(
          `UPDATE pesagens SET status = 'utilizado', usado_em = ?
           WHERE (comanda_id = ? OR mesa_id = ? OR comanda_id = ? OR mesa_id = ?)`,
          [agora, numLimpo, numLimpo, rawId, rawId]
        );

        if (io) {
          io.emit('comanda_paga_cliente', { identificador: rawId, metodo: 'PIX', pagoEm: agora });
          io.emit('pedido_atualizado', { localName: rawId });
        }

        log(`[Pesagem] Comanda/Mesa ${rawId} PAGA COM SUCESSO PELO CLIENTE VIA PIX.`);
        res.json({ sucesso: true, mensagem: 'Pagamento PIX realizado com sucesso! Comanda quitada.', pagoEm: agora });
      }
    );
  });

  // --- 9. CAIXA: DAR BAIXA AO ESCANEAR QR CODE DO CELULAR DO CLIENTE ---
  app.post('/api/modulo/pesagem-selfservice/comanda/baixa-caixa', (req, res) => {
    const { codigoQr, metodoPagamento } = req.body;
    if (!codigoQr) return res.status(400).json({ sucesso: false, error: 'Código QR não fornecido.' });

    // Aceita formatos:
    // 1) PAGAR|COMANDA|15|34.95
    // 2) PAGAR|MESA|2|34.95
    // 3) PAGAR|TICKET|PESO-123456|34.95
    // 4) PESO-123456
    // 5) 15
    let idAlvo = codigoQr.trim();
    if (codigoQr.includes('|')) {
      const p = codigoQr.split('|');
      if (p[0] === 'PAGAR') {
        idAlvo = p[2] || p[1];
      } else if (p[0] === 'PESO') {
        idAlvo = p[1] || p[0];
      }
    }

    const agora = new Date().toISOString();
    const metodo = metodoPagamento || 'Caixa';

    // Se for ticket
    if (idAlvo.toUpperCase().startsWith('PESO-')) {
      db.get('SELECT * FROM pesagens WHERE id = ?', [idAlvo.toUpperCase()], (err, t) => {
        if (err || !t) return res.status(404).json({ sucesso: false, error: 'Ticket não encontrado.' });
        if (t.status === 'utilizado') {
          return res.status(409).json({ sucesso: false, error: 'Este ticket já foi dado baixa!' });
        }

        db.run(`UPDATE pesagens SET status = 'utilizado', usado_em = ? WHERE id = ?`, [agora, t.id], (errU) => {
          if (errU) return res.status(500).json({ sucesso: false, error: errU.message });

          if (io) {
            io.emit('comanda_paga_cliente', { identificador: t.id, metodo, total: t.valor_total, pagoEm: agora });
            io.emit('ticket_resgatado', t);
          }

          log(`[Pesagem] Ticket ${t.id} BAIXADO NO CAIXA (R$ ${t.valor_total.toFixed(2)})`);
          return res.json({ sucesso: true, mensagem: `Ticket ${t.id} baixado no Caixa com sucesso!`, total: t.valor_total });
        });
      });
      return;
    }

    // Se for comanda ou mesa
    const numLimpo = idAlvo.replace(/\D/g, '');
    const nomesBusca = [idAlvo, `Comanda ${numLimpo}`, `Mesa ${numLimpo}`, numLimpo];

    db.run(
      `UPDATE pedidos SET status = 'Pago', paymentMethod = ?
       WHERE (localName = ? OR localName = ? OR localName = ? OR localName = ?)
         AND status NOT IN ('Pago', 'Finalizado', 'Cancelado')`,
      [metodo, ...nomesBusca],
      function (errP) {
        if (errP) return res.status(500).json({ sucesso: false, error: errP.message });

        db.run(
          `UPDATE pesagens SET status = 'utilizado', usado_em = ?
           WHERE (comanda_id = ? OR mesa_id = ? OR comanda_id = ? OR mesa_id = ?)`,
          [agora, numLimpo, numLimpo, idAlvo, idAlvo]
        );

        if (io) {
          io.emit('comanda_paga_cliente', { identificador: idAlvo, metodo, pagoEm: agora });
          io.emit('pedido_atualizado', { localName: idAlvo });
        }

        log(`[Pesagem] Comanda ${idAlvo} BAIXADA COM SUCESSO NO CAIXA (Método: ${metodo})`);
        res.json({ sucesso: true, mensagem: `Comanda ${idAlvo} baixada com sucesso no Caixa!` });
      }
    );
  });

  // ── 9.1 VALIDAÇÃO E LIBERAÇÃO DE CATRACA DE SAÍDA (Tolerância + Uso Único) ──
  function processarValidacaoCatraca(rawCodigo, req, res) {
    const cfg = carregarConfig();
    if (!rawCodigo || !String(rawCodigo).trim()) {
      return res.status(400).json({ liberado: false, codigo: 0, erro: 'Código de validação não fornecido.' });
    }

    let codigoLimpo = String(rawCodigo).trim();
    let idAlvo = codigoLimpo;

    if (codigoLimpo.includes('|')) {
      const parts = codigoLimpo.split('|');
      if (parts[0] === 'CATRACA' && parts[1] === 'LIBERAR') {
        idAlvo = parts[2] || parts[0];
      } else if (parts[0] === 'PAGAR') {
        idAlvo = parts[2] || parts[1];
      } else if (parts[0] === 'PESO') {
        idAlvo = parts[1] || parts[0];
      }
    }

    const agora = new Date();
    const agoraIso = agora.toISOString();
    const toleranciaMin = cfg.toleranciaSaidaMinutos || 15;

    function registrarLogCatraca(liberado, motivo, identificador, callback) {
      if (!db || typeof db.run !== 'function') return callback && callback();
      db.run(
        `INSERT INTO catraca_logs (codigo_lido, tipo, liberado, motivo, identificador, timestamp)
         VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [codigoLimpo, idAlvo.toUpperCase().startsWith('PESO-') ? 'ticket' : 'comanda', liberado ? 1 : 0, motivo, identificador || idAlvo],
        () => callback && callback()
      );
    }

    // A) SE FOR TICKET INDIVIDUAL (PESO-...)
    if (idAlvo.toUpperCase().startsWith('PESO-')) {
      const ticketId = idAlvo.toUpperCase();
      db.get('SELECT * FROM pesagens WHERE id = ?', [ticketId], (err, row) => {
        if (err) {
          return res.status(500).json({ liberado: false, codigo: 0, erro: 'Erro interno ao consultar ticket.' });
        }
        if (!row) {
          const motivo = `Ticket ${ticketId} não localizado no sistema.`;
          registrarLogCatraca(false, motivo, ticketId);
          return res.status(404).json({ liberado: false, codigo: 0, erro: motivo });
        }

        // Verifica se foi pago
        if (row.status !== 'utilizado') {
          const motivo = `Ticket ${ticketId} não está pago. Favor efetuar o pagamento no caixa ou via celular.`;
          registrarLogCatraca(false, motivo, ticketId);
          return res.status(403).json({ liberado: false, codigo: 0, erro: motivo });
        }

        // Verifica se já foi liberada a catraca anteriormente (Uso Único Antifraude)
        if (row.catraca_liberada === 1) {
          const motivo = `Ticket ${ticketId} já foi utilizado para liberar a catraca em ${row.catraca_liberada_em || 'momento anterior'}.`;
          registrarLogCatraca(false, motivo, ticketId);
          return res.status(409).json({ liberado: false, codigo: 0, erro: motivo });
        }

        // Verifica tolerância de saída em minutos
        if (row.usado_em) {
          const dataPago = new Date(row.usado_em);
          const diffMs = agora - dataPago;
          const diffMin = diffMs / (1000 * 60);
          if (diffMin > toleranciaMin) {
            const motivo = `Tolerância de saída excedida (${Math.round(diffMin)} min decorridos, tolerância máxima é de ${toleranciaMin} min). Favor validar no caixa.`;
            registrarLogCatraca(false, motivo, ticketId);
            return res.status(403).json({ liberado: false, codigo: 0, erro: motivo, minutosExcedidos: Math.round(diffMin - toleranciaMin) });
          }
        }

        // Libera catraca
        db.run(
          `UPDATE pesagens SET catraca_liberada = 1, catraca_liberada_em = ? WHERE id = ?`,
          [agoraIso, ticketId],
          (errUpd) => {
            if (errUpd) {
              return res.status(500).json({ liberado: false, codigo: 0, erro: 'Erro ao atualizar status da catraca.' });
            }

            registrarLogCatraca(true, 'Acesso liberado com sucesso.', ticketId);

            const payloadSocket = {
              evento: 'catraca_giro_liberado',
              identificador: ticketId,
              tipo: 'ticket',
              liberado: true,
              hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              mensagem: cfg.catracaMensagemLiberado || 'Acesso Liberado! Volte sempre.'
            };

            if (io) {
              io.emit('catraca_liberada', payloadSocket);
            }

            log(`[Catraca] 🟢 CATRACA LIBERADA para o ticket ${ticketId}!`);
            res.json({
              liberado: true,
              codigo: 1,
              sucesso: true,
              mensagem: cfg.catracaMensagemLiberado || 'Acesso Liberado! Volte sempre.',
              identificador: ticketId,
              tipo: 'ticket'
            });
          }
        );
      });
      return;
    }

    // B) SE FOR COMANDA OU MESA
    const numLimpo = idAlvo.replace(/\D/g, '');
    const nomesBusca = [idAlvo, `Comanda ${numLimpo}`, `Mesa ${numLimpo}`, numLimpo];

    // Verifica se existem pedidos em aberto
    db.all(
      `SELECT id, status, total, createdAt FROM pedidos
       WHERE (localName = ? OR localName = ? OR localName = ? OR localName = ?)
         AND status NOT IN ('Pago', 'Finalizado', 'Cancelado')`,
      nomesBusca,
      (err, pendentes) => {
        if (err) return res.status(500).json({ liberado: false, codigo: 0, erro: 'Erro ao consultar pedidos.' });

        if (pendentes && pendentes.length > 0) {
          const totalPendente = pendentes.reduce((acc, p) => acc + (parseFloat(p.total) || 0), 0);
          const motivo = `Comanda ${idAlvo} possui R$ ${totalPendente.toFixed(2)} em aberto pendente de pagamento.`;
          registrarLogCatraca(false, motivo, idAlvo);
          return res.status(403).json({
            liberado: false,
            codigo: 0,
            erro: motivo,
            saldoPendente: totalPendente
          });
        }

        // Verifica se existem pesagens pendentes não pagas vinculadas à comanda
        db.get(
          `SELECT COUNT(*) as qtdPendentes FROM pesagens
           WHERE (comanda_id = ? OR mesa_id = ? OR comanda_id = ? OR mesa_id = ?)
             AND status = 'pendente'`,
          [numLimpo, numLimpo, idAlvo, idAlvo],
          (errPes, rowPes) => {
            if (!errPes && rowPes && rowPes.qtdPendentes > 0) {
              const motivo = `Comanda ${idAlvo} possui pesagens pendentes de pagamento no buffet.`;
              registrarLogCatraca(false, motivo, idAlvo);
              return res.status(403).json({ liberado: false, codigo: 0, erro: motivo });
            }

            // Verifica se a comanda já girou a catraca nos últimos 15 min (Uso único antifraude)
            db.get(
              `SELECT id, timestamp FROM catraca_logs
               WHERE (identificador = ? OR identificador = ?)
                 AND liberado = 1
                 AND timestamp >= datetime('now', 'localtime', '-15 minutes')
               ORDER BY id DESC LIMIT 1`,
              [idAlvo, numLimpo],
              (errLog, logAnterior) => {
                if (!errLog && logAnterior) {
                  const motivo = `Comanda ${idAlvo} já efetuou a liberação da catraca de saída em ${logAnterior.timestamp}.`;
                  registrarLogCatraca(false, motivo, idAlvo);
                  return res.status(409).json({ liberado: false, codigo: 0, erro: motivo });
                }

                // Libera a catraca para a comanda
                registrarLogCatraca(true, 'Acesso liberado com sucesso.', idAlvo);

                // Marca pesagens vinculadas como catraca liberada
                db.run(
                  `UPDATE pesagens SET catraca_liberada = 1, catraca_liberada_em = ?
                   WHERE (comanda_id = ? OR mesa_id = ? OR comanda_id = ? OR mesa_id = ?)`,
                  [agoraIso, numLimpo, numLimpo, idAlvo, idAlvo]
                );

                const payloadSocket = {
                  evento: 'catraca_giro_liberado',
                  identificador: idAlvo,
                  tipo: 'comanda',
                  liberado: true,
                  hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                  mensagem: cfg.catracaMensagemLiberado || 'Acesso Liberado! Volte sempre.'
                };

                if (io) {
                  io.emit('catraca_liberada', payloadSocket);
                }

                log(`[Catraca] 🟢 CATRACA LIBERADA para a Comanda ${idAlvo}!`);
                res.json({
                  liberado: true,
                  codigo: 1,
                  sucesso: true,
                  mensagem: cfg.catracaMensagemLiberado || 'Acesso Liberado! Volte sempre.',
                  identificador: idAlvo,
                  tipo: 'comanda'
                });
              }
            );
          }
        );
      }
    );
  }

  // Endpoints para Integração com Hardware de Catracas (Henry, Topdata, Control iD, Dimep, Intelbras, etc)
  app.post('/api/modulo/pesagem-selfservice/catraca/validar', (req, res) => {
    const rawCodigo = req.body.codigo || req.body.qr || req.body.token || req.body.qrcode;
    processarValidacaoCatraca(rawCodigo, req, res);
  });

  app.get('/api/modulo/pesagem-selfservice/catraca/validar/:codigo', (req, res) => {
    processarValidacaoCatraca(req.params.codigo, req, res);
  });

  app.get('/api/modulo/pesagem-selfservice/catraca/validar', (req, res) => {
    const rawCodigo = req.query.codigo || req.query.qr || req.query.token || req.query.c;
    processarValidacaoCatraca(rawCodigo, req, res);
  });

  // Consulta de Logs de Catraca para Segurança e Recepção
  app.get('/api/modulo/pesagem-selfservice/catraca/logs', (req, res) => {
    if (!db || typeof db.all !== 'function') return res.status(500).json({ sucesso: false, error: 'Banco indisponível.' });
    db.all(`SELECT * FROM catraca_logs ORDER BY id DESC LIMIT 100`, [], (err, rows) => {
      if (err) return res.status(500).json({ sucesso: false, error: err.message });
      res.json({ sucesso: true, logs: rows || [] });
    });
  });

  // 10. Relatório Analítico de Pesagens
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

  // 11. Exportar Pesagens para Excel (XLSX)
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

  // 12. Obter Produtos do Cardápio para Vinculação Fiscal (NFC-e)
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

  // 13. Servir a página do Totem de Pesagem
  app.get('/plugins/pesagem-selfservice/totem', (req, res) => {
    res.sendFile(path.join(__dirname, 'totem.html'));
  });

  // 14. Servir a página de Relatórios de Pesagem
  app.get('/plugins/pesagem-selfservice/relatorio', (req, res) => {
    res.sendFile(path.join(__dirname, 'relatorio.html'));
  });

  // 15. Servir a Área do Cliente no Celular (Self-Checkout & QR Code para Caixa)
  app.get('/cliente-comanda', (req, res) => {
    res.sendFile(path.join(__dirname, 'cliente.html'));
  });
  app.get('/plugins/pesagem-selfservice/cliente', (req, res) => {
    res.sendFile(path.join(__dirname, 'cliente.html'));
  });
};
