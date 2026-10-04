/**
 * routes/cupons.routes.js
 * Módulo de Cupons extraído do server.js (linhas 9346–9394, 12644–12688)
 *
 * Rotas públicas (sem token):
 *   GET  /api/cupons/disponiveis
 *   POST /api/cupons/consultar
 *
 * Rotas administrativas:
 *   GET    /api/cupons
 *   POST   /api/cupons
 *   DELETE /api/cupons/:codigo
 *   GET    /api/cupons/:codigo/desempenho
 */
'use strict';

const { Router } = require('express');
const { getContext } = require('./shared/context');

function createCuponsRouter() {
  const router = Router();
  const { io } = getContext();
  const getDb = () => getContext().getTenantDb();

  // GET /api/cupons/disponiveis — para o cardápio/totem (público)
  router.get('/disponiveis', (req, res) => {
    const agora = new Date();
    const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    getDb().all(
      `SELECT codigo, titulo, descricao, valor_tipo, valor, validade, itens_json, valor_minimo, limite_usos, usado
       FROM cupons
       WHERE (validade IS NULL OR validade = '' OR validade >= ?)
         AND (usado < limite_usos OR limite_usos IS NULL OR limite_usos = 0)
       ORDER BY data_criacao DESC LIMIT 30`,
      [hojeStr],
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Erro ao buscar cupons' });
        res.json({ cupons: rows || [] });
      }
    );
  });

  // POST /api/cupons/consultar — valida e calcula desconto (público)
  router.post('/consultar', (req, res) => {
    const b = req.body || {};
    const codigo = String(b.codigo || '').trim().toUpperCase();
    const total = parseFloat(b.valor_total || b.total) || 0;
    if (!codigo) return res.status(400).json({ valido: false, error: 'Código não informado.' });

    getDb().get('SELECT * FROM cupons WHERE UPPER(codigo) = ?', [codigo], (err, cupom) => {
      if (err || !cupom) return res.json({ valido: false, error: 'Cupom inválido ou não encontrado.' });
      if ((cupom.limite_usos || 0) > 0 && (cupom.usado || 0) >= cupom.limite_usos) {
        return res.json({ valido: false, error: 'Este cupom já atingiu o limite de usos.' });
      }
      if (cupom.validade && new Date() > new Date(cupom.validade + 'T23:59:59')) {
        return res.json({ valido: false, error: 'Este cupom expirou.' });
      }
      const minimo = parseFloat(cupom.valor_minimo) || 0;
      if (minimo > 0 && total < minimo) {
        return res.json({ valido: false, error: `Pedido mínimo de R$ ${minimo.toFixed(2).replace('.', ',')} para este cupom.` });
      }
      let desconto = 0;
      if (cupom.valor_tipo === 'desconto_fixo') {
        desconto = Math.min(total, parseFloat(cupom.valor) || 0);
      } else if (['desconto_porcentagem', 'porcentagem'].includes(cupom.valor_tipo)) {
        desconto = Math.round((total * ((parseFloat(cupom.valor) || 0) / 100)) * 100) / 100;
      }
      let itensBrinde = [];
      try { if (cupom.itens_json) itensBrinde = JSON.parse(cupom.itens_json); } catch (e) { /* fallback */ }
      res.json({
        valido: true,
        cupom: {
          codigo: cupom.codigo,
          titulo: cupom.titulo || cupom.codigo,
          descricao: cupom.descricao || '',
          valor_tipo: cupom.valor_tipo,
          valor: cupom.valor,
          desconto,
          itens: itensBrinde,
          validade: cupom.validade,
          valor_minimo: minimo
        }
      });
    });
  });

  // GET /api/cupons — lista todos (painel admin)
  router.get('/', (req, res) => {
    getDb().all('SELECT * FROM cupons ORDER BY rowid DESC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  });

  // POST /api/cupons — criar/atualizar cupom
  router.post('/', (req, res) => {
    const { codigo, titulo, valor_tipo, valor, validade, limite_usos, itens_json, dias_horarios_json } = req.body || {};
    if (!codigo) return res.status(400).json({ error: 'Código do cupom é obrigatório.' });
    getDb().run(
      `INSERT INTO cupons (codigo, titulo, valor_tipo, valor, validade, limite_usos, itens_json, dias_horarios_json, data_criacao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(codigo) DO UPDATE SET
         titulo = excluded.titulo, valor_tipo = excluded.valor_tipo,
         valor = excluded.valor, validade = excluded.validade,
         limite_usos = excluded.limite_usos, itens_json = excluded.itens_json,
         dias_horarios_json = excluded.dias_horarios_json`,
      [codigo.toUpperCase(), titulo || '', valor_tipo || 'percentual', valor || 0, validade || '', limite_usos || 1, itens_json || '[]', dias_horarios_json || '[]'],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        io.emit('cupons_atualizados');
        res.json({ success: true });
      }
    );
  });

  // DELETE /api/cupons/:codigo
  router.delete('/:codigo', (req, res) => {
    getDb().run('DELETE FROM cupons WHERE codigo = ?', [req.params.codigo], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });

  // GET /api/cupons/:codigo/desempenho — estatísticas de uso
  router.get('/:codigo/desempenho', (req, res) => {
    getDb().get(
      'SELECT COUNT(*) as total_usos, COALESCE(SUM(desconto_aplicado), 0) as economia_total FROM cupons_usos WHERE codigo_cupom = ?',
      [req.params.codigo],
      (err, row) => res.json(row || { total_usos: 0, economia_total: 0 })
    );
  });

  return router;
}

module.exports = { createCuponsRouter };
