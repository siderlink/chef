/**
 * routes/relatorios.routes.js
 * Módulo de Relatórios e Auditoria de Cancelamentos extraído do server.js
 *
 * Rotas:
 *   GET  /api/relatorios/curva-abc
 *   GET  /api/relatorios/dre-gerencial
 *   POST /api/auditoria/cancelamento
 *   GET  /api/auditoria/cancelamentos
 */
'use strict';

const express = require('express');
const { Router } = express;
const { getContext } = require('./shared/context');

function createRelatoriosRouter() {
  const router = Router();
  const getDb = () => getContext().getTenantDb();
  const { withTenant } = getContext();

  // GET /api/relatorios/curva-abc
  router.get('/curva-abc', (req, res) => {
    withTenant(req, () => {
      getDb().all(`
        SELECT 
          p.productName as nome,
          SUM(p.quantity) as quantidade_total,
          SUM(CAST(REPLACE(REPLACE(p.total, 'R$', ''), ',', '.') AS REAL)) as receita_total
        FROM pedidos p
        WHERE LOWER(COALESCE(p.status, '')) IN ('finalizado', 'pago', 'entregue')
        AND p.productName NOT LIKE '%Pgto%' AND p.productName NOT LIKE '%Pagamento%'
        GROUP BY p.productName
        ORDER BY receita_total DESC
      `, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        const produtos = (rows || []).map(r => ({
          nome: r.nome,
          quantidade_total: r.quantidade_total || 0,
          receita_total: parseFloat(Number(r.receita_total || 0).toFixed(2))
        }));

        const faturamentoTotal = produtos.reduce((acc, p) => acc + p.receita_total, 0);

        let acumulado = 0;
        const classificados = produtos.map(prod => {
          acumulado += prod.receita_total;
          const pctAcumulado = faturamentoTotal > 0 ? (acumulado / faturamentoTotal) * 100 : 0;
          let classe = 'C';
          if (pctAcumulado <= 80) classe = 'A';
          else if (pctAcumulado <= 95) classe = 'B';

          return {
            ...prod,
            participacao_pct: faturamentoTotal > 0 ? parseFloat(((prod.receita_total / faturamentoTotal) * 100).toFixed(2)) : 0,
            acumulado_pct: parseFloat(pctAcumulado.toFixed(2)),
            classe
          };
        });

        const totalA = classificados.filter(c => c.classe === 'A').length;
        const totalB = classificados.filter(c => c.classe === 'B').length;
        const totalC = classificados.filter(c => c.classe === 'C').length;

        res.json({
          success: true,
          ok: true,
          faturamento_total: parseFloat(faturamentoTotal.toFixed(2)),
          total_itens: classificados.length,
          resumo_classes: {
            classe_a: { qtd: totalA, descricao: 'Carro-chefe (até 80% do faturamento)' },
            classe_b: { qtd: totalB, descricao: 'Intermediários (próximos 15%)' },
            classe_c: { qtd: totalC, descricao: 'Cauda longa (últimos 5%)' }
          },
          produtos: classificados
        });
      });
    });
  });

  // GET /api/relatorios/dre-gerencial
  router.get('/dre-gerencial', (req, res) => {
    withTenant(req, () => {
      const db = getDb();
      db.get(`
        SELECT 
          COUNT(id) as total_pedidos,
          COALESCE(SUM(CAST(REPLACE(REPLACE(total, 'R$', ''), ',', '.') AS REAL)), 0) as receita_bruta
        FROM pedidos
        WHERE LOWER(COALESCE(status, '')) IN ('finalizado', 'pago', 'entregue')
        AND productName NOT LIKE '%Pgto%' AND productName NOT LIKE '%Pagamento%'
      `, [], (errPed, rowPed) => {
        if (errPed) return res.status(500).json({ success: false, error: errPed.message });

        const receitaBruta = parseFloat(Number(rowPed?.receita_bruta || 0).toFixed(2));
        const totalPedidos = rowPed?.total_pedidos || 0;

        db.all(`SELECT tipo, valor, forma_pagamento FROM movimentacoes`, [], (errMov, movs) => {
          const movimentacoes = movs || [];
          let totalSangrias = 0;
          let totalSuprimentos = 0;

          movimentacoes.forEach(m => {
            const val = parseFloat(m.valor) || 0;
            if (m.tipo === 'Sangria') totalSangrias += val;
            if (m.tipo === 'Suprimento') totalSuprimentos += val;
          });

          const cmvEstimado = parseFloat((receitaBruta * 0.32).toFixed(2));
          const lucroBruto = parseFloat((receitaBruta - cmvEstimado).toFixed(2));
          const taxasCartaoEstimadas = parseFloat((receitaBruta * 0.022).toFixed(2));
          const lucroOperacional = parseFloat((lucroBruto - totalSangrias - taxasCartaoEstimadas).toFixed(2));
          const margemOperacionalPct = receitaBruta > 0 ? parseFloat(((lucroOperacional / receitaBruta) * 100).toFixed(2)) : 0;

          res.json({
            success: true,
            ok: true,
            periodo: 'Consolidado Geral',
            total_pedidos: totalPedidos,
            dre: {
              receita_bruta: receitaBruta,
              impostos_e_deducoes_estimados: 0.00,
              receita_liquida: receitaBruta,
              cmv_custo_mercadorias: cmvEstimado,
              cmv_percentual: 32.0,
              lucro_bruto: lucroBruto,
              margem_bruta_pct: receitaBruta > 0 ? parseFloat(((lucroBruto / receitaBruta) * 100).toFixed(2)) : 0,
              despesas_operacionais_sangrias: parseFloat(totalSangrias.toFixed(2)),
              taxas_meios_pagamento_estimadas: taxasCartaoEstimadas,
              lucro_operacional_liquido: lucroOperacional,
              margem_operacional_liquida_pct: margemOperacionalPct
            }
          });
        });
      });
    });
  });

  return router;
}

function createAuditoriaCancelamentosRouter() {
  const router = Router();
  const getDb = () => getContext().getTenantDb();
  const { withTenant, io } = getContext();

  // POST /api/auditoria/cancelamento
  router.post('/cancelamento', express.json(), (req, res) => {
    const { tipo = 'ITEM', identificador, valor = 0, motivo, operador = 'Operador', autorizado_por = 'Gerente' } = req.body || {};

    if (!motivo || !motivo.trim()) {
      return res.status(400).json({ success: false, error: 'O motivo do cancelamento é estritamente obrigatório para auditoria.' });
    }

    withTenant(req, () => {
      getDb().run(`
        INSERT INTO auditoria_cancelamentos (tipo, identificador, valor, motivo, operador, autorizado_por, data)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `, [tipo, identificador || 'Mesa/Item', parseFloat(valor) || 0, motivo.trim(), operador, autorizado_por], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });

        if (io) {
          io.emit('alerta_cancelamento_seguranca', {
            id: this.lastID,
            tipo,
            identificador,
            valor,
            motivo,
            operador,
            autorizado_por,
            data: new Date().toISOString()
          });
        }

        res.json({
          success: true,
          ok: true,
          registro_id: this.lastID,
          tipo,
          motivo,
          mensagem: 'Cancelamento registrado com sucesso na auditoria de segurança!'
        });
      });
    });
  });

  // GET /api/auditoria/cancelamentos
  router.get('/cancelamentos', (req, res) => {
    withTenant(req, () => {
      getDb().all(`SELECT * FROM auditoria_cancelamentos ORDER BY id DESC LIMIT 50`, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({
          success: true,
          ok: true,
          total: (rows || []).length,
          cancelamentos: rows || []
        });
      });
    });
  });

  return router;
}

module.exports = { createRelatoriosRouter, createAuditoriaCancelamentosRouter };
