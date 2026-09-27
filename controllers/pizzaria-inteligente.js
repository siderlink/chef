/**
 * controllers/pizzaria-inteligente.js
 * Módulo Especializado para Pizzarias e Cozinhas de Alta Demanda:
 * 
 * 1. Catálogo Dinâmico de Sabores, Massas, Bordas e Adicionais
 * 2. Motor de Montagem de Pizza (1, 2 ou 3 sabores com regra de maior valor ou média)
 * 3. Previsão Preditiva de Preparo (Fila do Forno + Tempo Dinâmico)
 * 4. KDS com Fases de Linha de Produção (Massa -> Recheio -> Forno -> Expedição)
 * 5. Integração com Delivery e Takeaway (Retirada)
 */
'use strict';

module.exports = function(app, options) {
  const {
    db: defaultDb,
    masterDb,
    io,
    sqlite3,
    verificarToken,
    getTenantDb,
    superAdminAuth
  } = options || {};

  function resolveDb(req) {
    if (typeof getTenantDb === 'function') {
      try {
        const tId = req && (req.query?.restaurante_id || req.body?.restaurante_id || req.tenantId || req.headers?.['x-tenant-id']);
        if (tId) {
          const tDb = getTenantDb(tId);
          if (tDb) return tDb;
        }
      } catch (e) {}
    }
    return defaultDb || masterDb;
  }

  // Auto-migração na inicialização
  migrarTabelasPizzaria(defaultDb || masterDb);

  // ══════════════════════════════════════════════════════════════════
  // ESQUEMAS DO BANCO DE DADOS DA PIZZARIA
  // ══════════════════════════════════════════════════════════════════
  function migrarTabelasPizzaria(db) {
    if (!db || typeof db.serialize !== 'function') return;

    db.serialize(() => {
      // 1. Sabores de Pizza
      db.run(`
        CREATE TABLE IF NOT EXISTS pizzaria_sabores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          categoria TEXT DEFAULT 'Salgada', -- 'Tradicional' | 'Especial' | 'Premium' | 'Doce'
          descricao TEXT,
          ingredientes_padrao TEXT, -- JSON com lista de ingredientes (ex: ["Mussarela", "Calabresa", "Cebola", "Orégano"])
          preco_broto REAL DEFAULT 35.0,
          preco_media REAL DEFAULT 48.0,
          preco_grande REAL DEFAULT 58.0,
          preco_familia REAL DEFAULT 68.0,
          disponivel INTEGER DEFAULT 1,
          tempo_preparo_base_min INTEGER DEFAULT 12,
          emoji TEXT DEFAULT '🍕',
          destaque INTEGER DEFAULT 0
        )
      `, () => {});

      // 2. Bordas Recheadas
      db.run(`
        CREATE TABLE IF NOT EXISTS pizzaria_bordas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          preco_adicional REAL DEFAULT 0,
          disponivel INTEGER DEFAULT 1,
          tipo TEXT DEFAULT 'Salgada' -- 'Salgada' | 'Doce' | 'Vulcao'
        )
      `, () => {});

      // 3. Tipos de Massa
      db.run(`
        CREATE TABLE IF NOT EXISTS pizzaria_massas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          descricao TEXT,
          preco_adicional REAL DEFAULT 0,
          disponivel INTEGER DEFAULT 1
        )
      `, () => {});

      // 4. Adicionais Extras
      db.run(`
        CREATE TABLE IF NOT EXISTS pizzaria_adicionais (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          preco REAL NOT NULL,
          categoria TEXT DEFAULT 'Geral', -- 'Queijos' | 'Carnes' | 'Vegetais' | 'Molhos'
          disponivel INTEGER DEFAULT 1
        )
      `, () => {});

      // 5. Histórico e Fila de Produção KDS de Pizzas
      db.run(`
        CREATE TABLE IF NOT EXISTS pizzaria_kds_producao (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pedido_id INTEGER,
          cliente_nome TEXT,
          cliente_whatsapp TEXT,
          endereco_entrega TEXT,
          bairro TEXT,
          tipo_consumo TEXT DEFAULT 'delivery', -- 'delivery' | 'retirada' | 'salao'
          tamanho TEXT DEFAULT 'Grande',
          massa TEXT DEFAULT 'Tradicional',
          borda TEXT DEFAULT 'Sem Borda',
          fracoes_json TEXT NOT NULL, -- Sabores escolhidos (ex: [{"sabor":"Calabresa","retirar":["cebola"],"adicionar":["bacon"]}])
          bebidas_adicionais_json TEXT,
          status TEXT DEFAULT 'abertura', -- 'abertura' | 'montagem' | 'forno' | 'pronto' | 'entregue'
          tempo_inicio_forno DATETIME,
          tempo_estimado_min INTEGER DEFAULT 25,
          observacoes TEXT,
          valor_total REAL DEFAULT 0.00,
          forma_pagamento TEXT DEFAULT 'PIX',
          criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
          finalizado_em DATETIME
        )
      `, () => {});

      // 6. Garantir tabela base de orders para integração transparente com CheffEntregas e Motoboys
      db.run(`
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          localName TEXT,
          customerName TEXT,
          address TEXT,
          bairro TEXT,
          phone TEXT,
          total REAL DEFAULT 0.00,
          paymentMethod TEXT DEFAULT 'Dinheiro',
          changeFor REAL DEFAULT 0.00,
          status TEXT DEFAULT 'Pronto',
          isDelivery INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          motoboy TEXT
        )
      `, () => {});

      // Migração de compatibilidade retroativa para colunas em pizzaria_kds_producao
      db.all('PRAGMA table_info(pizzaria_kds_producao)', [], (errCols, cols) => {
        if (!errCols && Array.isArray(cols)) {
          const names = cols.map(c => c.name);
          if (!names.includes('endereco_entrega')) db.run('ALTER TABLE pizzaria_kds_producao ADD COLUMN endereco_entrega TEXT', () => {});
          if (!names.includes('bairro')) db.run('ALTER TABLE pizzaria_kds_producao ADD COLUMN bairro TEXT', () => {});
          if (!names.includes('cliente_whatsapp')) db.run('ALTER TABLE pizzaria_kds_producao ADD COLUMN cliente_whatsapp TEXT', () => {});
          if (!names.includes('valor_total')) db.run('ALTER TABLE pizzaria_kds_producao ADD COLUMN valor_total REAL DEFAULT 0.00', () => {});
          if (!names.includes('forma_pagamento')) db.run('ALTER TABLE pizzaria_kds_producao ADD COLUMN forma_pagamento TEXT DEFAULT "PIX"', () => {});
        }
      });

      // Sementes automáticas caso a tabela esteja vazia
      db.get('SELECT COUNT(*) as total FROM pizzaria_sabores', [], (err, row) => {
        if (!err && row && row.total === 0) {
          seedPizzariaData(db);
        }
      });
    });
  }

  function seedPizzariaData(db) {
    const sabores = [
      ['Calabresa Especial', 'Tradicional', 'Molho de tomate italiano, muçarela derretida, fatias finas de calabresa defumada, rodelas de cebola roxa fresca e orégano.', JSON.stringify(['Molho de Tomate', 'Muçarela', 'Calabresa', 'Cebola Roxa', 'Azeitonas', 'Orégano']), 35, 48, 56, 66, 1, 10, '🍕', 1],
      ['Frango com Catupiry Original', 'Especial', 'Peito de frango desfiado temperado artesanalmente, generosa camada do legítimo Catupiry cremoso e azeitonas pretas.', JSON.stringify(['Molho de Tomate', 'Muçarela', 'Frango Desfiado', 'Catupiry Original', 'Orégano']), 38, 52, 62, 72, 1, 12, '🍗', 1],
      ['Quatro Queijos Nobres', 'Especial', 'Equilíbrio perfeito de muçarela curada, provolone defumado, gorgonzola cremoso e Catupiry sobre molho artesanal.', JSON.stringify(['Molho de Tomate', 'Muçarela', 'Provolone', 'Gorgonzola', 'Catupiry']), 40, 54, 64, 76, 1, 12, '🧀', 1],
      ['Portuguesa Tradicional', 'Tradicional', 'Presunto cozido fatiado, muçarela, ovos caipiras cozidos picados, rodelas de cebola, ervilhas verdes e azeitonas pretas.', JSON.stringify(['Molho de Tomate', 'Muçarela', 'Presunto', 'Ovos', 'Cebola', 'Ervilha', 'Azeitonas']), 38, 50, 60, 70, 1, 12, '🍳', 0],
      ['Margherita Gourmet', 'Tradicional', 'Fatias de tomate italiano selecionado, folhas frescas de manjericão gigante, muçarela de búfala e azeite extravirgem.', JSON.stringify(['Molho de Tomate', 'Muçarela', 'Tomate Italiano', 'Manjericão Fresco', 'Azeite']), 36, 49, 58, 68, 1, 10, '🌿', 1],
      ['Bacon Crocante & Milho Doce', 'Especial', 'Muçarela especial com fartos cubos de bacon dourado crocante e milho doce selecionado.', JSON.stringify(['Molho de Tomate', 'Muçarela', 'Bacon Crocante', 'Milho Doce', 'Orégano']), 39, 53, 63, 74, 1, 12, '🥓', 0],
      ['Carne Seca com Cream Cheese', 'Premium', 'Carne seca desfiada refogada na manteiga de garrafa, cebola roxa bem caramelizada e cream cheese Philadelphia.', JSON.stringify(['Molho de Tomate', 'Muçarela', 'Carne Seca', 'Cebola Roxa', 'Cream Cheese']), 45, 62, 74, 86, 1, 14, '🥩', 1],
      ['Nutella com Morangos Frescos', 'Doce', 'Creme autêntico de avelãs Nutella com fatias generosas de morangos frescos e raspas de chocolate belga.', JSON.stringify(['Nutella', 'Morangos Frescos', 'Raspas de Chocolate']), 42, 56, 68, 78, 1, 8, '🍓', 1],
      ['Doce de Leite com Banana e Canela', 'Doce', 'Doce de leite mineiro cremoso, bananas caramelizadas fatiadas e toque aromático de canela em pó.', JSON.stringify(['Doce de Leite', 'Banana Caramelizada', 'Canela']), 38, 50, 60, 70, 1, 8, '🍌', 0]
    ];

    sabores.forEach(s => {
      db.run(`
        INSERT INTO pizzaria_sabores (nome, categoria, descricao, ingredientes_padrao, preco_broto, preco_media, preco_grande, preco_familia, disponivel, tempo_preparo_base_min, emoji, destaque)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, s, () => {});
    });

    const bordas = [
      ['Sem Borda Recheada', 0.0, 1, 'Salgada'],
      ['Borda de Catupiry Original', 9.90, 1, 'Salgada'],
      ['Borda de Cheddar Cremoso', 9.90, 1, 'Salgada'],
      ['Borda Vulcão Quatro Queijos', 14.90, 1, 'Vulcao'],
      ['Borda de Chocolate ao Leite', 12.90, 1, 'Doce'],
      ['Borda Vulcão Doce de Leite', 14.90, 1, 'Vulcao']
    ];
    bordas.forEach(b => {
      db.run('INSERT INTO pizzaria_bordas (nome, preco_adicional, disponivel, tipo) VALUES (?, ?, ?, ?)', b, () => {});
    });

    const massas = [
      ['Tradicional Crocante', 'Massa artesanal italiana, bordas aeradas e fundo crocante.', 0.0, 1],
      ['Fina Estilo Nova York', 'Massa fininha e leve, perfeita para quem aprecia mais o recheio.', 0.0, 1],
      ['Integral 7 Grãos', 'Farinha integral rústica rica em fibras e sabor único.', 4.0, 1],
      ['Fermentação Natural (Sourdough)', 'Leveza máxima, fermentação lenta de 48 horas.', 6.0, 1]
    ];
    massas.forEach(m => {
      db.run('INSERT INTO pizzaria_massas (nome, descricao, preco_adicional, disponivel) VALUES (?, ?, ?, ?)', m, () => {});
    });

    const adicionais = [
      ['Bacon Crocante Extra', 6.50, 'Carnes', 1],
      ['Catupiry Extra', 7.00, 'Queijos', 1],
      ['Cheddar Melt Extra', 6.00, 'Queijos', 1],
      ['Alho Frito Dourado', 3.50, 'Temperos', 1],
      ['Queijo Parmesão Ralado na Hora', 5.00, 'Queijos', 1],
      ['Tomate Seco Artesanal', 6.00, 'Vegetais', 1],
      ['Champignon Fresco Laminado', 7.00, 'Vegetais', 1],
      ['Pimenta Calabresa em Flocos', 2.00, 'Temperos', 1]
    ];
    adicionais.forEach(a => {
      db.run('INSERT INTO pizzaria_adicionais (nome, preco, categoria, disponivel) VALUES (?, ?, ?, ?)', a, () => {});
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ENDPOINTS DA PIZZARIA INTELIGENTE
  // ══════════════════════════════════════════════════════════════════

  // 1. Catálogo Completo do Montador (Sabores, Massas, Bordas, Adicionais e Bebidas)
  app.get('/api/pizzaria/catalogo', (req, res) => {
    const db = resolveDb(req);
    migrarTabelasPizzaria(db);

    db.all('SELECT * FROM pizzaria_sabores WHERE disponivel = 1 ORDER BY destaque DESC, categoria ASC, nome ASC', [], (errSabores, sabores) => {
      db.all('SELECT * FROM pizzaria_bordas WHERE disponivel = 1 ORDER BY preco_adicional ASC', [], (errBordas, bordas) => {
        db.all('SELECT * FROM pizzaria_massas WHERE disponivel = 1 ORDER BY preco_adicional ASC', [], (errMassas, massas) => {
          db.all('SELECT * FROM pizzaria_adicionais WHERE disponivel = 1 ORDER BY categoria ASC, nome ASC', [], (errAdic, adicionais) => {
            // Bebidas e Sobremesas adicionais
            const bebidas = [
              { id: 'coca_2l', nome: 'Coca-Cola 2 Litros', preco: 14.00, emoji: '🥤' },
              { id: 'guarana_2l', nome: 'Guaraná Antarctica 2 Litros', preco: 12.00, emoji: '🥤' },
              { id: 'coca_lata', nome: 'Coca-Cola Lata 350ml', preco: 6.50, emoji: '🥫' },
              { id: 'cerveja_heineken', nome: 'Heineken Long Neck 330ml', preco: 10.50, emoji: '🍺' },
              { id: 'suco_natural_1l', nome: 'Suco Natural de Laranja 1L', preco: 15.00, emoji: '🍊' }
            ];

            const parsedSabores = (sabores || []).map(s => {
              let ing = [];
              try { ing = JSON.parse(s.ingredientes_padrao); } catch (e) {}
              return { ...s, ingredientes: ing };
            });

            res.json({
              ok: true,
              sabores: parsedSabores,
              bordas: bordas || [],
              massas: massas || [],
              adicionais: adicionais || [],
              bebidas
            });
          });
        });
      });
    });
  });

  // 2. Cálculo de Previsão Preditiva de Tempo de Espera
  app.get('/api/pizzaria/previsao-tempo', (req, res) => {
    const db = resolveDb(req);

    // Conta quantas pizzas estão no forno e em montagem neste momento
    db.get(`
      SELECT 
        COUNT(CASE WHEN status IN ('abertura', 'montagem') THEN 1 END) as na_montagem,
        COUNT(CASE WHEN status = 'forno' THEN 1 END) as no_forno
      FROM pizzaria_kds_producao 
      WHERE status IN ('abertura', 'montagem', 'forno')
    `, [], (err, counts) => {
      const naMontagem = counts?.na_montagem || 0;
      const noForno = counts?.no_forno || 0;

      // Capacidade típica de fornos de esteira ou lastro: 4 a 6 pizzas simultâneas (tempo 8 a 12 min)
      const tempoBaseMin = 20;
      const tempoAdicionalFila = Math.ceil((naMontagem * 3) + (noForno * 2));
      const tempoTotalEstimado = Math.min(65, tempoBaseMin + tempoAdicionalFila);

      res.json({
        ok: true,
        tempo_estimado_min: tempoTotalEstimado,
        fila_atual: {
          em_montagem: naMontagem,
          no_forno: noForno
        },
        status_cozinha: tempoTotalEstimado <= 30 ? 'Normal' : tempoTotalEstimado <= 45 ? 'Moderada' : 'Pico Intenso',
        dica_preparo: tempoTotalEstimado > 40 ? 'Cozinha em alta demanda. Priorizando encomendas e fornos.' : 'Fluxo rápido.'
      });
    });
  });

  // 3. Submeter Pedido Personalizado de Pizza (Delivery ou Retirada)
  app.post('/api/pizzaria/pedido-customizado', (req, res) => {
    const db = resolveDb(req);
    const {
      cliente_nome,
      cliente_whatsapp,
      tipo_consumo, // 'delivery' | 'retirada'
      endereco_entrega,
      bairro,
      tamanho,
      massa,
      borda,
      fracoes, // Array de frações com { sabor_id, nome, retirar: [], adicionar: [] }
      bebidas, // Array de { id, nome, preco, qtd }
      valor_total,
      forma_pagamento,
      observacoes
    } = req.body || {};

    if (!cliente_nome || !fracoes || !fracoes.length) {
      return res.status(400).json({ ok: false, erro: 'Nome do cliente e sabores da pizza são obrigatórios.' });
    }

    // Calcula tempo estimado
    const tempoEstimadoMin = tipo_consumo === 'retirada' ? 25 : 40;
    const valorTotalNum = parseFloat(valor_total) || 65.0;
    const tipo = tipo_consumo || 'delivery';

    // Determina bairro para agrupamento no despachador TSP de motoboys
    let bairroLimpo = (bairro || '').trim();
    if (!bairroLimpo && endereco_entrega) {
      const partes = endereco_entrega.split(/[-–,]/);
      if (partes.length >= 2) {
        bairroLimpo = partes[partes.length - 1].trim();
      }
    }
    if (!bairroLimpo) bairroLimpo = 'Centro';

    // Função interna para inserir na fila do KDS
    const gravarKds = (orderId = null) => {
      db.run(`
        INSERT INTO pizzaria_kds_producao (
          pedido_id, cliente_nome, cliente_whatsapp, endereco_entrega, bairro,
          tipo_consumo, tamanho, massa, borda, fracoes_json, bebidas_adicionais_json,
          status, tempo_estimado_min, observacoes, valor_total, forma_pagamento
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'abertura', ?, ?, ?, ?)
      `, [
        orderId,
        cliente_nome,
        cliente_whatsapp || '',
        endereco_entrega || '',
        bairroLimpo,
        tipo,
        tamanho || 'Grande',
        massa || 'Tradicional Crocante',
        borda || 'Sem Borda',
        JSON.stringify(fracoes),
        JSON.stringify(bebidas || []),
        tempoEstimadoMin,
        observacoes || '',
        valorTotalNum,
        forma_pagamento || 'PIX'
      ], function(errKds) {
        if (errKds) return res.status(500).json({ ok: false, erro: errKds.message });

        const novoKdsId = this.lastID;

        // Notifica via Socket.IO para a tela da cozinha em tempo real
        if (io && io.emit) {
          io.emit('novo_pedido_pizza_kds', {
            id: novoKdsId,
            pedido_id: orderId,
            cliente_nome,
            tamanho,
            massa,
            borda,
            fracoes,
            tipo_consumo: tipo,
            endereco_entrega,
            bairro: bairroLimpo,
            tempo_estimado_min: tempoEstimadoMin
          });

          // Se for delivery, notifica painel de entregas
          if (tipo === 'delivery') {
            io.emit('cheff_entregas_atualizado', { tipo: 'novo_pedido_delivery', orderId, cliente_nome });
          }
        }

        res.json({
          ok: true,
          kds_id: novoKdsId,
          pedido_id: orderId || novoKdsId,
          tempo_estimado_min: tempoEstimadoMin,
          mensagem: '🍕 Pedido recebido e despachado para a linha de produção da cozinha!',
          pix_copia_cola: '00020126580014br.gov.bcb.pix0136' + novoKdsId + '-chef-cozinha520400005303986540' + valorTotalNum.toFixed(2) + '5802BR5920CHEF PIZZARIA6009SAO PAULO62070503***6304ABCD'
        });
      });
    };

    // Se for delivery, cria também o registro na tabela orders para integração de rotas e motoboys
    if (tipo === 'delivery') {
      db.run(`
        INSERT INTO orders (
          localName, customerName, address, bairro, phone, total, paymentMethod, status, isDelivery
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Em preparo', 1)
      `, [
        'Delivery Pizzaria',
        cliente_nome,
        endereco_entrega || '',
        bairroLimpo,
        cliente_whatsapp || '',
        valorTotalNum,
        forma_pagamento || 'PIX'
      ], function(errOrder) {
        const orderId = (!errOrder && this.lastID) ? this.lastID : null;
        gravarKds(orderId);
      });
    } else {
      gravarKds(null);
    }
  });

  // 4. KDS de Cozinha: Listar Fila de Pizzas
  app.get('/api/pizzaria/kds/fila', (req, res) => {
    const db = resolveDb(req);

    db.all(`
      SELECT *,
        CAST((strftime('%s', 'now', 'localtime') - strftime('%s', criado_em)) / 60 AS INTEGER) as minutos_em_espera
      FROM pizzaria_kds_producao
      WHERE status NOT IN ('entregue')
      ORDER BY 
        CASE status 
          WHEN 'abertura' THEN 1 
          WHEN 'montagem' THEN 2 
          WHEN 'forno' THEN 3 
          WHEN 'pronto' THEN 4 
          ELSE 5 
        END,
        id ASC
      LIMIT 30
    `, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });

      const pedidosFormatados = (rows || []).map(r => {
        let fracoes = [];
        let bebidas = [];
        try { fracoes = JSON.parse(r.fracoes_json); } catch (e) {}
        try { bebidas = JSON.parse(r.bebidas_adicionais_json); } catch (e) {}
        return {
          ...r,
          fracoes,
          bebidas
        };
      });

      res.json({ ok: true, pedidos: pedidosFormatados });
    });
  });

  // 5. KDS de Cozinha: Avançar Etapa (Abertura -> Montagem -> Forno -> Pronto -> Entregue)
  app.post('/api/pizzaria/kds/avancar-etapa', (req, res) => {
    const db = resolveDb(req);
    const { id, novo_status } = req.body || {};

    if (!id || !novo_status) {
      return res.status(400).json({ ok: false, erro: 'id e novo_status são obrigatórios.' });
    }

    const campos = ['status = ?'];
    const params = [novo_status];

    if (novo_status === 'forno') {
      campos.push("tempo_inicio_forno = datetime('now', 'localtime')");
    } else if (novo_status === 'pronto' || novo_status === 'entregue') {
      campos.push("finalizado_em = datetime('now', 'localtime')");
    }

    params.push(parseInt(id, 10));

    db.get('SELECT pedido_id, cliente_nome, tipo_consumo FROM pizzaria_kds_producao WHERE id = ?', [id], (errGet, itemKds) => {
      db.run(`UPDATE pizzaria_kds_producao SET ${campos.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });

        // Sincroniza tabela orders se houver pedido vinculado
        if (itemKds && itemKds.pedido_id) {
          if (novo_status === 'pronto') {
            db.run(`UPDATE orders SET status = 'Pronto' WHERE id = ?`, [itemKds.pedido_id], () => {});
            if (io && io.emit) {
              io.emit('cheff_entregas_atualizado', { tipo: 'pedido_pronto', pedidoId: itemKds.pedido_id, cliente: itemKds.cliente_nome });
            }
          } else if (novo_status === 'entregue') {
            db.run(`UPDATE orders SET status = 'Entregue' WHERE id = ?`, [itemKds.pedido_id], () => {});
            if (io && io.emit) {
              io.emit('cheff_entregas_atualizado', { tipo: 'pedido_entregue', pedidoId: itemKds.pedido_id });
            }
          }
        }

        // Emite broadcast socket para o KDS
        if (io && io.emit) {
          io.emit('kds_etapa_atualizada', { id, status: novo_status });
        }

        res.json({ ok: true, id, status: novo_status, pedido_id: itemKds ? itemKds.pedido_id : null });
      });
    });
  });
};
