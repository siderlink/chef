/**
 * controllers/engenharia-cardapio.js
 * Módulo Pilar 1: Engenharia de Cardápio Automatizada & Matriz BCG (Kasavana & Smith)
 * Benchmark Gastronômico Global Cheff.pro
 * 
 * - Análise cruzada de Margem de Contribuição individual vs Volume de Vendas histórico
 * - Classificação nos 4 Quadrantes:
 *   ⭐ ESTRELAS (Stars): Alta Margem + Altas Vendas
 *   🐴 BURROS DE CARGA (Plowhorses): Baixa Margem + Altas Vendas
 *   🧩 QUEBRA-CABEÇAS (Puzzles): Alta Margem + Baixas Vendas
 *   🐕 CÃES (Dogs): Baixa Margem + Baixas Vendas
 * - Recomendações acionáveis de precificação e engenharia de menu
 * - Aplicação de reajuste com 1 clique diretamente no banco de produtos
 * - Feed de pratos Estrelas com badge dourada no cardápio digital
 */
'use strict';

module.exports = function(app, options) {
  const { db: defaultDb, io, verificarToken, getTenantDb } = options || {};

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

  function authMiddleware(req, res, next) {
    if (req.headers && req.headers.authorization && typeof verificarToken === 'function') {
      return verificarToken(req, res, next);
    }
    next();
  }

  // ── 1. ROTA PRINCIPAL: MATRIZ BCG COMPLETA (ÚLTIMOS 30 DIAS OU PERÍODO CUSTOM) ──
  app.get('/api/engenharia-cardapio/matriz', authMiddleware, async (req, res) => {
    const db = resolveDb(req);
    const { dias = 30, categoria } = req.query || {};

    const numDias = parseInt(dias, 10) || 30;
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - numDias);
    const dtInicioIso = dataLimite.toISOString().slice(0, 10);
    const dtHojeIso = new Date().toISOString().slice(0, 10);

    try {
      // Buscar CMV padrão do restaurante
      const cfgRows = await new Promise(resolve => {
        db.all(`SELECT valor FROM configuracoes WHERE chave = 'cmv_padrao_pct'`, [], (err, rows) => resolve(rows || []));
      });
      const cmvPadraoPct = cfgRows[0] ? (parseFloat(cfgRows[0].valor) || 32) : 32;

      // Consulta agregada de vendas dos pedidos finalizados
      let query = `
        SELECT p.productName,
               SUM(p.quantity) as qtd_total,
               SUM(CAST(REPLACE(p.total, ',', '.') AS REAL)) as faturamento_total,
               prod.id as produto_id,
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
      const params = [dtInicioIso, dtHojeIso];

      if (categoria && categoria !== 'todas') {
        query += ` AND prod.categoria = ?`;
        params.push(categoria);
      }

      query += ` GROUP BY p.productName ORDER BY faturamento_total DESC`;

      const rows = await new Promise((resolve, reject) => {
        db.all(query, params, (err, data) => {
          if (err) reject(err);
          else resolve(data || []);
        });
      });

      const faturamentoTotalGeral = rows.reduce((acc, r) => acc + (parseFloat(r.faturamento_total) || 0), 0);
      const volumeTotalGeral = rows.reduce((acc, r) => acc + (parseInt(r.qtd_total, 10) || 0), 0);

      // Linhas de corte da Matriz Kasavana & Smith (médias)
      const mediaVolumePorProduto = rows.length > 0 ? (volumeTotalGeral / rows.length) : 0;
      let somaMargens = 0;

      // 1. Processar custos, preços e margem de contribuição
      const produtosProcessados = rows.map(r => {
        const faturamento = parseFloat(r.faturamento_total) || 0;
        const qtd = parseInt(r.qtd_total, 10) || 0;
        const precoMedio = qtd > 0 ? (faturamento / qtd) : (parseFloat(r.preco_cadastro) || 0);
        
        let custoUnit = parseFloat(r.custo_unitario) || 0;
        if (custoUnit <= 0) {
          custoUnit = precoMedio * (cmvPadraoPct / 100);
        }

        const custoTotal = custoUnit * qtd;
        const margemTotal = faturamento - custoTotal;
        const margemUnit = precoMedio - custoUnit;
        const cmvRealPct = precoMedio > 0 ? (custoUnit / precoMedio) * 100 : cmvPadraoPct;

        somaMargens += margemUnit;

        return {
          id: r.produto_id,
          nome: r.productName,
          categoria: r.categoria || 'Geral',
          emoji: r.emoji || '🍽️',
          imagem: r.imagem || null,
          qtd,
          faturamento,
          preco_medio: Math.round(precoMedio * 100) / 100,
          preco_cadastro: parseFloat(r.preco_cadastro) || precoMedio,
          custo_unitario: Math.round(custoUnit * 100) / 100,
          custo_total: Math.round(custoTotal * 100) / 100,
          margem_total: Math.round(margemTotal * 100) / 100,
          margem_unitaria: Math.round(margemUnit * 100) / 100,
          cmv_pct: Math.round(cmvRealPct * 10) / 10,
          pct_volume: volumeTotalGeral > 0 ? (qtd / volumeTotalGeral) * 100 : 0,
          pct_faturamento: faturamentoTotalGeral > 0 ? (faturamento / faturamentoTotalGeral) * 100 : 0
        };
      });

      const mediaMargemUnitaria = rows.length > 0 ? (somaMargens / rows.length) : 0;

      // 2. Classificar nos 4 quadrantes
      const quadrantes = {
        estrelas: [],
        burros_de_carga: [],
        quebra_cabecas: [],
        caes: []
      };

      let ganhoPotencialTotal = 0;

      produtosProcessados.forEach(p => {
        const altaPopularidade = p.qtd >= mediaVolumePorProduto;
        const altaLucratividade = p.margem_unitaria >= mediaMargemUnitaria;

        if (altaPopularidade && altaLucratividade) {
          p.quadrante = 'Estrela';
          p.quadrante_tipo = 'estrela';
          p.icone = '⭐';
          p.cor = '#10b981';
          p.acao_estrategica = 'Campeão de Vendas: Manter qualidade da receita sagrada, destacar no topo do cardápio e manter em evidência.';
          p.preco_sugerido = p.preco_medio;
          p.ganho_potencial = 0;
          quadrantes.estrelas.push(p);
        } else if (altaPopularidade && !altaLucratividade) {
          p.quadrante = 'Burro de Carga';
          p.quadrante_tipo = 'burro_de_carga';
          p.icone = '🐴';
          p.cor = '#f59e0b';
          p.acao_estrategica = 'Alto volume, margem apertada: Reajustar preço em 5% a 8% ou renegociar custos de insumos por porção.';
          // Preço sugerido: +6% a +8% arredondado para centavos amigáveis
          const recPreco = Math.ceil(p.preco_medio * 1.07 * 2) / 2;
          p.preco_sugerido = recPreco > p.preco_medio ? recPreco : Math.round((p.preco_medio + 2.00) * 100) / 100;
          p.ganho_potencial = Math.round((p.preco_sugerido - p.preco_medio) * p.qtd * 100) / 100;
          ganhoPotencialTotal += p.ganho_potencial;
          quadrantes.burros_de_carga.push(p);
        } else if (!altaPopularidade && altaLucratividade) {
          p.quadrante = 'Quebra-Cabeça';
          p.quadrante_tipo = 'quebra_cabeca';
          p.icone = '🧩';
          p.cor = '#8b5cf6';
          p.acao_estrategica = 'Alta margem, pouca saída: Criar combos promocionais com bebidas, comissionar garçons no app e melhorar fotos.';
          p.preco_sugerido = p.preco_medio;
          p.ganho_potencial = 0;
          quadrantes.quebra_cabecas.push(p);
        } else {
          p.quadrante = 'Cão';
          p.quadrante_tipo = 'cao';
          p.icone = '🐕';
          p.cor = '#ef4444';
          p.acao_estrategica = 'Baixa margem e baixa saída: Avaliar retirada imediata do menu para estancar custos e desperdício de insumos.';
          p.preco_sugerido = p.preco_medio;
          p.ganho_potencial = 0;
          quadrantes.caes.push(p);
        }
      });

      return res.json({
        ok: true,
        periodo_dias: numDias,
        total_produtos_analisados: produtosProcessados.length,
        faturamento_total: faturamentoTotalGeral,
        volume_total: volumeTotalGeral,
        cortes_matriz: {
          media_volume: Math.round(mediaVolumePorProduto * 10) / 10,
          media_margem_unitaria: Math.round(mediaMargemUnitaria * 100) / 100,
          cmv_medio_estimado_pct: cmvPadraoPct
        },
        totais_quadrantes: {
          estrelas: quadrantes.estrelas.length,
          burros_de_carga: quadrantes.burros_de_carga.length,
          quebra_cabecas: quadrantes.quebra_cabecas.length,
          caes: quadrantes.caes.length
        },
        oportunidade_lucro_mensal: Math.round(ganhoPotencialTotal * 100) / 100,
        quadrantes,
        todos_itens: produtosProcessados
      });

    } catch (err) {
      console.error('[Engenharia Cardapio] Erro ao calcular matriz BCG:', err);
      return res.status(500).json({ ok: false, erro: 'Erro ao processar Engenharia de Cardápio BCG.' });
    }
  });

  // ── 2. APLICAR PREÇO SUGERIDO COM 1 CLIQUE ──
  app.post('/api/engenharia-cardapio/aplicar-sugestao', authMiddleware, async (req, res) => {
    const db = resolveDb(req);
    const { nome_produto, novo_preco } = req.body || {};

    if (!nome_produto || typeof novo_preco !== 'number' || novo_preco <= 0) {
      return res.status(400).json({ ok: false, erro: 'Nome do produto e novo preço válidos são obrigatórios.' });
    }

    try {
      const precoFinal = Math.round(novo_preco * 100) / 100;
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE produtos SET preco = ?, atualizado_em = datetime('now','localtime') WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?))`,
          [precoFinal, nome_produto],
          function (err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });

      if (io) {
        io.emit('produto_atualizado', { nome: nome_produto, novo_preco: precoFinal });
      }

      return res.json({
        ok: true,
        mensagem: `Preço de "${nome_produto}" reajustado com sucesso para R$ ${precoFinal.toFixed(2).replace('.', ',')}!`,
        novo_preco: precoFinal
      });
    } catch (err) {
      console.error('[Engenharia Cardapio] Erro ao aplicar preço sugerido:', err);
      return res.status(500).json({ ok: false, erro: 'Falha ao salvar novo preço do produto.' });
    }
  });

  // ── 3. FEED DE PRATOS ESTRELA PARA BADGE DOURADO NO CARDÁPIO DIGITAL ──
  app.get('/api/engenharia-cardapio/estrelas-cardapio', async (req, res) => {
    const db = resolveDb(req);
    try {
      // Buscar os produtos que mais venderam nos últimos 30 dias
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - 30);
      const dtInicio = dataLimite.toISOString().slice(0, 10);

      const query = `
        SELECT p.productName,
               SUM(p.quantity) as qtd,
               prod.id as produto_id,
               prod.emoji,
               prod.categoria
        FROM pedidos p
        LEFT JOIN produtos prod ON LOWER(TRIM(p.productName)) = LOWER(TRIM(prod.nome))
        WHERE p.status IN ('Finalizado', 'Pago', 'Fracionado')
          AND date(COALESCE(p.createdAt, p.time)) >= ?
        GROUP BY p.productName
        ORDER BY qtd DESC
        LIMIT 6
      `;

      db.all(query, [dtInicio], (err, rows) => {
        if (!err && rows && rows.length > 0) {
          const estrelas = rows.map(r => ({
            nome: r.productName,
            produto_id: r.produto_id,
            emoji: r.emoji || '⭐',
            badge: '🌟 Favorito dos Clientes',
            categoria: r.categoria || 'Destaques'
          }));
          return res.json({ ok: true, estrelas });
        }

        // Fallback: busca pratos cadastrados no restaurante
        db.all(`SELECT id as produto_id, nome as productName, emoji, categoria FROM produtos LIMIT 6`, [], (e2, rows2) => {
          const estrelasFallback = (rows2 || []).map(r => ({
            nome: r.productName,
            produto_id: r.produto_id,
            emoji: r.emoji || '⭐',
            badge: '🌟 Favorito dos Clientes',
            categoria: r.categoria || 'Destaques'
          }));
          return res.json({ ok: true, estrelas: estrelasFallback });
        });
      });
    } catch (e) {
      return res.json({ ok: true, estrelas: [] });
    }
  });
};
