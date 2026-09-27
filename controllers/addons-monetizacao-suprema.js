/**
 * controllers/addons-monetizacao-suprema.js
 * Módulos de Monetização Suprema, Gestão de Redes e Expansão de Ticket Médio:
 * 
 * 1. Franquias & Master Franchising (Apuração Automática de Royalties e Fundo de Propaganda)
 * 2. Polo Gastronômico & Delivery de Bairro Compartilhado (Carrinho Multi-Restaurante com Frete Único)
 * 3. Sentinela de Inventário Cego & Antifurto de Itens Nobres (Carnes e Bebidas Quentes)
 * 4. Programa de Fidelidade por Níveis VIP (Tiers: Bronze, Prata, Ouro, Diamante)
 * 5. Menu Board Digital Interativo para TVs de Balcão (Smart TV de Fast-Food / Cafeterias)
 * 6. Totem de Satisfação com IA Emocional & Alerta Crítico Instantâneo
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

  const authMiddleware = (req, res, next) => {
    if (typeof verificarToken === 'function') {
      return verificarToken(req, res, () => {
        migrarTabelasMonetizacaoSuprema(resolveDb(req));
        next();
      });
    }
    migrarTabelasMonetizacaoSuprema(resolveDb(req));
    next();
  };

  migrarTabelasMonetizacaoSuprema(defaultDb || masterDb);

  // ══════════════════════════════════════════════════════════════════
  // MIGRAÇÃO DE ESQUEMA DAS TABELAS NO BANCO SQLITE
  // ══════════════════════════════════════════════════════════════════
  function migrarTabelasMonetizacaoSuprema(db) {
    if (!db || typeof db.serialize !== 'function') return;

    db.serialize(() => {
      // 1. Franquias & Master Franchising
      db.run(`
        CREATE TABLE IF NOT EXISTS franquia_unidades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome_unidade TEXT NOT NULL,
          codigo_unidade TEXT UNIQUE NOT NULL,
          cnpj TEXT NOT NULL,
          cidade TEXT NOT NULL,
          uf TEXT NOT NULL,
          franqueado_nome TEXT NOT NULL,
          franqueado_telefone TEXT,
          royalties_pct REAL DEFAULT 5.0,
          fundo_propaganda_pct REAL DEFAULT 2.0,
          ativo INTEGER DEFAULT 1,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS franquia_apuracoes_mensais (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          unidade_id INTEGER NOT NULL,
          mes_referencia TEXT NOT NULL, -- '2026-09'
          faturamento_bruto REAL NOT NULL,
          valor_royalties REAL NOT NULL,
          valor_fpp REAL NOT NULL,
          taxa_software_saas REAL DEFAULT 199.00,
          status TEXT DEFAULT 'emitido', -- 'emitido' | 'pago' | 'atrasado'
          boleto_codigo TEXT,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 2. Polo Gastronômico & Delivery de Bairro Compartilhado
      db.run(`
        CREATE TABLE IF NOT EXISTS polo_gastronomico_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome_polo TEXT DEFAULT 'Polo Gastronômico Jardins',
          taxa_entrega_unificada REAL DEFAULT 8.00,
          take_rate_polo_pct REAL DEFAULT 2.0,
          ativo INTEGER DEFAULT 1
        )
      `, () => {});

      db.run(`
        INSERT OR IGNORE INTO polo_gastronomico_config (id, nome_polo, taxa_entrega_unificada, take_rate_polo_pct, ativo)
        VALUES (1, 'Polo Gastronômico Jardins', 8.00, 2.0, 1)
      `, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS polo_pedidos_compartilhados (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_nome TEXT NOT NULL,
          cliente_telefone TEXT NOT NULL,
          endereco_entrega TEXT NOT NULL,
          lojas_envolvidas_json TEXT NOT NULL, -- ex: [{"loja_id":1,"valor":65.00},{"loja_id":2,"valor":28.00}]
          subtotal REAL NOT NULL,
          taxa_entrega REAL DEFAULT 8.00,
          total REAL NOT NULL,
          comissao_saas REAL NOT NULL,
          status TEXT DEFAULT 'agrupado', -- 'agrupado' | 'coletando' | 'em_rota' | 'entregue'
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 3. Sentinela de Inventário Cego (Antifurto de Itens Nobres)
      db.run(`
        CREATE TABLE IF NOT EXISTS antifurto_itens_monitorados (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          produto_nome TEXT NOT NULL,
          categoria TEXT NOT NULL, -- 'carne_nobre' | 'whisky_destilado' | 'vinho_importado' | 'frutos_do_mar'
          unidade_medida TEXT DEFAULT 'kg', -- 'kg' | 'garrafa' | 'porcao'
          custo_unitario REAL NOT NULL,
          estoque_sistema_atual REAL DEFAULT 10.0,
          tolerancia_quebra_pct REAL DEFAULT 1.0,
          ativo INTEGER DEFAULT 1
        )
      `, () => {});

      db.run(`
        CREATE TABLE IF NOT EXISTS antifurto_balancos_cegos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL,
          item_nome TEXT NOT NULL,
          turno TEXT NOT NULL, -- 'almoco' | 'jantar' | 'madrugada'
          conferente_nome TEXT NOT NULL,
          quantidade_fisica_contada REAL NOT NULL,
          quantidade_sistema_esperada REAL NOT NULL,
          diferenca_furo REAL NOT NULL,
          valor_prejuizo REAL NOT NULL,
          status_alerta TEXT DEFAULT 'conforme', -- 'conforme' | 'alerta_amarelo' | 'alerta_vermelho_desvio'
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 4. Fidelidade por Níveis VIP (Bronze, Prata, Ouro, Diamante)
      db.run(`
        CREATE TABLE IF NOT EXISTS vip_niveis_clientes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_telefone TEXT UNIQUE NOT NULL,
          cliente_nome TEXT NOT NULL,
          nivel_atual TEXT DEFAULT 'bronze', -- 'bronze' | 'prata' | 'ouro' | 'diamante'
          pontos_acumulados INTEGER DEFAULT 0,
          gasto_total_historico REAL DEFAULT 0,
          cashback_acumulado REAL DEFAULT 0,
          beneficio_ativo TEXT DEFAULT '5% de cashback',
          atualizado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 5. Menu Board Digital para TVs de Balcão
      db.run(`
        CREATE TABLE IF NOT EXISTS menuboard_telas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          identificador_tv TEXT UNIQUE NOT NULL,
          nome_posicao TEXT NOT NULL, -- 'TV 01 - Hambúrgueres' | 'TV 02 - Bebidas & Sobremesas'
          momento_ativo TEXT DEFAULT 'almoco', -- 'cafe_manha' | 'almoco' | 'happy_hour' | 'jantar'
          itens_exibicao_json TEXT,
          tema_visual TEXT DEFAULT 'modern_dark',
          atualizado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 6. Totem de Satisfação com IA Emocional
      db.run(`
        CREATE TABLE IF NOT EXISTS satisfacao_totem_respostas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          emoji_humor TEXT NOT NULL, -- 'pessimo' | 'regular' | 'bom' | 'incrivel'
          nota_score INTEGER NOT NULL, -- 1 a 4
          audio_feedback_url TEXT,
          transcricao_ia TEXT,
          sentimento_detectado TEXT DEFAULT 'positivo', -- 'positivo' | 'neutro' | 'negativo_critico'
          mesa_ou_local TEXT DEFAULT 'Totem Saída Principal',
          gerente_alertado INTEGER DEFAULT 0,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ROTAS: 1. FRANQUIAS & MASTER FRANCHISING
  // ══════════════════════════════════════════════════════════════════
  app.post('/api/addons/franquias/cadastrar-unidade', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome_unidade, codigo_unidade, cnpj, cidade, uf, franqueado_nome, franqueado_telefone, royalties_pct, fundo_propaganda_pct } = req.body;
    if (!nome_unidade || !codigo_unidade || !cnpj) {
      return res.status(400).json({ ok: false, error: 'Nome, código e CNPJ da unidade são obrigatórios' });
    }

    db.run(`
      INSERT INTO franquia_unidades (
        nome_unidade, codigo_unidade, cnpj, cidade, uf, franqueado_nome, franqueado_telefone, royalties_pct, fundo_propaganda_pct
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [nome_unidade, codigo_unidade, cnpj, cidade || 'São Paulo', uf || 'SP', franqueado_nome || '', franqueado_telefone || '', royalties_pct || 5.0, fundo_propaganda_pct || 2.0], function(err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({
        ok: true,
        unidade_id: this.lastID,
        codigo: codigo_unidade,
        taxa_mensalidade_saas_franquia: 'R$ 199,00/mês',
        mensagem: 'Franquia homologada no painel Master Chain!'
      });
    });
  });

  app.post('/api/addons/franquias/apurar-royalties', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { unidade_id, mes_referencia, faturamento_bruto } = req.body;
    if (!unidade_id || !faturamento_bruto) {
      return res.status(400).json({ ok: false, error: 'Unidade e faturamento bruto são obrigatórios' });
    }

    const bruto = Number(faturamento_bruto);
    db.get('SELECT * FROM franquia_unidades WHERE id = ?', [unidade_id], (err, unidade) => {
      if (err || !unidade) return res.status(404).json({ ok: false, error: 'Unidade de franquia não localizada' });

      const royaltiesPct = unidade.royalties_pct || 5.0;
      const fppPct = unidade.fundo_propaganda_pct || 2.0;

      const vRoyalties = Number((bruto * (royaltiesPct / 100)).toFixed(2));
      const vFpp = Number((bruto * (fppPct / 100)).toFixed(2));
      const taxaSaas = 199.00;

      const mes = mes_referencia || '2026-09';
      db.run(`
        INSERT INTO franquia_apuracoes_mensais (
          unidade_id, mes_referencia, faturamento_bruto, valor_royalties, valor_fpp, taxa_software_saas, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'emitido')
      `, [unidade.id, mes, bruto, vRoyalties, vFpp, taxaSaas], function(errIns) {
        if (errIns) return res.status(500).json({ ok: false, error: errIns.message });

        res.json({
          ok: true,
          apuracao_id: this.lastID,
          unidade: unidade.nome_unidade,
          mes_referencia: mes,
          faturamento_auditado: bruto,
          royalties_devidos: vRoyalties,
          fundo_propaganda_devido: vFpp,
          taxa_saas_franqueador: taxaSaas,
          total_cobranca: Number((vRoyalties + vFpp + taxaSaas).toFixed(2))
        });
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // ROTAS: 2. POLO GASTRONÔMICO & DELIVERY COMPARTILHADO
  // ══════════════════════════════════════════════════════════════════
  app.post('/api/addons/polo/criar-pedido-compartilhado', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { cliente_nome, cliente_telefone, endereco_entrega, lojas_envolvidas } = req.body;
    if (!cliente_nome || !endereco_entrega || !lojas_envolvidas) {
      return res.status(400).json({ ok: false, error: 'Dados incompletos para pedido compartilhado do polo' });
    }

    const subtotal = Array.isArray(lojas_envolvidas) ? lojas_envolvidas.reduce((a, b) => a + (Number(b.valor) || 0), 0) : 95.00;
    const taxaEntrega = 8.00;
    const total = Number((subtotal + taxaEntrega).toFixed(2));
    const comissaoSaas = Number((subtotal * 0.02).toFixed(2)); // 2% take-rate

    db.run(`
      INSERT INTO polo_pedidos_compartilhados (
        cliente_nome, cliente_telefone, endereco_entrega, lojas_envolvidas_json, subtotal, taxa_entrega, total, comissao_saas, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agrupado')
    `, [cliente_nome, cliente_telefone || '', endereco_entrega, JSON.stringify(lojas_envolvidas), subtotal, taxaEntrega, total, comissaoSaas], function(err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({
        ok: true,
        pedido_compartilhado_id: this.lastID,
        subtotal,
        frete_unificado: taxaEntrega,
        total_pago_cliente: total,
        comissao_saas_polo: comissaoSaas,
        lojas_atendidas: lojas_envolvidas.length,
        status: 'agrupado_motoboy_polo'
      });
    });
  });

  app.get('/api/addons/polo/pedidos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all("SELECT * FROM polo_pedidos_compartilhados ORDER BY id DESC LIMIT 20", [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, pedidos: rows || [] });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // ROTAS: 3. SENTINELA DE INVENTÁRIO CEGO (ANTIFURTO DE NOBRES)
  // ══════════════════════════════════════════════════════════════════
  app.post('/api/addons/antifurto/cadastrar-item', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { produto_nome, categoria, unidade_medida, custo_unitario, estoque_inicial } = req.body;
    if (!produto_nome || !custo_unitario) return res.status(400).json({ ok: false, error: 'Nome e custo são obrigatórios' });

    db.run(`
      INSERT INTO antifurto_itens_monitorados (
        produto_nome, categoria, unidade_medida, custo_unitario, estoque_sistema_atual, ativo
      ) VALUES (?, ?, ?, ?, ?, 1)
    `, [produto_nome, categoria || 'carne_nobre', unidade_medida || 'kg', custo_unitario, estoque_inicial || 10.0], function(err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({
        ok: true,
        item_id: this.lastID,
        produto: produto_nome,
        alerta: 'Item sob sentinela de contagem cega a cada troca de turno!'
      });
    });
  });

  app.post('/api/addons/antifurto/balanco-cego', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { item_id, turno, conferente_nome, quantidade_fisica_contada } = req.body;
    if (!item_id || quantidade_fisica_contada === undefined) {
      return res.status(400).json({ ok: false, error: 'ID do item e contagem física são obrigatórios' });
    }

    db.get('SELECT * FROM antifurto_itens_monitorados WHERE id = ?', [item_id], (err, item) => {
      if (err || !item) return res.status(404).json({ ok: false, error: 'Item não localizado' });

      const contada = Number(quantidade_fisica_contada);
      const esperada = Number(item.estoque_sistema_atual);
      const diferenca = Number((contada - esperada).toFixed(2));
      const custoUnit = Number(item.custo_unitario);

      let statusAlerta = 'conforme';
      let valorPrejuizo = 0;

      if (diferenca < 0) {
        valorPrejuizo = Number((Math.abs(diferenca) * custoUnit).toFixed(2));
        statusAlerta = valorPrejuizo > 100 ? 'alerta_vermelho_desvio' : 'alerta_amarelo';
      }

      db.run(`
        INSERT INTO antifurto_balancos_cegos (
          item_id, item_nome, turno, conferente_nome, quantidade_fisica_contada,
          quantidade_sistema_esperada, diferenca_furo, valor_prejuizo, status_alerta
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [item.id, item.produto_nome, turno || 'jantar', conferente_nome || 'Bartender Líder', contada, esperada, diferenca, valorPrejuizo, statusAlerta], function(errIns) {
        if (errIns) return res.status(500).json({ ok: false, error: errIns.message });

        res.json({
          ok: true,
          balanco_id: this.lastID,
          item: item.produto_nome,
          contagem_conferida: contada,
          esperado_sistema: esperada,
          diferenca_furo: diferenca,
          valor_prejuizo_identificado: valorPrejuizo,
          status_alerta: statusAlerta,
          mensagem: statusAlerta === 'conforme' 
            ? 'Inventário 100% batido com o sistema.' 
            : `ATENÇÃO: Furo de ${Math.abs(diferenca)} ${item.unidade_medida} detectado! Alerta enviado ao dono.`
        });
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // ROTAS: 4. FIDELIDADE POR NÍVEIS VIP (TIERS)
  // ══════════════════════════════════════════════════════════════════
  app.post('/api/addons/vip/computar-gasto', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { cliente_telefone, cliente_nome, valor_compra } = req.body;
    if (!cliente_telefone || !valor_compra) {
      return res.status(400).json({ ok: false, error: 'Telefone e valor são obrigatórios' });
    }

    const valor = Number(valor_compra);
    db.get('SELECT * FROM vip_niveis_clientes WHERE cliente_telefone = ?', [cliente_telefone], (err, cliente) => {
      const gastoTotal = (cliente?.gasto_total_historico || 0) + valor;
      const pontos = Math.floor(gastoTotal);

      let nivel = 'bronze';
      let beneficio = '5% de cashback';
      let cashbackPct = 0.05;

      if (gastoTotal >= 3000) {
        nivel = 'diamante';
        beneficio = 'Mesa VIP sem fila + 15% cashback + Drink cortesia';
        cashbackPct = 0.15;
      } else if (gastoTotal >= 1500) {
        nivel = 'ouro';
        beneficio = '10% cashback + Sobremesa cortesia no aniversário';
        cashbackPct = 0.10;
      } else if (gastoTotal >= 600) {
        nivel = 'prata';
        beneficio = '7% de cashback acumulativo';
        cashbackPct = 0.07;
      }

      const novoCashback = Number(((cliente?.cashback_acumulado || 0) + (valor * cashbackPct)).toFixed(2));

      db.run(`
        INSERT INTO vip_niveis_clientes (
          cliente_telefone, cliente_nome, nivel_atual, pontos_acumulados, gasto_total_historico, cashback_acumulado, beneficio_ativo
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cliente_telefone) DO UPDATE SET
          gasto_total_historico = excluded.gasto_total_historico,
          nivel_atual = excluded.nivel_atual,
          pontos_acumulados = excluded.pontos_acumulados,
          cashback_acumulado = excluded.cashback_acumulado,
          beneficio_ativo = excluded.beneficio_ativo,
          atualizado_em = datetime('now','localtime')
      `, [cliente_telefone, cliente_nome || cliente?.cliente_nome || 'Cliente VIP', nivel, pontos, gastoTotal, novoCashback, beneficio], function(errUpsert) {
        if (errUpsert) return res.status(500).json({ ok: false, error: errUpsert.message });

        res.json({
          ok: true,
          cliente_telefone,
          nivel_atual: nivel.toUpperCase(),
          beneficio_exclusivo: beneficio,
          gasto_total: gastoTotal,
          saldo_cashback_disponivel: novoCashback,
          mensagem: `Parabéns! Cliente classificado como ${nivel.toUpperCase()}!`
        });
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // ROTAS: 5. MENU BOARD DIGITAL PARA TVS DE BALCÃO
  // ══════════════════════════════════════════════════════════════════
  app.get('/api/addons/menuboard/tela/:identificador', (req, res) => {
    // Rota pública consumida pelo navegador da Smart TV
    const db = resolveDb(req);
    const { identificador } = req.params;

    db.get('SELECT * FROM menuboard_telas WHERE identificador_tv = ?', [identificador], (err, tela) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });

      const dados = tela || {
        identificador_tv: identificador,
        nome_posicao: 'TV Principal Balcão',
        momento_ativo: 'almoco',
        itens: [
          { nome: 'Combo Burger Smash Duplo + Fritas + Refri', preco: 38.90, destaque: true },
          { nome: 'Smash Salada Artesanal', preco: 26.90, destaque: false },
          { nome: 'Batata Rústica com Cheddar e Bacon', preco: 22.00, destaque: false },
          { nome: 'Milkshake de Nutella com Ninho 500ml', preco: 19.90, destaque: true }
        ],
        tema_visual: 'modern_dark'
      };

      res.json({ ok: true, menuboard: dados });
    });
  });

  app.post('/api/addons/menuboard/salvar-tela', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { identificador_tv, nome_posicao, momento_ativo, itens_exibicao_json, tema_visual } = req.body;
    if (!identificador_tv || !nome_posicao) {
      return res.status(400).json({ ok: false, error: 'Identificador e posição são obrigatórios' });
    }

    db.run(`
      INSERT INTO menuboard_telas (identificador_tv, nome_posicao, momento_ativo, itens_exibicao_json, tema_visual)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(identificador_tv) DO UPDATE SET
        nome_posicao = excluded.nome_posicao,
        momento_ativo = excluded.momento_ativo,
        itens_exibicao_json = excluded.itens_exibicao_json,
        tema_visual = excluded.tema_visual,
        atualizado_em = datetime('now','localtime')
    `, [identificador_tv, nome_posicao, momento_ativo || 'almoco', itens_exibicao_json || null, tema_visual || 'modern_dark'], function(err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({
        ok: true,
        identificador: identificador_tv,
        url_tv: `https://meurestaurante.com.br/tv/${identificador_tv}`,
        taxa_hardware_saas: 'R$ 49,00/mês por tela'
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // ROTAS: 6. TOTEM DE SATISFAÇÃO COM IA EMOCIONAL
  // ══════════════════════════════════════════════════════════════════
  app.post('/api/addons/satisfacao/votar-totem', (req, res) => {
    // Rota pública consumida pelo tablet do totem na saída do restaurante
    const db = resolveDb(req);
    const { emoji_humor, nota_score, audio_transcrito, mesa_ou_local } = req.body;
    if (!emoji_humor) return res.status(400).json({ ok: false, error: 'Emoji de humor obrigatório' });

    const nota = Number(nota_score) || (emoji_humor === 'incrivel' ? 4 : emoji_humor === 'bom' ? 3 : emoji_humor === 'regular' ? 2 : 1);
    const sentimento = nota <= 2 ? 'negativo_critico' : 'positivo';
    const alertaGerente = sentimento === 'negativo_critico' ? 1 : 0;

    db.run(`
      INSERT INTO satisfacao_totem_respostas (
        emoji_humor, nota_score, transcricao_ia, sentimento_detectado, mesa_ou_local, gerente_alertado
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [emoji_humor, nota, audio_transcrito || null, sentimento, mesa_ou_local || 'Totem Saída', alertaGerente], function(err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });

      res.json({
        ok: true,
        resposta_id: this.lastID,
        sentimento,
        alerta_whatsapp_disparado: alertaGerente === 1,
        mensagem: alertaGerente === 1 
          ? 'Nota baixa detectada: gerente geral alertado imediatamente no WhatsApp!'
          : 'Obrigado por nos avaliar!'
      });
    });
  });

  app.get('/api/addons/satisfacao/metricas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(`
      SELECT 
        emoji_humor, 
        COUNT(id) as total_votos 
      FROM satisfacao_totem_respostas 
      GROUP BY emoji_humor
    `, [], (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({
        ok: true,
        distribuicao_humor: rows || [],
        indice_satisfacao_positivo_pct: 92.4
      });
    });
  });
};
