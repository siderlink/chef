/**
 * controllers/financeiro-bi.js
 * Módulo Financeiro & BI Avançado:
 * - DRE (Demonstrativo do Resultado do Exercício)
 * - Curva ABC & Matriz de Engenharia de Cardápio
 * - Fechamento de Caixa com Conferência Cega/Aberta e Apuração de Quebra
 * - Gestão de Despesas Operacionais e Custos Fixos
 */
'use strict';

module.exports = function(app, options) {
  const { db: defaultDb, masterDb, io, verificarToken, getTenantDb } = options || {};

  function resolveDb(req) {
    if (typeof getTenantDb === 'function') {
      try {
        const tId = req && (req.tenantId || (req.headers && req.headers['x-tenant-id']));
        const tDb = getTenantDb(tId);
        if (tDb) return tDb;
      } catch (e) {}
    }
    return defaultDb;
  }

  // Executa migrações nas tabelas do tenant
  function migrarSchema(db) {
    if (!db || !db.run) return;
    db.serialize(() => {
      // 1. Campos extras em turnos_caixa para conferência avançada e auditoria
      db.run(`ALTER TABLE turnos_caixa ADD COLUMN total_declarado REAL DEFAULT 0`, () => {});
      db.run(`ALTER TABLE turnos_caixa ADD COLUMN diferenca_caixa REAL DEFAULT 0`, () => {});
      db.run(`ALTER TABLE turnos_caixa ADD COLUMN detalhes_fechamento TEXT`, () => {});
      db.run(`ALTER TABLE turnos_caixa ADD COLUMN operador_fechamento TEXT`, () => {});
      db.run(`ALTER TABLE turnos_caixa ADD COLUMN justificativa_diferenca TEXT`, () => {});

      // 2. Campo custo em produtos para CMV exato e createdAt em pedidos
      db.run(`ALTER TABLE produtos ADD COLUMN custo REAL DEFAULT 0`, () => {});
      db.run(`ALTER TABLE produtos ADD COLUMN preco_custo REAL DEFAULT 0`, () => {});
      db.run(`ALTER TABLE pedidos ADD COLUMN createdAt DATETIME`, () => {
        db.run(`UPDATE pedidos SET createdAt = datetime('now', 'localtime') WHERE createdAt IS NULL AND time NOT LIKE '20%'`, () => {});
        db.run(`UPDATE pedidos SET createdAt = time WHERE createdAt IS NULL AND time LIKE '20%'`, () => {});
      });

      // 3. Tabela de despesas operacionais e custos fixos
      db.run(`
        CREATE TABLE IF NOT EXISTS despesas_financeiras (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          descricao TEXT NOT NULL,
          categoria TEXT NOT NULL,
          valor REAL NOT NULL,
          data_competencia DATE NOT NULL,
          data_vencimento DATE,
          data_pagamento DATE,
          status TEXT DEFAULT 'Pendente',
          forma_pagamento TEXT,
          recorrente INTEGER DEFAULT 0,
          observacao TEXT,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 4. Insumos (Matéria-prima / Estoque por ingrediente)
      db.run(`
        CREATE TABLE IF NOT EXISTS insumos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          unidade TEXT DEFAULT 'kg',
          custo_unitario REAL DEFAULT 0,
          estoque_atual REAL DEFAULT 0,
          estoque_minimo REAL DEFAULT 0,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 5. Ficha Técnica (Receita vinculando produtos a insumos com perda)
      db.run(`
        CREATE TABLE IF NOT EXISTS ficha_tecnica (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          produto_id INTEGER NOT NULL,
          insumo_id INTEGER NOT NULL,
          quantidade REAL NOT NULL,
          perda_pct REAL DEFAULT 0,
          FOREIGN KEY (insumo_id) REFERENCES insumos(id) ON DELETE CASCADE
        )
      `, () => {});

      // 6. Auditoria de movimentações de estoque de insumos
      db.run(`
        CREATE TABLE IF NOT EXISTS movimentacoes_insumos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          insumo_id INTEGER NOT NULL,
          tipo TEXT NOT NULL,
          quantidade REAL NOT NULL,
          saldo_anterior REAL DEFAULT 0,
          saldo_novo REAL DEFAULT 0,
          motivo TEXT,
          referencia_id INTEGER,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `, () => {});

      // 7. Índices para performance em relatórios analíticos
      db.run(`CREATE INDEX IF NOT EXISTS idx_pedidos_turno ON pedidos(turno_id)`, () => {});
      db.run(`CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status)`, () => {});
      db.run(`CREATE INDEX IF NOT EXISTS idx_despesas_competencia ON despesas_financeiras(data_competencia)`, () => {});
      db.run(`CREATE INDEX IF NOT EXISTS idx_ficha_produto ON ficha_tecnica(produto_id)`, () => {});
      db.run(`CREATE INDEX IF NOT EXISTS idx_mov_insumos ON movimentacoes_insumos(insumo_id)`, () => {});
    });
  }

  if (defaultDb) {
    migrarSchema(defaultDb);
  }

  // Auth middleware opcional com fallback permissivo se sem token em modo local
  const authMiddleware = (req, res, next) => {
    if (typeof verificarToken === 'function') {
      return verificarToken(req, res, () => {
        migrarSchema(resolveDb(req));
        next();
      });
    }
    migrarSchema(resolveDb(req));
    next();
  };

  // ══════════════════════════════════════════════════════════════════
  // 1. CONFIGURAÇÕES FINANCEIRAS & REGRAS DE EXECUÇÃO
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/financeiro/config', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const keys = ['fechamento_modo', 'cmv_padrao_pct', 'taxa_cartao_debito_pct', 'taxa_cartao_credito_pct', 'taxa_pix_pct'];
    const placeholders = keys.map(() => '?').join(',');
    db.all(`SELECT chave, valor FROM configuracoes WHERE chave IN (${placeholders})`, keys, (err, rows) => {
      const config = {
        fechamento_modo: 'cego', // 'cego' ou 'aberto'
        cmv_padrao_pct: 32,
        taxa_cartao_debito_pct: 1.5,
        taxa_cartao_credito_pct: 3.0,
        taxa_pix_pct: 0
      };
      (rows || []).forEach(r => {
        if (r.chave === 'fechamento_modo') config.fechamento_modo = r.valor || 'cego';
        else if (r.chave === 'cmv_padrao_pct') config.cmv_padrao_pct = parseFloat(r.valor) || 32;
        else if (r.chave === 'taxa_cartao_debito_pct') config.taxa_cartao_debito_pct = parseFloat(r.valor) || 1.5;
        else if (r.chave === 'taxa_cartao_credito_pct') config.taxa_cartao_credito_pct = parseFloat(r.valor) || 3.0;
        else if (r.chave === 'taxa_pix_pct') config.taxa_pix_pct = parseFloat(r.valor) || 0;
      });
      res.json({ ok: true, config });
    });
  });

  app.post('/api/financeiro/config', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const body = req.body || {};
    const updates = {
      fechamento_modo: ['cego', 'aberto'].includes(body.fechamento_modo) ? body.fechamento_modo : 'cego',
      cmv_padrao_pct: String(Math.max(0, Math.min(100, parseFloat(body.cmv_padrao_pct) || 32))),
      taxa_cartao_debito_pct: String(Math.max(0, Math.min(20, parseFloat(body.taxa_cartao_debito_pct) || 1.5))),
      taxa_cartao_credito_pct: String(Math.max(0, Math.min(30, parseFloat(body.taxa_cartao_credito_pct) || 3.0))),
      taxa_pix_pct: String(Math.max(0, Math.min(10, parseFloat(body.taxa_pix_pct) || 0)))
    };

    db.serialize(() => {
      Object.entries(updates).forEach(([k, v]) => {
        db.run(`INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)`, [k, v]);
      });
    });

    res.json({ ok: true, mensagem: 'Configurações financeiras salvas com sucesso!', config: updates });
  });

  // ══════════════════════════════════════════════════════════════════
  // 2. MÓDULO ÁGIL DE DESPESAS OPERACIONAIS & CONTAS
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/financeiro/despesas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { inicio, fim, categoria, status } = req.query || {};

    let query = `SELECT * FROM despesas_financeiras WHERE 1=1`;
    const params = [];

    if (inicio) {
      query += ` AND data_competencia >= ?`;
      params.push(inicio);
    }
    if (fim) {
      query += ` AND data_competencia <= ?`;
      params.push(fim);
    }
    if (categoria && categoria !== 'todas') {
      query += ` AND categoria = ?`;
      params.push(categoria);
    }
    if (status && status !== 'todos') {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY data_competencia DESC, id DESC`;

    db.all(query, params, (err, rows) => {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      
      const total = (rows || []).reduce((acc, d) => acc + (parseFloat(d.valor) || 0), 0);
      const pagas = (rows || []).filter(d => d.status === 'Pago').reduce((acc, d) => acc + (parseFloat(d.valor) || 0), 0);
      const pendentes = total - pagas;

      res.json({
        ok: true,
        despesas: rows || [],
        resumo: {
          total,
          pagas,
          pendentes,
          quantidade: (rows || []).length
        }
      });
    });
  });

  app.post('/api/financeiro/despesas', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { descricao, categoria, valor, data_competencia, data_vencimento, data_pagamento, status, forma_pagamento, observacao } = req.body || {};

    if (!descricao || !valor || isNaN(parseFloat(valor))) {
      return res.status(400).json({ ok: false, erro: 'Descrição e valor numérico são obrigatórios.' });
    }

    const valNum = parseFloat(valor);
    const cat = categoria || 'Outros';
    const comp = data_competencia || new Date().toISOString().slice(0, 10);
    const stat = status || 'Pago';
    const pagto = stat === 'Pago' ? (data_pagamento || comp) : null;

    db.run(
      `INSERT INTO despesas_financeiras (descricao, categoria, valor, data_competencia, data_vencimento, data_pagamento, status, forma_pagamento, observacao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [descricao.trim(), cat, valNum, comp, data_vencimento || comp, pagto, stat, forma_pagamento || 'Dinheiro', observacao || ''],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({
          ok: true,
          id: this.lastID,
          mensagem: 'Despesa cadastrada com sucesso!'
        });
      }
    );
  });

  app.put('/api/financeiro/despesas/:id/pagar', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const id = req.params.id;
    const dataPagamento = (req.body && req.body.data_pagamento) || new Date().toISOString().slice(0, 10);
    const forma = (req.body && req.body.forma_pagamento) || 'Dinheiro';

    db.run(
      `UPDATE despesas_financeiras SET status = 'Pago', data_pagamento = ?, forma_pagamento = ? WHERE id = ?`,
      [dataPagamento, forma, id],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        if (this.changes === 0) return res.status(404).json({ ok: false, erro: 'Despesa não encontrada.' });
        res.json({ ok: true, mensagem: 'Despesa marcada como paga!' });
      }
    );
  });

  app.delete('/api/financeiro/despesas/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.run(`DELETE FROM despesas_financeiras WHERE id = ?`, [req.params.id], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Despesa removida.' });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 3. DRE (DEMONSTRATIVO DO RESULTADO DO EXERCÍCIO)
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/financeiro/dre', authMiddleware, async (req, res) => {
    const db = resolveDb(req);
    const { periodo, inicio, fim } = req.query || {};

    // Determina intervalo de datas (YYYY-MM-DD)
    let dtInicio = inicio;
    let dtFim = fim;

    const hoje = new Date();
    const toIsoDate = (d) => d.toISOString().slice(0, 10);

    if (!dtInicio || !dtFim) {
      if (periodo === 'hoje') {
        dtInicio = toIsoDate(hoje);
        dtFim = toIsoDate(hoje);
      } else if (periodo === '7dias') {
        const seteAtras = new Date(hoje);
        seteAtras.setDate(seteAtras.getDate() - 7);
        dtInicio = toIsoDate(seteAtras);
        dtFim = toIsoDate(hoje);
      } else if (periodo === 'mes_anterior') {
        const primDiaMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        const ultDiaMesPassado = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
        dtInicio = toIsoDate(primDiaMesPassado);
        dtFim = toIsoDate(ultDiaMesPassado);
      } else {
        // Padrão: este mês até hoje
        const primDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        dtInicio = toIsoDate(primDia);
        dtFim = toIsoDate(hoje);
      }
    }

    try {
      // 1. Carrega configurações financeiras
      const cfgRows = await new Promise(r => db.all(`SELECT chave, valor FROM configuracoes WHERE chave LIKE 'taxa_%' OR chave = 'cmv_padrao_pct'`, [], (e, d) => r(d || [])));
      const cfg = { cmv_padrao_pct: 32, taxa_cartao_debito_pct: 1.5, taxa_cartao_credito_pct: 3.0, taxa_pix_pct: 0 };
      cfgRows.forEach(row => {
        if (cfg.hasOwnProperty(row.chave)) cfg[row.chave] = parseFloat(row.valor) || cfg[row.chave];
      });

      // 2. Consulta pedidos finalizados/pagos no intervalo
      const pedidosQuery = `
        SELECT p.id, p.productName, p.quantity, p.total, p.paymentMethod, p.localName, p.time, p.createdAt,
               COALESCE(prod.custo, prod.preco_custo, 0) as custo_unitario,
               COALESCE(prod.preco, 0) as preco_unitario
        FROM pedidos p
        LEFT JOIN produtos prod ON LOWER(TRIM(p.productName)) = LOWER(TRIM(prod.nome))
        WHERE p.status IN ('Finalizado', 'Pago', 'Fracionado')
          AND date(COALESCE(p.createdAt, p.time)) >= ? AND date(COALESCE(p.createdAt, p.time)) <= ?
          AND p.productName NOT LIKE 'Pgto Parcial%'
          AND p.productName NOT LIKE 'Pgto QR Code%'
      `;
      const pedidos = await new Promise(r => db.all(pedidosQuery, [dtInicio, dtFim], (e, d) => r(d || [])));

      // 3. Consulta despesas operacionais no intervalo
      const despesasQuery = `
        SELECT categoria, SUM(valor) as total
        FROM despesas_financeiras
        WHERE data_competencia >= ? AND data_competencia <= ?
        GROUP BY categoria
      `;
      const despesasRows = await new Promise(r => db.all(despesasQuery, [dtInicio, dtFim], (e, d) => r(d || [])));

      // 3a. Garante que pagamentos de diaristas/funcionários registrados em funcionarios_pagamentos não fiquem de fora
      try {
        const pagamentosAvulsosQuery = `
          SELECT SUM(COALESCE(valor_liquido, valor_bruto, valor, 0)) as total_pessoal
          FROM funcionarios_pagamentos
          WHERE date(COALESCE(data_pagamento, data)) >= ? AND date(COALESCE(data_pagamento, data)) <= ?
        `;
        const pagamentosStaff = await new Promise(r => db.get(pagamentosAvulsosQuery, [dtInicio, dtFim], (e, d) => r(d || {})));
        const totalStaff = parseFloat(pagamentosStaff?.total_pessoal) || 0;
        
        const catMaoDeObra = despesasRows.find(d => 
          (d.categoria || '').toLowerCase().includes('mão de obra') || 
          (d.categoria || '').toLowerCase().includes('freelancer') ||
          (d.categoria || '').toLowerCase().includes('pessoal')
        );

        if (!catMaoDeObra && totalStaff > 0) {
          despesasRows.push({
            categoria: 'Mão de Obra / Freelancers',
            total: totalStaff
          });
        }
      } catch (errStaff) {}

      // 3b. Consulta movimentações reais do período para apuração precisa dos métodos de pagamento
      const movsQuery = `
        SELECT forma_pagamento, tipo, SUM(valor) as total
        FROM movimentacoes
        WHERE tipo = 'Entrada' AND date(data) >= ? AND date(data) <= ?
        GROUP BY forma_pagamento, tipo
      `;
      const movsRows = await new Promise(r => db.all(movsQuery, [dtInicio, dtFim], (e, d) => r(d || [])));

      // 4. Cálculos da Receita Bruta e Formas de Pagamento
      let receitaBruta = 0;
      const porForma = { Dinheiro: 0, PIX: 0, 'Cartão Débito': 0, 'Cartão Crédito': 0, Fiado: 0, Outros: 0 };
      const porCanal = { Balcao: 0, Salao: 0, Delivery: 0 };
      let cmvTotal = 0;
      let totalItens = 0;

      pedidos.forEach(p => {
        const val = parseFloat(String(p.total || 0).replace(',', '.')) || 0;
        const qty = parseInt(p.quantity, 10) || 1;
        receitaBruta += val;
        totalItens += qty;

        // Canais de venda
        const local = String(p.localName || '').toLowerCase();
        if (local.includes('balc') || local.includes('caixa')) porCanal.Balcao += val;
        else if (local.includes('delivery') || local.includes('entrega') || local.includes('moto')) porCanal.Delivery += val;
        else porCanal.Salao += val;

        // CMV Híbrido: se tem custo unitário > 0 usa o real, senão usa % padrão
        const custoUnit = parseFloat(p.custo_unitario) || 0;
        if (custoUnit > 0) {
          cmvTotal += custoUnit * qty;
        } else {
          cmvTotal += val * (cfg.cmv_padrao_pct / 100);
        }
      });

      // Se houver movimentações no período, usa o registro fiel das formas de pagamento (resolve 'Múltiplo' e parciais)
      let totalMovsEntrada = 0;
      (movsRows || []).forEach(m => {
        const fp = String(m.forma_pagamento || '').toLowerCase();
        const v = parseFloat(m.total) || 0;
        totalMovsEntrada += v;
        if (fp.includes('dinheiro')) porForma.Dinheiro += v;
        else if (fp.includes('pix')) porForma.PIX += v;
        else if (fp.includes('debito') || fp.includes('débito')) porForma['Cartão Débito'] += v;
        else if (fp.includes('credito') || fp.includes('crédito') || fp.includes('cartão') || fp.includes('cartao')) porForma['Cartão Crédito'] += v;
        else if (fp.includes('fiado') || fp.includes('conta')) porForma.Fiado += v;
        else porForma.Outros += v;
      });

      // Se não há movimentações no período (ex: dados antigos), faz fallback para os pedidos
      if (totalMovsEntrada === 0) {
        pedidos.forEach(p => {
          const val = parseFloat(String(p.total || 0).replace(',', '.')) || 0;
          const metodo = String(p.paymentMethod || '').toLowerCase();
          if (metodo.includes('dinheiro')) porForma.Dinheiro += val;
          else if (metodo.includes('pix')) porForma.PIX += val;
          else if (metodo.includes('debito') || metodo.includes('débito')) porForma['Cartão Débito'] += val;
          else if (metodo.includes('credito') || metodo.includes('crédito')) porForma['Cartão Crédito'] += val;
          else if (metodo.includes('fiado')) porForma.Fiado += val;
          else porForma.Outros += val;
        });
      }

      // 5. Deduções da Receita: Taxas de cartão estimadas
      const taxaDebito = porForma['Cartão Débito'] * (cfg.taxa_cartao_debito_pct / 100);
      const taxaCredito = porForma['Cartão Crédito'] * (cfg.taxa_cartao_credito_pct / 100);
      const taxaPix = porForma.PIX * (cfg.taxa_pix_pct / 100);
      const totalTaxas = taxaDebito + taxaCredito + taxaPix;

      const receitaLiquida = Math.max(0, receitaBruta - totalTaxas);
      const margemContribuicao = receitaLiquida - cmvTotal;
      const margemContribuicaoPct = receitaLiquida > 0 ? (margemContribuicao / receitaLiquida) * 100 : 0;

      // 6. Despesas Operacionais
      const despesasPorCategoria = {};
      let totalDespesasOperacionais = 0;
      despesasRows.forEach(d => {
        const cat = d.categoria || 'Gerais';
        const val = parseFloat(d.total) || 0;
        despesasPorCategoria[cat] = val;
        totalDespesasOperacionais += val;
      });

      // 7. Resultado Final / Lucro Líquido
      const lucroLiquido = margemContribuicao - totalDespesasOperacionais;
      const margemLiquidaPct = receitaLiquida > 0 ? (lucroLiquido / receitaLiquida) * 100 : 0;
      const pontoEquilibrio = (margemContribuicaoPct > 0) ? (totalDespesasOperacionais / (margemContribuicaoPct / 100)) : 0;

      const kpis = {
        receita_bruta: receitaBruta,
        deducoes_taxas: totalTaxas,
        receita_liquida: receitaLiquida,
        cmv_total: cmvTotal,
        cmv_pct_receita: receitaLiquida > 0 ? (cmvTotal / receitaLiquida) * 100 : 0,
        margem_contribuicao: margemContribuicao,
        margem_contribuicao_pct: margemContribuicaoPct,
        despesas_operacionais_fixas: totalDespesasOperacionais,
        lucro_liquido_real: lucroLiquido,
        margem_liquida_pct: margemLiquidaPct,
        ponto_equilibrio_estimado: pontoEquilibrio
      };

      res.json({
        ok: true,
        periodo: { inicio: dtInicio, fim: dtFim },
        kpis: kpis,
        formas_pagamento: porForma,
        detalhes_despesas: despesasRows,
        dre: {
          receita_bruta: receitaBruta,
          por_forma_pagamento: porForma,
          por_canal: porCanal,
          total_pedidos: pedidos.length,
          total_itens: totalItens,
          ticket_medio: pedidos.length > 0 ? (receitaBruta / pedidos.length) : 0,

          deducoes: {
            taxas_cartao: totalTaxas,
            detalhe_taxas: {
              debito: taxaDebito,
              credito: taxaCredito,
              pix: taxaPix
            },
            total: totalTaxas
          },

          receita_liquida: receitaLiquida,

          cmv: {
            total: cmvTotal,
            pct_sobre_receita: receitaLiquida > 0 ? (cmvTotal / receitaLiquida) * 100 : 0,
            metodo: 'Híbrido (Custo Cadastrado + Estimativa Paramétrica)'
          },

          margem_contribuicao: margemContribuicao,
          margem_contribuicao_pct: margemContribuicaoPct,

          despesas_operacionais: {
            total: totalDespesasOperacionais,
            por_categoria: despesasPorCategoria
          },

          lucro_liquido: lucroLiquido,
          margem_liquida_pct: margemLiquidaPct,
          ponto_equilibrio_estimado: pontoEquilibrio
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: 'Falha ao processar DRE: ' + e.message });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // 4. CURVA ABC & ENGENHARIA DE CARDÁPIO
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/financeiro/curva-abc', authMiddleware, async (req, res) => {
    const db = resolveDb(req);
    const { periodo, inicio, fim, categoria } = req.query || {};

    let dtInicio = inicio;
    let dtFim = fim;
    const hoje = new Date();
    const toIsoDate = (d) => d.toISOString().slice(0, 10);

    if (!dtInicio || !dtFim) {
      if (periodo === 'hoje') {
        dtInicio = toIsoDate(hoje); dtFim = toIsoDate(hoje);
      } else if (periodo === '7dias') {
        const seteAtras = new Date(hoje); seteAtras.setDate(seteAtras.getDate() - 7);
        dtInicio = toIsoDate(seteAtras); dtFim = toIsoDate(hoje);
      } else if (periodo === 'mes_anterior') {
        const prim = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        const ult = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
        dtInicio = toIsoDate(prim); dtFim = toIsoDate(ult);
      } else {
        const prim = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        dtInicio = toIsoDate(prim); dtFim = toIsoDate(hoje);
      }
    }

    try {
      const cfgRows = await new Promise(r => db.all(`SELECT valor FROM configuracoes WHERE chave = 'cmv_padrao_pct'`, [], (e, d) => r(d || [])));
      const cmvPadraoPct = cfgRows[0] ? (parseFloat(cfgRows[0].valor) || 32) : 32;

      let query = `
        SELECT p.productName,
               SUM(p.quantity) as qtd_total,
               SUM(CAST(REPLACE(p.total, ',', '.') AS REAL)) as faturamento_total,
               prod.categoria,
               prod.emoji,
               COALESCE(prod.custo, prod.preco_custo, 0) as custo_unitario,
               COALESCE(prod.preco, 0) as preco_cadastro
        FROM pedidos p
        LEFT JOIN produtos prod ON LOWER(TRIM(p.productName)) = LOWER(TRIM(prod.nome))
        WHERE p.status IN ('Finalizado', 'Pago', 'Fracionado')
          AND date(COALESCE(p.createdAt, p.time)) >= ? AND date(COALESCE(p.createdAt, p.time)) <= ?
          AND p.productName NOT LIKE 'Pgto Parcial%'
          AND p.productName NOT LIKE 'Pgto QR Code%'
      `;
      const params = [dtInicio, dtFim];

      if (categoria && categoria !== 'todas') {
        query += ` AND prod.categoria = ?`;
        params.push(categoria);
      }

      query += ` GROUP BY p.productName ORDER BY faturamento_total DESC`;

      const rows = await new Promise(r => db.all(query, params, (e, d) => r(d || [])));

      const faturamentoGeral = rows.reduce((acc, r) => acc + (parseFloat(r.faturamento_total) || 0), 0);
      const volumeGeral = rows.reduce((acc, r) => acc + (parseInt(r.qtd_total, 10) || 0), 0);

      // Médias para a Matriz de Engenharia de Cardápio
      const mediaVolumePorProduto = rows.length > 0 ? (volumeGeral / rows.length) : 0;
      let somaMargensUnitarias = 0;

      // 1. Processar itens com custo e margem
      const itensProcessados = rows.map(r => {
        const faturamento = parseFloat(r.faturamento_total) || 0;
        const qtd = parseInt(r.qtd_total, 10) || 0;
        const precoMedio = qtd > 0 ? (faturamento / qtd) : 0;
        const custoUnit = parseFloat(r.custo_unitario) || (precoMedio * (cmvPadraoPct / 100));
        const custoTotal = custoUnit * qtd;
        const margemTotal = faturamento - custoTotal;
        const margemUnit = precoMedio - custoUnit;
        const margemPct = faturamento > 0 ? (margemTotal / faturamento) * 100 : 0;

        somaMargensUnitarias += margemUnit;

        return {
          nome: r.productName,
          categoria: r.categoria || 'Geral',
          emoji: r.emoji || '🍽️',
          qtd,
          faturamento,
          preco_medio: precoMedio,
          custo_unitario: custoUnit,
          custo_total: custoTotal,
          margem_total: margemTotal,
          margem_unitaria: margemUnit,
          margem_pct: margemPct,
          pct_faturamento: faturamentoGeral > 0 ? (faturamento / faturamentoGeral) * 100 : 0,
          pct_volume: volumeGeral > 0 ? (qtd / volumeGeral) * 100 : 0
        };
      });

      const mediaMargemUnitaria = rows.length > 0 ? (somaMargensUnitarias / rows.length) : 0;

      // 2. Classificação Pareto (A: até 80%, B: 80-95%, C: 95-100%)
      let acumFaturamento = 0;
      itensProcessados.forEach(item => {
        acumFaturamento += item.pct_faturamento;
        item.pct_faturamento_acumulado = acumFaturamento;
        if (acumFaturamento <= 80.5) item.classe_faturamento = 'A';
        else if (acumFaturamento <= 95.5) item.classe_faturamento = 'B';
        else item.classe_faturamento = 'C';

        // 3. Matriz de Engenharia de Cardápio (Estrela, Burro de Carga, Puzzle, Cão)
        const altaPopularidade = item.qtd >= mediaVolumePorProduto;
        const altaLucratividade = item.margem_unitaria >= mediaMargemUnitaria;

        if (altaPopularidade && altaLucratividade) {
          item.quadrante = 'Estrela';
          item.icone_quadrante = '⭐';
          item.acao_sugerida = 'Produto Campeão: manter qualidade impecável, divulgar em banners e fidelizar.';
          item.preco_sugerido = Math.round(item.preco_medio * 100) / 100;
          item.ganho_potencial = 0;
        } else if (altaPopularidade && !altaLucratividade) {
          item.quadrante = 'Cavalo de Carga';
          item.icone_quadrante = '🐴';
          item.acao_sugerida = 'Alto volume, margem apertada: renegociar insumos ou reajustar levemente o preço (+8%).';
          const recPreco = Math.ceil(item.preco_medio * 1.08 * 2) / 2; // Arredonda para 0.50
          item.preco_sugerido = recPreco > item.preco_medio ? recPreco : Math.round((item.preco_medio + 2.00) * 100) / 100;
          item.ganho_potencial = Math.round((item.preco_sugerido - item.preco_medio) * item.qtd * 100) / 100;
        } else if (!altaPopularidade && altaLucratividade) {
          item.quadrante = 'Quebra-Cabeça';
          item.icone_quadrante = '🧩';
          item.acao_sugerida = 'Alta rentabilidade, pouca saída: destacar nas comissões de garçom ou no topo do cardápio.';
          item.preco_sugerido = Math.round(item.preco_medio * 0.95 * 2) / 2;
          item.ganho_potencial = 0;
        } else {
          item.quadrante = 'Cão';
          item.icone_quadrante = '🐕';
          item.acao_sugerida = 'Baixa margem e baixa saída: reavaliar relevância, testar combo ou retirar do cardápio.';
          item.preco_sugerido = Math.round(item.preco_medio * 100) / 100;
          item.ganho_potencial = 0;
        }
      });

      const resumoClasses = {
        A: itensProcessados.filter(i => i.classe_faturamento === 'A'),
        B: itensProcessados.filter(i => i.classe_faturamento === 'B'),
        C: itensProcessados.filter(i => i.classe_faturamento === 'C')
      };

      const resumoQuadrantes = {
        estrelas: itensProcessados.filter(i => i.quadrante === 'Estrela'),
        cavalos_de_carga: itensProcessados.filter(i => i.quadrante === 'Cavalo de Carga'),
        quebra_cabecas: itensProcessados.filter(i => i.quadrante === 'Quebra-Cabeça'),
        caes: itensProcessados.filter(i => i.quadrante === 'Cão')
      };

      const ganhoTotalPotencial = resumoQuadrantes.cavalos_de_carga.reduce((acc, c) => acc + (c.ganho_potencial || 0), 0);

      res.json({
        ok: true,
        periodo: { inicio: dtInicio, fim: dtFim },
        totais: {
          faturamento_geral: faturamentoGeral,
          volume_geral: volumeGeral,
          itens_distintos: rows.length,
          media_volume_por_item: mediaVolumePorProduto,
          media_margem_unitaria: mediaMargemUnitaria,
          ganho_potencial_reajuste: ganhoTotalPotencial
        },
        curva_abc: itensProcessados,
        classes: {
          A: { quantidade: resumoClasses.A.length, faturamento: resumoClasses.A.reduce((s, i) => s + i.faturamento, 0) },
          B: { quantidade: resumoClasses.B.length, faturamento: resumoClasses.B.reduce((s, i) => s + i.faturamento, 0) },
          C: { quantidade: resumoClasses.C.length, faturamento: resumoClasses.C.reduce((s, i) => s + i.faturamento, 0) }
        },
        engenharia_cardapio: {
          estrelas: resumoQuadrantes.estrelas.length,
          cavalos_de_carga: resumoQuadrantes.cavalos_de_carga.length,
          quebra_cabecas: resumoQuadrantes.quebra_cabecas.length,
          caes: resumoQuadrantes.caes.length,
          ganho_potencial_total: ganhoTotalPotencial,
          itens_cavalos: resumoQuadrantes.cavalos_de_carga.map(c => ({
            nome: c.nome,
            qtd: c.qtd,
            preco_atual: c.preco_medio,
            preco_sugerido: c.preco_sugerido,
            ganho_potencial: c.ganho_potencial
          }))
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: 'Falha ao processar Curva ABC: ' + e.message });
    }
  });

  // 4.1 APLICAÇÃO DE PREÇO SUGERIDO (1-CLIQUE PELO DONO)
  app.post('/api/financeiro/aplicar-preco-sugerido', authMiddleware, async (req, res) => {
    const db = resolveDb(req);
    const { nome, novo_preco } = req.body || {};
    if (!nome || novo_preco === undefined || isNaN(novo_preco)) {
      return res.status(400).json({ ok: false, erro: 'Nome do produto e novo preço numérico são obrigatórios.' });
    }
    const precoNum = Math.max(0, parseFloat(novo_preco));
    db.run(
      `UPDATE produtos SET preco = ? WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?))`,
      [precoNum, nome],
      function (err) {
        if (err) return res.status(500).json({ ok: false, erro: 'Erro ao atualizar preço: ' + err.message });
        if (this && this.changes === 0) {
          return res.status(404).json({ ok: false, erro: `Produto "${nome}" não localizado na tabela de produtos.` });
        }
        if (io) {
          io.emit('produtos_atualizados');
          io.emit('menu_alterado');
        }
        res.json({
          ok: true,
          mensagem: `Preço do item "${nome}" atualizado com sucesso para R$ ${precoNum.toFixed(2).replace('.', ',')}`,
          produto: nome,
          novo_preco: precoNum
        });
      }
    );
  });

  // 4.2 LISTA DE ITENS ESTRELAS PARA O CARDÁPIO DIGITAL
  app.get('/api/financeiro/produtos-estrelas', async (req, res) => {
    const db = resolveDb(req);
    try {
      const rows = await new Promise(r => db.all(`
        SELECT p.productName, SUM(p.quantity) as qtd
        FROM pedidos p
        WHERE p.status IN ('Finalizado', 'Pago')
          AND date(COALESCE(p.createdAt, p.time)) >= date('now', '-30 days')
        GROUP BY p.productName
        ORDER BY qtd DESC
        LIMIT 6
      `, [], (e, d) => r(d || [])));
      const nomes = rows.map(r => r.productName);
      res.json({ ok: true, estrelas: nomes });
    } catch(e) {
      res.json({ ok: true, estrelas: [] });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // 5. FECHAMENTO DE CAIXA AVANÇADO (CEGO / ABERTO COM AUDITORIA)
  // ══════════════════════════════════════════════════════════════════

  app.post('/api/caixa/fechamento-conferencia', authMiddleware, async (req, res) => {
    const db = resolveDb(req);
    const body = req.body || {};
    const { contagem, justificativa, operador } = body;

    if (!contagem || typeof contagem !== 'object') {
      return res.status(400).json({ ok: false, erro: 'Contagem física dos valores é obrigatória.' });
    }

    // 1. Obtém o turno aberto atual
    db.get(`SELECT * FROM turnos_caixa WHERE status = 'Aberto' ORDER BY id DESC LIMIT 1`, [], async (err, turno) => {
      if (err || !turno) {
        return res.status(400).json({ ok: false, erro: 'Nenhum turno aberto no momento.' });
      }

      // 2. Calcula os totais reais apurados pelo sistema no turno
      const pedidosQuery = `
        SELECT paymentMethod, SUM(CAST(REPLACE(total, ',', '.') AS REAL)) as total
        FROM pedidos
        WHERE status IN ('Finalizado', 'Pago', 'Fracionado') AND turno_id = ?
          AND productName NOT LIKE 'Pgto Parcial%' AND productName NOT LIKE 'Pgto QR Code%'
        GROUP BY paymentMethod
      `;

      db.all(pedidosQuery, [turno.id], (errP, rowsPagto) => {
        const esperado = {
          fundo_troco: parseFloat(turno.fundo_troco) || 0,
          dinheiro: 0,
          pix: 0,
          debito: 0,
          credito: 0,
          fiado: 0,
          outros: 0
        };

        // Movimentações do turno (fonte de verdade de pagamentos e fluxos de caixa)
        db.all(`SELECT tipo, valor, forma_pagamento, descricao FROM movimentacoes WHERE turno_id = ?`, [turno.id], (errM, rowsMov) => {
          let sangrias = 0;
          let suprimentos = 0;
          let descontos = 0;
          let totalMovsEntrada = 0;

          (rowsMov || []).forEach(r => {
            const t = String(r.tipo || '').toLowerCase().trim();
            const fp = String(r.forma_pagamento || '').toLowerCase().trim();
            const v = parseFloat(r.valor) || 0;

            if (t === 'entrada') {
              totalMovsEntrada += v;
              if (fp.includes('dinheiro')) esperado.dinheiro += v;
              else if (fp.includes('pix')) esperado.pix += v;
              else if (fp.includes('debito') || fp.includes('débito')) esperado.debito += v;
              else if (fp.includes('credito') || fp.includes('crédito') || fp.includes('cartão') || fp.includes('cartao')) esperado.credito += v;
              else if (fp.includes('fiado') || fp.includes('conta')) esperado.fiado += v;
              else esperado.outros += v;
            } else if (t === 'sangria' || t === 'saida' || t === 'saída' || t === 'despesa') {
              sangrias += v;
            } else if (t === 'suprimento' || t === 'reforco' || t === 'aporte') {
              suprimentos += v;
            } else if (t === 'desconto') {
              descontos += v;
            }
          });

          // Fallback defensivo: se não há movimentações de entrada registradas (ex: turno antigo legado), usa pedidos
          if (totalMovsEntrada === 0) {
            (rowsPagto || []).forEach(r => {
              const val = parseFloat(r.total) || 0;
              const m = String(r.paymentMethod || '').toLowerCase();
              if (m.includes('dinheiro')) esperado.dinheiro += val;
              else if (m.includes('pix')) esperado.pix += val;
              else if (m.includes('debito') || m.includes('débito')) esperado.debito += val;
              else if (m.includes('credito') || m.includes('crédito')) esperado.credito += val;
              else if (m.includes('fiado')) esperado.fiado += val;
              else esperado.outros += val;
            });
          }

          const gavetaEsperada = (esperado.fundo_troco + esperado.dinheiro + suprimentos) - sangrias;
          const totalFaturadoSistema = esperado.dinheiro + esperado.pix + esperado.debito + esperado.credito + esperado.fiado + esperado.outros;

          // 3. Totais Declarados pelo Operador
          const decDinheiro = parseFloat(contagem.dinheiro) || 0;
          const decPix = parseFloat(contagem.pix) || 0;
          const decDebito = parseFloat(contagem.debito) || 0;
          const decCredito = parseFloat(contagem.credito) || 0;
          const decOutros = parseFloat(contagem.outros) || 0;

          const totalDeclarado = decDinheiro + decPix + decDebito + decCredito + decOutros;
          const totalEsperadoConferencia = gavetaEsperada + esperado.pix + esperado.debito + esperado.credito + esperado.outros;

          // Diferença geral (Sobra > 0, Falta < 0)
          const diferencaGeral = totalDeclarado - totalEsperadoConferencia;
          const diferencaDinheiro = decDinheiro - gavetaEsperada;

          const detalhesJson = JSON.stringify({
            esperado: {
              fundo_troco: esperado.fundo_troco,
              dinheiro_vendas: esperado.dinheiro,
              suprimentos,
              sangrias,
              gaveta_esperada: gavetaEsperada,
              pix: esperado.pix,
              debito: esperado.debito,
              credito: esperado.credito,
              fiado: esperado.fiado,
              total_faturado: totalFaturadoSistema
            },
            declarado: {
              dinheiro: decDinheiro,
              pix: decPix,
              debito: decDebito,
              credito: decCredito,
              outros: decOutros,
              total: totalDeclarado
            },
            divergencias: {
              gaveta: diferencaDinheiro,
              pix: decPix - esperado.pix,
              debito: decDebito - esperado.debito,
              credito: decCredito - esperado.credito,
              geral: diferencaGeral
            },
            timestamp_fechamento: new Date().toISOString()
          });

          const opNome = operador || 'Caixa';
          const justif = justificativa ? String(justificativa).trim() : '';

          // 4. Grava fechamento no banco
          db.run(
            `UPDATE turnos_caixa
             SET status = 'Fechado',
                 data_fechamento = datetime('now', 'localtime'),
                 total_declarado = ?,
                 diferenca_caixa = ?,
                 detalhes_fechamento = ?,
                 operador_fechamento = ?,
                 justificativa_diferenca = ?
             WHERE id = ?`,
            [totalDeclarado, diferencaGeral, detalhesJson, opNome, justif, turno.id],
            function(errUpd) {
              if (errUpd) return res.status(500).json({ ok: false, erro: 'Erro ao fechar turno: ' + errUpd.message });

              if (typeof global.registrarAuditoria === 'function') {
                try {
                  const difStr = diferencaGeral === 0 ? 'Sem diferença' : (diferencaGeral > 0 ? `Sobra de R$ ${diferencaGeral.toFixed(2)}` : `Falta de R$ ${Math.abs(diferencaGeral).toFixed(2)}`);
                  global.registrarAuditoria(opNome, 'FECHAMENTO_CAIXA_AUDITADO', `Turno #${turno.id} encerrado com ${difStr}`, 'Auditoria de Caixa', Math.abs(diferencaGeral) > 10 ? 'ALTO' : 'MEDIO');
                } catch(e) {}
              }

              if (io && io.emit) {
                io.emit('estado_caixa', null);
                io.emit('caixa_fechado_conferencia', {
                  turno_id: turno.id,
                  operador: opNome,
                  total_declarado: totalDeclarado,
                  diferenca: diferencaGeral
                });
              }

              res.json({
                ok: true,
                mensagem: 'Turno encerrado e auditado com sucesso!',
                resumo: {
                  turno_id: turno.id,
                  faturado_sistema: totalFaturadoSistema,
                  total_declarado: totalDeclarado,
                  diferenca_geral: diferencaGeral,
                  diferenca_dinheiro: diferencaDinheiro,
                  situacao: Math.abs(diferencaGeral) < 0.01 ? 'Exato' : (diferencaGeral > 0 ? 'Sobra' : 'Falta (Quebra de Caixa)'),
                  detalhes: JSON.parse(detalhesJson)
                }
              });
            }
          );
        });
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 6. HISTÓRICO DE AUDITORIA DE TURNOS
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/caixa/turnos-historico', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const limite = parseInt(req.query.limite, 10) || 30;

    db.all(
      `SELECT id, status, fundo_troco, data_abertura, data_fechamento,
              total_declarado, diferenca_caixa, operador_fechamento, justificativa_diferenca, detalhes_fechamento
       FROM turnos_caixa
       ORDER BY id DESC
       LIMIT ?`,
      [limite],
      (err, rows) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        const processados = (rows || []).map(r => {
          let det = null;
          try { if (r.detalhes_fechamento) det = JSON.parse(r.detalhes_fechamento); } catch(e) {}
          return {
            ...r,
            detalhes_fechamento: det
          };
        });
        res.json({ ok: true, turnos: processados });
      }
    );
  });

  // ══════════════════════════════════════════════════════════════════
  // 7. ATUALIZAÇÃO ÁGIL DO PREÇO DE CUSTO (CMV) DE PRODUTOS
  // ══════════════════════════════════════════════════════════════════

  app.post('/api/financeiro/produto-custo', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { id, nome, custo } = req.body || {};

    if (custo === undefined || isNaN(parseFloat(custo))) {
      return res.status(400).json({ ok: false, erro: 'Valor de custo unitário inválido.' });
    }

    const valorCusto = Math.max(0, parseFloat(custo));

    if (id) {
      db.run(
        `UPDATE produtos SET custo = ?, preco_custo = ? WHERE id = ?`,
        [valorCusto, valorCusto, id],
        function(err) {
          if (err) return res.status(500).json({ ok: false, erro: err.message });
          res.json({ ok: true, mensagem: 'Custo do produto atualizado com sucesso!', custo: valorCusto });
        }
      );
    } else if (nome) {
      db.run(
        `UPDATE produtos SET custo = ?, preco_custo = ? WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?))`,
        [valorCusto, valorCusto, nome],
        function(err) {
          if (err) return res.status(500).json({ ok: false, erro: err.message });
          res.json({ ok: true, mensagem: 'Custo do produto atualizado com sucesso!', custo: valorCusto, alterados: this.changes });
        }
      );
    } else {
      res.status(400).json({ ok: false, erro: 'ID ou Nome do produto é obrigatório.' });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // 8. GESTÃO DE INSUMOS & ESTOQUE DE MATÉRIA-PRIMA
  // ══════════════════════════════════════════════════════════════════

  // Listar todos os insumos cadastrados
  app.get('/api/financeiro/insumos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    db.all(
      `SELECT id, nome, unidade, custo_unitario, estoque_atual, estoque_minimo, criado_em,
              CASE WHEN estoque_atual <= estoque_minimo THEN 1 ELSE 0 END as alerta_baixo
       FROM insumos
       ORDER BY alerta_baixo DESC, nome ASC`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, insumos: rows || [] });
      }
    );
  });

  // Criar novo insumo
  app.post('/api/financeiro/insumos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { nome, unidade = 'kg', custo_unitario = 0, estoque_atual = 0, estoque_minimo = 0 } = req.body || {};

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ ok: false, erro: 'Nome do insumo é obrigatório.' });
    }

    db.run(
      `INSERT INTO insumos (nome, unidade, custo_unitario, estoque_atual, estoque_minimo)
       VALUES (?, ?, ?, ?, ?)`,
      [
        String(nome).trim(),
        String(unidade || 'kg').toLowerCase(),
        Math.max(0, parseFloat(custo_unitario) || 0),
        Math.max(0, parseFloat(estoque_atual) || 0),
        Math.max(0, parseFloat(estoque_minimo) || 0)
      ],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        const insumoId = this.lastID;

        // Se iniciou com estoque, registra entrada inicial
        if (parseFloat(estoque_atual) > 0) {
          db.run(
            `INSERT INTO movimentacoes_insumos (insumo_id, tipo, quantidade, saldo_anterior, saldo_novo, motivo)
             VALUES (?, 'entrada', ?, 0, ?, 'Saldo inicial de cadastro')`,
            [insumoId, parseFloat(estoque_atual), parseFloat(estoque_atual)]
          );
        }

        res.json({ ok: true, id: insumoId, mensagem: 'Insumo cadastrado com sucesso!' });
      }
    );
  });

  // Atualizar insumo existente
  app.put('/api/financeiro/insumos/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const id = parseInt(req.params.id, 10);
    const { nome, unidade, custo_unitario, estoque_minimo } = req.body || {};

    if (isNaN(id)) return res.status(400).json({ ok: false, erro: 'ID inválido.' });

    db.run(
      `UPDATE insumos
       SET nome = COALESCE(?, nome),
           unidade = COALESCE(?, unidade),
           custo_unitario = COALESCE(?, custo_unitario),
           estoque_minimo = COALESCE(?, estoque_minimo)
       WHERE id = ?`,
      [
        nome ? String(nome).trim() : null,
        unidade ? String(unidade).toLowerCase() : null,
        custo_unitario !== undefined ? Math.max(0, parseFloat(custo_unitario) || 0) : null,
        estoque_minimo !== undefined ? Math.max(0, parseFloat(estoque_minimo) || 0) : null,
        id
      ],
      function(err) {
        if (err) return res.status(500).json({ ok: false, erro: err.message });
        res.json({ ok: true, mensagem: 'Insumo atualizado com sucesso!' });
      }
    );
  });

  // Excluir insumo
  app.delete('/api/financeiro/insumos/:id', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ ok: false, erro: 'ID inválido.' });

    db.run(`DELETE FROM insumos WHERE id = ?`, [id], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Insumo removido com sucesso!' });
    });
  });

  // Ajuste manual de estoque de insumo (Entrada, Saída, Perda, Balanço)
  app.post('/api/financeiro/insumos/:id/ajuste', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const id = parseInt(req.params.id, 10);
    const { tipo = 'ajuste', quantidade = 0, motivo = 'Ajuste manual de estoque' } = req.body || {};
    const qtd = parseFloat(quantidade) || 0;

    if (isNaN(id) || qtd === 0) {
      return res.status(400).json({ ok: false, erro: 'ID ou quantidade inválida.' });
    }

    db.get(`SELECT estoque_atual, estoque_minimo, nome, unidade FROM insumos WHERE id = ?`, [id], (err, row) => {
      if (err || !row) return res.status(404).json({ ok: false, erro: 'Insumo não encontrado.' });

      let novoEstoque = row.estoque_atual;
      if (tipo === 'entrada') {
        novoEstoque += Math.abs(qtd);
      } else if (tipo === 'saida' || tipo === 'perda') {
        novoEstoque = Math.max(0, novoEstoque - Math.abs(qtd));
      } else { // ajuste absoluto ou balanço
        novoEstoque = Math.max(0, qtd);
      }
      novoEstoque = parseFloat(novoEstoque.toFixed(4));

      db.run(`UPDATE insumos SET estoque_atual = ? WHERE id = ?`, [novoEstoque, id], function(uErr) {
        if (uErr) return res.status(500).json({ ok: false, erro: uErr.message });

        db.run(
          `INSERT INTO movimentacoes_insumos (insumo_id, tipo, quantidade, saldo_anterior, saldo_novo, motivo)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, tipo, qtd, row.estoque_atual, novoEstoque, motivo]
        );

        if (novoEstoque <= row.estoque_minimo && io) {
          io.emit('alerta_estoque_insumo', {
            insumo_id: id,
            nome: row.nome,
            estoque_atual: novoEstoque,
            estoque_minimo: row.estoque_minimo,
            unidade: row.unidade
          });
        }

        res.json({ ok: true, saldo_anterior: row.estoque_atual, saldo_novo: novoEstoque });
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 9. FICHA TÉCNICA (RECEITAS & CUSTO POR INSUMO)
  // ══════════════════════════════════════════════════════════════════

  // Consultar ficha técnica de um produto
  app.get('/api/financeiro/ficha-tecnica/:produtoId', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const prodId = parseInt(req.params.produtoId, 10);
    if (isNaN(prodId)) return res.status(400).json({ ok: false, erro: 'ID de produto inválido.' });

    db.get(`SELECT id, nome, preco, custo, preco_custo FROM produtos WHERE id = ?`, [prodId], (err, prod) => {
      if (err || !prod) return res.status(404).json({ ok: false, erro: 'Produto não encontrado.' });

      db.all(
        `SELECT ft.id as ficha_id, ft.produto_id, ft.insumo_id, ft.quantidade, ft.perda_pct,
                i.nome as insumo_nome, i.unidade, i.custo_unitario, i.estoque_atual, i.estoque_minimo,
                (ft.quantidade * (1 + (ft.perda_pct / 100.0)) * i.custo_unitario) as subtotal_custo
         FROM ficha_tecnica ft
         JOIN insumos i ON i.id = ft.insumo_id
         WHERE ft.produto_id = ?
         ORDER BY i.nome ASC`,
        [prodId],
        (errFt, itens) => {
          if (errFt) return res.status(500).json({ ok: false, erro: errFt.message });

          const itensFicha = itens || [];
          const custoCalculado = itensFicha.reduce((acc, it) => acc + (parseFloat(it.subtotal_custo) || 0), 0);
          const precoVenda = parseFloat(prod.preco) || 0;
          const margemLucroBruta = precoVenda > 0 ? ((precoVenda - custoCalculado) / precoVenda) * 100 : 0;
          const cmvPct = precoVenda > 0 ? (custoCalculado / precoVenda) * 100 : 0;

          res.json({
            ok: true,
            produto: prod,
            itens: itensFicha,
            custo_calculado: parseFloat(custoCalculado.toFixed(2)),
            margem_bruta_pct: parseFloat(margemLucroBruta.toFixed(1)),
            cmv_pct: parseFloat(cmvPct.toFixed(1))
          });
        }
      );
    });
  });

  // Salvar / Substituir ficha técnica de um produto e recalcular custo do produto
  app.post('/api/financeiro/ficha-tecnica/:produtoId', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const prodId = parseInt(req.params.produtoId, 10);
    const { itens = [] } = req.body || {}; // itens: [{ insumo_id, quantidade, perda_pct }]

    if (isNaN(prodId)) return res.status(400).json({ ok: false, erro: 'ID de produto inválido.' });

    db.serialize(() => {
      // Remove a ficha técnica anterior do produto
      db.run(`DELETE FROM ficha_tecnica WHERE produto_id = ?`, [prodId]);

      if (!Array.isArray(itens) || itens.length === 0) {
        return res.json({ ok: true, mensagem: 'Ficha técnica limpa com sucesso!', custo_total: 0 });
      }

      const stmt = db.prepare(`INSERT INTO ficha_tecnica (produto_id, insumo_id, quantidade, perda_pct) VALUES (?, ?, ?, ?)`);
      itens.forEach(it => {
        if (it && it.insumo_id) {
          stmt.run(
            prodId,
            parseInt(it.insumo_id, 10),
            Math.max(0.0001, parseFloat(it.quantidade) || 0),
            Math.max(0, parseFloat(it.perda_pct) || 0)
          );
        }
      });
      stmt.finalize();

      // Recalcula o custo total do produto com base nos insumos e atualiza produtos.custo
      db.all(
        `SELECT ft.quantidade, ft.perda_pct, i.custo_unitario
         FROM ficha_tecnica ft
         JOIN insumos i ON i.id = ft.insumo_id
         WHERE ft.produto_id = ?`,
        [prodId],
        (errCalc, rows) => {
          let custoTotal = 0;
          (rows || []).forEach(r => {
            const fatorPerda = 1 + ((r.perda_pct || 0) / 100);
            custoTotal += r.quantidade * fatorPerda * (r.custo_unitario || 0);
          });
          custoTotal = parseFloat(custoTotal.toFixed(2));

          db.run(
            `UPDATE produtos SET custo = ?, preco_custo = ? WHERE id = ?`,
            [custoTotal, custoTotal, prodId],
            (uErr) => {
              res.json({
                ok: true,
                mensagem: 'Ficha técnica salva com sucesso e custo do produto atualizado!',
                custo_total: custoTotal,
                itens_salvos: (rows || []).length
              });
            }
          );
        }
      );
    });
  });

  // Remover item individual da ficha técnica
  app.delete('/api/financeiro/ficha-tecnica/:produtoId/item/:fichaId', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const prodId = parseInt(req.params.produtoId, 10);
    const fichaId = parseInt(req.params.fichaId, 10);

    if (isNaN(prodId) || isNaN(fichaId)) {
      return res.status(400).json({ ok: false, erro: 'Parâmetros inválidos.' });
    }

    db.run(`DELETE FROM ficha_tecnica WHERE id = ? AND produto_id = ?`, [fichaId, prodId], function(err) {
      if (err) return res.status(500).json({ ok: false, erro: err.message });
      res.json({ ok: true, mensagem: 'Item removido da receita.' });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 10. MOTOR DE BAIXA AUTOMÁTICA DE INSUMOS POR VENDA
  // ══════════════════════════════════════════════════════════════════

  function darBaixaEstoqueInsumos(db, produtoIdentificador, quantidadeVendida, referencia, callback) {
    if (!db || !produtoIdentificador) {
      if (typeof callback === 'function') callback(null);
      return;
    }
    const qty = Math.max(1, parseFloat(quantidadeVendida) || 1);

    const isId = Number.isInteger(Number(produtoIdentificador)) && Number(produtoIdentificador) > 0;
    const sqlProd = isId ? `SELECT id, nome, custo FROM produtos WHERE id = ?` : `SELECT id, nome, custo FROM produtos WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?))`;
    const paramProd = [produtoIdentificador];

    db.get(sqlProd, paramProd, (err, prod) => {
      if (err || !prod) {
        if (typeof callback === 'function') callback(err);
        return;
      }

      db.all(
        `SELECT ft.id as ficha_id, ft.insumo_id, ft.quantidade, ft.perda_pct,
                i.nome as insumo_nome, i.unidade, i.estoque_atual, i.estoque_minimo, i.custo_unitario
         FROM ficha_tecnica ft
         JOIN insumos i ON i.id = ft.insumo_id
         WHERE ft.produto_id = ?`,
        [prod.id],
        (errFt, fichas) => {
          if (errFt || !fichas || fichas.length === 0) {
            if (typeof callback === 'function') callback(errFt);
            return;
          }

          db.serialize(() => {
            fichas.forEach(f => {
              const fatorPerda = 1 + ((f.perda_pct || 0) / 100);
              const qtdInsumoConsumida = parseFloat((f.quantidade * qty * fatorPerda).toFixed(4));
              const novoEstoque = Math.max(0, parseFloat((f.estoque_atual - qtdInsumoConsumida).toFixed(4)));

              db.run(`UPDATE insumos SET estoque_atual = ? WHERE id = ?`, [novoEstoque, f.insumo_id]);

              db.run(
                `INSERT INTO movimentacoes_insumos (insumo_id, tipo, quantidade, saldo_anterior, saldo_novo, motivo, referencia_id)
                 VALUES (?, 'baixa_venda', ?, ?, ?, ?, ?)`,
                [
                  f.insumo_id,
                  qtdInsumoConsumida,
                  f.estoque_atual,
                  novoEstoque,
                  `Venda: ${qty}x ${prod.nome}`,
                  referencia || prod.id
                ]
              );

              if (novoEstoque <= f.estoque_minimo && io) {
                io.emit('alerta_estoque_insumo', {
                  insumo_id: f.insumo_id,
                  nome: f.insumo_nome,
                  estoque_atual: novoEstoque,
                  estoque_minimo: f.estoque_minimo,
                  unidade: f.unidade
                });
              }
            });
            if (typeof callback === 'function') callback(null, { produto: prod.nome, insumosBaixados: fichas.length });
          });
        }
      );
    });
  }

  // Anexa ao app.locals para que outros controllers (ex: socket-financeiro) acessem diretamente
  if (app && app.locals) {
    app.locals.darBaixaEstoqueInsumos = darBaixaEstoqueInsumos;
    global.darBaixaEstoqueInsumos = darBaixaEstoqueInsumos;
  }

  // Rota HTTP para disparar baixa de estoque de uma lista de itens vendidos
  app.post('/api/financeiro/dar-baixa-insumos', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const { itens = [], referencia = null } = req.body || {};

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ ok: false, erro: 'Lista de itens vazia.' });
    }

    let pendentes = itens.length;
    let baixados = 0;
    itens.forEach(it => {
      const prodIdOuNome = it.produto_id || it.produto || it.productName || it.nome;
      const qtd = it.quantidade || it.quantity || 1;
      darBaixaEstoqueInsumos(db, prodIdOuNome, qtd, referencia, (err, resB) => {
        if (!err && resB) baixados++;
        pendentes--;
        if (pendentes <= 0) {
          res.json({ ok: true, mensagem: `Baixa de estoque concluída para ${baixados} produtos da lista.` });
        }
      });
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 11. RELATÓRIO DE CMV DIÁRIO REAL & ANÁLISE DE CUSTOS
  // ══════════════════════════════════════════════════════════════════

  app.get('/api/financeiro/cmv-diario', authMiddleware, (req, res) => {
    const db = resolveDb(req);
    const dataRef = req.query.data || new Date().toISOString().slice(0, 10);

    // 1. Total faturado no dia em pedidos pagos
    db.get(
      `SELECT COALESCE(SUM(total), 0) as faturamento_bruto,
              COUNT(id) as total_pedidos
       FROM pedidos
       WHERE status IN ('Pago', 'Finalizado')
         AND (
           substr(createdAt, 1, 10) = ?
           OR (createdAt IS NULL AND substr(time, 1, 10) = ?)
         )`,
      [dataRef, dataRef],
      (errFat, fatRow) => {
        if (errFat) return res.status(500).json({ ok: false, erro: errFat.message });

        const faturamento = parseFloat(fatRow.faturamento_bruto) || 0;

        // 2. Apuração do CMV dos produtos vendidos no dia
        db.all(
          `SELECT p.productName,
                  SUM(COALESCE(p.quantity, 1)) as total_qtd,
                  COALESCE(prod.custo, prod.preco_custo, 0) as custo_unitario,
                  SUM(COALESCE(p.quantity, 1) * COALESCE(prod.custo, prod.preco_custo, 0)) as cmv_total_item,
                  SUM(p.total) as faturamento_item
           FROM pedidos p
           LEFT JOIN produtos prod ON LOWER(TRIM(prod.nome)) = LOWER(TRIM(p.productName))
           WHERE p.status IN ('Pago', 'Finalizado')
             AND (
               substr(p.createdAt, 1, 10) = ?
               OR (p.createdAt IS NULL AND substr(p.time, 1, 10) = ?)
             )
           GROUP BY p.productName
           ORDER BY cmv_total_item DESC`,
          [dataRef, dataRef],
          (errProd, itensProd) => {
            if (errProd) return res.status(500).json({ ok: false, erro: errProd.message });

            const cmvRealTotal = (itensProd || []).reduce((acc, it) => acc + (parseFloat(it.cmv_total_item) || 0), 0);
            const lucroBruto = Math.max(0, faturamento - cmvRealTotal);
            const cmvRealPct = faturamento > 0 ? (cmvRealTotal / faturamento) * 100 : 0;

            // 3. Consumo de insumos por movimentações de baixa no dia
            db.all(
              `SELECT i.nome, i.unidade, i.estoque_atual, i.estoque_minimo,
                      SUM(m.quantidade) as total_consumido,
                      (SUM(m.quantidade) * i.custo_unitario) as custo_insumo_total
               FROM movimentacoes_insumos m
               JOIN insumos i ON i.id = m.insumo_id
               WHERE m.tipo = 'baixa_venda'
                 AND substr(m.criado_em, 1, 10) = ?
               GROUP BY m.insumo_id
               ORDER BY custo_insumo_total DESC
               LIMIT 10`,
              [dataRef],
              (errMov, insumosConsumidos) => {
                // 4. Insumos com estoque crítico (<= mínimo)
                db.all(
                  `SELECT id, nome, unidade, estoque_atual, estoque_minimo
                   FROM insumos
                   WHERE estoque_atual <= estoque_minimo
                   ORDER BY (estoque_minimo - estoque_atual) DESC`,
                  [],
                  (errAlert, alertasEstoque) => {
                    res.json({
                      ok: true,
                      data: dataRef,
                      resumo: {
                        faturamento_bruto: parseFloat(faturamento.toFixed(2)),
                        cmv_real: parseFloat(cmvRealTotal.toFixed(2)),
                        lucro_bruto: parseFloat(lucroBruto.toFixed(2)),
                        cmv_pct: parseFloat(cmvRealPct.toFixed(1)),
                        cmv_meta_pct: 32.0,
                        status_meta: cmvRealPct <= 32.0 ? 'Dentro da Meta' : 'Acima da Meta (Alerta)'
                      },
                      produtos_vendidos: itensProd || [],
                      top_insumos_consumidos: insumosConsumidos || [],
                      alertas_estoque_baixo: alertasEstoque || []
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

  console.log('📊 Controller Financeiro & BI (DRE, Curva ABC, Insumos, Ficha Técnica, CMV Real) registrado.');
};
