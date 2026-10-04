/**
 * routes/mesas.routes.js
 * Módulo de Mesas extraído do server.js (linhas 13746-13942)
 *
 * Rotas:
 *   GET  /api/mesas
 *   POST /api/mesas/dividir-conta
 *   POST /api/mesas/transferir-item
 */
'use strict';

const express = require('express');
const { Router } = express;
const { getContext } = require('./shared/context');

function createMesasRouter() {
  const router = Router();
  const getDb = () => getContext().getTenantDb();
  const { withTenant, io } = getContext();

  // GET /api/mesas
  router.get('/', (req, res) => {
    withTenant(req, () => {
      getDb().all('SELECT * FROM mesas ORDER BY id ASC', [], (err, rows) => {
        res.json(rows || []);
      });
    });
  });

  // POST /api/mesas/dividir-conta
  router.post('/dividir-conta', express.json(), (req, res) => {
    const { mesa, pessoas = 1, incluir_servico = true, desconto = 0, couvert_unitario = 0 } = req.body || {};
    const numPessoas = Math.max(1, parseInt(pessoas, 10) || 1);
    const mesaNome = mesa || 'Mesa 01';

    withTenant(req, () => {
      getDb().all(`
        SELECT * FROM pedidos 
        WHERE (localName = ? OR mesa_grupo = ?) AND LOWER(COALESCE(status, '')) NOT IN ('finalizado', 'pago', 'cancelado')
        ORDER BY id ASC
      `, [mesaNome, mesaNome], (err, itens) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!itens || itens.length === 0) {
          return res.status(404).json({ success: false, error: `Não há itens abertos para a mesa ${mesaNome}.` });
        }

        let subtotalConsumo = 0;
        const itensFormatados = itens.map(item => {
          const precoNum = Math.abs(parseFloat(String(item.total || 0).replace(',', '.')) || 0);
          subtotalConsumo += precoNum;
          return {
            id: item.id,
            produto: item.productName,
            quantidade: item.quantity || 1,
            total: precoNum,
            observacoes: item.observations || ''
          };
        });

        const taxaServico = incluir_servico ? parseFloat((subtotalConsumo * 0.10).toFixed(2)) : 0;
        const couvertTotal = parseFloat(((parseFloat(couvert_unitario) || 0) * numPessoas).toFixed(2));
        const descontoValor = Math.min(subtotalConsumo, parseFloat(desconto) || 0);
        const totalGeral = parseFloat((subtotalConsumo + taxaServico + couvertTotal - descontoValor).toFixed(2));
        const valorPorPessoa = parseFloat((totalGeral / numPessoas).toFixed(2));

        const dataHora = new Date().toLocaleString('pt-BR');
        const extratoConferenciaHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Conferência de Mesa - ${mesaNome}</title>
  <style>
    body { font-family: 'Courier New', monospace; width: 300px; margin: 0 auto; padding: 10px; font-size: 12px; color: #000; }
    .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
    .linha { display: flex; justify-content: space-between; margin: 3px 0; }
    .bold { font-weight: bold; }
    .destaque { font-size: 14px; font-weight: bold; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin: 8px 0; }
    .rateio { background: #f4f4f4; border: 1px solid #ddd; border-radius: 6px; padding: 8px; margin: 10px 0; text-align: center; }
    .rateio .valor-pessoa { font-size: 16px; font-weight: bold; color: #000; margin-top: 4px; }
    .no-print { text-align: center; margin-top: 15px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="header">
    <div style="font-size: 15px; font-weight: bold;">CHEF COZINHA RESTAURANTE</div>
    <div>CONFERÊNCIA DE CONTA (NÃO É FISCAL)</div>
    <div style="font-size: 14px; font-weight: bold; margin-top: 4px;">${mesaNome.toUpperCase()}</div>
    <div style="font-size: 11px;">Data/Hora: ${dataHora}</div>
  </div>

  <div style="margin-bottom: 8px;">
    ${itensFormatados.map(it => `
      <div class="linha">
        <span>${it.quantidade}x ${it.produto}</span>
        <span>R$ ${it.total.toFixed(2)}</span>
      </div>
      ${it.observacoes ? `<div style="font-size:10px; color:#555; padding-left:12px;">Obs: ${it.observacoes}</div>` : ''}
    `).join('')}
  </div>

  <div class="linha">
    <span>Subtotal Consumo:</span>
    <span>R$ ${subtotalConsumo.toFixed(2)}</span>
  </div>
  ${taxaServico > 0 ? `
  <div class="linha">
    <span>Serviço Sugerido (10%):</span>
    <span>R$ ${taxaServico.toFixed(2)}</span>
  </div>` : ''}
  ${couvertTotal > 0 ? `
  <div class="linha">
    <span>Couvert Artístico (${numPessoas}x):</span>
    <span>R$ ${couvertTotal.toFixed(2)}</span>
  </div>` : ''}
  ${descontoValor > 0 ? `
  <div class="linha" style="color: #b91c1c;">
    <span>Desconto Promocional:</span>
    <span>- R$ ${descontoValor.toFixed(2)}</span>
  </div>` : ''}

  <div class="linha destaque">
    <span>TOTAL DA CONTA:</span>
    <span>R$ ${totalGeral.toFixed(2)}</span>
  </div>

  <div class="rateio">
    <div>DIVIDIDO POR <strong>${numPessoas} PESSOA(S)</strong>:</div>
    <div class="valor-pessoa">R$ ${valorPorPessoa.toFixed(2)} / pessoa</div>
  </div>

  <div style="text-align: center; font-size: 10px; margin-top: 15px; color: #555;">
    Agradecemos a sua preferência!<br>
    Chef Cozinha SaaS Kernel
  </div>

  <div class="no-print">
    <button onclick="window.print()" style="padding: 8px 16px; font-weight: bold; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer;">
      🖨️ Imprimir Conferência
    </button>
  </div>
</body>
</html>`;

        if (io) {
          io.emit('mesa_conferencia_solicitada', {
            mesa: mesaNome,
            pessoas: numPessoas,
            total: totalGeral,
            valor_por_pessoa: valorPorPessoa
          });
        }

        res.json({
          success: true,
          ok: true,
          mesa: mesaNome,
          pessoas: numPessoas,
          itens_qtd: itensFormatados.length,
          itens: itensFormatados,
          subtotal_consumo: subtotalConsumo,
          taxa_servico: taxaServico,
          couvert_total: couvertTotal,
          desconto_valor: descontoValor,
          total_geral: totalGeral,
          valor_por_pessoa: valorPorPessoa,
          extrato_conferencia_html: extratoConferenciaHtml
        });
      });
    });
  });

  // POST /api/mesas/transferir-item
  router.post('/transferir-item', express.json(), (req, res) => {
    const { itemId, mesaOrigem, mesaDestino, operador = 'Garçom' } = req.body || {};
    if (!itemId || !mesaDestino) {
      return res.status(400).json({ success: false, error: 'Item ID e Mesa de Destino são obrigatórios.' });
    }

    withTenant(req, () => {
      const db = getDb();
      db.get('SELECT * FROM pedidos WHERE id = ?', [itemId], (err, item) => {
        if (err || !item) {
          return res.status(404).json({ success: false, error: 'Item não localizado no banco de dados.' });
        }

        const origemEfetiva = mesaOrigem || item.localName;

        db.run('UPDATE pedidos SET localName = ?, mesa_grupo = ? WHERE id = ?', [mesaDestino, mesaDestino, itemId], function(errUp) {
          if (errUp) return res.status(500).json({ success: false, error: errUp.message });

          if (typeof global.registrarAuditoria === 'function') {
            global.registrarAuditoria(
              operador,
              'TRANSFERENCIA_ITEM_MESA',
              `Item #${itemId} (${item.quantity}x ${item.productName}) transferido de ${origemEfetiva} para ${mesaDestino}`,
              'Operação de Salão',
              'MEDIO'
            );
          }

          if (io) {
            io.emit('item_transferido', {
              itemId,
              produto: item.productName,
              origem: origemEfetiva,
              destino: mesaDestino,
              operador
            });
            // Emite notificação para a tela inteira recarregar os pedidos:
            io.emit('pedido_adicionado_cozinha');
          }

          // Nota: liberarMesaSeVazia e broadcastPedidos foram movidos/injetados ou substituídos pelos eventos.
          res.json({
            success: true,
            ok: true,
            itemId,
            produto: item.productName,
            origem: origemEfetiva,
            destino: mesaDestino,
            mensagem: `Item "${item.productName}" transferido com sucesso para ${mesaDestino}!`
          });
        });
      });
    });
  });

  return router;
}

module.exports = { createMesasRouter };
