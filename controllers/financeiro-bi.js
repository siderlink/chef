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

      // 4. Índices para performance em relatórios analíticos
      db.run(`CREATE INDEX IF NOT EXISTS idx_pedidos_turno ON pedidos(turno_id)`, () => {});
      db.run(`CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status)`, () => {});
      db.run(`CREATE INDEX IF NOT EXISTS idx_despesas_competencia ON despesas_financeiras(data_competencia)`, () => {});
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
        } else if (altaPopularidade && !altaLucratividade) {
          item.quadrante = 'Cavalo de Carga';
          item.icone_quadrante = '🐴';
          item.acao_sugerida = 'Alto volume, margem apertada: renegociar custo de insumos ou reajustar levemente o preço.';
        } else if (!altaPopularidade && altaLucratividade) {
          item.quadrante = 'Quebra-Cabeça';
          item.icone_quadrante = '🧩';
          item.acao_sugerida = 'Alta rentabilidade, pouca saída: destacar nas comissões de garçom ou no topo do cardápio.';
        } else {
          item.quadrante = 'Cão';
          item.icone_quadrante = '🐕';
          item.acao_sugerida = 'Baixa margem e baixa saída: reavaliar relevância ou substituir por novidade no cardápio.';
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

      res.json({
        ok: true,
        periodo: { inicio: dtInicio, fim: dtFim },
        totais: {
          faturamento_geral: faturamentoGeral,
          volume_geral: volumeGeral,
          itens_distintos: rows.length,
          media_volume_por_item: mediaVolumePorProduto,
          media_margem_unitaria: mediaMargemUnitaria
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
          caes: resumoQuadrantes.caes.length
        }
      });
    } catch (e) {
      res.status(500).json({ ok: false, erro: 'Falha ao processar Curva ABC: ' + e.message });
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

  console.log('📊 Controller Financeiro & BI (DRE, Curva ABC, Fechamento Avançado, Despesas) registrado.');
};
