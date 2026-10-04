/**
 * routes/kds.routes.js
 * Módulo KDS (Kitchen Display System) extraído do server.js (linhas 13519–13645)
 *
 * Rotas:
 *   GET  /api/kds/pedidos-ativos
 *   POST /api/kds/concluir-pedido
 *   POST /api/painel-tv/chamar
 */

'use strict';

const { Router } = require('express');
const { getContext } = require('./shared/context');

// ── Lógica de negócio pura ────────────────────────────────────────────────

/**
 * Determina em qual estação da cozinha um item deve ser produzido.
 * @param {string} nome      - Nome do produto
 * @param {string} categoria - Categoria/setor do produto
 * @returns {'bar'|'forno'|'sobremesas'|'cozinha'}
 */
function determinarEstacaoItem(nome, categoria) {
  const texto = `${nome || ''} ${categoria || ''}`.toLowerCase();
  if (texto.match(/bebida|suco|refrigerante|cerveja|chopp|drink|água|agua|vinho|whisky|gin|coquetel|dose/))
    return 'bar';
  if (texto.match(/pizza|calzone|esfiha|forno|fornada/))
    return 'forno';
  if (texto.match(/sobremesa|doce|sorvete|torta|pudim|petit|brownie|açai|acai|café|cafe/))
    return 'sobremesas';
  return 'cozinha';
}

/**
 * Calcula o nível de SLA de um pedido com base no tempo decorrido.
 * @param {number} minutosDecorridos
 * @returns {'verde'|'amarelo'|'vermelho'}
 */
function calcularNivelSla(minutosDecorridos) {
  if (minutosDecorridos >= 20) return 'vermelho';
  if (minutosDecorridos >= 10) return 'amarelo';
  return 'verde';
}

// ── Router Factory ────────────────────────────────────────────────────────

function createKdsRouter() {
  const router = Router();
  const { io, withTenant } = getContext();
  const getDb = () => getContext().getTenantDb();

  // GET /api/kds/pedidos-ativos
  router.get('/pedidos-ativos', (req, res) => {
    const pracaFiltro = (req.query.praca || 'todas').toLowerCase();

    withTenant(req, () => {
      getDb().all(`
        SELECT p.*, strftime('%s','now') - strftime('%s', COALESCE(p.createdAt,'now')) as segundos_decorridos
        FROM pedidos p
        WHERE LOWER(COALESCE(p.status,'')) IN ('pendente','em preparo','aguardando','cozinha','em espera')
        ORDER BY p.id ASC
      `, [], (err, rows) => {
        if (err) return res.status(500).json({ success: false, error: err.message });

        const pedidosFormatados = (rows || []).map(p => {
          const estacao          = determinarEstacaoItem(p.productName, p.sector);
          const decorridoMinutos = Math.max(0, Math.floor((p.segundos_decorridos || 0) / 60));
          return {
            id:                  p.id,
            mesa:                p.localName || 'Balcão',
            cliente:             p.userName || 'Cliente',
            produto:             p.productName,
            quantidade:          p.quantity || 1,
            observacoes:         p.observations || '',
            opcoes:              p.options || '',
            estacao,
            status:              p.status || 'Pendente',
            criado_em:           p.createdAt || p.time,
            segundos_decorridos: p.segundos_decorridos || 0,
            minutos_decorridos:  decorridoMinutos,
            sla_nivel:           calcularNivelSla(decorridoMinutos)
          };
        });

        const filtrados = (pracaFiltro === 'todas' || pracaFiltro === 'expedicao')
          ? pedidosFormatados
          : pedidosFormatados.filter(p => p.estacao === pracaFiltro);

        res.json({ success: true, ok: true, praca: pracaFiltro, total: filtrados.length, pedidos: filtrados });
      });
    });
  });

  // POST /api/kds/concluir-pedido
  router.post('/concluir-pedido', (req, res) => {
    const { id, chamar_tv } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: 'ID do pedido obrigatório.' });

    withTenant(req, () => {
      const db = getDb();
      db.get('SELECT * FROM pedidos WHERE id = ?', [id], (err, p) => {
        if (err || !p) return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });

        db.run(`UPDATE pedidos SET status = 'Pronto', prontoEm = datetime('now','localtime') WHERE id = ?`, [id], function (errUp) {
          if (errUp) return res.status(500).json({ success: false, error: errUp.message });

          io.emit('pedidos_atualizados');
          io.emit('pedido_status_alterado', { id, status: 'Pronto' });

          if (chamar_tv || !p.localName || p.localName.toLowerCase().includes('balc')) {
            const senhaNum = String(p.id).slice(-3);
            io.emit('senha_chamada_tv', {
              senha:       senhaNum,
              senha_numero: senhaNum,
              status:      'PRONTO',
              cliente:     p.userName || 'Cliente',
              texto_fala:  `Senha ${senhaNum}, favor retirar no balcão.`
            });
          }

          res.json({ success: true, ok: true, id, status: 'Pronto', mensagem: `Pedido #${id} marcado como Pronto!` });
        });
      });
    });
  });

  return router;
}

// ── Painel TV Router (separado para montar em /api/painel-tv) ─────────────

function createPainelTvRouter() {
  const router = Router();
  const { io } = getContext();

  // POST /api/painel-tv/chamar
  router.post('/chamar', (req, res) => {
    const { senha, cliente, tipo, texto_fala } = req.body || {};
    const senhaStr  = String(senha || '001');
    const clienteStr = cliente || 'Cliente';
    const fala      = texto_fala || `Senha ${senhaStr}, ${clienteStr}, favor retirar no balcão.`;

    io.emit('senha_chamada_tv', {
      senha:        senhaStr,
      senha_numero: senhaStr,
      status:       'PRONTO',
      cliente_nome: clienteStr,
      tipo:         tipo || 'Retirada Balcão',
      texto_fala:   fala,
      timestamp:    new Date().toISOString()
    });

    res.json({ success: true, ok: true, senha: senhaStr, cliente: clienteStr, fala, mensagem: `Senha #${senhaStr} chamada com sucesso no Painel de TV!` });
  });

  return router;
}

module.exports = { createKdsRouter, createPainelTvRouter, determinarEstacaoItem, calcularNivelSla };
