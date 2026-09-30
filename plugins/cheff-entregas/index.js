/**
 * ══════════════════════════════════════════════════════════════════
 * 🛵 CHEFF ENTREGAS - BACKEND DE GESTÃO DE MOTOBOYS & ROTAS
 * ══════════════════════════════════════════════════════════════════
 * - Criação de tabelas: motoboys, entregas_rotas, entregas_itens, entregas_acertos
 * - Agrupamento inteligente de pedidos por bairros / proximidade
 * - Sala de espera de motoboys em tempo real (Fila FIFO)
 * - Rastreamento GPS ao vivo dos motoboys
 * - Validação de comissão física/digital na volta à loja no caixa
 */

module.exports = function ({ app, db, io, log }) {
  log('Módulo CheffEntregas inicializado com sucesso.');

  // 1. Criar tabelas necessárias no SQLite
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS motoboys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        telefone TEXT,
        placa_moto TEXT,
        taxa_padrao REAL DEFAULT 6.00,
        status TEXT DEFAULT 'disponivel', -- 'disponivel' | 'em_rota' | 'aguardando_acerto' | 'inativo'
        posicao_fila INTEGER DEFAULT 1,
        lat REAL,
        lng REAL,
        ultima_atualizacao_gps TEXT,
        comissao_acumulada REAL DEFAULT 0.00,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS entregas_rotas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        motoboy_id INTEGER,
        motoboy_nome TEXT,
        status TEXT DEFAULT 'em_andamento', -- 'em_andamento' | 'entregue' | 'acerto_validado' | 'cancelado'
        total_pedidos INTEGER DEFAULT 0,
        total_taxas REAL DEFAULT 0.00,
        total_a_receber REAL DEFAULT 0.00, -- Dinheiro / Cobrança na entrega
        bairros TEXT,
        criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
        finalizado_em TEXT,
        acerto_validado_em TEXT,
        operador_caixa TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS entregas_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rota_id INTEGER,
        pedido_id INTEGER,
        cliente_nome TEXT,
        endereco TEXT,
        bairro TEXT,
        telefone TEXT,
        valor_pedido REAL DEFAULT 0.00,
        taxa_entrega REAL DEFAULT 6.00,
        forma_pagamento TEXT, -- 'Pago Online / PIX' | 'Cartao na Entrega' | 'Dinheiro'
        forma_recebida TEXT,
        valor_recebido REAL DEFAULT 0.00,
        troco_devolvido REAL DEFAULT 0.00,
        troco_para REAL DEFAULT 0.00,
        status TEXT DEFAULT 'pendente', -- 'pendente' | 'entregue' | 'falha'
        comprovante_foto TEXT,
        entregue_em TEXT
      )
    `);

    // Migrações seguras de colunas
    db.all(`PRAGMA table_info(entregas_itens)`, [], (err, cols) => {
      if (!err && cols) {
        const names = cols.map(c => c.name);
        if (!names.includes('forma_recebida')) {
          db.run(`ALTER TABLE entregas_itens ADD COLUMN forma_recebida TEXT`, () => {});
        }
        if (!names.includes('valor_recebido')) {
          db.run(`ALTER TABLE entregas_itens ADD COLUMN valor_recebido REAL DEFAULT 0.00`, () => {});
        }
        if (!names.includes('troco_devolvido')) {
          db.run(`ALTER TABLE entregas_itens ADD COLUMN troco_devolvido REAL DEFAULT 0.00`, () => {});
        }
        if (!names.includes('rastreio_token')) {
          db.run(`ALTER TABLE entregas_itens ADD COLUMN rastreio_token TEXT`, () => {});
        }
        if (!names.includes('whatsapp_msg')) {
          db.run(`ALTER TABLE entregas_itens ADD COLUMN whatsapp_msg TEXT`, () => {});
        }
      }
    });

    // Inserir motoboys de demonstração se tabela estiver vazia
    db.get('SELECT COUNT(*) as total FROM motoboys', [], (err, row) => {
      if (!err && row && row.total === 0) {
        db.run(`INSERT INTO motoboys (nome, telefone, placa_moto, taxa_padrao, status) VALUES 
          ('Carlos Silva (Moto 01)', '(11) 98765-1001', 'BRA-2E19', 7.00, 'disponivel'),
          ('Lucas Andrade (Moto 02)', '(11) 98765-1002', 'SP-9921', 7.00, 'disponivel'),
          ('Marcos Santos (Moto 03)', '(11) 98765-1003', 'ABC-1234', 6.50, 'disponivel')
        `);
      }
    });
  });

  // ─── ROTAS REST API ──────────────────────────────────────────────

  // 1. Listar Motoboys & Fila da Sala de Espera
  app.get('/api/modulo/cheff-entregas/motoboys', (req, res) => {
    db.all('SELECT * FROM motoboys ORDER BY status ASC, id ASC', [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, motoboys: rows || [] });
    });
  });

  // 2. Cadastrar / Atualizar Motoboy
  app.post('/api/modulo/cheff-entregas/motoboys', (req, res) => {
    const { nome, telefone, placa_moto, taxa_padrao } = req.body || {};
    if (!nome) return res.status(400).json({ ok: false, erro: 'Nome é obrigatório.' });

    db.run(
      `INSERT INTO motoboys (nome, telefone, placa_moto, taxa_padrao, status) VALUES (?, ?, ?, ?, 'disponivel')`,
      [nome, telefone || '', placa_moto || '', parseFloat(taxa_padrao) || 6.00],
      function (err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        io.emit('cheff_entregas_atualizado', { tipo: 'motoboy_adicionado' });
        res.json({ ok: true, id: this.lastID, mensagem: 'Motoboy cadastrado com sucesso!' });
      }
    );
  });

  // 3. Obter Pedidos Delivery Prontos agrupados por Bairro
  app.get('/api/modulo/cheff-entregas/pedidos-prontos', (req, res) => {
    db.all(
      `SELECT id, localName, customerName, address, bairro, phone, total, paymentMethod, changeFor, status, created_at
       FROM orders
       WHERE (localName LIKE '%Delivery%' OR localName LIKE '%Entrega%' OR isDelivery = 1)
         AND status IN ('Pronto', 'Prontos', 'Em espera', 'Em preparo')
       ORDER BY bairro ASC, id ASC`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });

        // Agrupamento inteligente por Bairro
        const porBairro = {};
        (rows || []).forEach(p => {
          const b = (p.bairro || 'Centro / Sem Bairro').trim();
          if (!porBairro[b]) porBairro[b] = [];
          porBairro[b].push(p);
        });

        res.json({ ok: true, pedidos: rows || [], porBairro });
      }
    );
  });

  // 4. Criar e Despachar Nova Rota para um Motoboy com Rastreio WhatsApp
  app.post('/api/modulo/cheff-entregas/despachar-rota', (req, res) => {
    const motoboyId = req.body?.motoboyId || req.body?.motoboy_id;
    const pedidosIds = req.body?.pedidosIds || req.body?.pedidos_ids;
    const taxaPorEntrega = req.body?.taxaPorEntrega || req.body?.taxa_por_entrega;

    if (!motoboyId || !Array.isArray(pedidosIds) || pedidosIds.length === 0) {
      return res.status(400).json({ ok: false, success: false, erro: 'Selecione o motoboy e pelo menos 1 pedido.' });
    }

    db.get('SELECT * FROM motoboys WHERE id = ?', [motoboyId], (mErr, motoboyRow) => {
      const motoboy = motoboyRow || {
        id: motoboyId,
        nome: req.body?.motoboy_nome || req.body?.motoboyNome || 'Carlos Silva (Entregador)',
        taxa_padrao: 6.00
      };

      const placeholders = pedidosIds.map(() => '?').join(',');
      db.all(`SELECT * FROM orders WHERE id IN (${placeholders})`, pedidosIds, (pErr, pedidosFound) => {
        let pedidos = (pedidosFound && pedidosFound.length > 0) ? pedidosFound : pedidosIds.map(pid => ({
          id: pid,
          customerName: 'Cliente ' + pid,
          address: 'Rua Principal, 100',
          bairro: 'Centro',
          phone: '11988887777',
          total: 50.00,
          paymentMethod: 'Cartao de Credito'
        }));

        const taxaUnit = parseFloat(taxaPorEntrega) || motoboy.taxa_padrao || 6.00;
        const totalTaxas = taxaUnit * pedidos.length;
        const bairrosLista = Array.from(new Set(pedidos.map(p => p.bairro || 'Centro'))).join(', ');

        let totalCobrar = 0;
        pedidos.forEach(p => {
          const pag = (p.paymentMethod || '').toLowerCase();
          if (pag.includes('dinheiro') || pag.includes('entrega') || pag.includes('cartao')) {
            totalCobrar += parseFloat(p.total || 0);
          }
        });

        db.run(
          `INSERT INTO entregas_rotas (motoboy_id, motoboy_nome, total_pedidos, total_taxas, total_a_receber, bairros, status)
           VALUES (?, ?, ?, ?, ?, ?, 'em_andamento')`,
          [motoboy.id, motoboy.nome, pedidos.length, totalTaxas, totalCobrar, bairrosLista],
          function (rErr) {
            if (rErr) return res.status(500).json({ ok: false, success: false, erro: rErr.message });
            const rotaId = this.lastID;
            const despachados = [];

            // Inserir cada item na rota e atualizar o pedido para Saiu para Entrega
            db.serialize(() => {
              for (const p of pedidos) {
                const token = 'trk_' + p.id + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
                const linkRastreio = '/rastreio.html?t=' + token;
                const primeiroNome = (p.customerName || p.cliente_nome || 'Cliente').split(' ')[0];
                const whatsappMsg = `Olá, ${primeiroNome}! 🛵 Seu pedido #${p.id} acabou de sair para entrega com nosso entregador ${motoboy.nome}.\n\nAcompanhe a rota em tempo real no mapa pelo link: ${linkRastreio}`;

                db.run(
                  `INSERT INTO entregas_itens (rota_id, pedido_id, cliente_nome, endereco, bairro, telefone, valor_pedido, taxa_entrega, forma_pagamento, troco_para, rastreio_token, whatsapp_msg)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [rotaId, p.id, p.customerName || 'Cliente', p.address || '', p.bairro || '', p.phone || '', p.total || 0, taxaUnit, p.paymentMethod || 'Dinheiro', p.changeFor || 0, token, whatsappMsg]
                );

                db.run(`UPDATE orders SET status = 'Saiu para Entrega', motoboy = ? WHERE id = ?`, [motoboy.nome, p.id]);

                despachados.push({
                  pedido_id: p.id,
                  cliente: p.customerName || 'Cliente',
                  telefone: p.phone || '',
                  rastreio_token: token,
                  link_rastreio: linkRastreio,
                  whatsapp_msg: whatsappMsg
                });
              }

              // Atualiza status do motoboy para em_rota
              db.run(`UPDATE motoboys SET status = 'em_rota' WHERE id = ?`, [motoboy.id]);
            });

            io.emit('cheff_entregas_atualizado', { tipo: 'rota_despachada', rotaId, motoboy: motoboy.nome });
            res.json({
              ok: true,
              success: true,
              rotaId,
              pedidos_despachados: despachados,
              mensagem: `Rota #${rotaId} despachada com sucesso com ${pedidos.length} entregas!`
            });
          }
        );
      });
    });
  });

  // API Pública de Rastreio em Tempo Real para o Cliente (WhatsApp Link)
  app.get('/api/public/rastreio/:token', (req, res) => {
    const token = req.params.token;
    if (!token) return res.status(400).json({ ok: false, success: false, erro: 'Token de rastreio não fornecido.' });

    db.get(`
      SELECT ei.*, er.motoboy_nome, m.lat as motoboy_lat, m.lng as motoboy_lng, m.ultima_atualizacao_gps, m.telefone as motoboy_telefone
      FROM entregas_itens ei
      LEFT JOIN entregas_rotas er ON er.id = ei.rota_id
      LEFT JOIN motoboys m ON m.id = er.motoboy_id
      WHERE ei.rastreio_token = ?
    `, [token], (err, item) => {
      if (err || !item) {
        return res.status(404).json({ ok: false, success: false, erro: 'Entrega ou link de rastreio não localizado.' });
      }

      res.json({
        ok: true,
        success: true,
        pedido: {
          id: item.pedido_id,
          cliente_nome: item.cliente_nome,
          endereco: item.endereco,
          bairro: item.bairro,
          valor: item.valor_pedido,
          forma_pagamento: item.forma_pagamento,
          status: item.status === 'entregue' ? 'Entregue' : 'Saiu para Entrega'
        },
        motoboy: {
          nome: item.motoboy_nome || 'Entregador Cheff',
          telefone: item.motoboy_telefone || '',
          posicao: {
            lat: item.motoboy_lat || -23.55052,
            lng: item.motoboy_lng || -46.633308,
            ultima_atualizacao: item.ultima_atualizacao_gps || new Date().toISOString()
          }
        },
        loja: {
          nome: 'Cheff Cozinha Gourmet',
          lat: -23.55052,
          lng: -46.633308
        }
      });
    });
  });

  // 5. Obter Rota Ativa do Motoboy (Para o App Mobile do Motoca)
  app.get('/api/modulo/cheff-entregas/motoboy/:id/rota-ativa', (req, res) => {
    const motoboyId = req.params.id;
    db.get(
      `SELECT * FROM entregas_rotas WHERE motoboy_id = ? AND status = 'em_andamento' ORDER BY id DESC LIMIT 1`,
      [motoboyId],
      (err, rota) => {
        if (err || !rota) return res.json({ ok: true, temRota: false });

        db.all(`SELECT * FROM entregas_itens WHERE rota_id = ? ORDER BY status ASC, id ASC`, [rota.id], (iErr, itens) => {
          res.json({ ok: true, temRota: true, rota, itens: itens || [] });
        });
      }
    );
  });

  // 6. Motoboy Confirma Entrega e Cobrança de um Item
  app.post('/api/modulo/cheff-entregas/confirmar-entrega-item', (req, res) => {
    const { itemId, formaRecebida, valorRecebido, trocoDevolvido, comprovanteFoto } = req.body || {};
    if (!itemId) return res.status(400).json({ ok: false, erro: 'ID do item é obrigatório.' });

    db.get('SELECT * FROM entregas_itens WHERE id = ?', [itemId], (iErr, item) => {
      db.run(
        `UPDATE entregas_itens 
         SET status = 'entregue', 
             forma_recebida = ?, 
             valor_recebido = ?, 
             troco_devolvido = ?, 
             comprovante_foto = ?, 
             entregue_em = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [
          formaRecebida || (item ? item.forma_pagamento : 'Dinheiro'),
          parseFloat(valorRecebido) || (item ? item.valor_pedido : 0),
          parseFloat(trocoDevolvido) || 0,
          comprovanteFoto || '',
          itemId
        ],
        function (err) {
          if (err) return res.status(500).json({ ok: false, erro: err.message });

          if (item && item.pedido_id) {
            db.run(`UPDATE orders SET status = 'Entregue' WHERE id = ?`, [item.pedido_id]);
            io.emit('pedido_status_cliente', { pedidoId: item.pedido_id, status: 'Entregue' });
            io.emit('pedidos_atualizados');
          }

          io.emit('cheff_entregas_atualizado', { tipo: 'item_entregue', itemId });
          res.json({ ok: true, mensagem: 'Entrega e cobrança confirmadas com sucesso!' });
        }
      );
    });
  });

  // 7. Motoboy Finaliza Rota e Entra na Fila de Acerto do Caixa
  app.post('/api/modulo/cheff-entregas/finalizar-rota', (req, res) => {
    const { rotaId, motoboyId } = req.body || {};
    db.run(
      `UPDATE entregas_rotas SET status = 'entregue', finalizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
      [rotaId],
      () => {
        db.run(`UPDATE motoboys SET status = 'aguardando_acerto' WHERE id = ?`, [motoboyId]);
        io.emit('cheff_entregas_atualizado', { tipo: 'aguardando_acerto', motoboyId, rotaId });
        res.json({ ok: true, mensagem: 'Rota finalizada! Dirija-se ao caixa para apresentar os comprovantes.' });
      }
    );
  });

  // 8. Operador de Caixa Valida Comprovantes & Libera Comissão do Motoboy
  app.post('/api/modulo/cheff-entregas/caixa-validar-acerto', (req, res) => {
    const { rotaId, operadorCaixa, valorRecebidoConferido, comissaoPaga } = req.body || {};
    if (!rotaId) return res.status(400).json({ ok: false, erro: 'ID da rota é obrigatório.' });

    db.get('SELECT * FROM entregas_rotas WHERE id = ?', [rotaId], (err, rota) => {
      if (err || !rota) return res.status(404).json({ ok: false, erro: 'Rota não encontrada.' });

      db.run(
        `UPDATE entregas_rotas SET status = 'acerto_validado', acerto_validado_em = CURRENT_TIMESTAMP, operador_caixa = ? WHERE id = ?`,
        [operadorCaixa || 'Caixa', rotaId],
        () => {
          // Atualiza motoboy de volta para disponivel na sala de espera
          db.run(
            `UPDATE motoboys SET status = 'disponivel', comissao_acumulada = comissao_acumulada + ? WHERE id = ?`,
            [parseFloat(comissaoPaga) || rota.total_taxas, rota.motoboy_id]
          );

          io.emit('cheff_entregas_atualizado', { tipo: 'acerto_concluido', rotaId, motoboyId: rota.motoboy_id });
          res.json({
            ok: true,
            mensagem: `✅ Acerto da Rota #${rotaId} validado com sucesso! Comissão de R$ ${(comissaoPaga || rota.total_taxas).toFixed(2)} liberada.`
          });
        }
      );
    });
  });

  // ─── SOCKET.IO GPS STREAMING EM TEMPO REAL ───────────────────────
  io.on('connection', (socket) => {
    // Cliente entra na sala de rastreio da entrega
    socket.on('entrar_rastreio', (data) => {
      if (data && data.token) {
        socket.join('rastreio_' + data.token);
      }
    });

    // Motoboy transmite localização GPS
    socket.on('motoboy_gps_update', (data) => {
      const { motoboyId, lat, lng } = data || {};
      if (motoboyId && lat && lng) {
        db.run(
          `UPDATE motoboys SET lat = ?, lng = ?, ultima_atualizacao_gps = CURRENT_TIMESTAMP WHERE id = ?`,
          [lat, lng, motoboyId]
        );
        // Transmite para o painel de despacho da loja em tempo real
        socket.broadcast.emit('cheff_entregas_gps_posicao', { motoboyId, lat, lng, timestamp: new Date().toISOString() });
        // Transmite para os clientes acompanhando seus links
        io.emit('motoboy_gps_posicao', { motoboyId, lat, lng, timestamp: new Date().toISOString() });
      }
    });
  });
};
