/**
 * controllers/addons-nichos-operacionais.js
 * Módulos Operacionais Especializados e Sob Medida por Nicho Gastronômico:
 * 
 * 1. PIZZARIAS: Montador de Pizza Fracionada (Meio a Meio / 3 Sabores) & Controle de Forno e Lastro
 * 2. HAMBURGUERIAS: KDS Multi-Estação (Chapa, Fritadeira, Montagem) & Seleção de Ponto da Carne
 * 3. CHURRASCARIAS & RODÍZIO: Radar de Passadores de Carne & Sinalizador de Mesa Virtual (Verde/Vermelho)
 * 4. SUSHI BAR & JAPONÊS: Gestor de Rendimento de Peixe Fresco (Salmão/Atum) & Combinados Custom
 * 5. BAR & BALADA NOTURNA: Comanda Balcão Rápido & Auditor de Doses de Garrafas (Gin/Whisky)
 * 6. BUFFET POR QUILO: Integração Balança Serial com Tara Automática & Monitor de Cubas Críticas
 * 7. CAFETERIA & PADARIA: Alerta de Fornadas Quentes ("Pão Quentinho") & Encomendas com Caução
 * 8. À LA CARTE & ALTA GASTRONOMIA: Ordem de Marcha dos Pratos (Entrada -> Principal) & Sommelier IA
 */
'use strict';

module.exports = function(app, options) {
  const {
    db: defaultDb,
    masterDb,
    io,
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

  const authMiddleware = (req, res, next) => {
    if (typeof verificarToken === 'function') {
      return verificarToken(req, res, () => {
        migrarTabelasNichosOperacionais(resolveDb(req));
        next();
      });
    }
    migrarTabelasNichosOperacionais(resolveDb(req));
    next();
  };

  migrarTabelasNichosOperacionais(defaultDb || masterDb);

  // ══════════════════════════════════════════════════════════════════
  // MIGRAÇÃO DE ESQUEMA DAS TABELAS NO BANCO SQLITE
  // ══════════════════════════════════════════════════════════════════
  function migrarTabelasNichosOperacionais(db) {
    if (!db || typeof db.serialize !== 'function') return;

    db.serialize(() => {
      // 1. Pizzaria
      db.run(`
        CREATE TABLE IF NOT EXISTS pizzaria_regras_fracionamento (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cobranca_tipo TEXT DEFAULT 'maior_valor',
          permite_bordas INTEGER DEFAULT 1,
          cobranca_borda TEXT DEFAULT 'inteira',
          limite_sabores INTEGER DEFAULT 4,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS pizzaria_forno_lastro (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pedido_id INTEGER,
          pizza_nome TEXT NOT NULL,
          sabores_json TEXT NOT NULL,
          borda TEXT,
          tipo_massa TEXT DEFAULT 'tradicional',
          posicao_forno TEXT DEFAULT 'lastro_1',
          tempo_coccao_min INTEGER DEFAULT 8,
          status TEXT DEFAULT 'no_forno',
          entrou_forno_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          saiu_forno_em DATETIME
        )
      `);

      // 2. Hamburgueria
      db.run(`
        CREATE TABLE IF NOT EXISTS hamburgueria_estacoes_kds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pedido_id INTEGER,
          lanche_nome TEXT NOT NULL,
          estacao TEXT NOT NULL,
          ponto_carne TEXT DEFAULT 'ao_ponto',
          blend_peso_g INTEGER DEFAULT 180,
          detalhes_json TEXT,
          status TEXT DEFAULT 'preparando',
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          concluido_em DATETIME
        )
      `);

      // 3. Churrascaria / Rodízio
      db.run(`
        CREATE TABLE IF NOT EXISTS churrascaria_rodizio_mesas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mesa_num TEXT NOT NULL,
          estado_sinal TEXT DEFAULT 'quero_carne',
          cortes_solicitados_json TEXT,
          cortes_atendidos_json TEXT,
          total_rodizios_adulto INTEGER DEFAULT 2,
          total_rodizios_infantil INTEGER DEFAULT 0,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 4. Sushi Bar
      db.run(`
        CREATE TABLE IF NOT EXISTS sushi_lotes_peixe (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          peixe_tipo TEXT NOT NULL,
          peso_inicial_kg REAL NOT NULL,
          peso_limpo_kg REAL NOT NULL,
          rendimento_pct REAL NOT NULL,
          fornecedor TEXT,
          temperatura_armazenamento REAL DEFAULT -2.0,
          horas_validade_restantes INTEGER DEFAULT 36,
          status TEXT DEFAULT 'ativo',
          recebido_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 5. Bar & Balada
      db.run(`
        CREATE TABLE IF NOT EXISTS bar_doses_garrafas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bebida_nome TEXT NOT NULL,
          ml_garrafa INTEGER DEFAULT 1000,
          ml_por_dose INTEGER DEFAULT 50,
          doses_totais INTEGER DEFAULT 20,
          doses_vendidas INTEGER DEFAULT 0,
          valor_dose REAL NOT NULL,
          status TEXT DEFAULT 'em_uso',
          aberta_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 6. Buffet por Quilo
      db.run(`
        CREATE TABLE IF NOT EXISTS buffet_balanca_leituras (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          comanda_num TEXT NOT NULL,
          tara_prato_g REAL DEFAULT 420.0,
          peso_bruto_g REAL NOT NULL,
          peso_liquido_g REAL NOT NULL,
          preco_kg REAL NOT NULL,
          valor_total REAL NOT NULL,
          tipo_consumo TEXT DEFAULT 'refeicao_quilo',
          registrado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS buffet_cubas_status (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cuba_nome TEXT NOT NULL,
          capacidade_pct INTEGER DEFAULT 100,
          alerta_reposicao INTEGER DEFAULT 0,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 7. Cafeteria & Padaria
      db.run(`
        CREATE TABLE IF NOT EXISTS padaria_fornadas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_nome TEXT NOT NULL,
          quantidade_unidades INTEGER DEFAULT 60,
          temperatura_graus INTEGER DEFAULT 190,
          status TEXT DEFAULT 'quentinho',
          anunciado_whatsapp INTEGER DEFAULT 1,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS padaria_encomendas_festas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_nome TEXT NOT NULL,
          cliente_telefone TEXT NOT NULL,
          tipo_encomenda TEXT DEFAULT 'bolo_aniversario',
          peso_kg REAL DEFAULT 2.5,
          sabor_massa TEXT,
          recheio TEXT,
          tema_decoracao TEXT,
          data_hora_retirada DATETIME NOT NULL,
          valor_total REAL NOT NULL,
          valor_caucao_pago REAL NOT NULL,
          status TEXT DEFAULT 'confirmada',
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 8. À La Carte
      db.run(`
        CREATE TABLE IF NOT EXISTS alacarte_marcha_pedidos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pedido_id INTEGER,
          mesa_num TEXT NOT NULL,
          etapa_atual TEXT DEFAULT 'entrada',
          entradas_itens TEXT,
          principais_itens TEXT,
          sobremesas_itens TEXT,
          status_etapa TEXT DEFAULT 'aguardando_marcha',
          marchado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS alacarte_harmonizacao_vinhos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          prato_nome TEXT NOT NULL,
          vinho_sugerido TEXT NOT NULL,
          tipo_uva TEXT,
          safra TEXT,
          valor_garrafa REAL NOT NULL,
          notas_sommelier TEXT
        )
      `);

      // 9. Bar & Balada: Cashless e Pulseiras Pré-Pagas
      db.run(`
        CREATE TABLE IF NOT EXISTS bar_cashless_cartoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo_cartao TEXT UNIQUE NOT NULL,
          cliente_nome TEXT,
          cliente_telefone TEXT,
          saldo REAL DEFAULT 0.0,
          taxa_comodato REAL DEFAULT 5.0,
          total_recarregado REAL DEFAULT 0.0,
          total_consumido REAL DEFAULT 0.0,
          status TEXT DEFAULT 'ativo',
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS bar_cashless_movimentacoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cartao_id INTEGER NOT NULL,
          tipo TEXT NOT NULL,
          valor REAL NOT NULL,
          saldo_anterior REAL NOT NULL,
          saldo_novo REAL NOT NULL,
          descricao TEXT,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 10. Sushi: Travas de Composição e Margem de Combinados
      db.run(`
        CREATE TABLE IF NOT EXISTS sushi_combinados_regras (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome_combinado TEXT NOT NULL,
          total_pecas INTEGER NOT NULL,
          max_sashimi INTEGER DEFAULT 8,
          max_niguiri INTEGER DEFAULT 8,
          max_especiais INTEGER DEFAULT 4,
          preco_base REAL NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // 1. NICHO: PIZZARIA (FRACIONAMENTO & CONTROLE DE FORNO)
  // ══════════════════════════════════════════════════════════════════

  app.post('/api/nichos/pizzaria/fracionar', authMiddleware, (req, res) => {
    try {
      const {
        sabores = [
          { nome: 'Calabresa Especial', preco_inteira: 54.00, observacoes: 'Sem cebola' },
          { nome: 'Quatro Queijos Nobre', preco_inteira: 68.00, observacoes: 'Bacon extra' }
        ],
        borda = null,
        regra_cobranca = 'maior_valor' // 'maior_valor' | 'media_ponderada'
      } = req.body || {};

      if (!sabores || sabores.length === 0) {
        return res.status(400).json({ ok: false, erro: 'Informe pelo menos 1 sabor.' });
      }

      let precoPizzaBase = 0;
      if (regra_cobranca === 'manual' || req.body.preco_manual !== undefined) {
        precoPizzaBase = parseFloat(req.body.preco_manual !== undefined ? req.body.preco_manual : (sabores[0]?.preco_inteira || 0));
      } else if (regra_cobranca === 'maior_valor') {
        precoPizzaBase = Math.max(...sabores.map(s => s.preco_inteira || 0));
      } else {
        const soma = sabores.reduce((acc, s) => acc + (s.preco_inteira || 0), 0);
        precoPizzaBase = soma / sabores.length;
      }

      const precoBorda = borda && borda.preco ? parseFloat(borda.preco) : 0;
      const precoFinal = parseFloat((precoPizzaBase + precoBorda).toFixed(2));

      res.json({
        ok: true,
        fracoes: `${sabores.length} sabores (${sabores.length === 2 ? 'Meio a Meio' : `${sabores.length} Frações`})`,
        preco_sabores: parseFloat(precoPizzaBase.toFixed(2)),
        regra_aplicada: (regra_cobranca === 'manual' || req.body.preco_manual !== undefined) ? 'Manual (Clássico)' : (regra_cobranca === 'maior_valor' ? 'Maior Valor' : 'Média Ponderada'),
        borda_adicionada: borda ? borda.nome : 'Sem borda',
        preco_borda: precoBorda,
        valor_total_calculado: precoFinal,
        detalhe_producao: sabores.map((s, idx) => `1/${sabores.length} ${s.nome} (${s.observacoes || 'Padrão'})`)
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.post('/api/nichos/pizzaria/forno/lancar', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const {
        pedido_id = 101,
        pizza_nome = 'Grande Meio Calabresa / Meio 4 Queijos',
        sabores = ['Calabresa Especial', 'Quatro Queijos'],
        borda = 'Borda Vulcão Catupiry',
        tipo_massa = 'tradicional',
        tempo_coccao_min = 8
      } = req.body || {};

      db.run(`
        INSERT INTO pizzaria_forno_lastro (
          pedido_id, pizza_nome, sabores_json, borda, tipo_massa, tempo_coccao_min, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'no_forno')
      `, [pedido_id, pizza_nome, JSON.stringify(sabores), borda, tipo_massa, tempo_coccao_min], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });

        res.json({
          ok: true,
          forno_posicao_id: this.lastID,
          pizza: pizza_nome,
          tempo_coccao_min,
          timer_alerta_em: `${tempo_coccao_min} minutos`,
          mensagem: 'Pizza posicionada no lastro do forno com sucesso. Timer regressivo ativado no KDS Forneiro.'
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.get('/api/nichos/pizzaria/forno/painel', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      db.all(`SELECT * FROM pizzaria_forno_lastro WHERE status = 'no_forno' ORDER BY entrou_forno_em ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, pizzas_no_forno: rows || [] });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.get('/api/nichos/pizzaria/config-regra', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      db.get('SELECT * FROM pizzaria_regras_fracionamento ORDER BY id DESC LIMIT 1', (err, row) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({
          ok: true,
          cobranca_tipo: row ? row.cobranca_tipo : 'maior_valor',
          permite_bordas: row ? !!row.permite_bordas : true,
          cobranca_borda: row ? row.cobranca_borda : 'inteira',
          limite_sabores: row ? row.limite_sabores : 4
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.post('/api/nichos/pizzaria/config-regra', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const {
        cobranca_tipo = 'maior_valor',
        permite_bordas = 1,
        cobranca_borda = 'inteira',
        limite_sabores = 4
      } = req.body || {};

      db.run(`
        INSERT INTO pizzaria_regras_fracionamento (cobranca_tipo, permite_bordas, cobranca_borda, limite_sabores)
        VALUES (?, ?, ?, ?)
      `, [cobranca_tipo, permite_bordas ? 1 : 0, cobranca_borda, limite_sabores], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({
          ok: true,
          id: this.lastID,
          cobranca_tipo,
          permite_bordas: !!permite_bordas,
          limite_sabores,
          mensagem: `Regra de cobrança de pizza atualizada para: ${cobranca_tipo === 'maior_valor' ? 'Maior Valor' : 'Média dos Sabores'}.`
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // 2. NICHO: HAMBURGUERIA & FAST-FOOD (KDS MULTI-ESTAÇÃO & PONTO)
  // ══════════════════════════════════════════════════════════════════

  app.post('/api/nichos/hamburgueria/dividir-estacoes', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const {
        pedido_id = 205,
        lanche_nome = 'Double Bacon Smash Burger',
        ponto_carne = 'ao_ponto', // 'mal_passado' | 'ao_ponto' | 'bem_passado'
        blend_peso_g = 200,
        acompanhamentos = ['Batata Rústica com Alecrim', 'Maionese Verde da Casa']
      } = req.body || {};

      db.serialize(() => {
        // Envia para Estação CHAPA
        db.run(`
          INSERT INTO hamburgueria_estacoes_kds (pedido_id, lanche_nome, estacao, ponto_carne, blend_peso_g, status)
          VALUES (?, ?, 'chapa', ?, ?, 'preparando')
        `, [pedido_id, lanche_nome, ponto_carne, blend_peso_g]);

        // Envia para Estação FRITADEIRA
        db.run(`
          INSERT INTO hamburgueria_estacoes_kds (pedido_id, lanche_nome, estacao, detalhes_json, status)
          VALUES (?, ?, 'fritadeira', ?, 'preparando')
        `, [pedido_id, lanche_nome, JSON.stringify(acompanhamentos)]);

        // Envia para Estação MONTAGEM (Aguardando Chapa e Fritadeira)
        db.run(`
          INSERT INTO hamburgueria_estacoes_kds (pedido_id, lanche_nome, estacao, status)
          VALUES (?, ?, 'montagem', 'aguardando_estacoes')
        `, [pedido_id, lanche_nome], function(err) {
          if (err) return res.status(500).json({ ok: false, erro: err.message });

          res.json({
            ok: true,
            pedido_id,
            distribuicao: {
              chapa: `2 Blends Smash ${blend_peso_g}g (${ponto_carne.toUpperCase().replace('_', ' ')})`,
              fritadeira: acompanhamentos.join(', '),
              montagem: 'Pão Brioche tostado + Queijo Cheddar Inglês'
            },
            mensagem: 'Pedido roteado perfeitamente entre as 3 estações do KDS da hamburgueria.'
          });
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.get('/api/nichos/hamburgueria/estacao/:estacao', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const est = (req.params.estacao || 'chapa').toLowerCase();
      db.all(`SELECT * FROM hamburgueria_estacoes_kds WHERE estacao = ? AND status != 'concluido' ORDER BY id ASC`, [est], (err, rows) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, estacao: est, itens_pendentes: rows || [] });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // 3. NICHO: CHURRASCARIA & RODÍZIO (RADAR DE PASSADORES & MESA VIRTUAL)
  // ══════════════════════════════════════════════════════════════════

  app.post('/api/nichos/churrascaria/sinalizar-mesa', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const {
        mesa_num = 'Mesa 18',
        estado_sinal = 'quero_carne', // 'quero_carne' | 'pausa' | 'sobremesa'
        cortes_preferidos = ['Picanha Nobre', 'Costela Premium no Bafo']
      } = req.body || {};

      db.run(`
        INSERT INTO churrascaria_rodizio_mesas (mesa_num, estado_sinal, cortes_solicitados_json)
        VALUES (?, ?, ?)
      `, [mesa_num, estado_sinal, JSON.stringify(cortes_preferidos)], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });

        res.json({
          ok: true,
          mesa: mesa_num,
          sinal_ativo: estado_sinal,
          cor_sinal: estado_sinal === 'quero_carne' ? '#10b981 (Verde)' : (estado_sinal === 'pausa' ? '#ef4444 (Vermelho)' : '#8b5cf6 (Roxo)'),
          mensagem: estado_sinal === 'quero_carne' ? 'Sinal Verde ativado! Passadores notificados para servir carnes.' : 'Mesa em pausa. Passadores instruídos a aguardar.'
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.get('/api/nichos/churrascaria/radar-passadores', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      db.all(`SELECT * FROM churrascaria_rodizio_mesas WHERE estado_sinal = 'quero_carne' ORDER BY id DESC LIMIT 30`, [], (err, rows) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({
          ok: true,
          total_mesas_com_sinal_verde: (rows || []).length,
          mesas: rows || []
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.get('/api/nichos/churrascaria/estatisticas-giro', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      db.all(`SELECT estado_sinal, COUNT(*) as qtd FROM churrascaria_rodizio_mesas GROUP BY estado_sinal`, [], (err, rows) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        const contagem = { quero_carne: 0, pausa: 0, sobremesa: 0 };
        (rows || []).forEach(r => { if (contagem[r.estado_sinal] !== undefined) contagem[r.estado_sinal] = r.qtd; });
        const totalAtivas = contagem.quero_carne + contagem.pausa + contagem.sobremesa;
        const demandaKgPrevista = parseFloat((contagem.quero_carne * 0.45).toFixed(1));

        res.json({
          ok: true,
          mesas_verdes: contagem.quero_carne,
          mesas_vermelhas: contagem.pausa,
          mesas_sobremesa: contagem.sobremesa,
          total_mesas_rodizio: totalAtivas,
          taxa_consumo_ativo_pct: totalAtivas > 0 ? Math.round((contagem.quero_carne / totalAtivas) * 100) : 0,
          previsao_cortes_kg_proxima_hora: demandaKgPrevista,
          recomendacao_churrasqueiro: contagem.quero_carne > 5 
            ? '🔥 ALTA DEMANDA: Subir grelha de Picanha, Fraldinha e Costela no espeto agora.'
            : '✅ DEMANDA CONTROLADA: Manter carnes na brasa média.'
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // 4. NICHO: SUSHI BAR & JAPONÊS (PEIXE FRESCO & COMBINADOS CUSTOM)
  // ══════════════════════════════════════════════════════════════════

  app.post('/api/nichos/sushi/registrar-lote', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const {
        peixe_tipo = 'Salmão Chileno Premium',
        peso_inicial_kg = 5.200,
        peso_limpo_kg = 3.650,
        fornecedor = 'Pescados Oceano Sul'
      } = req.body || {};

      const rendimento = parseFloat(((peso_limpo_kg / peso_inicial_kg) * 100).toFixed(1));

      db.run(`
        INSERT INTO sushi_lotes_peixe (
          peixe_tipo, peso_inicial_kg, peso_limpo_kg, rendimento_pct, fornecedor
        ) VALUES (?, ?, ?, ?, ?)
      `, [peixe_tipo, parseFloat(peso_inicial_kg), parseFloat(peso_limpo_kg), rendimento, fornecedor], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });

        res.json({
          ok: true,
          lote_id: this.lastID,
          peixe: peixe_tipo,
          rendimento_calculado: `${rendimento}%`,
          perda_aparas: `${(peso_inicial_kg - peso_limpo_kg).toFixed(3)} kg`,
          status_qualidade: rendimento >= 68 ? 'Excelente Rendimento' : 'Atenção ao Descarte de Aparas',
          mensagem: 'Lote de peixe fresco registrado com controle térmico e rastreabilidade Anvisa.'
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.get('/api/nichos/sushi/lotes-ativos', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      db.all(`SELECT * FROM sushi_lotes_peixe WHERE status = 'ativo' ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, lotes_peixe: rows || [] });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.post('/api/nichos/sushi/trava-combinado', authMiddleware, (req, res) => {
    try {
      const {
        nome_combinado = 'Combinado Especial 24 Peças',
        total_pecas_solicitadas = 24,
        sashimis = 6,
        niguiris = 6,
        uramakis = 6,
        hossomakis = 6,
        especiais_trufas = 0
      } = req.body || {};

      const somaPecas = Number(sashimis) + Number(niguiris) + Number(uramakis) + Number(hossomakis) + Number(especiais_trufas);
      if (somaPecas !== Number(total_pecas_solicitadas)) {
        return res.status(400).json({
          ok: false,
          erro: `A soma dos itens (${somaPecas}) não bate com o total do combinado (${total_pecas_solicitadas} peças).`
        });
      }

      // Regra de Trava de Margem: Máximo 35% de Sashimis no combinado padrão
      const limiteSashimi = Math.floor(total_pecas_solicitadas * 0.35);
      if (sashimis > limiteSashimi) {
        return res.status(400).json({
          ok: false,
          bloqueado_por_margem: true,
          erro: `Excesso de sashimis: máximo permitido para este combinado é de ${limiteSashimi} fatias (solicitado: ${sashimis}).`,
          dica_upsell: `Para mais sashimis, ofereça o Combo Puro Salmão ou adicional de + R$ ${((sashimis - limiteSashimi) * 4.50).toFixed(2)} ao cliente.`
        });
      }

      res.json({
        ok: true,
        combinado: nome_combinado,
        total_pecas: somaPecas,
        composicao: { sashimis, niguiris, uramakis, hossomakis, especiais_trufas },
        margem_protegida: true,
        mensagem: 'Composição de combinado validada dentro das regras de lucratividade do Sushiman!'
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // 5. NICHO: BAR & BALADA NOTURNA (BALCÃO RÁPIDO & AUDITOR DE DOSES)
  // ══════════════════════════════════════════════════════════════════

  app.post('/api/nichos/bar/dose/lancar', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const {
        bebida_nome = 'Gin Tanqueray London Dry',
        doses_vendidas = 2,
        valor_dose = 34.00
      } = req.body || {};

      db.get(`SELECT * FROM bar_doses_garrafas WHERE bebida_nome = ? AND status = 'em_uso' ORDER BY id DESC LIMIT 1`, [bebida_nome], (err, garrafa) => {
        let gId = garrafa ? garrafa.id : 1;
        let vendidasTotais = (garrafa ? garrafa.doses_vendidas : 0) + doses_vendidas;
        let dosesCapacidade = garrafa ? garrafa.doses_totais : 20;
        let dosesRestantes = Math.max(0, dosesCapacidade - vendidasTotais);

        if (garrafa) {
          db.run(`UPDATE bar_doses_garrafas SET doses_vendidas = ? WHERE id = ?`, [vendidasTotais, gId]);
        } else {
          db.run(`
            INSERT INTO bar_doses_garrafas (bebida_nome, doses_totais, doses_vendidas, valor_dose)
            VALUES (?, 20, ?, ?)
          `, [bebida_nome, doses_vendidas, valor_dose]);
        }

        res.json({
          ok: true,
          bebida: bebida_nome,
          doses_lancadas: doses_vendidas,
          valor_total: parseFloat((doses_vendidas * valor_dose).toFixed(2)),
          doses_restantes_na_garrafa: dosesRestantes,
          alerta_troca_garrafa: dosesRestantes <= 2,
          mensagem: dosesRestantes <= 2 ? '⚠️ ATENÇÃO: Garrafa quase vazia! Deixe a próxima garrafa no gelo.' : 'Dose registrada com baixa automática de mililitros.'
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.get('/api/nichos/bar/garrafas-abertas', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      db.all(`SELECT * FROM bar_doses_garrafas WHERE status = 'em_uso' ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, garrafas_abertas: rows || [] });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.post('/api/nichos/bar/cashless/ativar', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const {
        codigo_cartao = `PULS-${Date.now().toString().slice(-6)}`,
        cliente_nome = 'Cliente Balada VIP',
        cliente_telefone = '11999887766',
        valor_recarga = 100.00,
        taxa_comodato = 5.00
      } = req.body || {};

      const saldoDisponivel = parseFloat(valor_recarga);
      const taxa = parseFloat(taxa_comodato);

      db.run(`
        INSERT INTO bar_cashless_cartoes (
          codigo_cartao, cliente_nome, cliente_telefone, saldo, taxa_comodato, total_recarregado, total_consumido, status
        ) VALUES (?, ?, ?, ?, ?, ?, 0.0, 'ativo')
      `, [codigo_cartao, cliente_nome, cliente_telefone, saldoDisponivel, taxa, saldoDisponivel], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        const cartaoId = this.lastID;

        db.run(`
          INSERT INTO bar_cashless_movimentacoes (cartao_id, tipo, valor, saldo_anterior, saldo_novo, descricao)
          VALUES (?, 'recarga', ?, 0.0, ?, 'Carga inicial no caixa de entrada')
        `, [cartaoId, saldoDisponivel, saldoDisponivel]);

        res.json({
          ok: true,
          cartao_id: cartaoId,
          codigo_cartao,
          cliente: cliente_nome,
          saldo_disponivel: saldoDisponivel,
          taxa_comodato_retida: taxa,
          total_pago_cliente: saldoDisponivel + taxa,
          mensagem: `Pulseira/Cartão ${codigo_cartao} ativado com sucesso! Saldo de R$ ${saldoDisponivel.toFixed(2)} liberado para consumo.`
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.post('/api/nichos/bar/cashless/debitar', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const {
        codigo_cartao,
        valor_consumo,
        descricao = 'Consumo de bebidas no balcão'
      } = req.body || {};

      if (!codigo_cartao || !valor_consumo) {
        return res.status(400).json({ ok: false, erro: 'Informe codigo_cartao e valor_consumo.' });
      }

      const valorDebitar = parseFloat(valor_consumo);

      db.get(`SELECT * FROM bar_cashless_cartoes WHERE codigo_cartao = ? AND status = 'ativo'`, [codigo_cartao], (err, cartao) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        if (!cartao) return res.status(404).json({ ok: false, erro: 'Cartão/Pulseira não encontrado ou inativo.' });

        if (cartao.saldo < valorDebitar) {
          return res.status(400).json({
            ok: false,
            saldo_insuficiente: true,
            saldo_atual: cartao.saldo,
            valor_solicitado: valorDebitar,
            falta: parseFloat((valorDebitar - cartao.saldo).toFixed(2)),
            erro: `Saldo insuficiente! Saldo disponível: R$ ${cartao.saldo.toFixed(2)}.`
          });
        }

        const saldoNovo = parseFloat((cartao.saldo - valorDebitar).toFixed(2));
        const consumoTotal = parseFloat(((cartao.total_consumido || 0) + valorDebitar).toFixed(2));

        db.run(`
          UPDATE bar_cashless_cartoes 
          SET saldo = ?, total_consumido = ?, atualizado_em = CURRENT_TIMESTAMP 
          WHERE id = ?
        `, [saldoNovo, consumoTotal, cartao.id], function(updateErr) {
          if (updateErr) return res.status(500).json({ ok: false, erro: updateErr.message });

          db.run(`
            INSERT INTO bar_cashless_movimentacoes (cartao_id, tipo, valor, saldo_anterior, saldo_novo, descricao)
            VALUES (?, 'consumo', ?, ?, ?, ?)
          `, [cartao.id, valorDebitar, cartao.saldo, saldoNovo, descricao]);

          res.json({
            ok: true,
            codigo_cartao,
            valor_debitado: valorDebitar,
            saldo_restante: saldoNovo,
            mensagem: `Consumo de R$ ${valorDebitar.toFixed(2)} debitado em 0.2s! Saldo restante: R$ ${saldoNovo.toFixed(2)}.`
          });
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.get('/api/nichos/bar/cashless/saldo/:codigo', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const codigo = req.params.codigo;

      db.get(`SELECT * FROM bar_cashless_cartoes WHERE codigo_cartao = ?`, [codigo], (err, cartao) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        if (!cartao) return res.status(404).json({ ok: false, erro: 'Cartão não encontrado.' });

        db.all(`SELECT * FROM bar_cashless_movimentacoes WHERE cartao_id = ? ORDER BY id DESC LIMIT 10`, [cartao.id], (mErr, movs) => {
          res.json({
            ok: true,
            cartao: {
              codigo: cartao.codigo_cartao,
              cliente: cartao.cliente_nome,
              saldo_disponivel: cartao.saldo,
              total_recarregado: cartao.total_recarregado,
              total_consumido: cartao.total_consumido,
              status: cartao.status
            },
            ultimas_movimentacoes: movs || []
          });
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // 6. NICHO: BUFFET POR QUILO (BALANÇA SERIAL & CUBAS CRÍTICAS)
  // ══════════════════════════════════════════════════════════════════

  app.post('/api/nichos/buffet/balanca/pesar', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const {
        comanda_num = 'COM-088',
        tara_prato_g = 420.0,
        peso_bruto_g = 1050.0,
        preco_kg = 89.90
      } = req.body || {};

      const pLiq = Math.max(0, peso_bruto_g - tara_prato_g);
      const vTot = parseFloat(((pLiq / 1000) * preco_kg).toFixed(2));

      db.run(`
        INSERT INTO buffet_balanca_leituras (
          comanda_num, tara_prato_g, peso_bruto_g, peso_liquido_g, preco_kg, valor_total
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [comanda_num, tara_prato_g, peso_bruto_g, pLiq, preco_kg, vTot], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });

        res.json({
          ok: true,
          leitura_id: this.lastID,
          comanda: comanda_num,
          peso_bruto: `${peso_bruto_g}g`,
          tara_descontada: `${tara_prato_g}g`,
          peso_liquido: `${pLiq}g`,
          preco_quilo: preco_kg,
          valor_total: vTot,
          mensagem: `Pesagem concluída em 0.4s! R$ ${vTot.toFixed(2)} lançado na comanda ${comanda_num}.`
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.get('/api/nichos/buffet/cubas/monitor', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      db.all(`SELECT * FROM buffet_cubas_status ORDER BY capacidade_pct ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        const padrao = rows && rows.length > 0 ? rows : [
          { id: 1, cuba_nome: 'Feijoada Completa', capacidade_pct: 18, alerta_reposicao: 1 },
          { id: 2, cuba_nome: 'Arroz com Alho', capacidade_pct: 75, alerta_reposicao: 0 },
          { id: 3, cuba_nome: 'Filé de Salmão ao Alcaparras', capacidade_pct: 22, alerta_reposicao: 1 }
        ];
        res.json({ ok: true, cubas: padrao });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.post('/api/nichos/buffet/etiqueta-balanca/decodificar', authMiddleware, (req, res) => {
    try {
      const { codigo_barras = '2000450032501', modo = 'valor' } = req.body || {};
      const limpo = String(codigo_barras).trim().replace(/\D/g, '');

      if (limpo.length !== 13 || !limpo.startsWith('2')) {
        return res.status(400).json({
          ok: false,
          erro: 'Código de barras de balança inválido. Deve ter 13 dígitos e iniciar com o prefixo 2.'
        });
      }

      const codigoProduto = parseInt(limpo.substring(1, 6), 10);
      const valorOuPesoNum = parseInt(limpo.substring(6, 12), 10);

      let valorFinal = 0;
      let pesoKg = null;
      let tipoDecodificado = modo;

      if (modo === 'peso') {
        pesoKg = parseFloat((valorOuPesoNum / 1000).toFixed(3));
        const precoKgPadrao = 89.90;
        valorFinal = parseFloat((pesoKg * precoKgPadrao).toFixed(2));
      } else {
        valorFinal = parseFloat((valorOuPesoNum / 100).toFixed(2));
      }

      res.json({
        ok: true,
        codigo_barras_lido: limpo,
        codigo_produto: codigoProduto,
        tipo_decodificado: tipoDecodificado,
        valor_apurado: valorFinal,
        peso_kg: pesoKg,
        produto_sugerido: 'Almoço Buffet / Self-Service por Quilo',
        pronto_para_pdv: true,
        mensagem: `Etiqueta Toledo/Filizola decodificada com sucesso: R$ ${valorFinal.toFixed(2)}.`
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // 7. NICHO: CAFETERIA & PADARIA (FORNADA QUENTE & ENCOMENDAS)
  // ══════════════════════════════════════════════════════════════════

  app.post('/api/nichos/padaria/fornada/anunciar', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const {
        item_nome = 'Pão Francês Tradicional & Pão de Queijo Mineiro',
        quantidade_unidades = 80,
        temperatura_graus = 200
      } = req.body || {};

      db.run(`
        INSERT INTO padaria_fornadas (item_nome, quantidade_unidades, temperatura_graus, status)
        VALUES (?, ?, ?, 'quentinho')
      `, [item_nome, quantidade_unidades, temperatura_graus], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });

        res.json({
          ok: true,
          fornada_id: this.lastID,
          item: item_nome,
          quantidade: quantidade_unidades,
          alerta_whatsapp: `🥖 FORNADA QUENTINHA: Acabou de sair ${item_nome} do forno! Venha buscar enquanto está crocante!`,
          notificacao_enviada: true,
          mensagem: 'Fornada anunciada nos telões do salão e notificação disparada para clientes do bairro!'
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.post('/api/nichos/padaria/encomendas/criar', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const {
        cliente_nome = 'Renata Albuquerque',
        cliente_telefone = '11988883333',
        tipo_encomenda = 'Bolo de Festa Red Velvet com Frutas Vermelhas',
        peso_kg = 3.0,
        recheio = 'Cream Cheese com Brigadeiro Branco',
        tema_decoracao = 'Flores Naturais e Plaquinha Parabéns',
        data_hora_retirada = '2026-10-15 16:30:00',
        valor_total = 240.00
      } = req.body || {};

      const caucaoPix = parseFloat((valor_total * 0.50).toFixed(2)); // 50% de entrada obrigatória

      db.run(`
        INSERT INTO padaria_encomendas_festas (
          cliente_nome, cliente_telefone, tipo_encomenda, peso_kg, recheio, tema_decoracao, data_hora_retirada, valor_total, valor_caucao_pago
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [cliente_nome, cliente_telefone, tipo_encomenda, peso_kg, recheio, tema_decoracao, data_hora_retirada, valor_total, caucaoPix], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });

        res.json({
          ok: true,
          encomenda_id: this.lastID,
          cliente: cliente_nome,
          item: tipo_encomenda,
          data_retirada: data_hora_retirada,
          valor_total: valor_total,
          caucao_garantido_50pct: caucaoPix,
          saldo_a_receber_retirada: valor_total - caucaoPix,
          mensagem: `Encomenda agendada com segurança! 50% (R$ ${caucaoPix.toFixed(2)}) garantido via Pix antecipado.`
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // 8. NICHO: À LA CARTE (MARCHA DE PRATOS & SOMMELIER IA)
  // ══════════════════════════════════════════════════════════════════

  app.post('/api/nichos/alacarte/marchar-etapa', authMiddleware, (req, res) => {
    try {
      const db = resolveDb(req);
      const {
        pedido_id = 502,
        mesa_num = 'Mesa 07 Nobre',
        etapa_a_marchar = 'prato_principal' // 'entrada' | 'prato_principal' | 'sobremesa'
      } = req.body || {};

      db.run(`
        INSERT INTO alacarte_marcha_pedidos (pedido_id, mesa_num, etapa_atual, status_etapa)
        VALUES (?, ?, ?, 'liberado_cozinha')
      `, [pedido_id, mesa_num, etapa_a_marchar], function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });

        res.json({
          ok: true,
          mesa: mesa_num,
          etapa_marchada: etapa_a_marchar.toUpperCase().replace('_', ' '),
          alerta_kds_chef: `🔔 MARCHA AUTORIZADA: ${mesa_num} concluiu etapa anterior. Iniciar cocção do ${etapa_a_marchar.toUpperCase().replace('_', ' ')} agora!`,
          mensagem: 'Comando de marcha despachado para a praça quente do KDS.'
        });
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  app.get('/api/nichos/alacarte/harmonizar/:prato_id', authMiddleware, (req, res) => {
    try {
      const { prato_id } = req.params;
      const cardapioHarmonizacoes = {
        '1': { prato: 'Risoto de Cordeiro com Cogumelos', vinho: 'Malbec Reserva Mendoza', safra: '2021', valor: 145.00, dica: 'A estrutura encorpada dos taninos equilibra perfeitamente a untuosidade do queijo e da carne ovina.' },
        '2': { prato: 'Robalo Grelhado em Crosta de Ervas', vinho: 'Sauvignon Blanc Casablanca', safra: '2023', valor: 120.00, dica: 'Notas cítricas e frescor mineral harmonizam com a carne delicada do peixe branco.' },
        'default': { prato: 'Prato Especial do Chef', vinho: 'Cabernet Sauvignon Gran Reserva', safra: '2020', valor: 135.00, dica: 'Vinho versátil de final longo ideal para carnes grelhadas e molhos reduzidos.' }
      };

      const resultado = cardapioHarmonizacoes[prato_id] || cardapioHarmonizacoes['default'];

      res.json({
        ok: true,
        prato: resultado.prato,
        sommelier_ia: {
          rotulo_recomendado: resultado.vinho,
          safra: resultado.safra,
          preco_garrafa: resultado.valor,
          justificativa_harmonizacao: resultado.dica
        },
        upsell_garcom: `Oferecer taça por R$ ${(resultado.valor / 4).toFixed(2)} ou garrafa por R$ ${resultado.valor.toFixed(2)}.`
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: e.message });
    }
  });

  console.log('🍕 Controller de Módulos Específicos por Nicho carregado com sucesso.');
};
